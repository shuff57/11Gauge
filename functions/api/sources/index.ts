import { getSessionUser, type SessionEnv } from "../../utils/session";
import {
  createPrimarySourceRecord,
  listPrimarySourceRecords,
  toPrimarySourceSummary,
  type PrimarySourceSummaryPayload
} from "../../utils/sources";
import { isAdminEmail, type AdminEnv } from "../../utils/admin";

interface SourceEnv extends SessionEnv, AdminEnv {
  PRIMARY_SOURCES?: R2Bucket;
  USERS_DB?: D1Database;
}

interface UploadChunkPayload {
  id?: string;
  order?: number;
  page?: number;
  text?: string;
}

interface UploadManifestPayload {
  title?: string;
  originalName?: string;
  summary?: string;
  pageCount?: number;
  chunks?: UploadChunkPayload[];
  version?: number;
}

const json = (body: any, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {})
    }
  });

const validateManifest = (manifest: UploadManifestPayload, fallbackTitle: string) => {
  const title = (manifest.title || fallbackTitle || '').trim();
  if (!title) {
    throw new Error('A document title is required.');
  }
  const chunks = Array.isArray(manifest.chunks) ? manifest.chunks : [];
  if (!chunks.length) {
    throw new Error('Extracted chunks are required.');
  }
  const sanitized = chunks.map((chunk, index) => {
    const text = (chunk.text || '').replace(/\s+/g, ' ').trim();
    if (!text) return null;
    return {
      id: chunk.id || crypto.randomUUID(),
      order: typeof chunk.order === 'number' ? chunk.order : index,
      page: typeof chunk.page === 'number' ? chunk.page : index + 1,
      text: text.slice(0, 2000) // cap to keep payloads manageable
    };
  }).filter((chunk): chunk is Required<UploadChunkPayload> & { text: string } => Boolean(chunk));

  if (!sanitized.length) {
    throw new Error('All extracted chunks were empty.');
  }

  return {
    title,
    originalName: (manifest.originalName || fallbackTitle).trim() || title,
    summary: manifest.summary?.trim() || sanitized[0].text.slice(0, 280),
    pageCount: Math.max(1, Number(manifest.pageCount) || sanitized.length),
    chunks: sanitized,
    chunkCount: sanitized.length,
    version: manifest.version || 1,
  };
};

const toHex = (buffer: ArrayBuffer): string => {
  return Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

const computeDigest = async (chunks: { text: string }[]): Promise<string> => {
  const encoder = new TextEncoder();
  const payload = chunks.map((chunk) => chunk.text).join('\n\n');
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(payload));
  return toHex(hash);
};

export const onRequest = async ({ request, env }: { request: Request; env: SourceEnv }) => {
  if (request.method === 'GET') {
    return handleList(request, env);
  }
  if (request.method === 'POST') {
    return handleUpload(request, env);
  }
  return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, POST' } });
};

const handleList = async (request: Request, env: SourceEnv) => {
  const user = await getSessionUser(env, request);
  if (!user) {
    return json({ error: 'Not authenticated' }, { status: 401 });
  }
  try {
    const records = await listPrimarySourceRecords(env, user.id);
    const sources: PrimarySourceSummaryPayload[] = records.map(toPrimarySourceSummary);
    return json({ sources });
  } catch (err: any) {
    console.error('Primary source list failed:', err);
    return json({ error: 'Unable to load primary sources.' }, { status: 500 });
  }
};

const handleUpload = async (request: Request, env: SourceEnv) => {
  const user = await getSessionUser(env, request);
  if (!user) {
    return json({ error: 'Not authenticated' }, { status: 401 });
  }
  if (!isAdminEmail(env, user.email)) {
    return json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!env.PRIMARY_SOURCES) {
    return json({ error: 'PRIMARY_SOURCES bucket missing' }, { status: 500 });
  }

  const form = await request.formData();
  const file = form.get('file');
  const manifestRaw = form.get('manifest');

  if (!(file instanceof File)) {
    return json({ error: 'PDF file is required' }, { status: 400 });
  }
  if (typeof manifestRaw !== 'string') {
    return json({ error: 'Manifest payload missing' }, { status: 400 });
  }

  let parsed: UploadManifestPayload;
  try {
    parsed = JSON.parse(manifestRaw);
  } catch (err) {
    return json({ error: 'Invalid manifest payload' }, { status: 400 });
  }

  try {
    const validated = validateManifest(parsed, file.name);
    const sourceId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const digest = await computeDigest(validated.chunks);

    const baseKey = `users/${user.id}/${sourceId}`;
    const pdfKey = `${baseKey}/original.pdf`;
    const manifestKey = `${baseKey}/chunks.json`;

    await env.PRIMARY_SOURCES.put(pdfKey, file.stream(), {
      httpMetadata: {
        contentType: file.type || 'application/pdf',
        cacheControl: 'public, max-age=31536000, immutable'
      }
    });

    const manifestPayload = {
      id: sourceId,
      version: validated.version,
      title: validated.title,
      originalName: validated.originalName,
      summary: validated.summary,
      pageCount: validated.pageCount,
      chunkCount: validated.chunkCount,
      createdAt,
      chunks: validated.chunks,
    };

    await env.PRIMARY_SOURCES.put(manifestKey, JSON.stringify(manifestPayload), {
      httpMetadata: {
        contentType: 'application/json',
        cacheControl: 'public, max-age=86400'
      }
    });

    const record = await createPrimarySourceRecord(env, {
      id: sourceId,
      userId: user.id,
      title: validated.title,
      originalName: validated.originalName,
      summary: validated.summary,
      pageCount: validated.pageCount,
      chunkCount: validated.chunkCount,
      pdfKey,
      manifestKey,
      digest,
      createdAt,
    });

    return json({ source: toPrimarySourceSummary(record) }, { status: 201 });
  } catch (err: any) {
    console.error('Primary source upload failed:', err);
    return json({ error: err?.message || 'Failed to store primary source.' }, { status: 400 });
  }
};

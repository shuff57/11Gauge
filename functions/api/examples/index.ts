import { getSessionUser, type SessionEnv } from "../../utils/session";
import { isAdminEmail, type AdminEnv } from "../../utils/admin";
import {
  createExampleImageRecord,
  listExampleImageRecords,
  toExampleImageSummary,
  type ExampleImageLabel
} from "../../utils/examples";

interface ExampleEnv extends SessionEnv, AdminEnv {
  PRIMARY_SOURCES?: R2Bucket;
  USERS_DB?: D1Database;
}

const json = (body: any, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {})
    }
  });

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB
const VALID_LABELS: ExampleImageLabel[] = ['good', 'bad'];

export const onRequest = async ({ request, env }: { request: Request; env: ExampleEnv }) => {
  if (request.method === 'GET') {
    return handleList(request, env);
  }
  if (request.method === 'POST') {
    return handleUpload(request, env);
  }
  return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, POST' } });
};

const handleList = async (request: Request, env: ExampleEnv) => {
  const user = await getSessionUser(env, request);
  if (!user) {
    return json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const labelParam = url.searchParams.get('label');
    const label = VALID_LABELS.includes(labelParam as ExampleImageLabel)
      ? (labelParam as ExampleImageLabel)
      : undefined;

    const records = await listExampleImageRecords(env, label);
    const images = records.map((record) => ({
      ...toExampleImageSummary(record),
      imageUrl: `/api/examples/${record.id}/image`
    }));
    return json({ images });
  } catch (err: any) {
    console.error('Example image list failed:', err);
    return json({ error: 'Unable to load example images.' }, { status: 500 });
  }
};

const handleUpload = async (request: Request, env: ExampleEnv) => {
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
  const labelRaw = String(form.get('label') || '').toLowerCase();
  const titleRaw = String(form.get('title') || '').trim();
  const descriptionRaw = String(form.get('description') || '').trim();

  if (!(file instanceof File)) {
    return json({ error: 'Image file is required.' }, { status: 400 });
  }
  if (!file.type?.startsWith('image/')) {
    return json({ error: 'Only image uploads are supported.' }, { status: 400 });
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return json({ error: 'Image exceeds the 10MB upload limit.' }, { status: 400 });
  }

  const label = VALID_LABELS.includes(labelRaw as ExampleImageLabel)
    ? (labelRaw as ExampleImageLabel)
    : null;
  if (!label) {
    return json({ error: "Label must be 'good' or 'bad'." }, { status: 400 });
  }

  const title = titleRaw || file.name.replace(/\.[^.]+$/, '').trim() || 'Example Image';
  const description = descriptionRaw || null;

  try {
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const objectKey = `examples/${label}/${user.id}/${id}/${encodeURIComponent(file.name)}`;

    await env.PRIMARY_SOURCES.put(objectKey, file.stream(), {
      httpMetadata: {
        contentType: file.type || 'application/octet-stream',
        cacheControl: 'public, max-age=31536000'
      }
    });

    const record = await createExampleImageRecord(env, {
      id,
      userId: user.id,
      label,
      title,
      description,
      originalName: file.name,
      mimeType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
      objectKey,
      createdAt
    });

    return json({
      image: {
        ...toExampleImageSummary(record),
        imageUrl: `/api/examples/${record.id}/image`
      }
    }, { status: 201 });
  } catch (err: any) {
    console.error('Example image upload failed:', err);
    return json({ error: err?.message || 'Failed to store example image.' }, { status: 400 });
  }
};

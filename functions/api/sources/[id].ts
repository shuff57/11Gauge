import { getSessionUser, type SessionEnv } from "../../utils/session";
import {
  deletePrimarySourceRecord,
  getPrimarySourceRecord,
  toPrimarySourceSummary
} from "../../utils/sources";
import { isAdminEmail, type AdminEnv } from "../../utils/admin";

interface Env extends SessionEnv, AdminEnv {
  USERS_DB?: D1Database;
  PRIMARY_SOURCES?: R2Bucket;
}

const json = (body: any, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {})
    }
  });

export const onRequest = async ({ request, env, params }: { request: Request; env: Env; params: Record<string, string> }) => {
  if (request.method === 'GET') {
    return handleGet(request, env, params);
  }
  if (request.method === 'DELETE') {
    return handleDelete(request, env, params);
  }
  return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, DELETE' } });
};

const handleGet = async (request: Request, env: Env, params: Record<string, string>) => {
  const user = await getSessionUser(env, request);
  if (!user) {
    return json({ error: 'Not authenticated' }, { status: 401 });
  }

  const id = params?.id;
  if (!id) {
    return json({ error: 'Missing source id' }, { status: 400 });
  }

  try {
    const record = await getPrimarySourceRecord(env, user.id, id);
    if (!record) {
      return json({ error: 'Source not found' }, { status: 404 });
    }
    return json({ source: toPrimarySourceSummary(record) });
  } catch (err: any) {
    console.error('Primary source fetch failed:', err);
    return json({ error: 'Unable to load source' }, { status: 500 });
  }
};

const handleDelete = async (request: Request, env: Env, params: Record<string, string>) => {
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

  const id = params?.id;
  if (!id) {
    return json({ error: 'Missing source id' }, { status: 400 });
  }

  try {
    const record = await getPrimarySourceRecord(env, user.id, id);
    if (!record) {
      return json({ error: 'Source not found' }, { status: 404 });
    }

    await Promise.all([
      env.PRIMARY_SOURCES.delete(record.pdf_object_key).catch((err) => {
        console.warn('Failed to delete source PDF', err);
      }),
      env.PRIMARY_SOURCES.delete(record.manifest_object_key).catch((err) => {
        console.warn('Failed to delete source manifest', err);
      })
    ]);

    await deletePrimarySourceRecord(env, id);
    return json({ success: true });
  } catch (err: any) {
    console.error('Primary source deletion failed:', err);
    return json({ error: 'Unable to delete source' }, { status: 500 });
  }
};

import { getSessionUser, type SessionEnv } from "../../utils/session";
import { isAdminEmail, type AdminEnv } from "../../utils/admin";
import {
  getExampleImageRecord,
  deleteExampleImageRecord,
  toExampleImageSummary
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

export const onRequest = async ({ request, env }: { request: Request; env: ExampleEnv }) => {
  const url = new URL(request.url);
  const id = url.pathname.split('/').pop();
  if (!id) {
    return json({ error: 'Example ID missing.' }, { status: 400 });
  }

  if (request.method === 'GET') {
    return handleGet(id, request, env);
  }
  if (request.method === 'DELETE') {
    return handleDelete(id, request, env);
  }
  return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, DELETE' } });
};

const handleGet = async (id: string, request: Request, env: ExampleEnv) => {
  const user = await getSessionUser(env, request);
  if (!user) {
    return json({ error: 'Not authenticated' }, { status: 401 });
  }

  const record = await getExampleImageRecord(env, id);
  if (!record) {
    return json({ error: 'Not found' }, { status: 404 });
  }

  return json({
    image: {
      ...toExampleImageSummary(record),
      imageUrl: `/api/examples/${record.id}/image`
    }
  });
};

const handleDelete = async (id: string, request: Request, env: ExampleEnv) => {
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

  const record = await getExampleImageRecord(env, id);
  if (!record) {
    return json({ error: 'Not found' }, { status: 404 });
  }

  try {
    await env.PRIMARY_SOURCES.delete(record.object_key);
  } catch (err) {
    console.warn('Failed to delete example image object:', err);
  }

  await deleteExampleImageRecord(env, id);
  return json({ success: true });
};

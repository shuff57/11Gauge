import { getSessionUser, type SessionEnv } from "../../../utils/session";
import { getExampleImageRecord } from "../../../utils/examples";

interface ExampleEnv extends SessionEnv {
  PRIMARY_SOURCES?: R2Bucket;
  USERS_DB?: D1Database;
}

export const onRequest = async ({ request, env }: { request: Request; env: ExampleEnv }) => {
  const user = await getSessionUser(env, request);
  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }
  if (!env.PRIMARY_SOURCES) {
    return new Response('Example bucket missing', { status: 500 });
  }

  const url = new URL(request.url);
  const segments = url.pathname.split('/');
  const id = segments.length >= 4 ? segments[segments.length - 2] : null;
  if (!id) {
    return new Response('Invalid path', { status: 400 });
  }

  const record = await getExampleImageRecord(env, id);
  if (!record) {
    return new Response('Not found', { status: 404 });
  }

  const object = await env.PRIMARY_SOURCES.get(record.object_key);
  if (!object || !object.body) {
    return new Response('Not found', { status: 404 });
  }

  return new Response(object.body, {
    headers: {
      'Content-Type': record.mime_type,
      'Cache-Control': 'public, max-age=86400'
    }
  });
};

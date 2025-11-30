import { getSessionUser, type SessionEnv } from "../../../utils/session";
import { getPrimarySourceRecord } from "../../../utils/sources";

interface Env extends SessionEnv {
  PRIMARY_SOURCES?: R2Bucket;
  USERS_DB?: D1Database;
}

export const onRequest = async ({ request, env, params }: { request: Request; env: Env; params: Record<string, string> }) => {
  if (request.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET' } });
  }

  const user = await getSessionUser(env, request);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (!env.PRIMARY_SOURCES) {
    return new Response(JSON.stringify({ error: 'PRIMARY_SOURCES bucket missing' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const id = params?.id;
  if (!id) {
    return new Response(JSON.stringify({ error: 'Missing source id' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const record = await getPrimarySourceRecord(env, user.id, id);
    if (!record) {
      return new Response(JSON.stringify({ error: 'Source not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const object = await env.PRIMARY_SOURCES.get(record.manifest_object_key);
    if (!object || !object.body) {
      return new Response(JSON.stringify({ error: 'Manifest not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(object.body, {
      status: 200,
      headers: {
        'Content-Type': object.httpMetadata?.contentType || 'application/json',
        'Cache-Control': 'private, max-age=300'
      }
    });
  } catch (err: any) {
    console.error('Primary source manifest fetch failed:', err);
    return new Response(JSON.stringify({ error: 'Unable to load manifest' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

import { deleteSession, buildSessionCookie, getSessionToken } from '../../utils/session';

interface Env {
  USERS_DB?: D1Database;
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  const token = getSessionToken(request);
  if (token) {
    await deleteSession(env, token);
  }

  const secure = request.url.startsWith('https://');

  return new Response(null, {
    status: 204,
    headers: {
      'Set-Cookie': buildSessionCookie(null, { secure })
    }
  });
};
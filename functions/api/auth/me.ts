import { getSessionUser } from '../../utils/session';

interface Env {
  USERS_DB?: D1Database;
}

const json = (body: any, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {})
    }
  });

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getSessionUser(env, request);
  if (!user) {
    return json({ user: null }, { status: 401 });
  }
  return json({ user });
};

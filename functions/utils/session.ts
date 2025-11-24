export const SESSION_COOKIE_NAME = '11g_session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

interface SessionEnv {
  USERS_DB?: D1Database;
}

interface SessionRecord {
  id: number;
  user_id: number;
  token: string;
  expires_at: string;
  email?: string;
}

const parseCookies = (header?: string | null): Record<string, string> => {
  if (!header) return {};
  return header.split(';').reduce<Record<string, string>>((acc, part) => {
    const [key, ...rest] = part.trim().split('=');
    if (!key) return acc;
    acc[key] = decodeURIComponent(rest.join('='));
    return acc;
  }, {});
};

interface CookieOptions {
  secure?: boolean;
}

const buildSessionCookie = (token: string | null, options?: CookieOptions): string => {
  const parts = [`${SESSION_COOKIE_NAME}=${token ? encodeURIComponent(token) : ''}`];
  parts.push('Path=/');
  if (token) {
    parts.push(`Max-Age=${SESSION_MAX_AGE_SECONDS}`);
  } else {
    parts.push('Max-Age=0');
  }
  parts.push('SameSite=Lax');
  if (options?.secure !== false) {
    parts.push('Secure');
  }
  parts.push('HttpOnly');
  return parts.join('; ');
};

const createSession = async (env: SessionEnv, userId: number): Promise<string | null> => {
  if (!env.USERS_DB) return null;
  const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, '');
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + SESSION_MAX_AGE_SECONDS * 1000);
  await env.USERS_DB.prepare(
    'INSERT INTO sessions (user_id, token, created_at, expires_at) VALUES (?, ?, ?, ?)'
  ).bind(userId, token, createdAt.toISOString(), expiresAt.toISOString()).run();
  return token;
};

const deleteSession = async (env: SessionEnv, token: string): Promise<void> => {
  if (!env.USERS_DB) return;
  await env.USERS_DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
};

const getSessionToken = (request: Request): string | null => {
  const cookieHeader = request.headers.get('Cookie');
  const cookies = parseCookies(cookieHeader);
  return cookies[SESSION_COOKIE_NAME] || null;
};

const getSessionUser = async (env: SessionEnv, request: Request): Promise<{ id: number; email: string } | null> => {
  if (!env.USERS_DB) return null;
  const token = getSessionToken(request);
  if (!token) return null;
  const nowIso = new Date().toISOString();
  const session = await env.USERS_DB.prepare(
    `SELECT s.id, s.user_id, s.token, s.expires_at, u.email
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > ?`
  ).bind(token, nowIso).first<SessionRecord>();
  if (!session || !session.email) return null;
  return { id: session.user_id, email: session.email };
};

export {
  parseCookies,
  buildSessionCookie,
  type CookieOptions,
  createSession,
  deleteSession,
  getSessionToken,
  getSessionUser,
  type SessionEnv
};

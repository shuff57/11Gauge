import { createSession, buildSessionCookie } from '../../utils/session';
import { withAdminFlag, type AdminEnv } from '../../utils/admin';
interface Env extends AdminEnv {
  USERS_DB?: D1Database;
}

interface SignInRequest {
  email: string;
  password: string;
}

const json = (body: any, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {})
    }
  });

const hashPassword = async (password: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

export const onRequest = async ({ request, env }: { request: Request; env: Env }) => {
  console.log('[Auth] Request received');
  
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  console.log('[Auth] USERS_DB:', !!env.USERS_DB);
  
  if (!env.USERS_DB) {
    return json({ error: 'Database not configured' }, { status: 501 });
  }

  let payload: SignInRequest;
  try {
    payload = await request.json();
  } catch (e) {
    console.error('[Auth] JSON parse error:', e);
    return json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { email, password } = payload;
  console.log('[Auth] Email:', email);

  if (!email || !password) {
    return json({ error: 'Email and password are required' }, { status: 400 });
  }

  const emailLower = email.toLowerCase().trim();
  const passwordHash = await hashPassword(password);
  const secure = request.url.startsWith('https://');

  try {
    console.log('[Auth] Checking for existing user:', emailLower);
    
    // Check if user exists
    const existingUser = await env.USERS_DB.prepare(
      'SELECT id, email FROM users WHERE email = ?'
    ).bind(emailLower).first();
    
    console.log('[Auth] Existing user found:', !!existingUser);

    if (existingUser) {
      // Verify password
      const userWithPassword = await env.USERS_DB.prepare(
        'SELECT id FROM users WHERE email = ? AND password_hash = ?'
      ).bind(emailLower, passwordHash).first();

      if (!userWithPassword) {
        return json({ error: 'Invalid credentials' }, { status: 401 });
      }

      const token = await createSession(env, existingUser.id);
      const headers: HeadersInit = token ? { 'Set-Cookie': buildSessionCookie(token, { secure }) } : {};
      return json({ 
        success: true, 
        user: withAdminFlag(env, { id: existingUser.id, email: existingUser.email }),
        isNewUser: false
      }, { headers });
    }

    // Create new user
    const result = await env.USERS_DB.prepare(
      'INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)'
    ).bind(emailLower, passwordHash, new Date().toISOString()).run();

    if (!result.success) {
      throw new Error('Failed to create user');
    }

    const token = await createSession(env, result.meta.last_row_id);
    const headers: HeadersInit = token ? { 'Set-Cookie': buildSessionCookie(token, { secure }) } : {};
    return json({ 
      success: true, 
      user: withAdminFlag(env, { id: result.meta.last_row_id, email: emailLower }),
      isNewUser: true
    }, { headers });
  } catch (err: any) {
    console.error('Auth error:', err);
    return json({ error: 'Authentication failed' }, { status: 500 });
  }
};

/// <reference types="@cloudflare/workers-types" />
import { getSessionUser, type SessionEnv } from "../../utils/session";
import { isAdminEmail, type AdminEnv } from "../../utils/admin";

interface Env extends SessionEnv, AdminEnv {
  USERS_DB: D1Database;
}

const json = (body: any, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {})
    }
  });

export const onRequest = async ({ request, env }: { request: Request; env: Env }) => {
  const user = await getSessionUser(env, request);
  if (!user) {
    return json({ error: 'Not authenticated' }, { status: 401 });
  }
  if (!(await isAdminEmail(env, user.email))) {
    return json({ error: 'Forbidden' }, { status: 403 });
  }

  if (request.method === 'GET') {
    return handleList(env);
  }
  if (request.method === 'POST') {
    return handleAdd(request, env);
  }
  if (request.method === 'DELETE') {
    return handleRemove(request, env);
  }

  return new Response('Method Not Allowed', { status: 405 });
};

const handleList = async (env: Env) => {
  try {
    const { results } = await env.USERS_DB.prepare('SELECT email, created_at FROM admin_allowlist ORDER BY created_at DESC').all();
    
    // Also include env var admins for visibility, though they can't be removed via DB
    const envAdmins = (env.ADMIN_EMAILS || '')
      .split(/[,\n;]/)
      .map(e => e.trim().toLowerCase())
      .filter(Boolean);
      
    const dbEmails = new Set((results || []).map((r: any) => r.email));
    
    const combined = [...(results || [])];
    
    for (const email of envAdmins) {
      if (!dbEmails.has(email)) {
        combined.push({ email, created_at: 'System (Env Var)' });
      }
    }

    return json({ admins: combined });
  } catch (err: any) {
    return json({ error: err.message }, { status: 500 });
  }
};

const handleAdd = async (request: Request, env: Env) => {
  try {
    const { email } = await request.json() as any;
    if (!email || typeof email !== 'string') {
      return json({ error: 'Email is required' }, { status: 400 });
    }
    const normalized = email.trim().toLowerCase();
    
    await env.USERS_DB.prepare(
      'INSERT OR IGNORE INTO admin_allowlist (email, created_at) VALUES (?, ?)'
    ).bind(normalized, new Date().toISOString()).run();
    
    return json({ success: true });
  } catch (err: any) {
    return json({ error: err.message }, { status: 500 });
  }
};

const handleRemove = async (request: Request, env: Env) => {
  try {
    const { email } = await request.json() as any;
    if (!email || typeof email !== 'string') {
      return json({ error: 'Email is required' }, { status: 400 });
    }
    const normalized = email.trim().toLowerCase();
    
    // Check if it's an env var admin
    const envAdmins = (env.ADMIN_EMAILS || '')
      .split(/[,\n;]/)
      .map(e => e.trim().toLowerCase())
      .filter(Boolean);
      
    if (envAdmins.includes(normalized)) {
      return json({ error: 'Cannot remove system admin defined in environment variables.' }, { status: 400 });
    }

    await env.USERS_DB.prepare(
      'DELETE FROM admin_allowlist WHERE email = ?'
    ).bind(normalized).run();
    
    return json({ success: true });
  } catch (err: any) {
    return json({ error: err.message }, { status: 500 });
  }
};

import { OLLAMA_KEY_STORAGE_KEY, type KeyStore } from "../../utils/ollama";
import { getSessionUser } from "../../utils/session";
import { encryptText, decryptText } from "../../utils/crypto";

interface Env {
  KEY_STORE?: KeyStore;
  USERS_DB?: D1Database;
  OLLAMA_KEY_SECRET?: string;
}

const PROVIDER = "ollama";
const DEFAULT_LABEL = "Default";

const json = (body: any, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {})
    }
  });

export const onRequest = async ({ request, env }: { request: Request; env: Env }) => {
  const sessionUser = await getSessionUser(env, request);
  const secret = env.OLLAMA_KEY_SECRET;

  if (request.method === "POST") {
    if (!sessionUser || !env.USERS_DB) {
      return json({ error: 'Not authenticated' }, { status: 401 });
    }
    if (!secret) {
      return json({ error: 'Encryption secret not configured' }, { status: 500 });
    }

    const payload = await request.json().catch(() => ({}));
    const key = (payload?.key || "").trim();
    if (!key) {
      return json({ error: "API key is required." }, { status: 400 });
    }

    try {
      const encrypted = await encryptText(key, secret);
      const existing = await env.USERS_DB.prepare('SELECT id FROM user_keys WHERE user_id = ? AND provider = ? AND label = ?')
        .bind(sessionUser.id, PROVIDER, DEFAULT_LABEL)
        .first();
      const timestamp = new Date().toISOString();
      if (existing) {
        await env.USERS_DB.prepare('UPDATE user_keys SET key_value = ?, updated_at = ? WHERE id = ?')
          .bind(encrypted, timestamp, existing.id)
          .run();
      } else {
        await env.USERS_DB.prepare('INSERT INTO user_keys (user_id, provider, label, key_value, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
          .bind(sessionUser.id, PROVIDER, DEFAULT_LABEL, encrypted, timestamp, timestamp)
          .run();
      }
      return json({ success: true });
    } catch (err: any) {
      console.error('Key store error:', err);
      return json({ error: 'Failed to store key' }, { status: 500 });
    }
  }

  if (request.method === "DELETE") {
    if (!sessionUser || !env.USERS_DB) {
      return json({ error: 'Not authenticated' }, { status: 401 });
    }
    if (!secret) {
      return json({ error: 'Encryption secret not configured' }, { status: 500 });
    }
    try {
      await env.USERS_DB.prepare('DELETE FROM user_keys WHERE user_id = ? AND provider = ? AND label = ?')
        .bind(sessionUser.id, PROVIDER, DEFAULT_LABEL)
        .run();
      return json({ success: true });
    } catch (err: any) {
      console.error('Key delete error:', err);
      return json({ error: 'Failed to delete key' }, { status: 500 });
    }
  }

  // GET - return value for a user or the fallback key
  if (request.method === 'GET') {
    if (!secret) {
      return json({ error: 'Encryption secret not configured' }, { status: 500 });
    }

    if (sessionUser && env.USERS_DB) {
      try {
        const keyRow = await env.USERS_DB.prepare('SELECT key_value FROM user_keys WHERE user_id = ? AND provider = ? AND label = ?')
          .bind(sessionUser.id, PROVIDER, DEFAULT_LABEL)
          .first();
        if (!keyRow?.key_value) return json({ key: null });
        const decrypted = await decryptText(keyRow.key_value, secret);
        return json({ key: decrypted || null });
      } catch (err: any) {
        console.error('Key fetch error:', err);
        return json({ key: null, error: 'Failed to fetch key' }, { status: 500 });
      }
    }

    return json({ key: null });
  }

  return new Response("Method Not Allowed", {
    status: 405,
    headers: { Allow: "POST, DELETE" }
  });
};

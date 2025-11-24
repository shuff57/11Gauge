import { getSessionUser } from "../../utils/session";
import { encryptText, decryptText } from "../../utils/crypto";

interface Env {
  USERS_DB?: D1Database;
  OLLAMA_KEY_SECRET?: string;
}

interface KeyRow {
  id: number;
  user_id: number;
  provider: string;
  label: string;
  key_value: string;
  created_at: string;
  updated_at: string;
}

const json = (body: any, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {})
    }
  });

const fetchKey = async (env: Env, userId: number, id: number): Promise<KeyRow | null> => {
  if (!env.USERS_DB) return null;
  const row = await env.USERS_DB.prepare(
    "SELECT id, user_id, provider, label, key_value, created_at, updated_at FROM user_keys WHERE id = ? AND user_id = ?"
  )
    .bind(id, userId)
    .first<KeyRow>();
  return row || null;
};

export const onRequest = async ({ request, env, params }: { request: Request; env: Env; params: { id?: string } }) => {
  const keyId = Number(params?.id);
  if (!keyId) {
    return json({ error: "Invalid key id" }, { status: 400 });
  }

  const sessionUser = await getSessionUser(env, request);
  if (!sessionUser || !env.USERS_DB) {
    return json({ error: "Not authenticated" }, { status: 401 });
  }

  const secret = env.OLLAMA_KEY_SECRET;
  if (!secret) {
    return json({ error: "Encryption secret not configured" }, { status: 500 });
  }

  if (request.method === "GET") {
    const row = await fetchKey(env, sessionUser.id, keyId);
    if (!row) return json({ error: "Key not found" }, { status: 404 });
    const decrypted = await decryptText(row.key_value, secret);
    return json({
      key: {
        id: row.id,
        provider: row.provider,
        label: row.label,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        value: decrypted || ""
      }
    });
  }

  if (request.method === "PUT") {
    const existing = await fetchKey(env, sessionUser.id, keyId);
    if (!existing) return json({ error: "Key not found" }, { status: 404 });

    try {
      const payload = await request.json();
      const updates: string[] = [];
      const bindings: any[] = [];
      let lastFour: string | null = null;

      if (payload?.label !== undefined) {
        const label = (payload.label || "").trim();
        if (!label) throw new Error("Label is required");
        if (label.length > 60) throw new Error("Label must be 60 characters or fewer");
        updates.push("label = ?");
        bindings.push(label);
      }

      if (payload?.key !== undefined) {
        const rawKey = (payload.key || "").trim();
        if (!rawKey) throw new Error("API key is required");
        const encrypted = await encryptText(rawKey, secret);
        updates.push("key_value = ?");
        bindings.push(encrypted);
        lastFour = rawKey.slice(-4);
      }

      if (!updates.length) {
        return json({ error: "No changes provided" }, { status: 400 });
      }

      const timestamp = new Date().toISOString();
      updates.push("updated_at = ?");
      bindings.push(timestamp);
      bindings.push(keyId, sessionUser.id);

      await env.USERS_DB.prepare(
        `UPDATE user_keys SET ${updates.join(", ")} WHERE id = ? AND user_id = ?`
      )
        .bind(...bindings)
        .run();

      const refreshed = await fetchKey(env, sessionUser.id, keyId);
      if (!refreshed) {
        return json({ error: "Key not found" }, { status: 404 });
      }
      const decrypted = await decryptText(refreshed.key_value, secret);
      return json({
        key: {
          id: refreshed.id,
          provider: refreshed.provider,
          label: refreshed.label,
          createdAt: refreshed.created_at,
          updatedAt: refreshed.updated_at,
          lastFour: lastFour ?? (decrypted ? decrypted.slice(-4) : null)
        }
      });
    } catch (err: any) {
      if (err?.message?.includes("UNIQUE")) {
        return json({ error: "A key with that label already exists for this provider." }, { status: 409 });
      }
      return json({ error: err?.message || "Failed to update key" }, { status: 400 });
    }
  }

  if (request.method === "DELETE") {
    await env.USERS_DB.prepare("DELETE FROM user_keys WHERE id = ? AND user_id = ?")
      .bind(keyId, sessionUser.id)
      .run();
    return json({ success: true });
  }

  return new Response("Method Not Allowed", {
    status: 405,
    headers: { Allow: "GET, PUT, DELETE" }
  });
};

import { getSessionUser } from "../../utils/session";
import { encryptText, decryptText } from "../../utils/crypto";

interface Env {
  USERS_DB?: D1Database;
  OLLAMA_KEY_SECRET?: string;
}

interface KeyRow {
  id: number;
  provider: string;
  label: string;
  key_value: string;
  created_at: string;
  updated_at: string;
}

const AVAILABLE_PROVIDERS = new Set(["ollama", "gemini"]);

const json = (body: any, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {})
    }
  });

const normalizeProvider = (value?: string): string => {
  if (!value) throw new Error("Provider is required");
  const normalized = value.trim().toLowerCase();
  if (!AVAILABLE_PROVIDERS.has(normalized)) {
    throw new Error("Unsupported provider");
  }
  return normalized;
};

const sanitizeLabel = (value?: string): string => {
  const trimmed = (value || "").trim();
  if (!trimmed) {
    throw new Error("Label is required");
  }
  if (trimmed.length > 60) {
    throw new Error("Label must be 60 characters or fewer");
  }
  return trimmed;
};

const summarizeRow = async (row: KeyRow, secret: string) => {
  const decrypted = await decryptText(row.key_value, secret);
  return {
    id: row.id,
    provider: row.provider,
    label: row.label,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastFour: decrypted ? decrypted.slice(-4) : null
  };
};

export const onRequest = async ({ request, env }: { request: Request; env: Env }) => {
  const sessionUser = await getSessionUser(env, request);
  if (!sessionUser || !env.USERS_DB) {
    return json({ error: "Not authenticated" }, { status: 401 });
  }

  const secret = env.OLLAMA_KEY_SECRET;
  if (!secret) {
    return json({ error: "Encryption secret not configured" }, { status: 500 });
  }

  if (request.method === "GET") {
    const rows: KeyRow[] = await env.USERS_DB.prepare(
      "SELECT id, provider, label, key_value, created_at, updated_at FROM user_keys WHERE user_id = ? ORDER BY created_at DESC"
    )
      .bind(sessionUser.id)
      .all()
      .then((res: any) => res.results || []);

    const keys = await Promise.all(rows.map((row) => summarizeRow(row, secret)));
    return json({ keys });
  }

  if (request.method === "POST") {
    let provider: string;
    let label: string;
    let key: string;
    try {
      const payload = await request.json();
      provider = normalizeProvider(payload?.provider);
      label = sanitizeLabel(payload?.label);
      key = (payload?.key || "").trim();
      if (!key) throw new Error("API key is required");
    } catch (err: any) {
      return json({ error: err?.message || "Invalid payload" }, { status: 400 });
    }

    try {
      const encrypted = await encryptText(key, secret);
      const timestamp = new Date().toISOString();
      const result = await env.USERS_DB.prepare(
        "INSERT INTO user_keys (user_id, provider, label, key_value, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
      )
        .bind(sessionUser.id, provider, label, encrypted, timestamp, timestamp)
        .run();

      const id = result.meta?.last_row_id;
      return json({
        key: {
          id,
          provider,
          label,
          createdAt: timestamp,
          updatedAt: timestamp,
          lastFour: key.slice(-4)
        }
      }, { status: 201 });
    } catch (err: any) {
      if (err?.message?.includes("UNIQUE")) {
        return json({ error: "A key with that label already exists for this provider." }, { status: 409 });
      }
      console.error("Key insert error", err);
      return json({ error: "Failed to create key" }, { status: 500 });
    }
  }

  return new Response("Method Not Allowed", {
    status: 405,
    headers: { Allow: "GET, POST" }
  });
};

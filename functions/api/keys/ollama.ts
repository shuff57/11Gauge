import { OLLAMA_KEY_STORAGE_KEY, type KeyStore } from "../../utils/ollama";

interface Env {
  KEY_STORE?: KeyStore;
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
  if (!env.KEY_STORE) {
    return json({ error: "Key storage is not configured." }, { status: 501 });
  }

  if (request.method === "POST") {
    const payload = await request.json().catch(() => ({}));
    const key = (payload?.key || "").trim();
    if (!key) {
      return json({ error: "API key is required." }, { status: 400 });
    }
    await env.KEY_STORE.put(OLLAMA_KEY_STORAGE_KEY, key);
    return json({ success: true });
  }

  if (request.method === "DELETE") {
    if (typeof env.KEY_STORE.delete === "function") {
      await env.KEY_STORE.delete(OLLAMA_KEY_STORAGE_KEY);
    } else {
      await env.KEY_STORE.put(OLLAMA_KEY_STORAGE_KEY, "");
    }
    return json({ success: true });
  }

  return new Response("Method Not Allowed", {
    status: 405,
    headers: { Allow: "POST, DELETE" }
  });
};

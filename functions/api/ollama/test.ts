import {
  resolveBaseUrl,
  resolveApiKey,
  buildHeaders,
  resolveModel,
  type KeyStore
} from "../../utils/ollama";

interface Env {
  OLLAMA_URL?: string;
  OLLAMA_MODEL?: string;
  OLLAMA_TEST_MODEL?: string;
  OLLAMA_API_KEY?: string;
  KEY_STORE?: KeyStore;
}

export const onRequest = async (context: { request: Request; env: Env }) => {
  const { request, env } = context;

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  let payload: any;
  try {
    payload = await request.json();
  } catch (err) {
    return new Response(JSON.stringify({ error: "Invalid JSON body." }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const baseUrl = resolveBaseUrl(payload?.url, env.OLLAMA_URL);
    const apiKey = await resolveApiKey({
      provided: payload?.key,
      fallback: env.OLLAMA_API_KEY
    });

    // Use a lightweight model for the connectivity check when available
    const testModel = env.OLLAMA_TEST_MODEL || payload?.testModel || 'ministral-3:3b-cloud' || resolveModel(payload?.model, env.OLLAMA_MODEL);

    // Auth-sensitive check: run a tiny generate to force auth validation
    const upstream = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: buildHeaders(apiKey),
      body: JSON.stringify({
        model: testModel,
        prompt: "ping",
        stream: false,
        keep_alive: "1m"
      })
    });

    if (!upstream.ok) {
      const err = await upstream.text().catch(() => upstream.statusText);
      return new Response(JSON.stringify({ error: err || "Connection failed." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Success: return minimal JSON
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || "Connection failed." }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }
};

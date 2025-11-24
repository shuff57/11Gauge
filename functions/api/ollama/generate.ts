import {
  resolveBaseUrl,
  resolveApiKey,
  resolveModel,
  forwardToOllama,
  relayResponse
} from "../../utils/ollama";

interface Env {
  OLLAMA_URL?: string;
  OLLAMA_MODEL?: string;
  OLLAMA_API_KEY?: string;
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
    const apiKey = resolveApiKey(payload?.key, env.OLLAMA_API_KEY);
    const model = resolveModel(payload?.model, env.OLLAMA_MODEL);
    const prompt = payload?.prompt;
    const images: string[] | undefined = payload?.images;
    const stream = Boolean(payload?.stream);

    if (!prompt && (!images || images.length === 0)) {
      throw new Error("Prompt or images are required.");
    }

    const upstream = await forwardToOllama({
      baseUrl,
      apiKey,
      model,
      prompt,
      images,
      stream
    });

    return relayResponse(upstream);
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || "Request failed." }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }
};

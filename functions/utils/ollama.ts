const CLOUD_VISION_MODEL = "llama3.2-vision";

const normalizeUrl = (value?: string): string => {
  if (!value) return "";
  let clean = value.trim();
  if (!clean) return "";

  // Strip duplicated path segments and trailing slashes
  clean = clean.replace(/\/api\/?$/i, "").replace(/\/$/, "");

  if (!/^https?:\/\//i.test(clean)) {
    clean = `https://${clean}`;
  }
  return clean;
};

const resolveBaseUrl = (provided?: string, fallback?: string): string => {
  const normalized = normalizeUrl(provided || fallback);
  if (!normalized) {
    throw new Error("Missing Ollama base URL.");
  }
  return normalized;
};

const resolveApiKey = (provided?: string, fallback?: string): string | undefined => {
  const key = (provided || fallback || "").trim();
  return key || undefined;
};

const resolveModel = (provided?: string, fallback?: string): string => {
  return provided?.trim() || fallback?.trim() || CLOUD_VISION_MODEL;
};

const buildHeaders = (apiKey?: string): HeadersInit => {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }
  return headers;
};

interface ForwardOptions {
  baseUrl: string;
  apiKey?: string;
  model: string;
  prompt: string;
  images?: string[];
  stream?: boolean;
}

const forwardToOllama = async (opts: ForwardOptions): Promise<Response> => {
  const response = await fetch(`${opts.baseUrl}/api/generate`, {
    method: "POST",
    headers: buildHeaders(opts.apiKey),
    body: JSON.stringify({
      model: opts.model,
      prompt: opts.prompt,
      images: opts.images,
      stream: Boolean(opts.stream),
    })
  });
  return response;
};

const relayResponse = async (response: Response): Promise<Response> => {
  const text = await response.text();
  return new Response(text || "{}", {
    status: response.status,
    headers: {
      "Content-Type": "application/json",
    }
  });
};

export {
  CLOUD_VISION_MODEL,
  normalizeUrl,
  resolveBaseUrl,
  resolveApiKey,
  resolveModel,
  buildHeaders,
  forwardToOllama,
  relayResponse
};

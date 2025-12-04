const CLOUD_VISION_MODEL = "qwen3-vl:235b-instruct-cloud";
const OLLAMA_KEY_STORAGE_KEY = "ollama_api_key";

interface KeyStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete?(key: string): Promise<void>;
}

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

interface ApiKeyOptions {
  provided?: string;
  fallback?: string;
  store?: KeyStore;
}

const resolveApiKey = async (options: ApiKeyOptions): Promise<string | undefined> => {
  const direct = (options.provided || "").trim();
  if (direct) return direct;

  const fallback = (options.fallback || "").trim();
  if (fallback) return fallback;

  return undefined;
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
  think?: boolean | string;
  timeout?: number;
}

const forwardToOllama = async (opts: ForwardOptions): Promise<Response> => {
  const controller = new AbortController();
  // Default to 5 minutes for generation, but allow override
  const timeoutMs = opts.timeout || 300000; 
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${opts.baseUrl}/api/generate`, {
      method: "POST",
      headers: buildHeaders(opts.apiKey),
      body: JSON.stringify({
        model: opts.model,
        prompt: opts.prompt,
        images: opts.images,
        stream: Boolean(opts.stream),
        think: opts.think,
      }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Ollama request timed out after ${timeoutMs}ms`);
    }
    throw error;
  }
};

const relayResponse = (response: Response, extraHeaders?: Record<string, string>): Response => {
  const headers = new Headers(response.headers);
  // Ensure we don't block streaming
  headers.delete("Content-Length");
  headers.set("Content-Type", "application/x-ndjson");
  
  if (extraHeaders) {
    Object.entries(extraHeaders).forEach(([k, v]) => headers.set(k, v));
  }
  
  return new Response(response.body, {
    status: response.status,
    headers
  });
};

interface EmbeddingOptions {
  baseUrl: string;
  apiKey?: string;
  model: string;
  prompt: string;
  timeout?: number;
}

const generateEmbedding = async (opts: EmbeddingOptions): Promise<number[]> => {
  const controller = new AbortController();
  const timeoutMs = opts.timeout || 30000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${opts.baseUrl}/api/embeddings`, {
      method: "POST",
      headers: buildHeaders(opts.apiKey),
      body: JSON.stringify({
        model: opts.model,
        prompt: opts.prompt,
      }),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      const err = await response.text().catch(() => response.statusText);
      throw new Error(`Embedding failed (${response.status}): ${err}`);
    }

    const data = await response.json() as { embedding: number[] };
    if (!Array.isArray(data.embedding)) {
      throw new Error("Invalid embedding response format");
    }
    return data.embedding;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Embedding request timed out after ${timeoutMs}ms`);
    }
    throw error;
  }
};

export {
  CLOUD_VISION_MODEL,
  OLLAMA_KEY_STORAGE_KEY,
  type KeyStore,
  normalizeUrl,
  resolveBaseUrl,
  resolveApiKey,
  resolveModel,
  buildHeaders,
  forwardToOllama,
  relayResponse,
  generateEmbedding
};

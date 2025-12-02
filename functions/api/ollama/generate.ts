import {
  resolveBaseUrl,
  resolveApiKey,
  resolveModel,
  forwardToOllama,
  relayResponse,
  generateEmbedding,
  type KeyStore
} from "../../utils/ollama";

interface Env {
  OLLAMA_URL?: string;
  OLLAMA_MODEL?: string;
  OLLAMA_API_KEY?: string;
  OLLAMA_EMBEDDING_MODEL?: string;
  KEY_STORE?: KeyStore;
  USERS_DB?: D1Database;
  AI?: any;
}

// Cosine similarity helper
const cosineSimilarity = (a: number[], b: number[]) => {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
};

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
    const model = resolveModel(payload?.model, env.OLLAMA_MODEL);
    let prompt = payload?.prompt || "";
    const images: string[] | undefined = payload?.images;
    const stream = Boolean(payload?.stream);
    const think = Boolean(payload?.think);

    if (!prompt && (!images || images.length === 0)) {
      throw new Error("Prompt or images are required.");
    }

    let ragChunkCount = 0;

    // RAG: If we have a DB and embeddings, try to augment the prompt
    if (env.USERS_DB && prompt.length > 10) {
      try {
        let queryEmbedding: number[] | null = null;

        // 1. Generate embedding for the query
        if (env.AI) {
          console.log("[RAG] Generating embedding via Cloudflare AI...");
          const { data } = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
            text: [prompt.slice(0, 500)]
          });
          if (data && data[0]) {
            queryEmbedding = data[0];
            console.log("[RAG] Embedding generated successfully.");
          }
        } else if (env.OLLAMA_URL) {
          console.log("[RAG] Generating embedding via Ollama...");
          const embeddingModel = env.OLLAMA_EMBEDDING_MODEL || "nomic-embed-text";
          queryEmbedding = await generateEmbedding({
            baseUrl,
            apiKey,
            model: embeddingModel,
            prompt: prompt.slice(0, 500)
          });
        }

        if (queryEmbedding) {
          // Fetch all chunks with embeddings
          // Note: In production with many chunks, use Vectorize or a specialized index.
          // For < 1000 chunks, in-memory scan is fine.
          const { results } = await env.USERS_DB.prepare(`
            SELECT text_content, embedding_json, source_id FROM primary_source_chunks 
            WHERE embedding_json IS NOT NULL
          `).all();

          if (results && results.length > 0) {
            const scored = results.map((row: any) => {
              try {
                const vec = JSON.parse(row.embedding_json);
                return {
                  text: row.text_content,
                  score: cosineSimilarity(queryEmbedding!, vec)
                };
              } catch {
                return { text: "", score: -1 };
              }
            }).filter(r => r.score > 0.4); // Threshold

            scored.sort((a, b) => b.score - a.score);
            const topK = scored.slice(0, 5);

            if (topK.length > 0) {
              ragChunkCount = topK.length;
              console.log(`[RAG] Found ${topK.length} relevant chunks. Injecting context.`);
              const contextBlock = topK.map(k => k.text).join("\n\n---\n\n");
              prompt = `CONTEXT FROM KNOWLEDGE BASE:\n${contextBlock}\n\nUSER REQUEST:\n${prompt}`;
            } else {
              console.log("[RAG] No relevant chunks found above threshold.");
            }
          } else {
            console.log("[RAG] No knowledge base chunks found in DB.");
          }
        }
      } catch (ragErr) {
        console.warn("RAG augmentation failed:", ragErr);
        // Continue without RAG
      }
    }

    const upstream = await forwardToOllama({
      baseUrl,
      apiKey,
      model,
      prompt,
      images,
      stream,
      think
    });

    return relayResponse(upstream, ragChunkCount > 0 ? { 'X-RAG-Count': String(ragChunkCount) } : undefined);
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || "Request failed." }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }
};

import {
  resolveBaseUrl,
  resolveApiKey,
  resolveModel,
  forwardToOllama,
  relayResponse,
  generateEmbedding,
  type KeyStore
} from "../../utils/ollama";
import { checkRateLimit, getClientIdentifier, cleanupExpiredRateLimits } from "../../utils/rateLimit";
import { getSessionUser } from "../../utils/session";
import { buildRagPrompt, validateTextSafety } from "../../utils/promptSanitizer";

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

  // Rate limiting: 50 requests per 15 minutes per user/IP
  const user = await getSessionUser(env, request);
  const clientId = getClientIdentifier(request, user?.id);
  const rateLimitResult = await checkRateLimit(env, clientId, {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 50,
    keyPrefix: 'llm_generate'
  });

  if (!rateLimitResult.allowed) {
    return new Response(
      JSON.stringify({
        error: "Rate limit exceeded. Please try again later.",
        retryAfter: rateLimitResult.resetAt.toISOString()
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "X-RateLimit-Limit": "50",
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": rateLimitResult.resetAt.toISOString(),
          "Retry-After": String(Math.ceil((rateLimitResult.resetAt.getTime() - Date.now()) / 1000))
        }
      }
    );
  }

  // Cleanup old rate limit records (async, don't wait)
  cleanupExpiredRateLimits(env).catch(err => console.error('[RateLimit] Cleanup error:', err));

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
    const ragQuery = payload?.ragQuery; // Optional: Specific query for RAG
    const images: string[] | undefined = payload?.images;
    const stream = Boolean(payload?.stream);
    const think = payload?.think; // Allow boolean or string

    if (!prompt && (!images || images.length === 0)) {
      throw new Error("Prompt or images are required.");
    }

    let ragChunkCount = 0;

    // RAG: If we have a DB and embeddings, try to augment the prompt
    // We use ragQuery if provided, otherwise fall back to prompt (unless ragQuery is explicitly null/false to disable)
    const textToEmbed = ragQuery !== undefined ? ragQuery : prompt;
    const shouldRunRag = env.USERS_DB && textToEmbed && textToEmbed.length > 2 && ragQuery !== null;

    if (shouldRunRag) {
      try {
        let queryEmbedding: number[] | null = null;

        // 1. Generate embedding for the query
        if (env.AI) {
          console.log(`[RAG] Generating embedding via Cloudflare AI for query: "${textToEmbed.slice(0, 50)}..."`);
          const { data } = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
            text: [textToEmbed.slice(0, 500)]
          });
          if (data && data[0]) {
            queryEmbedding = data[0];
            console.log("[RAG] Embedding generated successfully.");
          }
        } else if (env.OLLAMA_URL) {
          console.log(`[RAG] Generating embedding via Ollama for query: "${textToEmbed.slice(0, 50)}..."`);
          const embeddingModel = env.OLLAMA_EMBEDDING_MODEL || "nomic-embed-text";
          queryEmbedding = await generateEmbedding({
            baseUrl,
            apiKey,
            model: embeddingModel,
            prompt: textToEmbed.slice(0, 500)
          });
        }

        if (queryEmbedding) {
          // Fetch all chunks with embeddings
          // Note: In production with many chunks, use Vectorize or a specialized index.
          // For < 1000 chunks, in-memory scan is fine.
          const { results: primaryResults } = await env.USERS_DB.prepare(`
            SELECT text_content, embedding_json, source_id FROM primary_source_chunks 
            WHERE embedding_json IS NOT NULL
          `).all();

          const { results: imageResults } = await env.USERS_DB.prepare(`
            SELECT text_content, embedding_json, image_id as source_id FROM example_image_chunks 
            WHERE embedding_json IS NOT NULL
          `).all();

          const allResults = [...(primaryResults || []), ...(imageResults || [])];

          if (allResults.length > 0) {
            const scored = allResults.map((row: any) => {
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
              // Validate chunks for potential injection attempts
              const safeChunks = topK.filter(k => {
                const validation = validateTextSafety(k.text);
                if (!validation.safe) {
                  console.warn('[RAG] Suspicious chunk detected and filtered:', validation.reason);
                }
                return validation.safe;
              });

              if (safeChunks.length > 0) {
                ragChunkCount = safeChunks.length;
                console.log(`[RAG] Found ${safeChunks.length} relevant chunks. Injecting context.`);

                // Use sanitized RAG prompt builder to prevent injection
                const contextTexts = safeChunks.map(k => k.text);
                prompt = buildRagPrompt(prompt, contextTexts);
              } else {
                console.log("[RAG] No safe chunks found after validation.");
              }
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

    // Add rate limit headers to response
    const additionalHeaders: Record<string, string> = {
      'X-RateLimit-Limit': '50',
      'X-RateLimit-Remaining': String(rateLimitResult.remainingRequests),
      'X-RateLimit-Reset': rateLimitResult.resetAt.toISOString()
    };

    if (ragChunkCount > 0) {
      additionalHeaders['X-RAG-Count'] = String(ragChunkCount);
    }

    return relayResponse(upstream, additionalHeaders);
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || "Request failed." }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }
};

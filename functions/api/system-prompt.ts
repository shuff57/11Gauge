import { DEFAULT_SYSTEM_PROMPT, DEFAULT_VISION_PROMPT } from "../../constants";

interface Env {
  SYSTEM_PROMPT?: string;
  USERS_DB?: D1Database;
}

export const onRequest = async ({ env }: { env: Env }) => {
  let systemPrompt = env.SYSTEM_PROMPT?.trim() || null;
  let visionPrompt = null;

  if (env.USERS_DB) {
    try {
      const rows = await env.USERS_DB.prepare(
        "SELECT key, value FROM system_settings WHERE key IN ('system_prompt', 'vision_prompt')"
      ).all();
      
      if (rows.results) {
        rows.results.forEach((row: any) => {
          if (row.key === 'system_prompt' && row.value) systemPrompt = row.value;
          if (row.key === 'vision_prompt' && row.value) visionPrompt = row.value;
        });
      }
    } catch (e) {
      // Ignore DB errors, fall back to defaults/env
      console.warn("Failed to read system settings from DB", e);
    }
  }

  return new Response(
    JSON.stringify({ 
      prompt: systemPrompt,
      visionPrompt: visionPrompt
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      }
    }
  );
};

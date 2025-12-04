import { getSessionUser } from "../../utils/session";
import { withAdminFlag, AdminEnv } from "../../utils/admin";
import { DEFAULT_SYSTEM_PROMPT, DEFAULT_VISION_PROMPT } from "../../../../constants";

interface Env extends AdminEnv {
  USERS_DB: D1Database;
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
  const baseUser = await getSessionUser(env, request);
  if (!baseUser) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }
  
  const sessionUser = await withAdminFlag(env, baseUser);
  if (!sessionUser.isAdmin) {
    return json({ error: "Forbidden" }, { status: 403 });
  }

  if (request.method === "GET") {
    try {
      const rows = await env.USERS_DB.prepare(
        "SELECT key, value FROM system_settings WHERE key IN ('system_prompt', 'vision_prompt')"
      ).all();
      
      const settings: Record<string, string> = {};
      if (rows.results) {
        rows.results.forEach((row: any) => {
          settings[row.key] = row.value;
        });
      }

      return json({
        systemPrompt: settings['system_prompt'] || null,
        visionPrompt: settings['vision_prompt'] || null
      });
    } catch (err: any) {
      console.error("Failed to fetch prompts", err);
      return json({ error: "Database error" }, { status: 500 });
    }
  }

  if (request.method === "POST") {
    try {
      const body = await request.json() as any;
      const { systemPrompt, visionPrompt } = body;
      const timestamp = new Date().toISOString();

      const stmt = env.USERS_DB.prepare(
        "INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
      );

      const batch = [];
      
      // If null is passed, we might want to delete the row to revert to code default, 
      // or store null/empty string. Let's store the value if provided, or delete if explicitly null?
      // For now, let's store what is sent. If the user wants "default", they might send null.
      // If they send null, we can delete the row so the app falls back to code constants.

      if (systemPrompt === null) {
        batch.push(env.USERS_DB.prepare("DELETE FROM system_settings WHERE key = 'system_prompt'"));
      } else if (systemPrompt !== undefined) {
        batch.push(stmt.bind('system_prompt', systemPrompt, timestamp));
      }

      if (visionPrompt === null) {
        batch.push(env.USERS_DB.prepare("DELETE FROM system_settings WHERE key = 'vision_prompt'"));
      } else if (visionPrompt !== undefined) {
        batch.push(stmt.bind('vision_prompt', visionPrompt, timestamp));
      }

      if (batch.length > 0) {
        await env.USERS_DB.batch(batch);
      }

      return json({ success: true });
    } catch (err: any) {
      console.error("Failed to save prompts", err);
      return json({ error: "Failed to save settings" }, { status: 500 });
    }
  }

  return new Response("Method Not Allowed", { status: 405 });
};

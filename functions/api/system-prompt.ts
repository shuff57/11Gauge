import { DEFAULT_SYSTEM_PROMPT } from "../../constants";

interface Env {
  SYSTEM_PROMPT?: string;
}

export const onRequest = async ({ env }: { env: Env }) => {
  const prompt = env.SYSTEM_PROMPT?.trim() || DEFAULT_SYSTEM_PROMPT;
  return new Response(
    JSON.stringify({ prompt }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      }
    }
  );
};

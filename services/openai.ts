import { AppSettings } from "../types";
import { SYSTEM_PROMPT } from "../constants";

export const analyzeWithOpenAI = async (base64Image: string, settings: AppSettings): Promise<string> => {
  const apiKey = settings.openaiKey;
  if (!apiKey) throw new Error("OpenAI API Key is missing.");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT
        },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: base64Image
              }
            }
          ]
        }
      ],
      max_tokens: 1000
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `OpenAI Error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || "No response content.";
};

export const testOpenAIConnection = async (settings: AppSettings): Promise<void> => {
  const apiKey = settings.openaiKey;
  if (!apiKey) throw new Error("OpenAI API Key is missing.");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "Hello" }],
      max_tokens: 5
    })
  });

  if (!response.ok) {
    throw new Error(`Connection failed: ${response.status}`);
  }
};
import { GoogleGenAI } from "@google/genai";
import { AppSettings } from "../types";
import { SYSTEM_PROMPT } from "../constants";

export const analyzeWithGemini = async (base64Image: string, settings: AppSettings): Promise<string> => {
  // Prioritize user key if provided, otherwise fallback to env
  const apiKey = settings.geminiKey || process.env.API_KEY;
  
  if (!apiKey) {
    throw new Error("Gemini API Key is missing. Please add it in settings or environment.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const model = settings.geminiModel || 'gemini-2.5-flash';

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Image,
              mimeType: 'image/jpeg', 
            },
          },
          {
            text: SYSTEM_PROMPT,
          },
        ],
      },
    });

    return response.text || "No response text generated.";
  } catch (error: any) {
    console.error("Gemini Error:", error);
    throw new Error(error.message || "Failed to analyze with Gemini.");
  }
};

export const testGeminiConnection = async (settings: AppSettings): Promise<void> => {
  const apiKey = settings.geminiKey || process.env.API_KEY;
  
  if (!apiKey) {
    throw new Error("Gemini API Key is missing.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const model = settings.geminiModel || 'gemini-2.5-flash';

  try {
    await ai.models.generateContent({
      model: model,
      contents: "Hello, can you hear me?",
    });
  } catch (error: any) {
    console.error("Gemini Connection Error:", error);
    throw new Error(error.message || "Failed to connect to Gemini.");
  }
};
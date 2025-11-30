import { GoogleGenAI } from "@google/genai";
import { AppSettings, MediaPayload } from "../types";
import { resolveSystemPrompt } from "../constants";

export const analyzeWithGemini = async (payload: MediaPayload, settings: AppSettings): Promise<string> => {
  // Prioritize user key if provided, otherwise fallback to env
  const apiKey = settings.geminiKey || process.env.API_KEY;
  
  if (!apiKey) {
    throw new Error("Gemini API Key is missing. Please add it in settings or environment.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const model = settings.geminiModel || 'gemini-2.5-flash';

  if (!payload.frames.length) {
    throw new Error('No visual data supplied for analysis.');
  }

  const descriptivePart = payload.kind === 'video'
    ? 'Analyze the following frames extracted from a short video clip. Consider their chronological order to explain the full scene.'
    : 'Analyze the provided image in detail.';

  const systemPrompt = resolveSystemPrompt(settings.systemPrompt);
  const parts = [
    { text: systemPrompt },
    { text: descriptivePart },
    ...payload.frames.map((frame) => ({
      inlineData: {
        data: frame.dataUrl.includes(',') ? frame.dataUrl.split(',')[1] : frame.dataUrl,
        mimeType: frame.mimeType || 'image/jpeg'
      }
    }))
  ];

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: [
        {
          role: 'user',
          parts
        }
      ],
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
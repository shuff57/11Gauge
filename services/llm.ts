import { AppSettings, ModelProvider } from "../types";
import { SYSTEM_PROMPT } from "../constants";
import { analyzeWithGemini, testGeminiConnection } from "./gemini";
import { analyzeWithOpenAI, testOpenAIConnection } from "./openai";

export const analyzeImage = async (
  file: File,
  settings: AppSettings
): Promise<string> => {
  const base64Image = await fileToBase64(file);
  
  switch (settings.provider) {
    case ModelProvider.GEMINI:
      return analyzeWithGemini(base64Image, settings);
    case ModelProvider.OPENAI:
      return analyzeWithOpenAI(base64Image, settings);
    case ModelProvider.OLLAMA:
      return analyzeWithOllama(base64Image, settings);
    default:
      throw new Error("Invalid provider selected");
  }
};

export const testConnection = async (settings: AppSettings): Promise<void> => {
  switch (settings.provider) {
    case ModelProvider.GEMINI:
      return testGeminiConnection(settings);
    case ModelProvider.OPENAI:
      return testOpenAIConnection(settings);
    case ModelProvider.OLLAMA:
      return testOllamaConnection(settings);
    default:
      throw new Error("Invalid provider");
  }
};

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });
};

const normalizeUrl = (url: string) => {
  let clean = url.trim().replace(/\/$/, "");
  
  // If protocol is missing
  if (!/^https?:\/\//i.test(clean)) {
    // Default to http for local connections, https for remote
    if (clean.includes('localhost') || clean.includes('127.0.0.1') || clean.includes('0.0.0.0')) {
      clean = `http://${clean}`;
    } else {
      clean = `https://${clean}`;
    }
  }
  return clean;
};

// Fetch implementation for Ollama API
const analyzeWithOllama = async (dataUri: string, settings: AppSettings): Promise<string> => {
  if (!settings.ollamaUrl) {
    throw new Error("Please configure your Ollama Cloud URL in settings.");
  }

  const rawBase64 = dataUri.split(',')[1];
  const baseUrl = normalizeUrl(settings.ollamaUrl);
  
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (settings.ollamaKey?.trim()) {
    headers["Authorization"] = `Bearer ${settings.ollamaKey.trim()}`;
  }

  try {
    const response = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: headers,
      body: JSON.stringify({
        model: settings.ollamaModel || "llava",
        prompt: SYSTEM_PROMPT,
        images: [rawBase64],
        stream: false
      })
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error("Unauthorized. Please check your API Key.");
      }
      if (response.status === 404) {
        throw new Error(`Model '${settings.ollamaModel}' not found on server.`);
      }
      throw new Error(`Request failed (${response.status}).`);
    }

    const data = await response.json();
    return data.response || "No response text generated.";
  } catch (err: any) {
    if (err instanceof TypeError && (err.message === 'Failed to fetch' || err.message.includes('NetworkError'))) {
      throw new Error('Connection failed. This is usually a CORS issue. See settings for help.');
    }
    throw err;
  }
};

const testOllamaConnection = async (settings: AppSettings): Promise<void> => {
  if (!settings.ollamaUrl) {
    throw new Error("URL is required.");
  }

  const baseUrl = normalizeUrl(settings.ollamaUrl);
  
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (settings.ollamaKey?.trim()) {
    headers["Authorization"] = `Bearer ${settings.ollamaKey.trim()}`;
  }

  // We use the generate endpoint with a simple text prompt to verify model access
  try {
    const response = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: headers,
      body: JSON.stringify({
        model: settings.ollamaModel || "llava",
        prompt: "Hello",
        stream: false
      })
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error("Unauthorized. Check API Key.");
      }
      if (response.status === 404) {
        throw new Error(`Model '${settings.ollamaModel}' not found.`);
      }
      throw new Error(`Connection failed (${response.status}).`);
    }
  } catch (err: any) {
    if (err instanceof TypeError && (err.message === 'Failed to fetch' || err.message.includes('NetworkError'))) {
      throw new Error('Connection failed. This is usually a CORS issue.');
    }
    throw err;
  }
};
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

export const saveOllamaKey = async (key?: string): Promise<boolean> => {
  const trimmed = key?.trim();
  if (!trimmed) return false;

  try {
    const response = await fetch('/api/keys/ollama', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: trimmed })
    });

    if (!response.ok) {
      console.warn('Failed to persist Ollama key', await response.text().catch(() => ''));
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Unable to store Ollama key', err);
    return false;
  }
};

export const getOllamaKey = async (): Promise<string | null> => {
  try {
    const response = await fetch('/api/keys/ollama');
    if (!response.ok) return null;
    const data = await response.json();
    return data.key || null;
  } catch (err) {
    console.warn('Failed to fetch Ollama key', err);
    return null;
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


const getOllamaModel = (settings: AppSettings) => {
  return settings.ollamaModel?.trim() || process.env.OLLAMA_MODEL || "qwen3-vl:235b-instruct-cloud";
};

// Fetch implementation for Ollama API
const analyzeWithOllama = async (dataUri: string, settings: AppSettings): Promise<string> => {
  const configuredUrl = settings.ollamaUrl || process.env.OLLAMA_URL || '';
  if (!configuredUrl) {
    throw new Error("Please configure your Ollama Cloud URL in settings or .env.");
  }

  const rawBase64 = dataUri.split(',')[1];
  const apiKey = settings.ollamaKey?.trim() || process.env.OLLAMA_API_KEY || '';

  try {
    const response = await fetch(`/api/ollama/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: configuredUrl,
        key: apiKey || undefined,
        model: getOllamaModel(settings),
        prompt: SYSTEM_PROMPT,
        images: [rawBase64],
        stream: false
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data?.error || `Request failed (${response.status}).`);
    }

    return data.response || "No response text generated.";
  } catch (err: any) {
    throw new Error(err?.message || 'Ollama request failed.');
  }
};

const testOllamaConnection = async (settings: AppSettings): Promise<void> => {
  const configuredUrl = settings.ollamaUrl || process.env.OLLAMA_URL || '';
  if (!configuredUrl) {
    throw new Error("URL is required. Provide it in settings or .env.");
  }

  const apiKey = settings.ollamaKey?.trim() || process.env.OLLAMA_API_KEY || '';

  const response = await fetch(`/api/ollama/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: configuredUrl,
      key: apiKey || undefined,
      model: getOllamaModel(settings)
    })
  });

  if (!response.ok) {
    const data = await response.json().catch(() => undefined);
    console.error("Ollama Test Failed:", { status: response.status, data });
    throw new Error(data?.error || `Connection failed (${response.status}). Check your API key and URL.`);
  }
};
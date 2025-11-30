import { ModelProvider, AppSettings } from './types';

export const SYSTEM_PROMPT = `
You are a highly capable vision analysis AI. 
Analyze the provided image and return a concise but comprehensive breakdown.
Format your response in Markdown.
Structure your response as follows:
1. **Summary**: A one-sentence overview.
2. **Key Elements**: Bullet points of main subjects or objects.
3. **Visual Style**: Description of colors, lighting, and aesthetic.
4. **Text Content**: Any visible text (if applicable).
`;

const defaultOllamaUrl = process.env.OLLAMA_URL || '';
const defaultCloudVisionModel = 'qwen3-vl:235b-instruct-cloud';
const defaultOllamaModel = process.env.OLLAMA_MODEL || defaultCloudVisionModel;
const defaultOllamaKey = '';
const defaultGeminiKey = '';

export const DEFAULT_SETTINGS: AppSettings = {
  provider: ModelProvider.OLLAMA,
  geminiKey: defaultGeminiKey,
  geminiModel: 'gemini-2.5-flash',
  openaiKey: '',
  ollamaUrl: defaultOllamaUrl,
  ollamaModel: defaultOllamaModel,
  ollamaKey: defaultOllamaKey,
  geminiKeyId: null,
  openaiKeyId: null,
  ollamaKeyId: null,
};

export const MODEL_LABELS = {
  [ModelProvider.GEMINI]: 'Google (Gemini)',
  [ModelProvider.OPENAI]: 'OpenAI (ChatGPT)',
  [ModelProvider.OLLAMA]: 'Ollama (OpenSource)',
};

export const GEMINI_MODELS = [
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (Fast)' },
  { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
  { value: 'gemini-3-pro-preview', label: 'Gemini 3 Pro (Reasoning)' },
];
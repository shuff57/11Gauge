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

export const DEFAULT_SETTINGS: AppSettings = {
  provider: ModelProvider.GEMINI,
  geminiKey: '',
  geminiModel: 'gemini-2.5-flash',
  openaiKey: '',
  ollamaUrl: '', // Default to empty to encourage user input for Cloud URL
  ollamaModel: 'llava',
  ollamaKey: '',
};

export const MODEL_LABELS = {
  [ModelProvider.GEMINI]: 'Gemini',
  [ModelProvider.OPENAI]: 'OpenAI',
  [ModelProvider.OLLAMA]: 'Ollama',
};

export const GEMINI_MODELS = [
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (Fast)' },
  { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
  { value: 'gemini-3-pro-preview', label: 'Gemini 3 Pro (Reasoning)' },
];
export enum ModelProvider {
  GEMINI = 'GEMINI',
  OPENAI = 'OPENAI',
  OLLAMA = 'OLLAMA'
}

export interface AppSettings {
  provider: ModelProvider;
  geminiKey: string;
  geminiModel: string;
  openaiKey: string;
  ollamaUrl: string;
  ollamaModel: string;
  ollamaKey: string;
}

export interface AnalysisResult {
  text: string;
  loading: boolean;
  error?: string;
}

export type VisionService = (
  base64Image: string,
  settings: AppSettings
) => Promise<string>;
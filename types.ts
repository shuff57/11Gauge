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

export type MediaKind = 'image' | 'video';

export interface MediaFrame {
  dataUrl: string;
  mimeType: string;
  timestampSeconds?: number;
}

export interface MediaPayload {
  frames: MediaFrame[];
  kind: MediaKind;
  durationSeconds?: number;
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
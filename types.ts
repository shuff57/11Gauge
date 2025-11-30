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
  geminiKeyId?: number | null;
  openaiKeyId?: number | null;
  ollamaKeyId?: number | null;
  systemPrompt?: string | null;
}

export interface SessionUser {
  id?: number;
  email: string;
  isAdmin?: boolean;
}

export interface PrimarySourceSummary {
  id: string;
  title: string;
  originalName: string;
  summary: string | null;
  pageCount: number;
  chunkCount: number;
  createdAt: string;
}

export interface PrimarySourceChunk {
  id: string;
  order: number;
  page: number;
  text: string;
}

export interface PrimarySourceManifest extends PrimarySourceSummary {
  version?: number;
  chunks: PrimarySourceChunk[];
}

export interface PrimarySourceUploadManifest {
  title: string;
  originalName: string;
  summary?: string;
  pageCount: number;
  chunks: PrimarySourceChunk[];
  version?: number;
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

export type AnalysisPhase =
  | 'preparing-media'
  | 'processing-video'
  | 'awaiting-model'
  | 'receiving-response';

export interface AnalysisProgress {
  phase: AnalysisPhase;
  message?: string;
  framesCaptured?: number;
  totalFrames?: number;
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
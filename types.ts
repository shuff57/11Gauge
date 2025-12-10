export enum ModelProvider {
  OLLAMA = 'OLLAMA',
  GEMINI = 'GEMINI'
}

export interface AppSettings {
  provider: ModelProvider;
  ollamaUrl: string;
  ollamaModel: string; // Legacy/Single model
  ollamaReasoningModel?: string; // Step 2: Reasoning/Scoring
  ollamaKey: string;
  ollamaKeyId?: number | null;
  ollamaThinking?: boolean;
  ollamaThinkingLevel?: 'low' | 'medium' | 'high';
  cloudflareAiModel?: string;
  geminiKey?: string;
  geminiModel?: string;
  geminiKeyId?: number | null;
  systemPrompt?: string | null;
  visionPrompt?: string | null;
  materialType?: string;
  weldProcess?: string;
  materialThickness?: string;
  jointType?: string;
  weldPosition?: string;
  rodType?: string;
  autoIncludeReferences?: boolean;
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

export type ExampleImageLabel = 'good' | 'bad';

export interface RubricObservation {
  criterion: string;
  observed_condition: string;
  matches_reference: string; // tolerance status (e.g., within_tolerance | borderline | out_of_tolerance)
  score?: string;
  variance_estimate?: string;
}

export interface RubricDefect {
  type: string;
  severity: string; // 'minor' | 'moderate' | 'severe'
  location: string;
}

export interface StructuredAnalysis {
  overall_grade?: string;
  feedback?: string;
  student_observations: RubricObservation[];
  detected_defects: RubricDefect[];
}

export interface ExampleImageSummary {
  id: string;
  label: ExampleImageLabel;
  title: string;
  description: string | null;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  imageUrl: string;
  createdAt: string;
  materialType?: string;
  weldProcess?: string;
  materialThickness?: string;
  jointType?: string;
  weldPosition?: string;
  structuredAnalysis?: StructuredAnalysis;
}

export interface ExampleImageUploadInput {
  label: ExampleImageLabel;
  title?: string;
  description?: string;
  materialType?: string;
  weldProcess?: string;
  materialThickness?: string;
  jointType?: string;
  weldPosition?: string;
  aiDescription?: string;
  structuredAnalysis?: StructuredAnalysis;
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

export interface OllamaMetrics {
  totalDurationSeconds: number;
  loadDurationSeconds: number;
  promptEvalCount: number;
  promptEvalDurationSeconds: number;
  evalCount: number;
  evalDurationSeconds: number;
}

export type VisionService = (
  base64Image: string,
  settings: AppSettings
) => Promise<string>;
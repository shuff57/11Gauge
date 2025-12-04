import type {
  PrimarySourceSummary,
  PrimarySourceManifest,
  PrimarySourceUploadManifest,
  PrimarySourceChunk
} from "../types";

// @ts-ignore
let cachedPdfjs: typeof import("pdfjs-dist/legacy/build/pdf") | null = null;

const ensurePdfjs = async () => {
  if (cachedPdfjs) return cachedPdfjs;
  const [pdfModule, workerModule] = await Promise.all([
    // @ts-ignore
    import("pdfjs-dist/legacy/build/pdf"),
    // @ts-ignore
    import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url")
  ]);
  pdfModule.GlobalWorkerOptions.workerSrc = workerModule.default;
  cachedPdfjs = pdfModule;
  return cachedPdfjs;
};

export type SourceUploadPhase = 'idle' | 'extracting' | 'uploading';

interface UploadOptions {
  onPhaseChange?: (phase: SourceUploadPhase, message?: string) => void;
  maxPages?: number;
}

const chunkCache = new Map<string, PrimarySourceManifest>();

const DEFAULT_CHUNK_SIZE = 1200; // characters
const DEFAULT_CHUNK_OVERLAP = 120;
const MAX_CHUNKS = 80;
const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25MB safeguard

export const processAndUploadPrimarySource = async (
  file: File,
  options?: UploadOptions
): Promise<PrimarySourceSummary> => {
  if (file.type !== 'application/pdf') {
    throw new Error('Only PDF uploads are supported.');
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('PDF exceeds the 25MB upload limit.');
  }

  options?.onPhaseChange?.('extracting', 'Extracting text and segmenting pages...');
  const manifest = await buildUploadManifest(file, options);

  options?.onPhaseChange?.('uploading', 'Uploading cached source...');
  const summary = await uploadManifest(file, manifest);
  chunkCache.delete(summary.id); // ensure re-fetch for latest manifest
  return summary;
};

const buildUploadManifest = async (
  file: File,
  options?: UploadOptions
): Promise<PrimarySourceUploadManifest> => {
  const pdfjsLib = await ensurePdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjsLib.getDocument({ data });
  const pdf = await loadingTask.promise;

  const maxPages = options?.maxPages && options.maxPages > 0
    ? Math.min(options.maxPages, pdf.numPages)
    : pdf.numPages;

  const chunks: PrimarySourceChunk[] = [];
  for (let i = 1; i <= maxPages; i += 1) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const normalized = textContent.items
      .map((item: any) => (typeof item.str === 'string' ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!normalized) continue;
    const pageChunks = splitIntoChunks(normalized, DEFAULT_CHUNK_SIZE, DEFAULT_CHUNK_OVERLAP);
    pageChunks.forEach((text, idx) => {
      chunks.push({
        id: crypto.randomUUID(),
        order: chunks.length,
        page: i,
        text
      });
      if (chunks.length >= MAX_CHUNKS) {
        return finalizeManifest(pdf.numPages, file.name, chunks);
      }
    });
  }

  if (!chunks.length) {
    throw new Error('No extractable text was found in the PDF.');
  }

  return finalizeManifest(pdf.numPages, file.name, chunks);
};

const finalizeManifest = (
  pageCount: number,
  filename: string,
  chunks: PrimarySourceChunk[]
): PrimarySourceUploadManifest => {
  const limited = chunks.slice(0, MAX_CHUNKS);
  const title = deriveTitle(filename);
  const summary = limited[0].text.slice(0, 240);

  return {
    title,
    originalName: filename,
    summary,
    pageCount,
    chunks: limited,
    version: 1
  };
};

const splitIntoChunks = (text: string, size: number, overlap: number): string[] => {
  if (text.length <= size) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(text.length, start + size);
    chunks.push(text.slice(start, end));
    if (end === text.length) break;
    start = Math.max(0, end - overlap);
  }
  return chunks;
};

const deriveTitle = (filename: string): string => {
  const base = filename.replace(/\.pdf$/i, '').trim();
  if (base) return base;
  return `Primary Source ${new Date().toLocaleDateString()}`;
};

const uploadManifest = async (
  file: File,
  manifest: PrimarySourceUploadManifest
): Promise<PrimarySourceSummary> => {
  const formData = new FormData();
  formData.append('file', file, file.name);
  formData.append('manifest', JSON.stringify(manifest));

  const response = await fetch('/api/sources', {
    method: 'POST',
    body: formData,
    credentials: 'include'
  });

  const payload = await response.json().catch(() => null) as any;
  if (!response.ok) {
    throw new Error(payload?.error || 'Failed to upload primary source.');
  }

  if (!payload?.source) {
    throw new Error('Malformed response from server.');
  }

  return payload.source as PrimarySourceSummary;
};

export const fetchPrimarySources = async (): Promise<PrimarySourceSummary[]> => {
  const response = await fetch('/api/sources', { credentials: 'include' });
  if (response.status === 401) {
    throw new Error('Sign in to manage primary sources.');
  }
  const payload = await response.json().catch(() => null) as any;
  if (!response.ok) {
    throw new Error(payload?.error || 'Unable to load primary sources.');
  }
  return Array.isArray(payload?.sources) ? payload.sources : [];
};

export const fetchPrimarySourceManifest = async (id: string): Promise<PrimarySourceManifest> => {
  if (chunkCache.has(id)) {
    return chunkCache.get(id)!;
  }
  const response = await fetch(`/api/sources/${id}/chunks`, { credentials: 'include' });
  const payload = await response.json().catch(() => null) as any;
  if (!response.ok) {
    throw new Error(payload?.error || 'Unable to load source manifest.');
  }
  if (!payload?.chunks) {
    throw new Error('Manifest response missing chunk data.');
  }
  const manifest = payload as PrimarySourceManifest;
  chunkCache.set(id, manifest);
  return manifest;
};

export const deletePrimarySource = async (id: string): Promise<void> => {
  const response = await fetch(`/api/sources/${id}`, {
    method: 'DELETE',
    credentials: 'include'
  });
  const payload = await response.json().catch(() => null) as any;
  if (!response.ok) {
    throw new Error(payload?.error || 'Failed to delete primary source.');
  }
  chunkCache.delete(id);
};

export const invalidatePrimarySourceCache = (id?: string) => {
  if (id) {
    chunkCache.delete(id);
    return;
  }
  chunkCache.clear();
};

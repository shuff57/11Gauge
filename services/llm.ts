// Service for handling LLM interactions and media processing
import { AppSettings, AnalysisProgress, MediaPayload, ModelProvider } from "../types";
import { resolveSystemPrompt } from "../constants";
import { analyzeWithOpenAI, testOpenAIConnection } from "./openai";

export const VIDEO_UPLOAD_LIMITS = {
  maxDurationSeconds: 45,
  maxFileBytes: 80 * 1024 * 1024,
  maxFrames: 12
} as const;

const TARGET_FRAME_SPACING_SECONDS = 1;
const MIN_SAMPLE_INTERVAL_SECONDS = 0.4;
const MAX_SAMPLE_INTERVAL_SECONDS = 3.5;
const MOTION_SAMPLE_WIDTH = 96;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

type ProgressCallback = (progress: AnalysisProgress) => void;
interface AnalyzeMediaOptions {
  onProgress?: ProgressCallback;
}

const finalizeWithProgress = async (
  runner: () => Promise<string>,
  onProgress?: ProgressCallback
): Promise<string> => {
  const result = await runner();
  onProgress?.({ phase: 'receiving-response', message: 'Formatting insights...' });
  return result;
};

export const analyzeMedia = async (
  file: File,
  settings: AppSettings,
  options?: AnalyzeMediaOptions
): Promise<string> => {
  options?.onProgress?.({ phase: 'preparing-media', message: 'Preparing upload...' });
  const payload = await buildMediaPayload(file, options?.onProgress);
  options?.onProgress?.({ phase: 'awaiting-model', message: 'Sending media to model...' });

  switch (settings.provider) {
    case ModelProvider.GEMINI:
      return finalizeWithProgress(
        () => import("./gemini").then(({ analyzeWithGemini }) => analyzeWithGemini(payload, settings)),
        options?.onProgress
      );
    case ModelProvider.OPENAI:
      return finalizeWithProgress(() => analyzeWithOpenAI(payload, settings), options?.onProgress);
    case ModelProvider.OLLAMA:
      return finalizeWithProgress(() => analyzeWithOllama(payload, settings), options?.onProgress);
    default:
      throw new Error("Invalid provider selected");
  }
};

export const testConnection = async (settings: AppSettings): Promise<void> => {
  switch (settings.provider) {
    case ModelProvider.GEMINI:
      return import("./gemini").then(({ testGeminiConnection }) => testGeminiConnection(settings));
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

const getOllamaModel = (settings: AppSettings) => {
  return settings.ollamaModel?.trim() || process.env.OLLAMA_MODEL || "qwen3-vl:235b-instruct-cloud";
};

const analyzeWithOllama = async (payload: MediaPayload, settings: AppSettings): Promise<string> => {
  const configuredUrl = settings.ollamaUrl || process.env.OLLAMA_URL || '';
  if (!configuredUrl) {
    throw new Error("Please configure your Ollama Cloud URL in settings or .env.");
  }

  const apiKey = settings.ollamaKey?.trim() || process.env.OLLAMA_API_KEY || '';
  const images = payload.frames.map((frame) => {
    if (!frame.dataUrl) return '';
    return frame.dataUrl.includes(',') ? frame.dataUrl.split(',')[1] : frame.dataUrl;
  }).filter(Boolean);

  if (!images.length) {
    throw new Error("No visual data was detected in the upload.");
  }

  const systemPrompt = resolveSystemPrompt(settings.systemPrompt);
  const promptPrefix = payload.kind === 'video'
    ? `${systemPrompt}\n\nThe user supplied a short video clip that has been converted into ${images.length} chronological frames. Analyze trends across the frames as a single scene.`
    : systemPrompt;

  try {
    const response = await fetch(`/api/ollama/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: configuredUrl,
        key: apiKey || undefined,
        model: getOllamaModel(settings),
        prompt: promptPrefix,
        images,
        stream: true
      })
    });

    if (!response.ok) {
      const failure = await response.json().catch(() => undefined);
      throw new Error(failure?.error || `Request failed (${response.status}).`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Unable to read streaming response.');
    }

    let acc = '';
    const decoder = new TextDecoder();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true }).trim();
      if (!chunk) continue;
      for (const line of chunk.split('\n')) {
        if (!line) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed?.response) {
            acc += parsed.response;
          }
        } catch {
          // ignore partial lines until they form valid JSON
        }
      }
    }

    return acc || "No response text generated.";
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

const buildMediaPayload = async (
  file: File,
  onProgress?: ProgressCallback
): Promise<MediaPayload> => {
  const mimeType = file.type || '';
  const isImage = mimeType.startsWith('image/');
  const isVideo = mimeType.startsWith('video/');

  if (!isImage && !isVideo) {
    throw new Error('Only image or video uploads are supported.');
  }

  if (isVideo) {
    if (file.size > VIDEO_UPLOAD_LIMITS.maxFileBytes) {
      const maxMb = Math.floor(VIDEO_UPLOAD_LIMITS.maxFileBytes / (1024 * 1024));
      throw new Error(`Video files must be smaller than ${maxMb}MB.`);
    }
    onProgress?.({ phase: 'processing-video', message: 'Extracting frames...' });
    return extractVideoPayload(file, onProgress);
  }

  const dataUrl = await fileToBase64(file);
  onProgress?.({ phase: 'preparing-media', message: 'Image ready for analysis.' });
  return {
    frames: [{ dataUrl, mimeType: mimeType || 'image/jpeg', timestampSeconds: 0 }],
    kind: 'image'
  };
};

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });
};

const extractVideoPayload = (
  file: File,
  onProgress?: ProgressCallback
): Promise<MediaPayload> => {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'auto';
    video.src = objectUrl;
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';

    let seekListener: (() => void) | null = null;
    let loadedDataListener: (() => void) | null = null;
    let isProcessing = false;

    const cleanup = () => {
      if (seekListener) video.removeEventListener('seeked', seekListener);
      if (loadedDataListener) video.removeEventListener('loadeddata', loadedDataListener);
      URL.revokeObjectURL(objectUrl);
      video.pause();
      video.removeAttribute('src');
      try {
        video.load();
      } catch {}
    };

    const fail = (message: string) => {
      if (isProcessing) return; // Prevent double failures
      isProcessing = true;
      cleanup();
      reject(new Error(message));
    };

    video.onerror = (e) => {
      console.error('[Frame Extraction] Video error:', e);
      fail('Unable to read the selected video.');
    };

    video.onloadedmetadata = () => {
      const duration = video.duration;

      if (!Number.isFinite(duration) || duration <= 0) {
        return fail('Unable to determine video duration. Please try another clip.');
      }

      if (duration > VIDEO_UPLOAD_LIMITS.maxDurationSeconds) {
        return fail(`Videos must be ${VIDEO_UPLOAD_LIMITS.maxDurationSeconds} seconds or shorter.`);
      }

      const targetSpacing = duration < 10 ? 0.5 : duration > 30 ? 2 : TARGET_FRAME_SPACING_SECONDS;
      const isDurationAdjusted = targetSpacing !== TARGET_FRAME_SPACING_SECONDS;
      let isMotionAdjusted = false;

      const safeEnd = Math.max(duration - 0.08, 0);
      const frameCount = Math.min(
        VIDEO_UPLOAD_LIMITS.maxFrames,
        Math.max(1, Math.ceil(duration / targetSpacing))
      );

      const frameTargets: number[] = [0];
      const extendTimeline = (motionScore?: number | null) => {
        if (frameTargets.length >= frameCount) return;
        const remainingSlots = frameCount - frameTargets.length;
        const lastTime = frameTargets[frameTargets.length - 1];
        const remainingDuration = Math.max(0, safeEnd - lastTime);
        const baseSpacing = remainingSlots > 0 ? remainingDuration / remainingSlots : targetSpacing;
        const baseInterval = Math.max(MIN_SAMPLE_INTERVAL_SECONDS, baseSpacing);
        const motionInterval = typeof motionScore === 'number'
          ? Math.max(
              MIN_SAMPLE_INTERVAL_SECONDS,
              MAX_SAMPLE_INTERVAL_SECONDS - motionScore * (MAX_SAMPLE_INTERVAL_SECONDS - MIN_SAMPLE_INTERVAL_SECONDS)
            )
          : null;
        
        if (motionInterval && motionInterval < baseInterval - 0.05) {
          isMotionAdjusted = true;
        }

        const chosenInterval = motionInterval ? Math.min(baseInterval, motionInterval) : baseInterval;
        const boundedInterval = Math.max(MIN_SAMPLE_INTERVAL_SECONDS, chosenInterval);
        const nextTime = Math.min(safeEnd, lastTime + boundedInterval);
        if (nextTime - lastTime < 0.05 && safeEnd > lastTime) {
          frameTargets.push(Number(Math.min(safeEnd, lastTime + MIN_SAMPLE_INTERVAL_SECONDS).toFixed(3)));
        } else {
          frameTargets.push(Number(nextTime.toFixed(3)));
        }
      };

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return fail('Unable to capture video frames in this browser.');

      const frames: MediaPayload['frames'] = [];
      let index = 0;
      let seekTimeout: number | null = null;
      let isSeeking = false;

      const motionAnalyzer = createMotionAnalyzer(video);

      const captureFrame = () => {
        if (isProcessing) return; // Already completed or failed

        const currentTargetTime = frameTargets[index] ?? frameTargets[frameTargets.length - 1] ?? video.currentTime;
        console.log(`[Frame Extraction] Capturing frame ${frames.length + 1}/${frameCount} at ${video.currentTime.toFixed(2)}s (target ${currentTargetTime.toFixed(2)}s)`);
        console.log(`[Frame Extraction] Video state: readyState=${video.readyState}, paused=${video.paused}, videoWidth=${video.videoWidth}`);
        
        if (video.readyState < 2 || video.videoWidth === 0) {
          console.warn('[Frame Extraction] Video not ready, waiting...');
          setTimeout(() => captureFrame(), 100);
          return;
        }

        try {
          canvas.width = video.videoWidth || 720;
          canvas.height = video.videoHeight || 720;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          const motionScore = motionAnalyzer.measure();

          frames.push({
            dataUrl,
            mimeType: 'image/jpeg',
            timestampSeconds: Number(currentTargetTime.toFixed(2))
          });
          
          const adjustments = [];
          if (isDurationAdjusted) adjustments.push('duration');
          if (isMotionAdjusted) adjustments.push('motion');
          const adjText = adjustments.length ? ` (${adjustments.join('+')} active)` : '';

          onProgress?.({
            phase: 'processing-video',
            message: `Captured frame ${frames.length}/${frameCount}${adjText}`,
            framesCaptured: frames.length,
            totalFrames: frameCount
          });
          
          index += 1;
          isSeeking = false;

          const reachedEnd = frameTargets[index - 1] >= safeEnd - 0.05;
          if (frames.length >= frameCount || reachedEnd) {
            console.log('[Frame Extraction] Complete - all frames captured');
            isProcessing = true;
            if (seekTimeout) clearTimeout(seekTimeout);
            cleanup();
            resolve({ frames, kind: 'video', durationSeconds: duration });
            return;
          }

          extendTimeline(motionScore);
          seekToNextFrame();
        } catch (err) {
          console.error('[Frame Extraction] Capture error:', err);
          fail(`Failed to capture frame: ${err}`);
        }
      };

      const seekToNextFrame = () => {
        if (isSeeking || isProcessing) return;
        if (index >= frameCount) return;
        
        isSeeking = true;
        const targetTime = frameTargets[index] ?? frameTargets[frameTargets.length - 1] ?? safeEnd;
        
        console.log(`[Frame Extraction] Seeking to ${targetTime.toFixed(2)}s (frame ${index + 1}/${frameCount})`);
        
        if (seekTimeout) clearTimeout(seekTimeout);
        
        seekTimeout = window.setTimeout(() => {
          if (!isProcessing && isSeeking) {
            console.warn('[Frame Extraction] Seek timeout - attempting recovery');
            isSeeking = false;
            captureFrame();
          }
        }, 5000);
        
        try {
          video.currentTime = targetTime;
        } catch (err) {
          console.error('[Frame Extraction] Seek error:', err);
          isSeeking = false;
          fail('Unable to advance through the video.');
        }
      };

      const onSeeked = () => {
        console.log('[Frame Extraction] Seeked event fired, currentTime=' + video.currentTime.toFixed(2));
        if (seekTimeout) clearTimeout(seekTimeout);
        if (!isSeeking || isProcessing) return;
        
        // Small delay to ensure frame is rendered on mobile
        setTimeout(() => captureFrame(), 50);
      };
      
      seekListener = onSeeked;
      video.addEventListener('seeked', onSeeked);

      const startCapture = () => {
        console.log(`[Frame Extraction] Starting capture - ${frameCount} frames over ${duration.toFixed(2)}s`);
        console.log(`[Frame Extraction] Initial targets:`, frameTargets);
        console.log(`[Frame Extraction] Video readyState: ${video.readyState}`);
        
        onProgress?.({
          phase: 'processing-video',
          message: 'Starting frame extraction...',
          framesCaptured: 0,
          totalFrames: frameCount
        });
        
        // Give video time to fully load on mobile
        setTimeout(() => {
          try {
            seekToNextFrame();
          } catch (err) {
            console.error('[Frame Extraction] Start error:', err);
            fail('Unable to start video capture.');
          }
        }, 100);
      };

      // Set overall timeout for entire extraction process
      const overallTimeout = setTimeout(() => {
        if (!isProcessing) {
          console.error('[Frame Extraction] Overall timeout exceeded');
          fail('Video processing took too long. Try a shorter video.');
        }
      }, 30000); // 30 second max for entire process

      const loadedHandler = () => {
        console.log('[Frame Extraction] Video loaded, readyState:', video.readyState);
        if (video.readyState >= 2) {
          startCapture();
        }
      };

      if (video.readyState >= 2) {
        startCapture();
      } else {
        loadedDataListener = loadedHandler;
        video.addEventListener('loadeddata', loadedHandler, { once: true });
        
        // Fallback if loadeddata never fires
        setTimeout(() => {
          if (!isProcessing && video.readyState >= 2) {
            console.warn('[Frame Extraction] loadeddata timeout, starting anyway');
            startCapture();
          }
        }, 2000);
      }
    };
  });
};

const createMotionAnalyzer = (video: HTMLVideoElement) => {
  const width = Math.max(1, Math.min(MOTION_SAMPLE_WIDTH, video.videoWidth || MOTION_SAMPLE_WIDTH));
  const aspect = video.videoWidth ? video.videoHeight / video.videoWidth : 1;
  const height = Math.max(1, Math.round(width * (aspect || 1)));

  const motionCanvas = document.createElement('canvas');
  motionCanvas.width = width;
  motionCanvas.height = height;
  const motionCtx = motionCanvas.getContext('2d', { willReadFrequently: true });
  let lastSample: Uint8ClampedArray | null = null;

  return {
    measure: (): number | null => {
      if (!motionCtx) return null;
      motionCtx.drawImage(video, 0, 0, width, height);
      const imageData = motionCtx.getImageData(0, 0, width, height).data;
      if (!lastSample) {
        lastSample = new Uint8ClampedArray(imageData);
        return 1;
      }
      let diff = 0;
      for (let i = 0; i < imageData.length; i += 4) {
        diff += Math.abs(imageData[i] - lastSample[i]);
        diff += Math.abs(imageData[i + 1] - lastSample[i + 1]);
        diff += Math.abs(imageData[i + 2] - lastSample[i + 2]);
      }
      const maxDiff = (imageData.length / 4) * 255 * 3;
      const normalized = clamp(diff / maxDiff, 0, 1);
      lastSample = new Uint8ClampedArray(imageData);
      return normalized;
    }
  };
};
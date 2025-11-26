import { AppSettings, MediaPayload, ModelProvider } from "../types";
import { SYSTEM_PROMPT } from "../constants";
import { analyzeWithGemini, testGeminiConnection } from "./gemini";
import { analyzeWithOpenAI, testOpenAIConnection } from "./openai";

export const VIDEO_UPLOAD_LIMITS = {
  maxDurationSeconds: 45,
  maxFileBytes: 80 * 1024 * 1024,
  maxFrames: 6
} as const;

const VIDEO_FRAME_SPACING_SECONDS = 2;

export const analyzeMedia = async (
  file: File,
  settings: AppSettings
): Promise<string> => {
  const payload = await buildMediaPayload(file);

  switch (settings.provider) {
    case ModelProvider.GEMINI:
      return analyzeWithGemini(payload, settings);
    case ModelProvider.OPENAI:
      return analyzeWithOpenAI(payload, settings);
    case ModelProvider.OLLAMA:
      return analyzeWithOllama(payload, settings);
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

  const promptPrefix = payload.kind === 'video'
    ? `${SYSTEM_PROMPT}\n\nThe user supplied a short video clip that has been converted into ${images.length} chronological frames. Analyze trends across the frames as a single scene.`
    : SYSTEM_PROMPT;

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

const buildMediaPayload = async (file: File): Promise<MediaPayload> => {
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
    return extractVideoPayload(file);
  }

  const dataUrl = await fileToBase64(file);
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

const extractVideoPayload = (file: File): Promise<MediaPayload> => {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.src = objectUrl;
    video.muted = true;
    video.playsInline = true;

    let seekListener: (() => void) | null = null;

    const cleanup = () => {
      URL.revokeObjectURL(objectUrl);
      video.pause();
      video.removeAttribute('src');
      try {
        video.load();
      } catch {}
    };

    const fail = (message: string) => {
      if (seekListener) {
        video.removeEventListener('seeked', seekListener);
      }
      cleanup();
      reject(new Error(message));
    };

    video.onerror = () => fail('Unable to read the selected video.');

    video.onloadedmetadata = () => {
      const duration = video.duration;

      if (!Number.isFinite(duration) || duration <= 0) {
        return fail('Unable to determine video duration. Please try another clip.');
      }

      if (duration > VIDEO_UPLOAD_LIMITS.maxDurationSeconds) {
        return fail(`Videos must be ${VIDEO_UPLOAD_LIMITS.maxDurationSeconds} seconds or shorter.`);
      }

      const safeEnd = Math.max(duration - 0.08, 0);
      const frameCount = Math.min(
        VIDEO_UPLOAD_LIMITS.maxFrames,
        Math.max(1, Math.ceil(duration / VIDEO_FRAME_SPACING_SECONDS))
      );
      const sampleTimes = buildSampleTimeline(safeEnd, frameCount);

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return fail('Unable to capture video frames in this browser.');

      const frames: MediaPayload['frames'] = [];
      let index = 0;

      const captureFrame = () => {
        canvas.width = video.videoWidth || 720;
        canvas.height = video.videoHeight || 720;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
        frames.push({
          dataUrl,
          mimeType: 'image/jpeg',
          timestampSeconds: Number(sampleTimes[index].toFixed(2))
        });
        index += 1;

        if (index >= sampleTimes.length) {
          video.removeEventListener('seeked', onSeeked);
          cleanup();
          resolve({ frames, kind: 'video', durationSeconds: duration });
          return;
        }

        requestAnimationFrame(() => {
          try {
            video.currentTime = sampleTimes[index];
          } catch (err) {
            fail('Unable to advance through the video.');
          }
        });
      };

      const onSeeked = () => captureFrame();
      seekListener = onSeeked;
      video.addEventListener('seeked', onSeeked);

      const startCapture = () => {
        try {
          video.currentTime = sampleTimes[0];
        } catch (err) {
          fail('Unable to start video capture.');
        }
      };

      if (video.readyState >= 2) {
        startCapture();
      } else {
        video.addEventListener('loadeddata', startCapture, { once: true });
      }
    };
  });
};

const buildSampleTimeline = (safeEnd: number, count: number): number[] => {
  if (count <= 1 || safeEnd <= 0) {
    return [0];
  }

  const interval = safeEnd / (count - 1);
  const times: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const t = Number((i * interval).toFixed(3));
    times.push(t);
  }
  return times;
};
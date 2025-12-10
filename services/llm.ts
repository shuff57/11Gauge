// Service for handling LLM interactions and media processing
import { AppSettings, AnalysisProgress, MediaPayload, ModelProvider, ExampleImageSummary } from "../types";
import { resolveSystemPrompt, resolveVisionPrompt } from "../constants";
import { getCachedExampleImageUrl } from "./exampleImages";

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

const detectMediaKind = (file: File): 'image' | 'video' | null => {
  const mimeType = file.type || '';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  return null;
};

const resolveGeminiKey = (apiKey?: string) => {
  // Clean common copy/paste patterns like GEMINI_API_KEY=... and quoted values
  const raw = (apiKey || process.env.GEMINI_API_KEY || '').trim();
  const withoutPrefix = raw.replace(/^GEMINI_API_KEY\s*=\s*/i, '');
  const unquoted = withoutPrefix.replace(/^['"](.+)['"]$/, '$1');
  const key = unquoted.trim();
  if (!key) {
    throw new Error('Please add a Gemini API key in Settings.');
  }
  return key;
};

const isGeminiLiveModel = (modelId: string) => /-live\b/i.test(modelId || '');

type ProgressCallback = (progress: AnalysisProgress) => void;
interface AnalyzeMediaOptions {
  onProgress?: ProgressCallback;
  onPartialResponse?: (text: string) => void;
  onThinking?: (text: string) => void;
  onMetrics?: (metrics: import("../types").OllamaMetrics) => void;
  onStructuredAnalysis?: (analysis: any) => void;
  referenceImages?: ExampleImageSummary[];
}

const finalizeWithProgress = async (
  runner: () => Promise<string>,
  onProgress?: ProgressCallback
): Promise<string> => {
  const result = await runner();
  onProgress?.({ phase: 'receiving-response', message: 'Formatting insights...' });
  return result;
};

const analyzeWithGeminiLive = async (
  payload: MediaPayload,
  settings: AppSettings,
  onProgress?: ProgressCallback,
  onThinking?: (text: string) => void
): Promise<string> => {
  const apiKey = resolveGeminiKey(settings.geminiKey);
  const modelId = settings.geminiModel || 'gemini-2.5-flash-live';

  if (!payload.frames.length) {
    throw new Error('No visual data found to analyze.');
  }

  const first = payload.frames[0];
  const base64 = first.dataUrl.includes(',') ? first.dataUrl.split(',')[1] : first.dataUrl;
  if (!base64) {
    throw new Error('Unable to read image data.');
  }

  onProgress?.({ phase: 'awaiting-model', message: `Connecting to Gemini Live (${modelId})...` });

  const systemPrompt = resolveSystemPrompt(settings.systemPrompt);
  const wsUrl = `wss://generativelanguage.googleapis.com/v1beta/live:connect?key=${encodeURIComponent(apiKey)}`;

  return await new Promise<string>((resolve, reject) => {
    let accumulated = '';
    let closed = false;

    const fail = (err: any) => {
      if (closed) return;
      closed = true;
      reject(err instanceof Error ? err : new Error(String(err || 'Gemini Live connection failed.')));
    };

    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);
    } catch (err) {
      return fail(err);
    }

    ws.onopen = () => {
      const setupMessage = {
        model: `models/${modelId}`,
        systemInstruction: { parts: [{ text: systemPrompt }] },
        // Single-turn input with inline image and prompt
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { data: base64, mimeType: first.mimeType || 'image/jpeg' } },
              { text: 'Analyze using the provided system prompt.' }
            ]
          }
        ]
      };

      try {
        ws.send(JSON.stringify(setupMessage));
      } catch (err) {
        fail(err);
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string);
        const chunkText = msg?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join(' ');
        if (chunkText) {
          accumulated += chunkText;
          onThinking?.(accumulated);
        }

        const finishReason = msg?.candidates?.[0]?.finishReason || msg?.done || msg?.status === 'completed';
        if (finishReason && !closed) {
          closed = true;
          ws.close();
          resolve(accumulated.trim() || '');
        }
      } catch (err) {
        // Ignore malformed fragments, keep streaming
      }
    };

    ws.onerror = (event) => {
      fail(new Error('Gemini Live connection error.'));
    };

    ws.onclose = () => {
      if (closed) return;
      closed = true;
      if (accumulated.trim()) {
        resolve(accumulated.trim());
      } else {
        reject(new Error('Gemini Live connection closed without response.'));
      }
    };
  });
};

const analyzeWithGemini = async (
  payload: MediaPayload,
  settings: AppSettings,
  onProgress?: ProgressCallback,
  onThinking?: (text: string) => void
): Promise<string> => {
  const apiKey = resolveGeminiKey(settings.geminiKey);
  const modelId = settings.geminiModel || 'gemini-2.5-flash';

  if (modelId.toLowerCase().startsWith('gemma')) {
    throw new Error('Gemma models are text-only and not supported via this Gemini endpoint. Please choose a Gemini vision-capable model.');
  }

  if (isGeminiLiveModel(modelId)) {
    return analyzeWithGeminiLive(payload, settings, onProgress, onThinking);
  }

  if (!payload.frames.length) {
    throw new Error('No visual data found to analyze.');
  }

  // Use the first frame for now; Gemini handles multiple images but we keep it simple.
  const first = payload.frames[0];
  const base64 = first.dataUrl.includes(',') ? first.dataUrl.split(',')[1] : first.dataUrl;
  if (!base64) {
    throw new Error('Unable to read image data.');
  }

  onProgress?.({ phase: 'awaiting-model', message: `Sending to Gemini (${modelId})...` });

  const systemPrompt = resolveSystemPrompt(settings.systemPrompt);
  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: systemPrompt },
          { inlineData: { data: base64, mimeType: first.mimeType || 'image/jpeg' } }
        ]
      }
    ]
  };

  // Prefer streaming endpoint so we can surface thinking/partials
  const streamUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:streamGenerateContent?key=${encodeURIComponent(apiKey)}`;
  const streamResp = await fetch(streamUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!streamResp.ok) {
    const errText = await streamResp.text().catch(() => '');
    throw new Error(`Gemini request failed: ${streamResp.status} ${streamResp.statusText} ${errText}`.trim());
  }

  let accumulated = '';
  if (streamResp.body && 'getReader' in streamResp.body) {
    const reader = streamResp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        const payloadStr = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed;
        if (!payloadStr || payloadStr === '[DONE]') continue;
        try {
          const json = JSON.parse(payloadStr);
          const chunkText = json?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join(' ');
          if (chunkText) {
            accumulated += chunkText;
            onThinking?.(accumulated);
          }
        } catch (e) {
          // ignore JSON parse issues on partial lines
        }
      }
    }
    if (accumulated.trim()) {
      onThinking?.(accumulated.trim());
      return accumulated.trim();
    }
  }

  // Fallback to non-streaming if body not readable
  const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`Gemini request failed: ${resp.status} ${resp.statusText} ${errText}`.trim());
  }

  const json = await resp.json() as any;
  const text = json?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join(' ').trim();
  if (text) {
    onThinking?.(text);
    return text;
  }
  return 'No response returned from Gemini.';
};

export const analyzeMedia = async (
  fileOrFiles: File | File[],
  settings: AppSettings,
  options?: AnalyzeMediaOptions
): Promise<string> => {
  const files = Array.isArray(fileOrFiles)
    ? fileOrFiles.filter((f): f is File => Boolean(f))
    : [fileOrFiles];
  if (!files.length) {
    throw new Error('Please select an image or video to analyze.');
  }

  const kinds = files.map(detectMediaKind);
  const primaryKind = kinds[0];

  if (!primaryKind) {
    throw new Error('Only image or video uploads are supported.');
  }

  const mixedKinds = kinds.some((k) => k !== primaryKind);
  if (mixedKinds) {
    throw new Error('Please upload either images or a single video at a time.');
  }

  if (primaryKind === 'video' && files.length > 1) {
    throw new Error('Only one video can be analyzed at a time.');
  }

  options?.onProgress?.({ phase: 'preparing-media', message: 'Preparing upload...' });
  const payload = await buildMediaPayload(files, options?.onProgress);
  options?.onProgress?.({ phase: 'awaiting-model', message: 'Sending media to model...' });

  if (settings.provider === ModelProvider.OLLAMA) {
    return finalizeWithProgress(
      () =>
        analyzeWithOllama(
          payload,
          settings,
          options?.onPartialResponse,
          options?.onThinking,
          options?.onMetrics,
          options?.onProgress,
          options?.referenceImages,
          options?.onStructuredAnalysis
        ),
      options?.onProgress
    );
  }

  if (settings.provider === ModelProvider.GEMINI) {
    return finalizeWithProgress(
      () => analyzeWithGemini(payload, settings, options?.onProgress, options?.onThinking),
      options?.onProgress
    );
  }

  throw new Error("Selected provider is not supported yet.");
};

export const testConnection = async (settings: AppSettings): Promise<void> => {
  if (settings.provider === ModelProvider.OLLAMA) {
    return testOllamaConnection(settings);
  }
  if (settings.provider === ModelProvider.GEMINI) {
    return testGeminiConnection(settings);
  }
  throw new Error("Selected provider is not supported yet.");
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
    const data = await response.json() as any;
    return data.key || null;
  } catch (err) {
    console.warn('Failed to fetch Ollama key', err);
    return null;
  }
};

const getOllamaModel = (settings: AppSettings) => {
  return settings.ollamaModel?.trim() || process.env.OLLAMA_MODEL || "qwen3-vl:235b-instruct-cloud";
};

const testGeminiConnection = async (settings: AppSettings): Promise<void> => {
  const apiKey = resolveGeminiKey(settings.geminiKey);
  const modelId = settings.geminiModel || 'gemini-2.5-flash';

  if (modelId.toLowerCase().startsWith('gemma')) {
    throw new Error('Gemma models are text-only and are not available via this Gemini API. Select a supported Gemini model to test.');
  }

  if (isGeminiLiveModel(modelId)) {
    await new Promise<void>((resolve, reject) => {
      let ws: WebSocket;
      try {
        ws = new WebSocket(`wss://generativelanguage.googleapis.com/v1beta/live:connect?key=${encodeURIComponent(apiKey)}`);
      } catch (err) {
        return reject(err);
      }

      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('Gemini Live test timed out.'));
      }, 8000);

      ws.onopen = () => {
        try {
          ws.send(JSON.stringify({ model: `models/${modelId}`, contents: [{ role: 'user', parts: [{ text: 'ping' }] }] }));
        } catch (err) {
          clearTimeout(timeout);
          reject(err);
        }
      };

      ws.onmessage = () => {
        clearTimeout(timeout);
        ws.close();
        resolve();
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('Gemini Live connection error.'));
      };

      ws.onclose = () => {
        clearTimeout(timeout);
      };
    });
    return;
  }
  const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'ping' }] }] })
  });
  if (!resp.ok) {
    throw new Error(`Gemini test failed: ${resp.status} ${resp.statusText}`);
  }
  const json = await resp.json().catch(() => null);
  const text = (json as any)?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join(' ').trim();
  if (!text) {
    throw new Error('No response from Gemini.');
  }
};

const analyzeWithOllama = async (
  payload: MediaPayload, 
  settings: AppSettings, 
  onPartial?: (text: string) => void,
  onThinking?: (text: string) => void,
  onMetrics?: (metrics: import("../types").OllamaMetrics) => void,
  onProgress?: ProgressCallback,
  referenceImages?: ExampleImageSummary[],
  onStructuredAnalysis?: (analysis: any) => void
): Promise<string> => {
  const configuredUrl = settings.ollamaUrl || process.env.OLLAMA_URL || '';
  // We allow empty URL here so the backend can use its own OLLAMA_URL env var if available.
  // if (!configuredUrl) {
  //   throw new Error("Please configure your Ollama Cloud URL in settings or .env.");
  // }

  const apiKey = settings.ollamaKey?.trim() || process.env.OLLAMA_API_KEY || '';
  const images = payload.frames.map((frame) => {
    if (!frame.dataUrl) return '';
    return frame.dataUrl.includes(',') ? frame.dataUrl.split(',')[1] : frame.dataUrl;
  }).filter(Boolean);

  if (!images.length) {
    throw new Error("No visual data was detected in the upload.");
  }

  // --- REFERENCE IMAGE PREPARATION ---
  let referenceContext = "";
  if (referenceImages && referenceImages.length > 0) {
    onProgress?.({ phase: 'preparing-media', message: 'Attaching reference examples...' });
    
    // Fetch and convert reference images to base64
    const refPromises = referenceImages.map(async (ref, idx) => {
      try {
        const url = await getCachedExampleImageUrl(ref.id, ref.imageUrl);
        const response = await fetch(url);
        const blob = await response.blob();
        const reader = new FileReader();
        return new Promise<string | null>((resolve) => {
          reader.onloadend = () => {
            const base64 = reader.result as string;
            resolve(base64.includes(',') ? base64.split(',')[1] : base64);
          };
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        });
      } catch (e) {
        console.warn(`Failed to load reference image ${ref.id}`, e);
        return null;
      }
    });

    const refBase64s = await Promise.all(refPromises);
    const validRefs = refBase64s.filter(Boolean) as string[];
    
    if (validRefs.length > 0) {
      // Append reference images to the main images array
      // The user's image(s) are first.
      const userImageCount = images.length;
      images.push(...validRefs);
      
      referenceContext = `\n\nREFERENCE IMAGES ATTACHED:
I have attached ${validRefs.length} reference images for comparison.
The first ${userImageCount} image(s) are the student's weld to be analyzed.
The subsequent images are reference examples:`;

      referenceImages.forEach((ref, i) => {
        // Calculate the index in the combined array (1-based for human readability)
        const refIndex = userImageCount + i + 1;
        const type = ref.label === 'good' ? 'EXEMPLAR (Good)' : 'DEFECTIVE (Bad)';
        referenceContext += `\n- Image ${refIndex}: ${type} - ${ref.title || 'Untitled'}. ${ref.description || ''}`;
      });
      
      referenceContext += `\n\nINSTRUCTION: Compare the student's weld (Image 1) against these references. specifically citing if the student has achieved the qualities of the Exemplars or exhibits the flaws of the Defective examples.`;
    }
  }

  // --- PIPELINE LOGIC ---
  // If a reasoning model is configured, we use the 2-step pipeline.
  // The vision model is hardcoded to qwen3-vl as per requirements.
  const visionModel = "qwen3-vl:235b-instruct-cloud";
  // Use the 2-step pipeline (vision → reasoning/grading) when a reasoning model is configured
  const usePipeline = Boolean(settings.ollamaReasoningModel);

  const normalizeVisionStatus = (value?: string | null) => {
    const lower = (value || '').toLowerCase().trim();
    if (lower === 'pass') return 'within_tolerance';
    if (lower === 'fail') return 'out_of_tolerance';
    if (lower === 'partial') return 'borderline';
    if (['within_tolerance', 'borderline', 'out_of_tolerance', 'not_evaluated'].includes(lower)) return lower;
    return lower || 'not_evaluated';
  };

  if (usePipeline) {
    // STEP 1: Vision Extraction
    onProgress?.({ phase: 'awaiting-model', message: 'Analyzing visual features (Step 1/2)...' });
    
    let visionPrompt = resolveVisionPrompt(settings.visionPrompt);

    const visionResponse = await fetchOllamaGenerate({
      url: configuredUrl,
      key: apiKey,
      model: visionModel,
      prompt: visionPrompt,
      images,
      stream: true, // Stream to keep connection alive, but we buffer it
      think: false, // Vision models usually don't think
      ragQuery: null // Disable RAG for vision step
    }, (partial) => {
      // Stream vision output to the Thinking UI while in progress
      onThinking?.(`### Vision Analysis (Step 1/2)\n\`\`\`json\n${partial}\n\`\`\``);
    });

    const visualFindings = visionResponse.text;
    
    // Format the vision output for the UI trace to be human-readable
    let visionTrace = `### Vision Analysis (Step 1/2)\n\`\`\`json\n${visualFindings}\n\`\`\``;
    try {
      const cleanJson = visualFindings.replace(/```json\n?|\n?```/g, '').trim();
      const data = JSON.parse(cleanJson);
      
      if (onStructuredAnalysis) {
        onStructuredAnalysis(data);
      }

      let readable = "### 👁️ Vision Analysis Findings\n\n";
      
      if (data.detected_defects && Array.isArray(data.detected_defects) && data.detected_defects.length > 0) {
        readable += "**⚠️ Defects Detected:**\n";
        data.detected_defects.forEach((d: any) => {
          readable += `- **${d.type}** (${d.severity}): ${d.location}\n`;
        });
        readable += "\n";
      } else {
        readable += "**✅ No Obvious Defects Detected**\n\n";
      }

      if (data.student_observations && Array.isArray(data.student_observations)) {
        readable += "**🔍 Observations:**\n";
        data.student_observations.forEach((o: any) => {
          const tol = normalizeVisionStatus(o.matches_reference);
          const statusIcon = tol === 'within_tolerance' ? '✅' : tol === 'out_of_tolerance' ? '❌' : tol === 'borderline' ? '⚠️' : 'ℹ️';
          const label = tol.replace(/_/g, ' ');
          readable += `- ${statusIcon} **${o.criterion}** (${label}): ${o.observed_condition}\n`;
        });
      }
      
      visionTrace = readable;
    } catch (e) {
      console.warn("Could not format vision JSON for display", e);
    }

    // Surface the formatted vision summary to the Thinking panel once complete
    onThinking?.(visionTrace);

    console.log("--- [Pipeline] Step 1 (Vision) Complete ---");
    console.log("Visual Findings JSON:", visualFindings);

    // STEP 2: Reasoning & Scoring
    onProgress?.({ phase: 'receiving-response', message: 'Generating feedback report (Step 2/2)...' });

    // Construct RAG query from visual findings
    let ragQuery = "welding defects troubleshooting";
    try {
      // Strip markdown code blocks if present
      const jsonStr = visualFindings.replace(/```json\n?|\n?```/g, '').trim();
      const findings = JSON.parse(jsonStr);
      
      const defects = findings.detected_defects?.map((d: any) => d.type).join(', ');
      const observations = findings.student_observations
        ?.filter((o: any) => {
          const status = normalizeVisionStatus(o.matches_reference);
          return status !== 'within_tolerance' && status !== 'not_evaluated';
        })
        .map((o: any) => o.criterion)
        .join(', ');
      
      const parts = [];
      if (settings.weldProcess) parts.push(settings.weldProcess);
      if (settings.materialType) parts.push(settings.materialType);
      if (defects) parts.push(`defects: ${defects}`);
      if (observations) parts.push(`issues: ${observations}`);
      
      if (parts.length > 0) {
        ragQuery = `How to fix ${parts.join(' ')} in welding`;
      }
    } catch (e) {
      console.warn('Failed to parse vision JSON for RAG query construction', e);
    }

    const systemPrompt = resolveSystemPrompt(settings.systemPrompt);
    let reasoningPrompt = `${systemPrompt}\n\n`;

    // Append material context
    const materialContext = [];
    if (settings.materialType) materialContext.push(`Material Type: ${settings.materialType}`);
    if (settings.weldProcess) materialContext.push(`Weld Process: ${settings.weldProcess}`);
    if (settings.materialThickness) materialContext.push(`Material Thickness: ${settings.materialThickness}`);
    if (settings.jointType) materialContext.push(`Joint Type: ${settings.jointType}`);
    if (settings.weldPosition) materialContext.push(`Weld Position: ${settings.weldPosition}`);
    if (settings.rodType && settings.weldProcess === 'SMAW') materialContext.push(`Rod Type: ${settings.rodType}`);

    if (materialContext.length > 0) {
      reasoningPrompt += `CONTEXT:\nThe user has provided the following specifications for this weld:\n${materialContext.join('\n')}\n\n`;
    }

    // Inject reference images context here (reasoning step only) so grading compares against exemplars/defectives.
    if (referenceContext) {
      reasoningPrompt += `${referenceContext}\n\n`;
    }

    reasoningPrompt += `You are provided with structured visual observations in JSON format below.

**INPUT DATA:**
\`\`\`json
${visualFindings}
\`\`\`

**TASK:**
Act as the Welding Instructor defined in your system prompt. Use the \`student_observations\` and \`detected_defects\` from the JSON above to populate your report following the structure defined in your system instructions.

Based on the visual analysis above and the provided context, evaluate the weld according to this rubric. Provide the scores and feedback.`;

    console.log("--- [Pipeline] Step 2 (Reasoning) Starting ---");
    console.log("Target Model:", settings.ollamaReasoningModel);
    console.log("RAG Query Generated:", ragQuery);
    
    const thinkValue = settings.ollamaReasoningModel?.includes('gpt-oss') 
        ? (settings.ollamaThinkingLevel || 'low') 
        : (settings.ollamaThinking ?? true);
    console.log("Thinking Configuration:", thinkValue);

    console.log("Handing over structured vision data to reasoning model...");

    const finalResponse = await fetchOllamaGenerate({
      url: configuredUrl,
      key: apiKey,
      model: settings.ollamaReasoningModel!,
      prompt: reasoningPrompt,
      images: [], // No images for reasoning model
      stream: true,
      think: settings.ollamaReasoningModel?.includes('gpt-oss') 
        ? (settings.ollamaThinkingLevel || 'low') 
        : (settings.ollamaThinking ?? true),
      ragQuery: ragQuery // Inject dynamic query based on defects
    }, onPartial, onThinking, onMetrics);

    // --- POST-PROCESSING: Extract Grades from Reasoning Report ---
    // The user prefers the grades generated by the reasoning model over the vision model.
    // We parse the Markdown table and merge it with the vision findings.
    try {
      const reasoningText = finalResponse.text;
      const visionData = JSON.parse(visualFindings.replace(/```json\n?|\n?```/g, '').trim());
      
      // 1. Extract Overall Grade
      // Look for "**Final Grade:** B+ (8.5/10)" or similar patterns
      const gradeMatch = reasoningText.match(/\*\*Final Grade:\*\*.*?(?:(\d+(?:\.\d+)?)\/10)/i);
      if (gradeMatch) {
        visionData.overall_grade = gradeMatch[1] + "/10";
      }

      // 2. Extract Table Rows for Criteria Scores
      // Table format: | Criterion | Score (0–10) | Pass/Fail | Notes |
      const lines = reasoningText.split('\n');
      let inTable = false;
      const reasoningScores: Record<string, { score: string, status: string, notes: string }> = {};

      for (const line of lines) {
        if (line.includes('| Criterion |') || line.includes('|-----------|')) {
          inTable = true;
          continue;
        }
        // Stop if we hit a new section (header) or empty line after table
        if (inTable && !line.trim().startsWith('|') && line.trim() !== '') {
          inTable = false;
        }

        if (inTable && line.trim().startsWith('|')) {
          const parts = line.split('|').map(p => p.trim()).filter(p => p);
          if (parts.length >= 2) {
            // parts[0] = Criterion, parts[1] = Score, parts[2] = Pass/Fail, parts[3] = Notes
            const name = parts[0];
            const score = parts[1]?.replace('/10', '').trim();
            const status = parts[2]?.toLowerCase();
            const notes = parts[3] || '';
            
            if (name && score) {
              reasoningScores[name.toLowerCase()] = { score, status, notes };
            }
          }
        }
      }

      // 3. Merge into Vision Data
      if (visionData.student_observations) {
        visionData.student_observations = visionData.student_observations.map((obs: any) => {
          const key = obs.criterion?.toLowerCase();
          // Fuzzy match or direct match
          const match = Object.keys(reasoningScores).find(k => k.includes(key) || key.includes(k));
          
          if (match) {
            const r = reasoningScores[match];
            return {
              ...obs,
              score: r.score,
              matches_reference: normalizeVisionStatus(r.status),
              // We append the reasoning notes to the vision observation for completeness
              observed_condition: r.notes ? `${obs.observed_condition} \n\nInstructor Note: ${r.notes}` : obs.observed_condition
            };
          }
          return obs;
        });
      }

      // 4. Extract Feedback Summary
      // Grab "Key Strengths" and "Primary Issues" as feedback
      const strengthsMatch = reasoningText.match(/\*\*Key Strengths:\*\*([\s\S]*?)(?=\*\*Primary Issues:|$)/i);
      const issuesMatch = reasoningText.match(/\*\*Primary Issues:\*\*([\s\S]*?)(?=\*\*Next Practice Strategies:|$)/i);
      
      let feedback = "";
      if (strengthsMatch) feedback += "Strengths: " + strengthsMatch[1].trim().replace(/^- /gm, '').replace(/\n/g, '; ') + "\n";
      if (issuesMatch) feedback += "Issues: " + issuesMatch[1].trim().replace(/^- /gm, '').replace(/\n/g, '; ');
      
      if (feedback) {
        visionData.feedback = feedback.trim();
      }

      // Update the UI with the merged analysis
      if (onStructuredAnalysis) {
        console.log("Updating Structured Analysis with Reasoning Grades:", visionData);
        onStructuredAnalysis(visionData);
      }

    } catch (e) {
      console.warn("Failed to merge reasoning grades into structured analysis", e);
    }

    return finalResponse.text;
  }

  // --- LEGACY / SINGLE MODEL LOGIC ---
  const systemPrompt = resolveSystemPrompt(settings.systemPrompt);
  let promptPrefix = payload.kind === 'video'
    ? `${systemPrompt}\n\nThe user supplied a short video clip that has been converted into ${images.length} chronological frames. Analyze trends across the frames as a single scene.`
    : systemPrompt;

  if (referenceContext) {
    promptPrefix += referenceContext;
  }

  // Append material context if available
  const materialContext = [];
  if (settings.materialType) materialContext.push(`Material Type: ${settings.materialType}`);
  if (settings.weldProcess) materialContext.push(`Weld Process: ${settings.weldProcess}`);
  if (settings.materialThickness) materialContext.push(`Material Thickness: ${settings.materialThickness}`);
  if (settings.jointType) materialContext.push(`Joint Type: ${settings.jointType}`);
  if (settings.weldPosition) materialContext.push(`Weld Position: ${settings.weldPosition}`);
  if (settings.rodType && settings.weldProcess === 'SMAW') materialContext.push(`Rod Type: ${settings.rodType}`);

  if (materialContext.length > 0) {
    promptPrefix += `\n\nCONTEXT:\nThe user has provided the following specifications for this weld:\n${materialContext.join('\n')}\n\nPlease use these specifications to grade the weld accordingly.`;
  }

  const response = await fetchOllamaGenerate({
    url: configuredUrl,
    key: apiKey,
    model: getOllamaModel(settings),
    prompt: promptPrefix,
    images,
    stream: true,
    think: false, // Vision models like qwen3-vl don't support native "thinking" states
    // Inject relevant handbook definitions by querying for key rubric terms
    ragQuery: "welding defects definitions undercut porosity cold lap bead consistency penetration profile"
  }, (partial) => {
    // Smart Stream Splitting:
    // If the output starts with a JSON block (Step 1), divert it to the "Thinking" trace.
    // Once the JSON block closes, stream the rest to the main result.
    
    // Check if we are still in the initial JSON block
    const jsonBlockEnd = partial.indexOf('```', 4); // Look for closing block (skip first ```json)
    
    if (partial.trimStart().startsWith('```json') && jsonBlockEnd === -1) {
      // We are inside the open JSON block -> Stream to Thinking
      onThinking?.(`### Visual Analysis (Streaming)\n${partial}`);
    } else if (partial.trimStart().startsWith('```json') && jsonBlockEnd !== -1) {
      // JSON block has closed.
      // 1. Update Thinking with the full JSON block
      const jsonPart = partial.substring(0, jsonBlockEnd + 3);
      onThinking?.(`### Visual Analysis (Complete)\n${jsonPart}`);
      
      // 2. Stream the rest to Result
      const rest = partial.substring(jsonBlockEnd + 3).trim();
      if (rest) {
        onPartial?.(rest);
      }
    } else {
      // No JSON block detected at start, or we are past it -> Stream everything to Result
      onPartial?.(partial);
    }
  }, onThinking, onMetrics, onProgress); // Pass onProgress for RAG notifications

  // Attempt to extract structured data from the single-pass response to update the UI
  try {
    const jsonMatch = response.text.match(/```json\n([\s\S]*?)\n```/);
    if (jsonMatch && jsonMatch[1] && onStructuredAnalysis) {
      const data = JSON.parse(jsonMatch[1]);
      onStructuredAnalysis(data);
    }
  } catch (e) {
    console.warn("Failed to parse structured data from single-pass response", e);
  }

  return response.text;
};

  // Helper to handle the fetch and streaming logic
const fetchOllamaGenerate = async (
  params: {
    url: string;
    key?: string;
    model: string;
    prompt: string;
    images?: string[];
    stream?: boolean;
    think?: boolean | string;
    ragQuery?: string | null;
  },
  onPartial?: (text: string) => void,
  onThinking?: (text: string) => void,
  onMetrics?: (metrics: import("../types").OllamaMetrics) => void,
  onProgress?: ProgressCallback
): Promise<{ text: string }> => {
  try {
    console.log(`[Ollama API] Sending request to ${params.model}. Thinking: ${params.think}`);
    const response = await fetch(`/api/ollama/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params)
    });    if (!response.ok) {
      const failure = await response.json().catch(() => undefined) as any;
      throw new Error(failure?.error || `Request failed (${response.status}).`);
    }

    // Check for RAG header
    const ragCount = response.headers.get('X-RAG-Count');
    if (ragCount && Number(ragCount) > 0) {
      onProgress?.({
        phase: 'receiving-response',
        message: `Found ${ragCount} relevant chunks in knowledge base. Injecting context.`
      });
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Unable to read streaming response.');
    }

    let acc = '';
    let thinkingAcc = '';
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      // Keep the last partial line in the buffer
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed?.thinking) {
            thinkingAcc += parsed.thinking;
            onThinking?.(thinkingAcc);
          }
          if (parsed?.response) {
            acc += parsed.response;
            onPartial?.(acc);
          }
          if (parsed?.done && parsed?.total_duration) {
            onMetrics?.({
              totalDurationSeconds: (parsed.total_duration || 0) / 1e9,
              loadDurationSeconds: (parsed.load_duration || 0) / 1e9,
              promptEvalCount: parsed.prompt_eval_count || 0,
              promptEvalDurationSeconds: (parsed.prompt_eval_duration || 0) / 1e9,
              evalCount: parsed.eval_count || 0,
              evalDurationSeconds: (parsed.eval_duration || 0) / 1e9
            });
          }
        } catch {
          // ignore malformed lines
        }
      }
    }

    // Process any remaining buffer
    if (buffer.trim()) {
      try {
        const parsed = JSON.parse(buffer);
        if (parsed?.thinking) {
          thinkingAcc += parsed.thinking;
          onThinking?.(thinkingAcc);
        }
        if (parsed?.response) {
          acc += parsed.response;
          onPartial?.(acc);
        }
        if (parsed?.done && parsed?.total_duration) {
          onMetrics?.({
            totalDurationSeconds: (parsed.total_duration || 0) / 1e9,
            loadDurationSeconds: (parsed.load_duration || 0) / 1e9,
            promptEvalCount: parsed.prompt_eval_count || 0,
            promptEvalDurationSeconds: (parsed.prompt_eval_duration || 0) / 1e9,
            evalCount: parsed.eval_count || 0,
            evalDurationSeconds: (parsed.eval_duration || 0) / 1e9
          });
        }
      } catch {
        // ignore
      }
    }

    return { text: acc || "No response text generated." };
  } catch (err: any) {
    throw new Error(err?.message || 'Ollama request failed.');
  }
};

const testOllamaConnection = async (settings: AppSettings): Promise<void> => {
  const configuredUrl = settings.ollamaUrl || process.env.OLLAMA_URL || '';
  // Allow empty URL to fall back to backend env var
  // if (!configuredUrl) {
  //   throw new Error("URL is required. Provide it in settings or .env.");
  // }

  const apiKey = settings.ollamaKey?.trim() || process.env.OLLAMA_API_KEY || '';

  const maskedKey = apiKey ? `${apiKey.slice(0, 4)}...${apiKey.slice(-2)}` : '(none)';
  console.log('[TestConnection] Sending Ollama test', {
    url: configuredUrl || '(backend default)',
    model: getOllamaModel(settings),
    keyProvided: Boolean(apiKey),
    keyPreview: maskedKey
  });

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
    const data = await response.json().catch(() => undefined) as any;
    console.error("Ollama Test Failed:", { status: response.status, data });
    throw new Error(data?.error || `Connection failed (${response.status}). Check your API key and URL.`);
  }

  console.log('[TestConnection] Ollama test succeeded');
};

const buildMediaPayload = async (
  files: File[],
  onProgress?: ProgressCallback
): Promise<MediaPayload> => {
  const list = files.filter((f): f is File => Boolean(f));
  const primary = list[0];

  if (!primary) {
    throw new Error('No media provided.');
  }

  const primaryKind = detectMediaKind(primary);

  if (!primaryKind) {
    throw new Error('Only image or video uploads are supported.');
  }

  if (primaryKind === 'video') {
    if (list.length > 1) {
      throw new Error('Only one video can be analyzed at a time.');
    }
    if (primary.size > VIDEO_UPLOAD_LIMITS.maxFileBytes) {
      const maxMb = Math.floor(VIDEO_UPLOAD_LIMITS.maxFileBytes / (1024 * 1024));
      throw new Error(`Video files must be smaller than ${maxMb}MB.`);
    }
    onProgress?.({ phase: 'processing-video', message: 'Extracting frames...' });
    return extractVideoPayload(primary, onProgress);
  }

  const frames: MediaPayload['frames'] = [];
  for (let i = 0; i < list.length; i++) {
    const file = list[i];
    if (detectMediaKind(file) !== 'image') {
      throw new Error('Please upload only images when attaching multiple files.');
    }
    const mimeType = file.type || 'image/jpeg';
    const dataUrl = await fileToBase64(file);
    frames.push({ dataUrl, mimeType, timestampSeconds: i });
    if (list.length > 1) {
      onProgress?.({ phase: 'preparing-media', message: `Attaching image ${i + 1}/${list.length}...` });
    }
  }

  onProgress?.({ phase: 'preparing-media', message: list.length > 1 ? `${list.length} images ready for analysis.` : 'Image ready for analysis.' });

  return {
    frames,
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
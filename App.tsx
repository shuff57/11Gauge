import React, { useState, useRef, useEffect, useMemo, Suspense } from 'react';
import { ImageCropper } from './components/ImageCropper';
import { makePromptHumanReadable } from './utils/prompt';
// Debug panel utility
const useDebugPanel = () => {
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const addDebugLog = (msg: string) => {
    setDebugLogs(logs => [...logs.slice(-99), `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };
  return { debugLogs, addDebugLog };
};

const PRIMARY_SOURCE_CONTEXT_BUDGET = 4800;
const MIN_CONTEXT_PER_SOURCE = 500;
const PRIMARY_SOURCE_SELECTION_KEY = 'primary-source-selection';

const formatPrimarySourceContext = (manifest: PrimarySourceManifest, budget: number): string => {
  let remaining = Math.max(MIN_CONTEXT_PER_SOURCE, budget);
  const lines: string[] = [];
  for (const chunk of manifest.chunks) {
    if (remaining <= 0) break;
    const allowance = Math.min(chunk.text.length, remaining);
    const snippet = chunk.text.slice(0, allowance);
    lines.push(`- Page ${chunk.page}: ${snippet}${chunk.text.length > allowance ? '…' : ''}`);
    remaining -= allowance;
  }
  return `Source: ${manifest.title} (pages ${manifest.pageCount})\n${lines.join('\n')}`;
};

const mergePrimarySourcesIntoPrompt = (
  systemPrompt: string | null | undefined,
  manifests: PrimarySourceManifest[]
): string => {
  const base = resolveSystemPrompt(systemPrompt);
  if (!manifests.length) return base;
  const perSourceBudget = Math.max(
    MIN_CONTEXT_PER_SOURCE,
    Math.floor(PRIMARY_SOURCE_CONTEXT_BUDGET / manifests.length)
  );
  const contextBlocks = manifests.map((manifest) => formatPrimarySourceContext(manifest, perSourceBudget)).join('\n\n');
  return `${base}\n\n${contextBlocks}\n\nWhen referencing facts, mention the source title and page inline immediately after the fact. Do NOT include a "Sources" or "References" section at the end of the response.`;
};

import { Settings, RefreshCw, Zap, Image as ImageIcon, LogIn } from 'lucide-react';
import { AuthModal } from './components/AuthModal';
import {
  AppSettings,
  AnalysisProgress,
  ModelProvider,
  PrimarySourceSummary,
  PrimarySourceManifest,
  SessionUser,
  ExampleImageSummary
} from './types';
import { MODEL_LABELS, DEFAULT_SETTINGS, DEFAULT_SYSTEM_PROMPT, resolveSystemPrompt } from './constants';
import { analyzeMedia, getOllamaKey, VIDEO_UPLOAD_LIMITS } from './services/llm';
import { fetchPrimarySources, fetchPrimarySourceManifest, invalidatePrimarySourceCache } from './services/sources';
import { fetchExampleImages, invalidateExampleImageCache, selectReferenceImages } from './services/exampleImages';

const SettingsModal = React.lazy(() => import('./components/SettingsModal').then((module) => ({ default: module.SettingsModal })));
const SetupModal = React.lazy(() => import('./components/SetupModal').then((module) => ({ default: module.SetupModal })));
const KeyManagerModal = React.lazy(() => import('./components/KeyManagerModal').then((module) => ({ default: module.KeyManagerModal })));
const ResultPanel = React.lazy(() => import('./components/ResultPanel').then((module) => ({ default: module.ResultPanel })));
const SaveReferenceModal = React.lazy(() => import('./components/SaveReferenceModal').then((module) => ({ default: module.SaveReferenceModal })));

export default function App() {
  const { debugLogs, addDebugLog } = useDebugPanel();
  // State
  const hydrateSettings = (raw: AppSettings | null): AppSettings => {
    const merged = { ...DEFAULT_SETTINGS, ...(raw || {}) };
    if (raw?.ollamaModel === 'llama3.2-vision') {
      merged.ollamaModel = DEFAULT_SETTINGS.ollamaModel;
    }
    if (!merged.ollamaUrl) {
      merged.ollamaUrl = DEFAULT_SETTINGS.ollamaUrl;
    }
    if (!merged.ollamaModel) {
      merged.ollamaModel = DEFAULT_SETTINGS.ollamaModel;
    }
    // Ensure reasoning model is set if it was previously empty (migration)
    if (!merged.ollamaReasoningModel) {
      merged.ollamaReasoningModel = DEFAULT_SETTINGS.ollamaReasoningModel;
    }
    const formattedSystemPrompt = makePromptHumanReadable(merged.systemPrompt);
    merged.systemPrompt = formattedSystemPrompt?.trim() ? formattedSystemPrompt : DEFAULT_SYSTEM_PROMPT;
    merged.visionPrompt = makePromptHumanReadable(merged.visionPrompt);
    return merged;
  };

  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('vision-settings');
    return hydrateSettings(saved ? JSON.parse(saved) : null);
  });
  
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSetupModalOpen, setIsSetupModalOpen] = useState(false);
  const [isKeyManagerOpen, setIsKeyManagerOpen] = useState(false);
  const [keyUpdateTrigger, setKeyUpdateTrigger] = useState(0);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(() => {
    const saved = localStorage.getItem('user');
    if (!saved) return null;
    try {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed.email === 'string') {
        return parsed;
      }
    } catch {
      return null;
    }
    return null;
  });
  const isAdminUser = Boolean(user?.isAdmin);
  const [primarySources, setPrimarySources] = useState<PrimarySourceSummary[]>([]);
  const [primarySourcesLoading, setPrimarySourcesLoading] = useState(false);
  const [primarySourcesError, setPrimarySourcesError] = useState<string | null>(null);
  const [isSaveReferenceModalOpen, setIsSaveReferenceModalOpen] = useState(false);
  const [exampleImages, setExampleImages] = useState<ExampleImageSummary[]>([]);
  const [exampleImagesLoading, setExampleImagesLoading] = useState(false);
  const [exampleImagesError, setExampleImagesError] = useState<string | null>(null);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem(PRIMARY_SOURCE_SELECTION_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const primaryFile = selectedFiles[activeIndex] || null;
  const primaryPreviewUrl = previewUrls[activeIndex] || null;
  const hasSelection = selectedFiles.length > 0;
  const [mediaKind, setMediaKind] = useState<'image' | 'video' | null>(null);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [reasoningTrace, setReasoningTrace] = useState<string | null>(null);
  const [structuredAnalysis, setStructuredAnalysis] = useState<any>(null);
  const [ollamaMetrics, setOllamaMetrics] = useState<import('./types').OllamaMetrics | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgress | null>(null);
  const [progressLog, setProgressLog] = useState<string[]>([]);
  const [hasUsedDemo, setHasUsedDemo] = useState(false);
  const [cropTarget, setCropTarget] = useState<{ url: string; index: number } | null>(null);

  // Check demo usage on mount
  useEffect(() => {
    const local = localStorage.getItem('has_used_demo') === 'true';
    const session = sessionStorage.getItem('has_used_demo') === 'true';
    setHasUsedDemo(local || session);
  }, []);

  // Refs for hidden inputs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const maxVideoSeconds = VIDEO_UPLOAD_LIMITS.maxDurationSeconds;
  const maxVideoMegabytes = Math.floor(VIDEO_UPLOAD_LIMITS.maxFileBytes / (1024 * 1024));
  const videoProgressPercent = useMemo(() => {
    if (analysisProgress?.phase !== 'processing-video') return null;
    const total = analysisProgress.totalFrames || 0;
    if (!total) return null;
    const current = Math.min(total, Math.max(0, analysisProgress.framesCaptured ?? 0));
    return Math.round((current / total) * 100);
  }, [analysisProgress]);

  const latestProgressMessage = useMemo(() => {
    if (progressLog.length > 0) {
      return progressLog[progressLog.length - 1];
    }
    return analysisProgress?.message;
  }, [progressLog, analysisProgress]);

  const describeProgress = (progress: AnalysisProgress): string => {
    switch (progress.phase) {
      case 'preparing-media':
        return progress.message || 'Preparing your media...';
      case 'processing-video': {
        if (progress.totalFrames) {
          const current = progress.framesCaptured ?? 0;
          return `Extracting frames ${current}/${progress.totalFrames}...`;
        }
        return progress.message || 'Extracting frames...';
      }
      case 'awaiting-model':
        return `Sending to ${MODEL_LABELS[settings.provider]}...`;
      case 'receiving-response':
        return progress.message || 'Composing response...';
      default:
        return progress.message || 'Working...';
    }
  };

  const handleKeysUpdated = React.useCallback(() => {
    setKeyUpdateTrigger(prev => prev + 1);
  }, []);

  const togglePrimarySource = React.useCallback((id: string) => {
    if (!isAdminUser) return;
    setSelectedSourceIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((value) => value !== id);
      }
      return [...prev, id];
    });
  }, [isAdminUser]);

  const refreshPrimarySources = React.useCallback(async () => {
    if (!isAdminUser) {
      setPrimarySources([]);
      setPrimarySourcesError(null);
      setPrimarySourcesLoading(false);
      return;
    }
    setPrimarySourcesLoading(true);
    setPrimarySourcesError(null);
    try {
      const data = await fetchPrimarySources();
      setPrimarySources(data);
    } catch (err: any) {
      setPrimarySourcesError(err?.message || 'Unable to load primary sources');
    } finally {
      setPrimarySourcesLoading(false);
    }
  }, [isAdminUser]);

  const handleSourceUploaded = React.useCallback((source: PrimarySourceSummary) => {
    setPrimarySources((prev) => [source, ...prev.filter((entry) => entry.id !== source.id)]);
  }, []);

  const handleSourceDeleted = React.useCallback((id: string) => {
    setPrimarySources((prev) => prev.filter((entry) => entry.id !== id));
    setSelectedSourceIds((prev) => prev.filter((entryId) => entryId !== id));
    invalidatePrimarySourceCache(id);
  }, []);

  const refreshExampleImages = React.useCallback(async () => {
    if (!user) {
      setExampleImages([]);
      setExampleImagesError(null);
      setExampleImagesLoading(false);
      return;
    }
    setExampleImagesLoading(true);
    setExampleImagesError(null);
    try {
      const data = await fetchExampleImages();
      setExampleImages(data);
    } catch (err: any) {
      setExampleImagesError(err?.message || 'Unable to load example images');
    } finally {
      setExampleImagesLoading(false);
    }
  }, [user]);

  const handleExampleUploaded = React.useCallback((image: ExampleImageSummary) => {
    setExampleImages((prev) => [image, ...prev.filter((entry) => entry.id !== image.id)]);
  }, []);

  const handleExampleDeleted = React.useCallback((id: string) => {
    setExampleImages((prev) => prev.filter((entry) => entry.id !== id));
  }, []);

  // Persistence
  useEffect(() => {
    // Check if the current settings have the OLD prompt and update it to the NEW default if so
    const oldDefaultStart = "You are a strict Certified Welding Inspector (CWI) and expert instructor.\n\nYour role is to evaluate welding practice results to help students improve.";
    if (settings.systemPrompt && settings.systemPrompt.includes(oldDefaultStart) && !settings.systemPrompt.includes("STEP 1: VISUAL ANALYSIS")) {
       console.log("Auto-updating stale system prompt to new default.");
       setSettings(prev => ({ ...prev, systemPrompt: DEFAULT_SETTINGS.systemPrompt }));
    }
    localStorage.setItem('vision-settings', JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    try {
      if (selectedSourceIds.length > 0) {
        localStorage.setItem(PRIMARY_SOURCE_SELECTION_KEY, JSON.stringify(selectedSourceIds));
      } else {
        localStorage.removeItem(PRIMARY_SOURCE_SELECTION_KEY);
      }
    } catch {
      // ignore storage failures
    }
  }, [selectedSourceIds]);

  useEffect(() => {
    if (!user) {
      setPrimarySources([]);
      setPrimarySourcesError(null);
      setSelectedSourceIds([]);
      invalidatePrimarySourceCache();
      return;
    }
    if (!user.isAdmin) {
      setPrimarySources([]);
      setPrimarySourcesError(null);
      setSelectedSourceIds([]);
      invalidatePrimarySourceCache();
      return;
    }
    refreshPrimarySources();
  }, [user, refreshPrimarySources]);

  useEffect(() => {
    if (!user) {
      setExampleImages([]);
      setExampleImagesError(null);
      return;
    }
    refreshExampleImages();
  }, [user, refreshExampleImages]);

  useEffect(() => {
    if (!isAdminUser && selectedSourceIds.length) {
      setSelectedSourceIds([]);
    }
  }, [isAdminUser, selectedSourceIds.length]);

  // Load global system prompts from DB
  useEffect(() => {
    let active = true;
    const loadSystemPrompt = async () => {
      try {
        const response = await fetch('/api/system-prompt');
        if (!response.ok) return;
        const data = await response.json().catch(() => null) as any;
        if (!active || !data) return;
        
        setSettings((prev) => {
          const next = { ...prev };
          let changed = false;
          const formattedSystemPrompt = makePromptHumanReadable(data.prompt);
          const formattedVisionPrompt = makePromptHumanReadable(data.visionPrompt);

          // Force update if the loaded prompt is the OLD default
          const oldDefaultStart = "You are a strict Certified Welding Inspector (CWI) and expert instructor.\n\nYour role is to evaluate welding practice results to help students improve.";
          const isOldDefault = formattedSystemPrompt && formattedSystemPrompt.includes(oldDefaultStart) && !formattedSystemPrompt.includes("STEP 1: VISUAL ANALYSIS");

          if (isOldDefault) {
             // If the DB has the old default, ignore it and let the new code constant take over (or explicitly set it)
             // Actually, we should probably update the state to the NEW default if the current state is also old.
             // But here we are loading FROM the DB. If the DB is stale, we should probably NOT use it if it matches the old default.
             console.log("Detected stale system prompt in DB. Ignoring in favor of new default.");
          } else if (formattedSystemPrompt && prev.systemPrompt !== formattedSystemPrompt) {
            next.systemPrompt = formattedSystemPrompt;
            changed = true;
          }

          if (formattedVisionPrompt && prev.visionPrompt !== formattedVisionPrompt) {
            next.visionPrompt = formattedVisionPrompt;
            changed = true;
          }
          
          return changed ? next : prev;
        });
      } catch (err) {
        console.warn('Failed to load system prompt', err);
      }
    };
    loadSystemPrompt();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (user) {
      localStorage.setItem('user', JSON.stringify(user));
    } else {
      localStorage.removeItem('user');
    }
  }, [user]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!(e.target instanceof Node)) return;
      
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setIsUserMenuOpen(false);
      }
    }

    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setIsUserMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, []);

  // Handle OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authSuccess = params.get('auth_success');
    const email = params.get('email');
    const authError = params.get('auth_error');

    if (authSuccess === 'true' && email) {
      setUser({ email: decodeURIComponent(email) });
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (authError) {
      console.error('Auth error:', authError);
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  useEffect(() => {
    // Always verify session on mount to ensure cookie is valid
    let active = true;
    const fetchSessionUser = async () => {
      try {
        const response = await fetch('/api/auth/me');
        if (!active) return;
        
        if (response.status === 401) {
          // Session is invalid, clear user state
          if (user) setUser(null);
          return;
        }
        
        if (!response.ok) return;
        const data = await response.json().catch(() => null) as any;
        if (!active) return;
        
        if (data?.user?.email) {
          // Update user state if needed
          setUser(prev => {
            if (!prev) return {
              email: data.user.email,
              isAdmin: Boolean(data.user.isAdmin),
              id: data.user.id
            };
            // Avoid redundant updates
            if (prev.email !== data.user.email || prev.isAdmin !== Boolean(data.user.isAdmin)) {
              return {
                email: data.user.email,
                isAdmin: Boolean(data.user.isAdmin),
                id: data.user.id
              };
            }
            return prev;
          });
        }
      } catch (err) {
        console.warn('Session fetch failed', err);
      }
    };
    fetchSessionUser();
    return () => {
      active = false;
    };
  }, []);

  // When user changes, if we have user and provider is Ollama, fetch stored key
  useEffect(() => {
    let mounted = true;
    const loadKey = async () => {
      if (!user) return;
      try {
        const key = await getOllamaKey();
        if (!mounted) return;
        if (key) {
          setSettings((s) => ({ ...s, ollamaKey: key }));
        } else {
          // If there's a session key from before login, use it for this session
          // but do not automatically save it to DB as "Default"
          const sessionKey = sessionStorage.getItem('session_ollama_key');
          if (sessionKey) {
            setSettings((s) => ({ ...s, ollamaKey: sessionKey }));
            // We keep it in session storage so it persists on refresh until explicitly saved or cleared
          }
        }
      } catch (err) {
        console.warn('Failed to fetch key on login', err);
      }
    };
    loadKey();
    return () => { mounted = false; };
  }, [user]);

  // Handlers
  const prepareSelectedFiles = (files: File[]) => {
    const list = files.filter(Boolean);
    if (!list.length) return;

    const detectKind = (file: File): 'image' | 'video' | null => {
      const type = (file.type || '').toLowerCase();
      if (type.startsWith('video/')) return 'video';
      if (type.startsWith('image/')) return 'image';
      return null;
    };

    const kinds = list.map(detectKind);
    const primaryKind = kinds[0];

    if (!primaryKind) {
      setError('Please choose an image or video file.');
      return;
    }

    const mixedKinds = kinds.some((k) => k !== primaryKind);
    if (mixedKinds) {
      setError('Please upload either images or a single video at a time.');
      return;
    }

    if (primaryKind === 'video' && list.length > 1) {
      setError('Only one video can be analyzed at a time.');
      return;
    }

    setSelectedFiles(list);
    // Build preview URLs for each selected file
    const urls = list.map((file) => URL.createObjectURL(file));
    setPreviewUrls((prev) => {
      prev.forEach((url) => URL.revokeObjectURL(url));
      return urls;
    });
    setActiveIndex(0);
    setMediaKind(primaryKind);
    setResult(null);
    setReasoningTrace(null);
    setStructuredAnalysis(null);
    setOllamaMetrics(null);
    setError(undefined);
    setAnalysisProgress(null);
    setProgressLog([]);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length) {
      prepareSelectedFiles(files);
    }
    e.target.value = '';
  };

  const handleCameraCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      prepareSelectedFiles([file]);
    }
    e.target.value = '';
  };

  const handleReset = () => {
    setSelectedFiles([]);
    setMediaKind(null);
    setPreviewUrls((prev) => {
      prev.forEach((url) => URL.revokeObjectURL(url));
      return [];
    });
    setActiveIndex(0);
    setResult(null);
    setReasoningTrace(null);
    setStructuredAnalysis(null);
    setOllamaMetrics(null);
    setError(undefined);
    setAnalysisProgress(null);
    setProgressLog([]);
  };

  useEffect(() => {
    if (previewUrls.length === 0) {
      setActiveIndex(0);
      return;
    }
    setActiveIndex((idx) => Math.min(idx, previewUrls.length - 1));
  }, [previewUrls.length]);

  const handlePrevImage = () => {
    setActiveIndex((idx) => {
      if (previewUrls.length === 0) return 0;
      return idx === 0 ? previewUrls.length - 1 : idx - 1;
    });
  };

  const handleNextImage = () => {
    setActiveIndex((idx) => {
      if (previewUrls.length === 0) return 0;
      return idx === previewUrls.length - 1 ? 0 : idx + 1;
    });
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const delta = e.changedTouches[0]?.clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) < 40) return;
    if (delta > 0) {
      handlePrevImage();
    } else {
      handleNextImage();
    }
  };

  const handleCropComplete = (croppedBlob: Blob) => {
    if (!cropTarget) return;
    
    const newFile = new File([croppedBlob], selectedFiles[cropTarget.index].name, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });

    const newFiles = [...selectedFiles];
    newFiles[cropTarget.index] = newFile;
    setSelectedFiles(newFiles);

    const newUrl = URL.createObjectURL(newFile);
    setPreviewUrls((prev) => {
      const next = [...prev];
      URL.revokeObjectURL(next[cropTarget.index]);
      next[cropTarget.index] = newUrl;
      return next;
    });

    setCropTarget(null);
  };

  const handleAnalyze = async () => {
    if (!selectedFiles.length) return;

    // Check for demo usage limit if signed out
    if (!user) {
      const local = localStorage.getItem('has_used_demo');
      const session = sessionStorage.getItem('has_used_demo');
      
      if (local || session) {
        setError("Demo limit reached. Please sign in or add your own API key in the Admin menu.");
        setHasUsedDemo(true);
        return;
      }
    }

    setIsAnalyzing(true);
    setError(undefined);
    setReasoningTrace(null);
    setStructuredAnalysis(null);
    setOllamaMetrics(null);
    setProgressLog([]);
    setAnalysisProgress({ phase: 'preparing-media', message: 'Preparing upload...' });
    setProgressLog(['Preparing your media...']);
    addDebugLog('Starting analysis...');
    
    console.log("--- Starting Analysis ---");
    console.log("Active Settings:", settings);

    try {
      // If signed out, force empty key to ensure backend uses demo key
      // AND force provider to Ollama to prevent using other providers via local storage hacks
      let effectiveSettings = user ? settings : { 
        ...settings, 
        provider: ModelProvider.OLLAMA,
        ollamaKey: '' 
      };

      if (isAdminUser && selectedSourceIds.length) {
        setAnalysisProgress({ phase: 'preparing-media', message: 'Attaching primary sources...' });
        setProgressLog((log) => [...log, 'Attaching primary sources...']);
        try {
          const manifests = await Promise.all(selectedSourceIds.map((id) => fetchPrimarySourceManifest(id)));
          effectiveSettings = {
            ...effectiveSettings,
            systemPrompt: mergePrimarySourcesIntoPrompt(effectiveSettings.systemPrompt, manifests)
          };
        } catch (err: any) {
          throw new Error(err?.message || 'Failed to load primary sources.');
        }
      }

      // Auto-select reference images if enabled
      let selectedReferences: ExampleImageSummary[] = [];
      if (effectiveSettings.autoIncludeReferences && exampleImages.length > 0) {
        selectedReferences = selectReferenceImages(exampleImages, {
          weldProcess: effectiveSettings.weldProcess,
          weldPosition: effectiveSettings.weldPosition
        });
        if (selectedReferences.length > 0) {
          addDebugLog(`Auto-selected ${selectedReferences.length} reference images`);
          setProgressLog((log) => [...log, `Comparing against ${selectedReferences.length} reference examples...`]);
        }
      }
      
      const text = await analyzeMedia(selectedFiles, effectiveSettings, {
        referenceImages: selectedReferences,
        onProgress: (progress) => {
          setAnalysisProgress(progress);
          addDebugLog(`[progress] ${progress.phase}: ${progress.message || ''}`);
          setProgressLog((log) => {
            const next = describeProgress(progress);
            if (!next) return log;
            if (log[log.length - 1] === next) return log;
            return [...log, next];
          });
        },
        onPartialResponse: (partial) => {
          setResult(partial);
        },
        onThinking: (trace) => {
          setReasoningTrace(trace);
        },
        onStructuredAnalysis: (analysis) => {
          setStructuredAnalysis(analysis);
        },
        onMetrics: (metrics) => {
          setOllamaMetrics(metrics);
        }
      });
      setResult(text);
      setAnalysisProgress(null);
      addDebugLog('Analysis complete.');

      // Mark demo as used if applicable
      if (!user) {
        localStorage.setItem('has_used_demo', 'true');
        sessionStorage.setItem('has_used_demo', 'true');
        setHasUsedDemo(true);
      }

    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
      setAnalysisProgress(null);
      addDebugLog(`[error] ${err.message || err}`);
    } finally {
      setIsAnalyzing(false);
    }
  };


  // Debug panel toggle
  const [showDebug, setShowDebug] = useState(false);

  return (
    <div className="relative flex flex-col h-[100dvh] w-full bg-zinc-950 selection:bg-zinc-800 overflow-hidden">
      
      {/* Background Logo */}
      <div 
        className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.2]"
        aria-hidden="true"
      >
        <img 
          src="/11gauge-logo.svg" 
          alt="" 
          className="w-[85%] h-[85%] object-contain grayscale invert"
        />
      </div>

      <div className="relative flex flex-col h-full w-full">
        <header className="flex items-center justify-between px-4 py-3 border-b border-zinc-900/50 shrink-0">
          <button 
            onClick={handleReset}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-zinc-400 hover:text-white hover:bg-zinc-900 transition-all"
          >
            {result ? (
              <>
                <RefreshCw className="w-4 h-4" />
                <span className="font-medium">New Scan</span>
              </>
            ) : (
              <span className="font-bold text-xl text-white tracking-tight">11GAUGE</span>
            )}
          </button>

        <div className="flex items-center gap-3 relative">
          <button 
            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
            className={`p-2 rounded-full transition-colors ${isSettingsOpen ? 'text-white bg-zinc-900' : 'text-zinc-400 hover:text-white hover:bg-zinc-900'}`}
          >
            <Settings className="w-5 h-5" />
          </button>
          {user ? (
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setIsUserMenuOpen((s) => !s)}
                className="w-9 h-9 rounded-full bg-zinc-800 text-zinc-200 flex items-center justify-center font-semibold text-sm hover:bg-zinc-700 transition-colors"
                title={user.email}
                aria-haspopup="true"
                aria-expanded={isUserMenuOpen}
              >
                {user.email
                  .split('@')[0]
                  .split(/[._-]/)
                  .filter(Boolean)
                  .slice(0,2)
                  .map(part => part[0].toUpperCase())
                  .join('') || 'U'}
              </button>
              {isUserMenuOpen && (
                <div className="absolute right-0 mt-2 w-40 bg-zinc-900 border border-zinc-800 rounded-lg shadow-lg z-50 py-2">
                  <div className="px-3 py-1 text-xs text-zinc-400 truncate">{user.email}</div>
                  <button
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      setIsKeyManagerOpen(true);
                    }}
                    className="w-full text-left px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800 transition-colors"
                  >
                    Admin
                  </button>
                  <button
                    onClick={async () => {
                      // Optional server-side signout can go here
                      setUser(null);
                      setSettings(prev => ({
                        ...prev,
                        provider: ModelProvider.OLLAMA,
                        ollamaKey: ''
                      }));
                      setIsUserMenuOpen(false);
                      setIsAuthOpen(false);
                      try {
                        await fetch('/api/auth/signout', { method: 'POST' });
                      } catch {}
                    }}
                    className="w-full text-left px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800 transition-colors"
                  >
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button 
              onClick={() => setIsAuthOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-zinc-400 hover:text-white hover:bg-zinc-900 transition-all"
            >
              <LogIn className="w-4 h-4" />
              <span className="font-medium">Sign In</span>
            </button>
          )}

          <AuthModal
            isOpen={isAuthOpen}
            onClose={() => setIsAuthOpen(false)}
            onSuccess={(user) => setUser(user)}
          />

          <Suspense fallback={null}>
            <SettingsModal 
              isOpen={isSettingsOpen} 
              onClose={() => setIsSettingsOpen(false)}
              settings={settings}
              onUpdate={setSettings}
              user={user}
              onOpenKeyManager={() => setIsKeyManagerOpen(true)}
              keyUpdateTrigger={keyUpdateTrigger}
            />
          </Suspense>

          <Suspense fallback={null}>
            <SetupModal 
              isOpen={isSetupModalOpen} 
              onClose={() => setIsSetupModalOpen(false)}
              settings={settings}
              onUpdate={setSettings}
              onAnalyze={handleAnalyze}
              mediaKind={mediaKind}
            />
          </Suspense>

          {user && (
            <Suspense fallback={null}>
              <KeyManagerModal
                isOpen={isKeyManagerOpen}
                onClose={() => setIsKeyManagerOpen(false)}
                user={user}
                settings={settings}
                onUpdate={setSettings}
                onKeysUpdated={handleKeysUpdated}
                primarySources={primarySources}
                primarySourcesLoading={primarySourcesLoading}
                primarySourcesError={primarySourcesError}
                selectedSourceIds={selectedSourceIds}
                onToggleSource={togglePrimarySource}
                onPrimarySourceUploaded={(source) => {
                  handleSourceUploaded(source);
                  refreshPrimarySources();
                }}
                onPrimarySourceDeleted={(id) => {
                  handleSourceDeleted(id);
                  refreshPrimarySources();
                }}
                onPrimarySourcesRefresh={refreshPrimarySources}
                referenceImages={exampleImages}
                referenceImagesLoading={exampleImagesLoading}
                referenceImagesError={exampleImagesError}
                onReferenceImagesRefresh={refreshExampleImages}
                onReferenceImageUploaded={(image) => {
                  handleExampleUploaded(image);
                  refreshExampleImages();
                }}
                onReferenceImageDeleted={(id) => {
                  handleExampleDeleted(id);
                  refreshExampleImages();
                }}
              />
            </Suspense>
          )}

          {user && isAdminUser && primaryFile && (
            <Suspense fallback={null}>
              <SaveReferenceModal
                isOpen={isSaveReferenceModalOpen}
                onClose={() => setIsSaveReferenceModalOpen(false)}
                file={primaryFile}
                initialDescription={result || undefined}
                settings={settings}
                structuredAnalysis={structuredAnalysis}
                onSuccess={() => {
                  refreshExampleImages();
                  // Optional: Show a success toast or message
                }}
              />
            </Suspense>
          )}

        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto relative scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
        <style>{`
          @keyframes slow-shake {
            0% { transform: rotate(0deg); }
            25% { transform: rotate(-5deg); }
            75% { transform: rotate(5deg); }
            100% { transform: rotate(0deg); }
          }
          .group:hover .icon-shake {
            animation: slow-shake 2s ease-in-out infinite;
          }
        `}</style>
        <div className="mx-[5vw] min-h-full flex flex-col p-2 sm:p-6">
          
          {/* Empty State / Logo with overlay inputs */}
          {!hasSelection && (
            <div className="flex-1 flex flex-col gap-4 w-full text-zinc-600">
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <h1 className="text-xl font-medium text-white mb-2">Ready to Analyze</h1>
                <p className="text-sm text-zinc-400 max-w-xs text-center">
                  Upload a photo, drop in a short video, or open your camera to capture something new with {MODEL_LABELS[settings.provider]}.
                </p>
              </div>

              {/* Thumbnail grid for multiple photos */}
              {mediaKind === 'image' && previewUrls.length > 1 && (
                <div className="flex flex-wrap gap-2 justify-center px-1">
                  {previewUrls.map((url, idx) => (
                    <button
                      key={url}
                      onClick={() => setActiveIndex(idx)}
                      className={`relative w-20 h-20 rounded-lg overflow-hidden border transition-all ${idx === activeIndex ? 'border-white shadow-[0_0_0_2px_rgba(255,255,255,0.25)]' : 'border-zinc-800 hover:border-zinc-600'}`}
                      aria-label={`Select photo ${idx + 1}`}
                    >
                      <img src={url} alt={`Preview ${idx + 1}`} className="w-full h-full object-cover" />
                      {idx === activeIndex && (
                        <span className="absolute inset-0 ring-2 ring-white/60 pointer-events-none" />
                      )}
                    </button>
                  ))}
                </div>
              )}
              
              {!user && hasUsedDemo ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-6">
                  <div className="w-full max-w-xs p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800 text-center backdrop-blur-sm">
                    <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center mx-auto mb-4">
                      <Zap className="w-6 h-6 text-zinc-500" />
                    </div>
                    <h3 className="text-white font-medium mb-2">Demo Limit Reached</h3>
                    <p className="text-sm text-zinc-400 mb-6">
                      You've used your free demo scan. Sign in to continue analyzing unlimited media.
                    </p>
                    <button 
                      onClick={() => setIsAuthOpen(true)} 
                      className="w-full py-2.5 bg-white text-black rounded-xl font-medium text-sm hover:bg-zinc-200 transition-colors"
                    >
                      Sign In to Continue
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 flex flex-col items-center justify-center gap-6 transition-all group rounded-3xl p-2 sm:p-6"
                >
                  <div className="w-48 h-48 max-w-[70vw] max-h-[70vw] p-6 rounded-full bg-transparent border border-zinc-800 group-hover:border-zinc-600 group-hover:scale-105 transition-all shadow-2xl flex items-center justify-center aspect-square">
                    <ImageIcon className="w-24 h-24 max-w-[50%] max-h-[50%] text-zinc-400 group-hover:text-white transition-colors icon-shake" />
                  </div>
                </button>
              )}

            </div>
          )}

          {/* Preview & Results */}
          {hasSelection && (
            <div className="flex-1 flex flex-col gap-8 pb-32">
              {/* Image Preview */}
              <div className="w-full flex justify-center animate-in zoom-in-95 duration-300">
                <div
                  className="relative group rounded-2xl overflow-hidden border border-zinc-800 shadow-2xl max-h-[50vh] bg-black"
                  onTouchStart={mediaKind === 'image' && previewUrls.length > 1 ? handleTouchStart : undefined}
                  onTouchEnd={mediaKind === 'image' && previewUrls.length > 1 ? handleTouchEnd : undefined}
                >
                  {mediaKind === 'video' ? (
                    <video
                      src={primaryPreviewUrl ?? undefined}
                      controls
                      playsInline
                      loop={!isAnalyzing && !result}
                      className="w-full h-full object-contain max-h-[50vh] bg-black"
                    />
                  ) : (
                    <img 
                      src={primaryPreviewUrl ?? undefined} 
                      alt="Preview" 
                      className="w-full h-full object-contain max-h-[50vh]"
                    />
                  )}
                  {mediaKind && (
                    <span className="absolute top-3 left-3 px-3 py-1 text-xs font-semibold rounded-full bg-black/70 text-white uppercase tracking-widest">
                      {mediaKind === 'video' ? 'Video Clip' : selectedFiles.length > 1 ? `Photos (${selectedFiles.length})` : 'Photo'}
                    </span>
                  )}

                  {mediaKind === 'image' && previewUrls.length > 1 && (
                    <div className="absolute inset-y-0 left-0 right-0 flex items-center justify-between px-3">
                      <button
                        onClick={handlePrevImage}
                        className="p-2 rounded-full bg-black/60 text-white hover:bg-black/80 border border-white/10"
                        aria-label="Previous photo"
                      >
                        ‹
                      </button>
                      <button
                        onClick={handleNextImage}
                        className="p-2 rounded-full bg-black/60 text-white hover:bg-black/80 border border-white/10"
                        aria-label="Next photo"
                      >
                        ›
                      </button>
                    </div>
                  )}
                  {!isAnalyzing && !result && (
                     <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity gap-3">
                        <button onClick={handleReset} className="px-4 py-2 bg-black/50 backdrop-blur text-white text-sm rounded-full border border-white/10 hover:bg-black/70">
                          Change Media
                        </button>
                        {mediaKind === 'image' && (
                          <button 
                            onClick={() => setCropTarget({ url: primaryPreviewUrl!, index: activeIndex })}
                            className="px-4 py-2 bg-blue-600/80 backdrop-blur text-white text-sm rounded-full border border-white/10 hover:bg-blue-600"
                          >
                            Crop / Focus
                          </button>
                        )}
                     </div>
                  )}
                </div>
              </div>

              {isAnalyzing && videoProgressPercent !== null && (
                <div className="space-y-3 animate-in fade-in duration-300">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-400">Extracting frames from video</span>
                    <span className="text-zinc-300 font-mono">
                      {analysisProgress?.framesCaptured || 0}/{analysisProgress?.totalFrames || 0}
                    </span>
                  </div>
                  <div className="h-3 rounded-full bg-zinc-900 border border-zinc-800 overflow-hidden shadow-inner">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-500 ease-out relative"
                      style={{ width: `${videoProgressPercent}%` }}
                    >
                      <div className="absolute inset-0 bg-white/20 animate-pulse" />
                    </div>
                  </div>
                  <div className="text-center text-xs text-zinc-500 font-mono">
                    {videoProgressPercent}% complete
                  </div>
                </div>
              )}

              {/* Analysis Result */}
              {(isAnalyzing || result || error) && (
                <Suspense
                  fallback={
                    <div className="rounded-2xl border border-zinc-900 bg-zinc-950/70 p-6 text-center text-sm text-zinc-500">
                      Preparing analysis view…
                    </div>
                  }
                >
                  <ResultPanel
                    loading={isAnalyzing}
                    result={result}
                    reasoningTrace={reasoningTrace}
                    metrics={ollamaMetrics}
                    error={error}
                    progress={analysisProgress}
                    thoughts={progressLog}
                    settings={settings}
                    user={user}
                    onSaveAsReference={() => setIsSaveReferenceModalOpen(true)}
                  />
                </Suspense>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Bottom Control Bar */}
      <div className="shrink-0 px-6 pt-2 pb-8 sm:pb-6 bg-gradient-to-t from-zinc-950 via-zinc-950 to-transparent">
        <div className="max-w-2xl mx-auto">
          {/* Input cards now occupy the lower half of the viewport via the main overlay */}

          {hasSelection && !result && !isAnalyzing && (
            /* Analyze Action State */
            <button 
              onClick={() => setIsSetupModalOpen(true)}
              className="w-full h-14 bg-white hover:bg-zinc-200 text-black rounded-full font-semibold text-base transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:scale-[1.01] active:scale-[0.99]"
            >
              <Settings className="w-5 h-5 text-black" />
              <span>Setup Analysis</span>
            </button>
          )}

          {isAdminUser && selectedSourceIds.length > 0 && (
            <p className="text-center text-xs text-emerald-300 mt-3">
              Primary sources attached: {selectedSourceIds.length}
            </p>
          )}
          
          {/* Result Action State (Reset) */}
          {result && (
             <button 
              onClick={handleReset}
              className="w-full h-14 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 rounded-full font-medium transition-all flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Analyze Another</span>
            </button>
          )}

          {isAnalyzing && (
            <div className="text-center mt-3 flex flex-col items-center gap-1">
              <p className="text-xs text-zinc-400">
                {latestProgressMessage || 'Working...'}
              </p>
            </div>
          )}

          <p className="text-center text-[10px] text-zinc-600 mt-3 font-mono">
            AI can make mistakes. Check important info. Photos ≤ 25MB • Videos ≤ {maxVideoSeconds}s / ~{maxVideoMegabytes}MB.
          </p>
        </div>
      </div>

      {/* Hidden file inputs */}
      <input 
        type="file" 
        ref={fileInputRef}
        className="hidden" 
        accept="image/*,video/*"
        multiple
        onChange={handleFileInputChange}
      />
      <input 
        type="file" 
        ref={cameraInputRef}
        className="hidden" 
        accept="image/*,video/*"
        capture="environment"
        onChange={handleCameraCapture}
      />
      
      {cropTarget && (
        <ImageCropper
          imageUrl={cropTarget.url}
          onCrop={handleCropComplete}
          onCancel={() => setCropTarget(null)}
        />
      )}
      </div>
    </div>
  );
}
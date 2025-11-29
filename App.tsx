import React, { useState, useRef, useEffect, useMemo } from 'react';
// Debug panel utility
const useDebugPanel = () => {
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const addDebugLog = (msg: string) => {
    setDebugLogs(logs => [...logs.slice(-99), `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };
  return { debugLogs, addDebugLog };
};
import { Settings, RefreshCw, Zap, Image as ImageIcon, LogIn, Camera } from 'lucide-react';
import { SettingsModal } from './components/SettingsModal';
import { AuthModal } from './components/AuthModal';
import { ResultPanel } from './components/ResultPanel';
import { AppSettings, AnalysisProgress } from './types';
import { MODEL_LABELS, DEFAULT_SETTINGS } from './constants';
import { analyzeMedia, getOllamaKey, saveOllamaKey, VIDEO_UPLOAD_LIMITS } from './services/llm';

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
    return merged;
  };

  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('vision-settings');
    return hydrateSettings(saved ? JSON.parse(saved) : null);
  });
  
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [user, setUser] = useState<{ email: string } | null>(() => {
    const saved = localStorage.getItem('user');
    return saved ? JSON.parse(saved) : null;
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [mediaKind, setMediaKind] = useState<'image' | 'video' | null>(null);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgress | null>(null);
  const [progressLog, setProgressLog] = useState<string[]>([]);

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
        return 'Composing response...';
      default:
        return progress.message || 'Working...';
    }
  };

  // Persistence
  useEffect(() => {
    localStorage.setItem('vision-settings', JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    if (user) {
      localStorage.setItem('user', JSON.stringify(user));
    } else {
      localStorage.removeItem('user');
    }
  }, [user]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!userMenuRef.current) return;
      if (!(e.target instanceof Node)) return;
      if (!userMenuRef.current.contains(e.target)) {
        setIsUserMenuOpen(false);
      }
    }

    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsUserMenuOpen(false);
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
    if (user) return;
    let active = true;
    const fetchSessionUser = async () => {
      try {
        const response = await fetch('/api/auth/me');
        if (!response.ok) return;
        const data = await response.json().catch(() => null);
        if (!active) return;
        if (data?.user?.email) {
          setUser({ email: data.user.email });
        }
      } catch (err) {
        console.warn('Session fetch failed', err);
      }
    };
    fetchSessionUser();
    return () => {
      active = false;
    };
  }, [user]);

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
          // If there's a session key from before login, save it to DB and persist for user
          const sessionKey = sessionStorage.getItem('session_ollama_key');
          if (sessionKey) {
            try {
              await saveOllamaKey(sessionKey);
              setSettings((s) => ({ ...s, ollamaKey: sessionKey }));
              sessionStorage.removeItem('session_ollama_key');
            } catch (err) {
              console.warn('Failed to persist session key for user', err);
            }
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
  const prepareSelectedFile = (file: File) => {
    const type = (file.type || '').toLowerCase();
    const nextKind = type.startsWith('video/') ? 'video' : type.startsWith('image/') ? 'image' : null;

    if (!nextKind) {
      setError('Please choose an image or video file.');
      return;
    }

    const objectUrl = URL.createObjectURL(file);

    setSelectedFile(file);
    setMediaKind(nextKind);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return objectUrl;
    });
    setResult(null);
    setError(undefined);
    setAnalysisProgress(null);
    setProgressLog([]);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      prepareSelectedFile(file);
    }
    e.target.value = '';
  };

  const handleCameraCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      prepareSelectedFile(file);
    }
    e.target.value = '';
  };

  const handleReset = () => {
    setSelectedFile(null);
    setMediaKind(null);
    setPreviewUrl(null);
    setResult(null);
    setError(undefined);
    setAnalysisProgress(null);
    setProgressLog([]);
    // Revoke URL to prevent memory leaks
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  };

  const handleAnalyze = async () => {
    if (!selectedFile) return;

    setIsAnalyzing(true);
    setError(undefined);
    setProgressLog([]);
    setAnalysisProgress({ phase: 'preparing-media', message: 'Preparing upload...' });
    setProgressLog(['Preparing your media...']);
    addDebugLog('Starting analysis...');

    try {
      const text = await analyzeMedia(selectedFile, settings, {
        onProgress: (progress) => {
          setAnalysisProgress(progress);
          addDebugLog(`[progress] ${progress.phase}: ${progress.message || ''}`);
          setProgressLog((log) => {
            const next = describeProgress(progress);
            if (!next) return log;
            if (log[log.length - 1] === next) return log;
            return [...log, next];
          });
        }
      });
      setResult(text);
      setAnalysisProgress(null);
      addDebugLog('Analysis complete.');
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
      
      {/* Header */}
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
            <>
              <span className="font-bold text-xl text-white tracking-tight">11GAUGE</span>
            </>
          )}
        </button>

        <div className="flex items-center gap-3 relative">
           <span className="hidden sm:block text-xs font-mono text-zinc-600 uppercase tracking-widest">
            {MODEL_LABELS[settings.provider]}
          </span>
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
                      setIsSettingsOpen(true);
                    }}
                    className="w-full text-left px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800 transition-colors"
                  >
                    Manage Keys
                  </button>
                  <button
                    onClick={async () => {
                      // Optional server-side signout can go here
                      setUser(null);
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

          <SettingsModal 
            isOpen={isSettingsOpen} 
            onClose={() => setIsSettingsOpen(false)}
            settings={settings}
            onUpdate={setSettings}
            user={user}
          />

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
          {!selectedFile && (
            <div className="flex-1 flex flex-col gap-4 w-full text-zinc-600">
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <h1 className="text-xl font-medium text-white mb-2">Ready to Analyze</h1>
                <p className="text-sm text-zinc-400 max-w-xs text-center">
                  Upload a photo, drop in a short video, or open your camera to capture something new with {MODEL_LABELS[settings.provider]}.
                </p>
              </div>
              
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 flex flex-col items-center justify-center gap-6 transition-all group rounded-3xl p-2 sm:p-6"
              >
                <div className="w-48 h-48 max-w-[70vw] max-h-[70vw] p-6 rounded-full bg-transparent border border-zinc-800 group-hover:border-zinc-600 group-hover:scale-105 transition-all shadow-2xl flex items-center justify-center aspect-square">
                  <ImageIcon className="w-24 h-24 max-w-[50%] max-h-[50%] text-zinc-400 group-hover:text-white transition-colors icon-shake" />
                </div>
              </button>

            </div>
          )}

          {/* Preview & Results */}
          {selectedFile && (
            <div className="flex-1 flex flex-col gap-8 pb-32">
              {/* Image Preview */}
              <div className="w-full flex justify-center animate-in zoom-in-95 duration-300">
                <div className="relative group rounded-2xl overflow-hidden border border-zinc-800 shadow-2xl max-h-[50vh] bg-black">
                  {mediaKind === 'video' ? (
                    <video
                      src={previewUrl ?? undefined}
                      controls
                      playsInline
                      loop={!isAnalyzing && !result}
                      className="w-full h-full object-contain max-h-[50vh] bg-black"
                    />
                  ) : (
                    <img 
                      src={previewUrl!} 
                      alt="Preview" 
                      className="w-full h-full object-contain max-h-[50vh]"
                    />
                  )}
                  {mediaKind && (
                    <span className="absolute top-3 left-3 px-3 py-1 text-xs font-semibold rounded-full bg-black/70 text-white uppercase tracking-widest">
                      {mediaKind === 'video' ? 'Video Clip' : 'Photo'}
                    </span>
                  )}
                  {!isAnalyzing && !result && (
                     <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={handleReset} className="px-4 py-2 bg-black/50 backdrop-blur text-white text-sm rounded-full border border-white/10 hover:bg-black/70">
                          Change Media
                        </button>
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
                <ResultPanel
                  loading={isAnalyzing}
                  result={result}
                  error={error}
                  progress={analysisProgress}
                  thoughts={progressLog}
                />
              )}
            </div>
          )}
        </div>
      </main>

      {/* Bottom Control Bar */}
      <div className="shrink-0 px-6 pt-2 pb-8 sm:pb-6 bg-gradient-to-t from-zinc-950 via-zinc-950 to-transparent">
        <div className="max-w-2xl mx-auto">
          {/* Input cards now occupy the lower half of the viewport via the main overlay */}

          {selectedFile && !result && !isAnalyzing && (
            /* Analyze Action State */
            <button 
              onClick={handleAnalyze}
              className="w-full h-14 bg-white hover:bg-zinc-200 text-black rounded-full font-semibold text-base transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:scale-[1.01] active:scale-[0.99]"
            >
              <Zap className="w-5 h-5 fill-black" />
              <span>{mediaKind === 'video' ? 'Analyze Video' : mediaKind === 'image' ? 'Analyze Image' : 'Analyze Media'}</span>
            </button>
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
            <p className="text-center text-xs text-zinc-400 mt-3">
              {latestProgressMessage || 'Working...'}
            </p>
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
      </div>
    </div>
  );
}
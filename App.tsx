import React, { useState, useRef, useEffect } from 'react';
import { Camera, Upload, Settings, RefreshCw, Zap, Flame } from 'lucide-react';
import { SettingsModal } from './components/SettingsModal';
import { ResultPanel } from './components/ResultPanel';
import { AppSettings } from './types';
import { MODEL_LABELS, DEFAULT_SETTINGS } from './constants';
import { analyzeImage } from './services/llm';
import { Dock } from './components/Dock';

export default function App() {
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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>();

  // Refs for hidden inputs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Persistence
  useEffect(() => {
    localStorage.setItem('vision-settings', JSON.stringify(settings));
  }, [settings]);

  // Handlers
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      
      // Create preview
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      
      // Reset previous results
      setResult(null);
      setError(undefined);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setResult(null);
    setError(undefined);
    // Revoke URL to prevent memory leaks
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  };

  const handleAnalyze = async () => {
    if (!selectedFile) return;

    setIsAnalyzing(true);
    setError(undefined);

    try {
      const text = await analyzeImage(selectedFile, settings);
      setResult(text);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const dockItems = [
    {
      icon: <Camera className="w-5 h-5 text-white" />,
      label: (
        <div className="flex flex-col text-[11px] leading-tight text-white">
          <span className="font-semibold">Use Camera</span>
          <span className="text-[10px] text-zinc-400">Live capture</span>
        </div>
      ),
      onClick: () => cameraInputRef.current?.click(),
    },
    {
      icon: <Upload className="w-5 h-5 text-white" />,
      label: (
        <div className="flex flex-col text-[11px] leading-tight text-white">
          <span className="font-semibold">Upload Image</span>
          <span className="text-[10px] text-zinc-400">JPG · PNG</span>
        </div>
      ),
      onClick: () => fileInputRef.current?.click(),
    },
  ];


  return (
    <div className="flex flex-col h-screen w-full bg-zinc-950 selection:bg-zinc-800">
      
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

          <SettingsModal 
            isOpen={isSettingsOpen} 
            onClose={() => setIsSettingsOpen(false)}
            settings={settings}
            onUpdate={setSettings}
          />
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto relative scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
        <div className="max-w-3xl mx-auto w-full min-h-full flex flex-col p-6">
          
          {/* Empty State / Logo with overlay inputs */}
          {!selectedFile && (
            <div className="flex-1 relative w-full text-zinc-600">
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10 text-center">
                <img 
                  src="/11gauge-logo.png" 
                  alt="11Gauge Logo" 
                  className="w-32 h-32 object-contain invert opacity-90 mb-6 rounded-[2rem]" 
                />
                <h1 className="text-xl font-medium text-white mb-2">Ready to Analyze</h1>
                <p className="text-sm text-zinc-400 max-w-xs text-center">
                  Upload a photo or use your camera to get instant AI insights using {MODEL_LABELS[settings.provider]}.
                </p>
              </div>
              <div className="absolute inset-x-0 bottom-6 z-20 flex justify-center pointer-events-none">
                <div className="pointer-events-auto">
                  <Dock
                    items={dockItems}
                    panelHeight={80}
                    baseItemSize={56}
                    magnification={92}
                    dockHeight={220}
                    className="backdrop-blur-lg border-white/10"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Preview & Results */}
          {selectedFile && (
            <div className="flex-1 flex flex-col gap-8 pb-32">
              {/* Image Preview */}
              <div className="w-full flex justify-center animate-in zoom-in-95 duration-300">
                <div className="relative group rounded-2xl overflow-hidden border border-zinc-800 shadow-2xl max-h-[50vh] bg-black">
                  <img 
                    src={previewUrl!} 
                    alt="Preview" 
                    className="w-full h-full object-contain max-h-[50vh]"
                  />
                  {!isAnalyzing && !result && (
                     <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={handleReset} className="px-4 py-2 bg-black/50 backdrop-blur text-white text-sm rounded-full border border-white/10 hover:bg-black/70">
                          Change Image
                        </button>
                     </div>
                  )}
                </div>
              </div>

              {/* Analysis Result */}
              {(isAnalyzing || result || error) && (
                <ResultPanel loading={isAnalyzing} result={result} error={error} />
              )}
            </div>
          )}
        </div>
      </main>

      {/* Bottom Control Bar */}
      <div className="shrink-0 p-6 pt-2 bg-gradient-to-t from-zinc-950 via-zinc-950 to-transparent">
        <div className="max-w-2xl mx-auto">
          {/* Input cards now occupy the lower half of the viewport via the main overlay */}

          {selectedFile && !result && !isAnalyzing && (
            /* Analyze Action State */
            <button 
              onClick={handleAnalyze}
              className="w-full h-14 bg-white hover:bg-zinc-200 text-black rounded-full font-semibold text-base transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:scale-[1.01] active:scale-[0.99]"
            >
              <Zap className="w-5 h-5 fill-black" />
              <span>Analyze Image</span>
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

          <p className="text-center text-[10px] text-zinc-600 mt-3 font-mono">
            AI can make mistakes. Check important info.
          </p>
        </div>
      </div>

      {/* Hidden file inputs */}
      <input 
        type="file" 
        ref={fileInputRef}
        className="hidden" 
        accept="image/*"
        onChange={handleFileSelect}
      />
      <input 
        type="file" 
        ref={cameraInputRef}
        className="hidden" 
        accept="image/*"
        capture="environment"
        onChange={handleFileSelect}
      />
    </div>
  );
}
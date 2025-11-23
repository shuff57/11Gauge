import React, { useState, useRef, useEffect } from 'react';
import { Camera, Upload, Settings, RefreshCw, ChevronRight, Zap, Image as ImageIcon } from 'lucide-react';
import { SettingsModal } from './components/SettingsModal';
import { ResultPanel } from './components/ResultPanel';
import { AppSettings, ModelProvider } from './types';
import { MODEL_LABELS, DEFAULT_SETTINGS } from './constants';
import { analyzeImage } from './services/llm';

export default function App() {
  // State
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('vision-settings');
    return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
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

  return (
    <div className="flex flex-col h-screen w-full bg-zinc-950 selection:bg-zinc-800">
      
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-zinc-900/50 shrink-0">
        <button 
          onClick={handleReset}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-zinc-400 hover:text-white hover:bg-zinc-900 transition-all"
        >
          {result ? <RefreshCw className="w-4 h-4" /> : <div className="w-4 h-4 border border-zinc-600 rounded-sm" />}
          <span className="font-medium">{result ? 'New Scan' : 'Vision AI'}</span>
        </button>

        <div className="flex items-center gap-3">
           <span className="hidden sm:block text-xs font-mono text-zinc-600 uppercase tracking-widest">
            {MODEL_LABELS[settings.provider]}
          </span>
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-900 rounded-full transition-colors"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto relative scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
        <div className="max-w-3xl mx-auto w-full min-h-full flex flex-col p-6">
          
          {/* Empty State / Logo */}
          {!selectedFile && (
            <div className="flex-1 flex flex-col items-center justify-center text-zinc-600 pb-20">
              <div className="w-16 h-16 bg-zinc-900 rounded-2xl flex items-center justify-center mb-6 shadow-2xl shadow-black border border-zinc-800">
                <Zap className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-xl font-medium text-white mb-2">Ready to Analyze</h1>
              <p className="text-sm text-zinc-500 max-w-xs text-center">
                Upload a photo or use your camera to get instant AI insights using {MODEL_LABELS[settings.provider]}.
              </p>
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
          {selectedFile && !result && !isAnalyzing ? (
            /* Analyze Action State */
            <button 
              onClick={handleAnalyze}
              className="w-full h-14 bg-white hover:bg-zinc-200 text-black rounded-full font-semibold text-base transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:scale-[1.01] active:scale-[0.99]"
            >
              <Zap className="w-5 h-5 fill-black" />
              <span>Analyze Image</span>
            </button>
          ) : (
             /* Input State (Only show if not analyzing/done) */
            (!isAnalyzing && !result) && (
              <div className="h-14 bg-zinc-900/80 backdrop-blur-md border border-zinc-800 rounded-full flex items-center p-1.5 shadow-lg relative overflow-hidden group">
                
                {/* Visual Hint Text */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-zinc-500 text-sm font-medium">
                  Select an image source
                </div>

                {/* Left Button (Camera) */}
                <button 
                  onClick={() => cameraInputRef.current?.click()}
                  className="relative z-10 h-full aspect-square rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-all flex items-center justify-center group/btn"
                  title="Open Camera"
                >
                  <Camera className="w-5 h-5" />
                </button>

                {/* Spacer to push second button to right */}
                <div className="flex-1" />

                {/* Right Button (Upload) */}
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="relative z-10 h-full aspect-square rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-all flex items-center justify-center"
                   title="Upload Photo"
                >
                  {/* Standard file input */}
                  <input 
                    type="file" 
                    ref={fileInputRef}
                    className="hidden" 
                    accept="image/*"
                    onChange={handleFileSelect}
                  />
                  {/* Camera capture input */}
                  <input 
                    type="file" 
                    ref={cameraInputRef}
                    className="hidden" 
                    accept="image/*"
                    capture="environment"
                    onChange={handleFileSelect}
                  />
                  
                  {selectedFile ? (
                     <div className="w-full h-full rounded-full overflow-hidden border-2 border-zinc-600">
                        <img src={previewUrl!} className="w-full h-full object-cover opacity-50" alt="thumb" />
                     </div>
                  ) : (
                    <ImageIcon className="w-5 h-5" />
                  )}
                </button>
              </div>
            )
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

      {/* Modals */}
      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onUpdate={setSettings}
      />
    </div>
  );
}
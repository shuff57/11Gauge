import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Loader2, AlertCircle, BrainCircuit, Activity, Layout, Save } from 'lucide-react';
import { AnalysisProgress, OllamaMetrics, AppSettings, SessionUser } from '../types';

interface ResultPanelProps {
  loading: boolean;
  result: string | null;
  reasoningTrace?: string | null;
  metrics?: OllamaMetrics | null;
  error?: string;
  progress?: AnalysisProgress | null;
  thoughts?: string[];
  settings?: AppSettings;
  user?: SessionUser | null;
  onSaveAsReference?: () => void;
}

export const ResultPanel: React.FC<ResultPanelProps> = ({ 
  loading, 
  result, 
  reasoningTrace, 
  metrics, 
  error, 
  progress, 
  thoughts, 
  settings,
  user,
  onSaveAsReference
}) => {
  if (loading && !result) {
    const detail = (() => {
      if (!progress) return 'Analyzing visual data...';
      if (progress.phase === 'processing-video' && progress.totalFrames) {
        const current = progress.framesCaptured ?? 0;
        return progress.message || `Extracting frames ${current}/${progress.totalFrames}`;
      }
      return progress.message || 'Analyzing visual data...';
    })();
    return (
      <div className="flex flex-col items-center justify-center h-full p-12 text-zinc-500 animate-in fade-in duration-500">
        <Loader2 className="w-8 h-8 animate-spin mb-4" />
        <p className="text-sm font-medium tracking-wide text-center">{detail}</p>
        
        {reasoningTrace && (
           <div className="mt-8 w-full max-w-2xl text-left">
            <div className="flex items-center gap-2 text-xs font-medium text-zinc-400 mb-2">
              <BrainCircuit className="w-4 h-4 animate-pulse" />
              <span>Thinking...</span>
            </div>
            <div className="p-4 bg-zinc-950/50 rounded-lg border border-zinc-800/50 text-xs text-zinc-500 font-mono whitespace-pre-wrap max-h-64 overflow-y-auto custom-scrollbar">
              {reasoningTrace}
              <span className="inline-block w-1.5 h-3 ml-1 bg-zinc-600 animate-pulse"/>
            </div>
           </div>
        )}

        {!reasoningTrace && thoughts?.length ? (
          <div className="mt-6 w-full max-w-md text-left">
            <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-600 mb-2">Status Feed</p>
            <div className="space-y-1">
              {thoughts.map((thought, index) => (
                <p key={`${thought}-${index}`} className="text-xs text-zinc-400">
                  {index + 1}. {thought}
                </p>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-500/10 border border-red-500/20 rounded-xl text-red-200 flex items-start gap-4 animate-in slide-in-from-bottom-2">
        <AlertCircle className="w-6 h-6 shrink-0 mt-0.5" />
        <div>
          <h3 className="font-medium mb-1 text-red-100">Analysis Failed</h3>
          <p className="text-sm opacity-90">{error}</p>
        </div>
      </div>
    );
  }

  if (!result) return null;

  return (
    <div className="prose prose-invert prose-sm max-w-none p-6 bg-zinc-900/50 rounded-xl border border-zinc-800/50 animate-in slide-in-from-bottom-4 duration-500">
      {reasoningTrace && (
        <details className="mb-6 group">
          <summary className="flex items-center gap-2 text-xs font-medium text-zinc-500 cursor-pointer hover:text-zinc-300 select-none list-none">
            <BrainCircuit className="w-4 h-4" />
            <span>Visual Analysis</span>
            <span className="text-[10px] bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-400 group-open:hidden">Show</span>
            <span className="text-[10px] bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-400 hidden group-open:inline">Hide</span>
          </summary>
          <div className="mt-3 p-4 bg-zinc-950/50 rounded-lg border border-zinc-800/50 text-xs text-zinc-400 font-mono whitespace-pre-wrap max-h-96 overflow-y-auto custom-scrollbar">
            {reasoningTrace}
          </div>
        </details>
      )}
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{result}</ReactMarkdown>
      {loading && (
        <div className="mt-4 flex items-center gap-2 text-zinc-500 animate-pulse">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-xs">Generating...</span>
        </div>
      )}

      {settings && (settings.materialType || settings.weldProcess || settings.materialThickness || settings.jointType || settings.weldPosition) && (
        <div className="mt-8 pt-6 border-t border-zinc-800/50">
          <div className="flex items-center gap-2 text-xs font-medium text-zinc-500 mb-3">
            <Layout className="w-4 h-4" />
            <span>Material Configuration</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {settings.materialType && (
              <div className="bg-zinc-950/30 rounded p-2 border border-zinc-800/30">
                <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Material</div>
                <div className="text-xs font-mono text-zinc-300 truncate" title={settings.materialType}>{settings.materialType}</div>
              </div>
            )}
            {settings.weldProcess && (
              <div className="bg-zinc-950/30 rounded p-2 border border-zinc-800/30">
                <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Process</div>
                <div className="text-xs font-mono text-zinc-300 truncate" title={settings.weldProcess}>{settings.weldProcess}</div>
              </div>
            )}
            {settings.materialThickness && (
              <div className="bg-zinc-950/30 rounded p-2 border border-zinc-800/30">
                <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Thickness</div>
                <div className="text-xs font-mono text-zinc-300 truncate" title={settings.materialThickness}>{settings.materialThickness}</div>
              </div>
            )}
            {settings.jointType && (
              <div className="bg-zinc-950/30 rounded p-2 border border-zinc-800/30">
                <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Joint</div>
                <div className="text-xs font-mono text-zinc-300 truncate" title={settings.jointType}>{settings.jointType}</div>
              </div>
            )}
            {settings.weldPosition && (
              <div className="bg-zinc-950/30 rounded p-2 border border-zinc-800/30">
                <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Position</div>
                <div className="text-xs font-mono text-zinc-300 truncate" title={settings.weldPosition}>{settings.weldPosition}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {metrics && (
        <div className="mt-8 pt-6 border-t border-zinc-800/50">
          <div className="flex items-center gap-2 text-xs font-medium text-zinc-500 mb-3">
            <Activity className="w-4 h-4" />
            <span>Performance Metrics</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-zinc-950/30 rounded p-2 border border-zinc-800/30">
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Total Duration</div>
              <div className="text-sm font-mono text-zinc-300">{metrics.totalDurationSeconds.toFixed(2)}s</div>
            </div>
            <div className="bg-zinc-950/30 rounded p-2 border border-zinc-800/30">
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Prompt Eval</div>
              <div className="text-sm font-mono text-zinc-300">{metrics.promptEvalCount} tokens</div>
            </div>
            <div className="bg-zinc-950/30 rounded p-2 border border-zinc-800/30">
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Generation</div>
              <div className="text-sm font-mono text-zinc-300">{metrics.evalCount} tokens</div>
            </div>
            <div className="bg-zinc-950/30 rounded p-2 border border-zinc-800/30">
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Speed</div>
              <div className="text-sm font-mono text-zinc-300">
                {metrics.totalDurationSeconds > 0 
                  ? (metrics.evalCount / metrics.totalDurationSeconds).toFixed(1) 
                  : '0.0'} tokens/sec
              </div>
            </div>
          </div>
        </div>
      )}

      {user?.isAdmin && onSaveAsReference && (
        <div className="mt-8 pt-6 border-t border-zinc-800/50 flex justify-end">
          <button
            onClick={onSaveAsReference}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-xs font-medium transition-colors"
          >
            <Save className="w-4 h-4" />
            Save as Reference Media
          </button>
        </div>
      )}
    </div>
  );
};

import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Loader2, AlertCircle } from 'lucide-react';
import { AnalysisProgress } from '../types';

interface ResultPanelProps {
  loading: boolean;
  result: string | null;
  error?: string;
  progress?: AnalysisProgress | null;
  thoughts?: string[];
}

export const ResultPanel: React.FC<ResultPanelProps> = ({ loading, result, error, progress, thoughts }) => {
  if (loading) {
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
        {thoughts?.length ? (
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
      <ReactMarkdown>{result}</ReactMarkdown>
    </div>
  );
};

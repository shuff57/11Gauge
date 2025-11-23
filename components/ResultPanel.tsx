import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Loader2, AlertCircle } from 'lucide-react';

interface ResultPanelProps {
  loading: boolean;
  result: string | null;
  error?: string;
}

export const ResultPanel: React.FC<ResultPanelProps> = ({ loading, result, error }) => {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-12 text-zinc-500 animate-in fade-in duration-500">
        <Loader2 className="w-8 h-8 animate-spin mb-4" />
        <p className="text-sm font-medium tracking-wide">Analyzing visual data...</p>
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

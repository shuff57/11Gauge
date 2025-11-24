import React, { useState } from 'react';
import { X, CheckCircle, AlertTriangle, Loader2, Wifi, Settings, Terminal } from 'lucide-react';
import { AppSettings, ModelProvider } from '../types';
import { MODEL_LABELS, GEMINI_MODELS } from '../constants';
import { testConnection } from '../services/llm';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onUpdate: (newSettings: AppSettings) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdate,
}) => {
  const [testStatus, setTestStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState<string>('');

  if (!isOpen) return null;

  const handleChange = (key: keyof AppSettings, value: any) => {
    onUpdate({ ...settings, [key]: value });
    // Reset test status when settings change
    if (testStatus !== 'idle') {
      setTestStatus('idle');
      setTestMessage('');
    }
  };

  const handleTestConnection = async () => {
    setTestStatus('loading');
    setTestMessage('');
    try {
      await testConnection(settings);
      setTestStatus('success');
      setTestMessage('Connection verified successfully.');
    } catch (err: any) {
      setTestStatus('error');
      setTestMessage(err.message || 'Connection failed.');
    }
  };

  const isOllama = settings.provider === ModelProvider.OLLAMA;
  const isCorsError = isOllama && testStatus === 'error' && (testMessage.includes('CORS') || testMessage.includes('Failed to fetch'));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-zinc-100" />
            <h2 className="text-lg font-medium text-white">Settings</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-zinc-800 rounded-full transition-colors">
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto">
          <div className="space-y-4">
            
            <div className="space-y-2">
              <label className="text-sm text-zinc-300">AI Provider</label>
              <select
                value={settings.provider}
                onChange={(e) => handleChange('provider', e.target.value as ModelProvider)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600"
              >
                {Object.entries(MODEL_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>

            {settings.provider === ModelProvider.GEMINI && (
              <>
                 <div className="space-y-2">
                  <label className="text-sm text-zinc-300">Gemini Model</label>
                  <select
                    value={settings.geminiModel || 'gemini-2.5-flash'}
                    onChange={(e) => handleChange('geminiModel', e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600"
                  >
                    {GEMINI_MODELS.map((model) => (
                      <option key={model.value} value={model.value}>{model.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-zinc-300">API Key</label>
                  <input
                    type="password"
                    value={settings.geminiKey}
                    onChange={(e) => handleChange('geminiKey', e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600 placeholder-zinc-600"
                    placeholder="Enter your Gemini API key"
                  />
                </div>
              </>
            )}

            {settings.provider === ModelProvider.OPENAI && (
              <div className="space-y-2">
                <label className="text-sm text-zinc-300">OpenAI API Key</label>
                <input
                  type="password"
                  value={settings.openaiKey}
                  onChange={(e) => handleChange('openaiKey', e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600 placeholder-zinc-600"
                  placeholder="sk-..."
                />
              </div>
            )}

            {isOllama && (
              <>
                <div className="space-y-2">
                  <label className="text-sm text-zinc-300">Endpoint URL</label>
                  <input
                    type="text"
                    value={settings.ollamaUrl}
                    onChange={(e) => handleChange('ollamaUrl', e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600 placeholder-zinc-600"
                    placeholder="http://localhost:11434"
                  />
                  <p className="text-[10px] text-zinc-500">For local use, enter http://localhost:11434</p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm text-zinc-300">API Key</label>
                  <input
                    type="password"
                    value={settings.ollamaKey || ''}
                    onChange={(e) => handleChange('ollamaKey', e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600 placeholder-zinc-600"
                    placeholder="Bearer token (optional)"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm text-zinc-300">Model Name</label>
                  <input
                    type="text"
                    value={settings.ollamaModel}
                    onChange={(e) => handleChange('ollamaModel', e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600 placeholder-zinc-600"
                    placeholder="e.g. llava, llama3.2-vision"
                  />
                  <p className="text-[10px] text-zinc-500">Leave blank to auto-use Ollama Cloud Vision.</p>
                </div>
              </>
            )}
            
            {/* CORS Helper Section */}
            {isCorsError && (
              <div className="bg-zinc-950/50 rounded-lg p-3 border border-orange-500/30">
                <div className="flex items-start gap-2 mb-2">
                  <Terminal className="w-4 h-4 text-orange-400 mt-0.5" />
                  <span className="text-xs font-semibold text-orange-200">Browser Access Blocked (CORS)</span>
                </div>
                <p className="text-[11px] text-zinc-400 mb-2">
                  Browsers cannot access Ollama locally unless you explicitly allow it.
                </p>
                <div className="space-y-2">
                  <div>
                    <span className="text-[10px] text-zinc-500 uppercase font-bold">Mac / Linux</span>
                    <div className="bg-black rounded px-2 py-1 mt-1 text-[10px] font-mono text-zinc-300 select-all border border-zinc-800">
                      OLLAMA_ORIGINS="*" ollama serve
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-500 uppercase font-bold">Windows (PowerShell)</span>
                    <div className="bg-black rounded px-2 py-1 mt-1 text-[10px] font-mono text-zinc-300 select-all border border-zinc-800">
                      $env:OLLAMA_ORIGINS="*"; ollama serve
                    </div>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
        
        {/* Footer actions */}
        <div className="p-4 bg-zinc-950/50 border-t border-zinc-800 flex flex-col gap-4 shrink-0">
          
          {/* Test Status Indicator */}
          {testStatus !== 'idle' && (
             <div className={`text-xs px-3 py-2 rounded-lg border flex items-center gap-2 ${
               testStatus === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-200' :
               testStatus === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-200' :
               'bg-zinc-800 border-zinc-700 text-zinc-300'
             }`}>
               {testStatus === 'loading' && <Loader2 className="w-3 h-3 animate-spin" />}
               {testStatus === 'success' && <CheckCircle className="w-3 h-3" />}
               {testStatus === 'error' && <AlertTriangle className="w-3 h-3 shrink-0" />}
               <span className="truncate">{testMessage || 'Testing connection...'}</span>
             </div>
          )}

          <div className="flex items-center justify-between">
            <button
              onClick={handleTestConnection}
              disabled={testStatus === 'loading' || (isOllama && !settings.ollamaUrl)}
              className="px-4 py-2 text-zinc-400 text-sm font-medium hover:text-white transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Wifi className="w-4 h-4" />
              Test Connection
            </button>

            <button 
              onClick={onClose}
              className="px-4 py-2 bg-white text-black text-sm font-medium rounded-lg hover:bg-zinc-200 transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
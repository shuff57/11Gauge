import React, { useMemo, useState } from 'react';
import { CheckCircle, AlertTriangle, Loader2, Wifi, Settings, Terminal, Key, X, ExternalLink, Layout, Database, FileText } from 'lucide-react';
import { AppSettings, ModelProvider, SessionUser } from '../types';
import { MODEL_LABELS, GEMINI_MODELS } from '../constants';
import { testConnection, getOllamaKey } from '../services/llm';

type ProviderSlug = 'ollama' | 'gemini' | 'openai';
type Tab = 'general' | 'material';

interface SavedKeySummary {
  id: number;
  provider: ProviderSlug;
  label: string;
  updatedAt: string;
  lastFour?: string | null;
}

const PROVIDER_FIELD_MAP: Record<ProviderSlug, keyof AppSettings> = {
  ollama: 'ollamaKey',
  gemini: 'geminiKey',
  openai: 'openaiKey'
};

const PROVIDER_ID_FIELD_MAP: Record<ProviderSlug, keyof AppSettings> = {
  ollama: 'ollamaKeyId',
  gemini: 'geminiKeyId',
  openai: 'openaiKeyId'
};

const MODEL_TO_PROVIDER: Record<ModelProvider, ProviderSlug> = {
  [ModelProvider.OLLAMA]: 'ollama',
  [ModelProvider.GEMINI]: 'gemini',
  [ModelProvider.OPENAI]: 'openai'
};

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onUpdate: (newSettings: AppSettings) => void;
  user?: SessionUser | null;
  onOpenKeyManager: () => void;
  keyUpdateTrigger?: number;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdate,
  user,
  onOpenKeyManager,
  keyUpdateTrigger = 0,
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('general');
  const [testStatus, setTestStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState<string>('');
  const [savedKeys, setSavedKeys] = useState<SavedKeySummary[]>([]);
  const [loadingSavedKeys, setLoadingSavedKeys] = useState(false);
  const [savedKeysError, setSavedKeysError] = useState<string | null>(null);

  const fetchSavedKeysFromApi = React.useCallback(async (): Promise<SavedKeySummary[]> => {
    if (!user) return [];
    const response = await fetch('/api/keys');
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.error || 'Failed to load saved keys');
    }
    const validProviders: ProviderSlug[] = ['ollama', 'gemini', 'openai'];
    const parsed: SavedKeySummary[] = Array.isArray(payload?.keys)
      ? payload.keys
          .filter((key: any) => validProviders.includes(key.provider))
          .map((key: any) => ({
            id: key.id,
            provider: key.provider as ProviderSlug,
            label: key.label,
            updatedAt: key.updatedAt || key.updated_at || '',
            lastFour: key.lastFour ?? key.last_four ?? null,
          }))
      : [];
    return parsed;
  }, [user]);

  const refreshSavedKeys = React.useCallback(async () => {
    if (!user) return;
    setLoadingSavedKeys(true);
    setSavedKeysError(null);
    try {
      const parsed = await fetchSavedKeysFromApi();
      setSavedKeys(parsed);
    } catch (err: any) {
      setSavedKeysError(err?.message || 'Unable to load saved keys');
    } finally {
      setLoadingSavedKeys(false);
    }
  }, [fetchSavedKeysFromApi, user]);

  // Refresh keys when trigger changes
  React.useEffect(() => {
    if (isOpen && user) {
      refreshSavedKeys();
    }
  }, [keyUpdateTrigger, isOpen, user, refreshSavedKeys]);

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
      let keyStored = false;
      if (settings.provider === ModelProvider.OLLAMA) {
        // Only save to session storage for persistence across reloads if not logged in
        // Logged in users should use Key Manager to save keys
        if (!user?.email) {
          sessionStorage.setItem('session_ollama_key', settings.ollamaKey || '');
        }
      }
      setTestStatus('success');
      setTestMessage('Connection verified successfully.');
    } catch (err: any) {
      setTestStatus('error');
      setTestMessage(err.message || 'Connection failed.');
    }
  };

  // Load key when settings modal opens
  React.useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!isOpen) return;
      if (settings.provider !== ModelProvider.OLLAMA) return;
      if (user && user.email) {
        const k = await getOllamaKey();
        if (mounted && k) {
          onUpdate({ ...settings, ollamaKey: k });
        }
      } else {
        const sessionKey = sessionStorage.getItem('session_ollama_key');
        if (mounted && sessionKey) {
          onUpdate({ ...settings, ollamaKey: sessionKey });
        }
      }
    };
    load();
    return () => { mounted = false; };
  }, [isOpen, settings.provider, user]);

  React.useEffect(() => {
    let cancelled = false;
    if (!isOpen || !user) {
      setSavedKeys([]);
      setSavedKeysError(null);
      setLoadingSavedKeys(false);
      return;
    }
    const load = async () => {
      setLoadingSavedKeys(true);
      setSavedKeysError(null);
      try {
        const parsed = await fetchSavedKeysFromApi();
        if (!cancelled) {
          setSavedKeys(parsed);
        }
      } catch (err: any) {
        if (!cancelled) {
          setSavedKeys([]);
          setSavedKeysError(err?.message || 'Unable to load saved keys');
        }
      } finally {
        if (!cancelled) setLoadingSavedKeys(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [fetchSavedKeysFromApi, isOpen, user]);

  const isOllama = settings.provider === ModelProvider.OLLAMA;
  const isCorsError = isOllama && testStatus === 'error' && (testMessage.includes('CORS') || testMessage.includes('Failed to fetch'));
  const savedKeysByProvider = useMemo(() => {
    const base: Record<ProviderSlug, SavedKeySummary[]> = {
      ollama: [],
      gemini: [],
      openai: []
    };
    savedKeys.forEach((key) => {
      if (base[key.provider]) {
        base[key.provider].push(key);
      }
    });
    return base;
  }, [savedKeys]);

  const activeProviderSlug = MODEL_TO_PROVIDER[settings.provider];
  const activeProviderLabel = MODEL_LABELS[settings.provider];
  const activeProviderKeys = savedKeysByProvider[activeProviderSlug];

  const handleSavedKeySelect = async (provider: ProviderSlug, keyIdStr: string) => {
    const keyId = keyIdStr ? Number(keyIdStr) : null;
    
    // Update the ID in settings immediately
    onUpdate({ ...settings, [PROVIDER_ID_FIELD_MAP[provider]]: keyId });

    if (!keyId) {
      // If clearing selection, also clear the key value? 
      // Or keep it? Let's clear it to be safe/consistent.
      handleChange(PROVIDER_FIELD_MAP[provider], '');
      return;
    }

    try {
      const response = await fetch(`/api/keys/${keyId}`);
      if (!response.ok) {
        throw new Error('Failed to load saved key');
      }
      const data = await response.json();
      const value = data?.key?.value;
      if (!value) return;
      
      // Update both the ID and the Value
      onUpdate({ 
        ...settings, 
        [PROVIDER_ID_FIELD_MAP[provider]]: keyId,
        [PROVIDER_FIELD_MAP[provider]]: value 
      });
    } catch (err) {
      console.warn('Unable to load saved key', err);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6" onClick={onClose}>
        <div
          className="w-full h-[600px] max-h-[90vh] sm:w-[min(90vw,36rem)] lg:w-1/2 lg:max-w-[48rem] bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between p-4 border-b border-zinc-800 shrink-0">
            <div className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-zinc-400" />
              <h2 className="text-sm font-medium text-white">Settings</h2>
            </div>
            <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center px-4 border-b border-zinc-800 bg-zinc-900/50">
            <button
              onClick={() => setActiveTab('general')}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-medium border-b-2 transition-colors ${
                activeTab === 'general' 
                  ? 'border-white text-white' 
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              General
            </button>
            <button
              onClick={() => setActiveTab('material')}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-medium border-b-2 transition-colors ${
                activeTab === 'material' 
                  ? 'border-white text-white' 
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Layout className="w-3.5 h-3.5" />
              Material
            </button>
          </div>

        <div className="p-4 space-y-5 overflow-y-auto custom-scrollbar flex-1">
          {activeTab === 'general' && (
          <div className="space-y-4">
            
            <div className="space-y-2">
              <label className="text-sm text-zinc-300">AI Provider</label>
              <select
                value={settings.provider}
                onChange={(e) => handleChange('provider', e.target.value as ModelProvider)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600"
              >
                {Object.entries(MODEL_LABELS)
                  .filter(([key]) => user || key === ModelProvider.OLLAMA)
                  .map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
              </select>
            </div>

            {user && savedKeysError && (
              <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {savedKeysError}
              </div>
            )}

            {settings.provider === ModelProvider.GEMINI && (
              <>
                {user && (
                  <div className="space-y-1">
                    <label className="text-xs text-zinc-400">Use Saved Key</label>
                    <select
                      value={settings.geminiKeyId || ''}
                      onChange={(e) => handleSavedKeySelect('gemini', e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600"
                    >
                      <option value="">Select a saved key</option>
                      {savedKeysByProvider.gemini.map((key) => (
                        <option key={key.id} value={String(key.id)}>
                          {key.label}
                        </option>
                      ))}
                    </select>
                    {savedKeysByProvider.gemini.length === 0 && (
                      <p className="text-[10px] text-zinc-500 pt-1"></p>
                    )}
                  </div>
                )}
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
              </>
            )}

            {settings.provider === ModelProvider.OPENAI && (
              <div className="space-y-2">
                {user && (
                  <div className="space-y-1">
                    <label className="text-xs text-zinc-400">Use Saved Key</label>
                    <select
                      value={settings.openaiKeyId || ''}
                      onChange={(e) => handleSavedKeySelect('openai', e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600"
                    >
                      <option value="">Select a saved key</option>
                      {savedKeysByProvider.openai.map((key) => (
                        <option key={key.id} value={String(key.id)}>
                          {key.label}
                        </option>
                      ))}
                    </select>
                    {savedKeysByProvider.openai.length === 0 && (
                      <p className="text-[10px] text-zinc-500 pt-1"></p>
                    )}
                  </div>
                )}
              </div>
            )}

            {isOllama && (
              <>
                {user && (
                  <div className="space-y-1">
                    <label className="text-xs text-zinc-400">Use Saved Key</label>
                    <select
                      value={settings.ollamaKeyId || ''}
                      onChange={(e) => handleSavedKeySelect('ollama', e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600"
                    >
                      <option value="">Select a saved key</option>
                      {savedKeysByProvider.ollama.map((key) => (
                        <option key={key.id} value={String(key.id)}>
                          {key.label}
                        </option>
                      ))}
                    </select>
                    {savedKeysByProvider.ollama.length === 0 && (
                      <p className="text-[10px] text-zinc-500 pt-1"></p>
                    )}
                  </div>
                )}

                <div className="space-y-4 pt-2 border-t border-zinc-800/50">
                  <div className="space-y-2">
                    <label className="text-sm text-zinc-300 flex items-center gap-2">
                      <span>Reasoning Model</span>
                      <span className="text-[10px] px-1.5 py-0.5 bg-blue-500/20 text-blue-300 rounded border border-blue-500/30">Pipeline Active</span>
                    </label>
                    <input
                      type="text"
                      value={settings.ollamaReasoningModel || ''}
                      onChange={(e) => handleChange('ollamaReasoningModel', e.target.value)}
                      placeholder="e.g. kimi-k2:1t-cloud"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600 placeholder-zinc-600"
                    />
                    <p className="text-[10px] text-zinc-500">
                      Generates the final report based on visual findings. Visual analysis is handled automatically by Qwen3-VL.
                    </p>
                  </div>
                </div>

                <div className="pt-2">
                  <a 
                    href="https://ollama.com/settings" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                  >
                    View Usage & Account Settings (Ollama Cloud)
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <div className="pt-2 flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="ollamaThinking"
                    checked={settings.ollamaThinking ?? false}
                    onChange={(e) => handleChange('ollamaThinking', e.target.checked)}
                    className="rounded border-zinc-700 bg-zinc-900 text-blue-500 focus:ring-blue-500/20"
                  />
                  <label htmlFor="ollamaThinking" className="text-sm text-zinc-300 select-none cursor-pointer">
                    Enable Thinking (Reasoning Trace)
                  </label>
                </div>
              </>
            )}

            {user ? (
              <>
              </>
            ) : (
              <div className="border border-dashed border-zinc-800 rounded-xl p-3 text-xs text-zinc-500 bg-zinc-950/30">
                Sign in to securely store and reuse provider keys across devices.
              </div>
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
          )}

          {activeTab === 'material' && (
            <div className="space-y-6">
              <div className="bg-zinc-950/50 rounded-xl border border-zinc-800/50 p-4">
                <h3 className="text-sm font-medium text-zinc-200 mb-4 flex items-center gap-2">
                  <Layout className="w-4 h-4 text-purple-400" />
                  Material & Weld Configuration
                </h3>
                <div className="space-y-4">
                  
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Material Type</label>
                    <select
                      value={settings.materialType || ''}
                      onChange={(e) => handleChange('materialType', e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600"
                    >
                      <option value="">Select Material...</option>
                      {['Carbon Steel', 'Stainless Steel', 'Aluminum', 'Titanium', 'Cast Iron', 'Copper'].map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Weld Process</label>
                    <select
                      value={settings.weldProcess || ''}
                      onChange={(e) => handleChange('weldProcess', e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600"
                    >
                      <option value="">Select Process...</option>
                      {[
                        { code: 'GMAW', name: 'MIG (Gas Metal Arc)' },
                        { code: 'GTAW', name: 'TIG (Gas Tungsten Arc)' },
                        { code: 'SMAW', name: 'Stick (Shielded Metal Arc)' },
                        { code: 'FCAW', name: 'Flux Core' }
                      ].map(m => (
                        <option key={m.code} value={m.code}>{m.name} ({m.code})</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Material Thickness</label>
                    <select
                      value={settings.materialThickness || ''}
                      onChange={(e) => handleChange('materialThickness', e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600"
                    >
                      <option value="">Select Thickness...</option>
                      {['24 Gauge', '22 Gauge', '20 Gauge', '18 Gauge', '16 Gauge', '14 Gauge', '1/8"', '3/16"', '1/4"', '3/8"', '1/2"'].map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Joint Type</label>
                    <select
                      value={settings.jointType || ''}
                      onChange={(e) => handleChange('jointType', e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600"
                    >
                      <option value="">Select Joint Type...</option>
                      {['Butt Joint', 'Tee Joint', 'Lap Joint', 'Corner Joint', 'Edge Joint'].map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Weld Position</label>
                    <select
                      value={settings.weldPosition || ''}
                      onChange={(e) => handleChange('weldPosition', e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600"
                    >
                      <option value="">Select Position...</option>
                      <optgroup label="Fillet Welds">
                        <option value="1F">1F (Flat)</option>
                        <option value="2F">2F (Horizontal)</option>
                        <option value="3F">3F (Vertical)</option>
                        <option value="4F">4F (Overhead)</option>
                      </optgroup>
                      <optgroup label="Groove Welds">
                        <option value="1G">1G (Flat)</option>
                        <option value="2G">2G (Horizontal)</option>
                        <option value="3G">3G (Vertical)</option>
                        <option value="4G">4G (Overhead)</option>
                      </optgroup>
                      <optgroup label="Pipe Welds">
                        <option value="5G">5G (Pipe Fixed, Horizontal)</option>
                        <option value="6G">6G (Pipe Fixed, 45°)</option>
                      </optgroup>
                    </select>
                  </div>

                </div>
              </div>
            </div>
          )}
        </div>
        
        {/* Footer actions */}
        <div className="px-4 pb-4 pt-2 border-t border-zinc-800 flex flex-col gap-4 shrink-0">
          
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

          <div className="flex items-center gap-3">
            {user && (
              <button
                onClick={handleTestConnection}
                disabled={testStatus === 'loading' || (isOllama && !settings.ollamaUrl)}
                className="flex-1 px-4 py-2 bg-[#a1a1aa] text-black text-sm font-medium rounded-lg hover:bg-zinc-300 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Wifi className="w-4 h-4" />
                Test Connection
              </button>
            )}

            <button 
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-[#a1a1aa] text-black text-sm font-medium rounded-lg hover:bg-zinc-300 transition-colors"
            >
              Done
            </button>
          </div>
        </div>
        </div>
      </div>
    </>
  );
};


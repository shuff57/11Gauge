import React, { useMemo, useState } from 'react';
import { CheckCircle, AlertTriangle, Loader2, Wifi, Settings, Terminal, Key, RefreshCcw, Pencil, Trash2 } from 'lucide-react';
import { AppSettings, ModelProvider } from '../types';
import { MODEL_LABELS, GEMINI_MODELS } from '../constants';
import { testConnection, saveOllamaKey, getOllamaKey } from '../services/llm';

type ProviderSlug = 'ollama' | 'gemini' | 'openai';

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
  user?: { email: string } | null;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdate,
  user,
}) => {
  const [testStatus, setTestStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState<string>('');
  const [savedKeys, setSavedKeys] = useState<SavedKeySummary[]>([]);
  const [selectedSavedKey, setSelectedSavedKey] = useState<Record<ProviderSlug, string | null>>({
    ollama: null,
    gemini: null,
    openai: null
  });
  const [loadingSavedKeys, setLoadingSavedKeys] = useState(false);
  const [savedKeysError, setSavedKeysError] = useState<string | null>(null);
  const [keyForm, setKeyForm] = useState<{ id: number | null; label: string }>({
    id: null,
    label: ''
  });
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [keyActionError, setKeyActionError] = useState<string | null>(null);
  const [editingKeyLoadingId, setEditingKeyLoadingId] = useState<number | null>(null);

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
        // Save to sessionStorage if not logged in, otherwise persist to DB
        if (user && user.email) {
          keyStored = await saveOllamaKey(settings.ollamaKey);
        } else {
          sessionStorage.setItem('session_ollama_key', settings.ollamaKey || '');
          keyStored = false;
        }
      }
      setTestStatus('success');
      setTestMessage(keyStored ? 'Connection verified and key saved securely.' : 'Connection verified successfully.');
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
      setSelectedSavedKey({ ollama: null, gemini: null, openai: null });
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

  const handleSavedKeySelect = async (provider: ProviderSlug, keyId: string) => {
    setSelectedSavedKey((prev) => ({ ...prev, [provider]: keyId || null }));
    if (!keyId) return;
    try {
      const response = await fetch(`/api/keys/${keyId}`);
      if (!response.ok) {
        throw new Error('Failed to load saved key');
      }
      const data = await response.json();
      const value = data?.key?.value;
      if (!value) return;
      handleChange(PROVIDER_FIELD_MAP[provider], value);
    } catch (err) {
      console.warn('Unable to load saved key', err);
    }
  };

  const resetKeyForm = () => {
    setKeyForm({ id: null, label: '' });
    setKeyActionError(null);
  };

  React.useEffect(() => {
    if (!isOpen) return;
    resetKeyForm();
  }, [isOpen, settings.provider]);

  const handleSavedKeySubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) return;
    const label = keyForm.label.trim();
    const providerField = PROVIDER_FIELD_MAP[activeProviderSlug];
    const currentSecret = (settings[providerField] || '').trim();
    if (!label) {
      setKeyActionError('Label is required');
      return;
    }
    if (!keyForm.id && !currentSecret) {
      setKeyActionError('Enter an API key above before saving.');
      return;
    }
    setIsSavingKey(true);
    setKeyActionError(null);
    try {
      if (keyForm.id) {
        const payload: Record<string, string> = { label };
        if (currentSecret) payload.key = currentSecret;
        const response = await fetch(`/api/keys/${keyForm.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(data?.error || 'Failed to update key');
        }
      } else {
        const response = await fetch('/api/keys', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: activeProviderSlug, label, key: currentSecret })
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(data?.error || 'Failed to save key');
        }
      }
      await refreshSavedKeys();
      resetKeyForm();
    } catch (err: any) {
      setKeyActionError(err?.message || 'Unable to save key');
    } finally {
      setIsSavingKey(false);
    }
  };

  const handleEditSavedKey = async (key: SavedKeySummary) => {
    setKeyActionError(null);
    setEditingKeyLoadingId(key.id);
    try {
      const response = await fetch(`/api/keys/${key.id}`);
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to load key');
      }
      setKeyForm({
        id: key.id,
        label: key.label
      });
      const providerField = PROVIDER_FIELD_MAP[key.provider];
      if (data?.key?.value) {
        handleChange(providerField, data.key.value);
        setSelectedSavedKey((prev) => ({ ...prev, [key.provider]: String(key.id) }));
      }
    } catch (err: any) {
      setKeyActionError(err?.message || 'Unable to load key');
    } finally {
      setEditingKeyLoadingId(null);
    }
  };

  const handleDeleteSavedKey = async (id: number) => {
    if (!user) return;
    if (!window.confirm('Remove this key? This cannot be undone.')) return;
    setKeyActionError(null);
    try {
      const response = await fetch(`/api/keys/${id}`, { method: 'DELETE' });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to delete key');
      }
      if (keyForm.id === id) {
        resetKeyForm();
      }
      await refreshSavedKeys();
    } catch (err: any) {
      setKeyActionError(err?.message || 'Unable to delete key');
    }
  };

  const handlePrefillSavedKey = (provider: ProviderSlug, id: number) => {
    setSelectedSavedKey((prev) => ({ ...prev, [provider]: String(id) }));
    handleSavedKeySelect(provider, String(id));
  };

  const handleKeyFormChange = (value: string) => {
    setKeyForm((prev) => ({ ...prev, label: value }));
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-20 lg:pt-24">
        <div className="w-full h-full sm:h-auto sm:w-[min(90vw,36rem)] lg:w-1/2 lg:max-w-[48rem] bg-zinc-900 border border-zinc-800 rounded-none sm:rounded-2xl shadow-2xl flex flex-col max-h-[95vh]">
          <div className="flex items-center justify-between p-4 border-b border-zinc-800 shrink-0">
            <div className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-zinc-400" />
              <h2 className="text-sm font-medium text-white">Settings</h2>
            </div>
          </div>

        <div className="p-4 space-y-5 overflow-y-auto custom-scrollbar">
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

            {user && savedKeysError && (
              <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {savedKeysError}
              </div>
            )}

            {settings.provider === ModelProvider.GEMINI && (
              <>
                {user && savedKeysByProvider.gemini.length > 0 && (
                  <div className="space-y-1">
                    <label className="text-xs text-zinc-400">Use Saved Key</label>
                    <select
                      value={selectedSavedKey.gemini || ''}
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
                {user && savedKeysByProvider.openai.length > 0 && (
                  <div className="space-y-1">
                    <label className="text-xs text-zinc-400">Use Saved Key</label>
                    <select
                      value={selectedSavedKey.openai || ''}
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
                  </div>
                )}
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
                {user && savedKeysByProvider.ollama.length > 0 && (
                  <div className="space-y-1">
                    <label className="text-xs text-zinc-400">Use Saved Key</label>
                    <select
                      value={selectedSavedKey.ollama || ''}
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
                  </div>
                )}
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
                <div className="text-xs text-zinc-500">
                  {user ? 'Saved to your account' : 'Saved for this browser session only'}
                </div>
              </>
            )}

            {user ? (
              <div className="space-y-3 border border-zinc-800 rounded-xl p-3 bg-zinc-950/50">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 text-sm text-white font-medium">
                      <Key className="w-4 h-4 text-zinc-400" />
                      Manage Keys
                    </div>
                    <p className="text-[11px] text-zinc-500">Stored keys for {activeProviderLabel}</p>
                  </div>
                  <button
                    type="button"
                    onClick={refreshSavedKeys}
                    disabled={loadingSavedKeys}
                    className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-white transition disabled:opacity-50"
                  >
                    <RefreshCcw className={`w-3 h-3 ${loadingSavedKeys ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                </div>

                <div className="space-y-2 max-h-36 overflow-y-auto">
                  {loadingSavedKeys && activeProviderKeys.length === 0 ? (
                    <div className="text-xs text-zinc-400">Loading saved keys...</div>
                  ) : activeProviderKeys.length === 0 ? (
                    <div className="text-xs text-zinc-500">
                      No saved keys for {activeProviderLabel}. Add one below.
                    </div>
                  ) : (
                    activeProviderKeys.map((key) => (
                      <div key={key.id} className="flex items-center justify-between gap-3 border border-zinc-800 rounded-lg px-3 py-2">
                        <div>
                          <p className="text-sm text-white font-medium">{key.label}</p>
                          <p className="text-[11px] text-zinc-500">•••• {key.lastFour || '????'}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handlePrefillSavedKey(key.provider, key.id)}
                            className="text-[11px] px-2 py-1 rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                          >
                            Use
                          </button>
                          <button
                            type="button"
                            onClick={() => handleEditSavedKey(key)}
                            className="text-[11px] text-zinc-400 hover:text-white"
                          >
                            {editingKeyLoadingId === key.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Pencil className="w-3 h-3" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSavedKey(key.id)}
                            className="text-[11px] text-red-400 hover:text-red-300"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <form className="space-y-2 border-t border-zinc-800 pt-3" onSubmit={handleSavedKeySubmit}>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-zinc-400">
                      {keyForm.id ? `Editing ${activeProviderLabel} key` : `Add a ${activeProviderLabel} key`}
                    </p>
                    {keyForm.id && (
                      <button
                        type="button"
                        className="text-[11px] text-zinc-400 hover:text-white"
                        onClick={resetKeyForm}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={keyForm.label}
                    onChange={(e) => handleKeyFormChange(e.target.value)}
                    placeholder="Label (e.g. Production)"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600 placeholder-zinc-600"
                  />
                  <p className="text-[11px] text-zinc-500">
                    Uses the current {activeProviderLabel} API key value above.
                  </p>
                  {keyActionError && (
                    <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                      {keyActionError}
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={isSavingKey}
                    className="w-full flex items-center justify-center gap-2 bg-white text-black text-sm font-medium rounded-lg py-2 hover:bg-zinc-200 transition disabled:opacity-60"
                  >
                    {isSavingKey && <Loader2 className="w-4 h-4 animate-spin" />}
                    {keyForm.id ? 'Update Key' : `Save ${activeProviderLabel} Key`}
                  </button>
                </form>
              </div>
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
    </>
  );
};
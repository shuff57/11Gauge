import React, { useState, useMemo } from 'react';
import { Key, RefreshCcw, Pencil, Trash2, Loader2, X } from 'lucide-react';
import { AppSettings, ModelProvider } from '../types';
import { MODEL_LABELS } from '../constants';

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

interface KeyManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: { email: string };
  settings: AppSettings;
  onUpdate: (newSettings: AppSettings) => void;
  onKeysUpdated: () => void;
}

export const KeyManagerModal: React.FC<KeyManagerModalProps> = ({
  isOpen,
  onClose,
  user,
  settings,
  onUpdate,
  onKeysUpdated
}) => {
  const [savedKeys, setSavedKeys] = useState<SavedKeySummary[]>([]);
  const [loadingSavedKeys, setLoadingSavedKeys] = useState(false);
  const [savedKeysError, setSavedKeysError] = useState<string | null>(null);
  const [keyForm, setKeyForm] = useState<{ id: number | null; label: string }>({
    id: null,
    label: ''
  });
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [keyActionError, setKeyActionError] = useState<string | null>(null);
  const [editingKeyLoadingId, setEditingKeyLoadingId] = useState<number | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<ProviderSlug>(MODEL_TO_PROVIDER[settings.provider]);

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
      onKeysUpdated();
    } catch (err: any) {
      setSavedKeysError(err?.message || 'Unable to load saved keys');
    } finally {
      setLoadingSavedKeys(false);
    }
  }, [fetchSavedKeysFromApi, user, onKeysUpdated]);

  React.useEffect(() => {
    if (isOpen) {
      refreshSavedKeys();
    }
  }, [isOpen, refreshSavedKeys]);

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

  const activeProviderSlug = selectedProvider;
  const PROVIDER_LABELS: Record<ProviderSlug, string> = {
    ollama: 'Ollama (OpenSource)',
    gemini: 'Google (Gemini)',
    openai: 'OpenAI (ChatGPT)'
  };
  const activeProviderLabel = PROVIDER_LABELS[selectedProvider];
  const activeProviderKeys = savedKeysByProvider[activeProviderSlug];

  const handleChange = (key: keyof AppSettings, value: any) => {
    onUpdate({ ...settings, [key]: value });
  };

  const resetKeyForm = () => {
    setKeyForm({ id: null, label: '' });
    setKeyActionError(null);
  };

  const handleSavedKeySubmit = async () => {
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
      // Switch to the provider of the key being edited
      setSelectedProvider(key.provider);
      
      const providerField = PROVIDER_FIELD_MAP[key.provider];
      if (data?.key?.value) {
        handleChange(providerField, data.key.value);
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

  const handleKeyFormChange = (value: string) => {
    setKeyForm((prev) => ({ ...prev, label: value }));
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-50" onClick={onClose} />
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6 pointer-events-none">
        <div className="w-full max-h-[90vh] sm:w-[min(90vw,36rem)] lg:w-1/2 lg:max-w-[48rem] bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl flex flex-col pointer-events-auto">
          <div className="flex items-center justify-between p-4 border-b border-zinc-800 shrink-0">
            <div className="flex items-center gap-2">
              <Key className="w-4 h-4 text-zinc-400" />
              <h2 className="text-sm font-medium text-white">Manage Keys</h2>
            </div>
            <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-4 space-y-5 overflow-y-auto custom-scrollbar flex-1">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm text-zinc-300">Provider</label>
                <select
                  value={selectedProvider}
                  onChange={(e) => setSelectedProvider(e.target.value as ProviderSlug)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600"
                >
                  <option value="ollama">Ollama (OpenSource)</option>
                  <option value="gemini">Google (Gemini)</option>
                  <option value="openai">OpenAI (ChatGPT)</option>
                </select>
              </div>

              <div className="space-y-2 pt-1">
                {keyForm.id && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      className="text-[11px] text-zinc-400 hover:text-white"
                      onClick={resetKeyForm}
                    >
                      Cancel
                    </button>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-sm text-zinc-300">Label</label>
                  <input
                    type="text"
                    value={keyForm.label}
                    onChange={(e) => handleKeyFormChange(e.target.value)}
                    placeholder="e.g. Production"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600 placeholder-zinc-600"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm text-zinc-300">API Key Value</label>
                  <input
                    type="password"
                    value={settings[PROVIDER_FIELD_MAP[activeProviderSlug]] || ''}
                    onChange={(e) => handleChange(PROVIDER_FIELD_MAP[activeProviderSlug], e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600 placeholder-zinc-600"
                    placeholder={`Enter ${activeProviderLabel} API key`}
                  />
                </div>
                
                {keyActionError && (
                  <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                    {keyActionError}
                  </div>
                )}
                <button
                  type="button"
                  disabled={isSavingKey}
                  className="w-full flex items-center justify-center gap-2 bg-white text-black text-sm font-medium rounded-lg py-2 hover:bg-zinc-200 transition disabled:opacity-60"
                  onClick={handleSavedKeySubmit}
                >
                  {isSavingKey && <Loader2 className="w-4 h-4 animate-spin" />}
                  {keyForm.id ? 'Update Key' : `Save ${activeProviderLabel} Key`}
                </button>
              </div>

              <div className="border-t border-zinc-800 pt-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
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
                      No saved keys for {activeProviderLabel}.
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
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

import React, { useState, useMemo } from 'react';
import { Key, RefreshCcw, Pencil, Trash2, Loader2, X, Wifi, CheckCircle, AlertTriangle, Users, FileText, RotateCcw, BookMarked } from 'lucide-react';
import { AppSettings, ExampleImageSummary, ModelProvider, PrimarySourceSummary, SessionUser } from '../types';
import { DEFAULT_SYSTEM_PROMPT, DEFAULT_VISION_PROMPT } from '../constants';
import { testConnection } from '../services/llm';
import { UserManagementPanel } from './UserManagementPanel';
import { PrimarySourceModal } from './PrimarySourceModal';

type ProviderSlug = 'ollama';
type Tab = 'keys' | 'users' | 'prompts' | 'library';

interface SavedKeySummary {
  id: number;
  provider: ProviderSlug;
  label: string;
  updatedAt: string;
  lastFour?: string | null;
}


interface KeyManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: SessionUser;
  settings: AppSettings;
  onUpdate: (newSettings: AppSettings) => void;
  onKeysUpdated: () => void;
  primarySources: PrimarySourceSummary[];
  primarySourcesLoading?: boolean;
  primarySourcesError?: string | null;
  selectedSourceIds: string[];
  onToggleSource: (id: string) => void;
  onPrimarySourceUploaded: (source: PrimarySourceSummary) => void;
  onPrimarySourceDeleted: (id: string) => void;
  onPrimarySourcesRefresh: () => Promise<void>;
  referenceImages: ExampleImageSummary[];
  referenceImagesLoading?: boolean;
  referenceImagesError?: string | null;
  onReferenceImagesRefresh: () => Promise<void>;
  onReferenceImageUploaded: (image: ExampleImageSummary) => void;
  onReferenceImageDeleted: (id: string) => void;
}

export const KeyManagerModal: React.FC<KeyManagerModalProps> = ({
  isOpen,
  onClose,
  user,
  settings,
  onUpdate,
  onKeysUpdated,
  primarySources,
  primarySourcesLoading,
  primarySourcesError,
  selectedSourceIds,
  onToggleSource,
  onPrimarySourceUploaded,
  onPrimarySourceDeleted,
  onPrimarySourcesRefresh,
  referenceImages,
  referenceImagesLoading,
  referenceImagesError,
  onReferenceImagesRefresh,
  onReferenceImageUploaded,
  onReferenceImageDeleted
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('keys');
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
  const [inputValue, setInputValue] = useState('');
  const [testStatus, setTestStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState<string>('');
  const [isSavingPrompts, setIsSavingPrompts] = useState(false);
  const [promptsMessage, setPromptsMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const fetchSavedKeysFromApi = React.useCallback(async (): Promise<SavedKeySummary[]> => {
    if (!user) return [];
    const response = await fetch('/api/keys');
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.error || 'Failed to load saved keys');
    }
    const parsed: SavedKeySummary[] = Array.isArray(payload?.keys)
      ? payload.keys
          .filter((key: any) => key.provider === 'ollama')
          .map((key: any) => ({
            id: key.id,
            provider: 'ollama' as ProviderSlug,
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

  const savedOllamaKeys = useMemo(() => savedKeys, [savedKeys]);
  const ACTIVE_PROVIDER_SLUG: ProviderSlug = 'ollama';

  const resetKeyForm = () => {
    setKeyForm({ id: null, label: '' });
    setInputValue('');
    setKeyActionError(null);
    setTestStatus('idle');
    setTestMessage('');
  };

  const handleTestConnection = async () => {
    setTestStatus('loading');
    setTestMessage('');
    
    // Create temp settings with the key currently in the input
    const tempSettings: AppSettings = {
      ...settings,
      provider: ModelProvider.OLLAMA,
      ollamaKey: inputValue
    };

    try {
      await testConnection(tempSettings);
      setTestStatus('success');
      setTestMessage('Connection verified successfully.');
    } catch (err: any) {
      setTestStatus('error');
      setTestMessage(err.message || 'Connection failed.');
    }
  };

  const handleSavedKeySubmit = async () => {
    if (!user) return;
    const label = keyForm.label.trim();
    const currentSecret = inputValue.trim();
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
          body: JSON.stringify({ provider: ACTIVE_PROVIDER_SLUG, label, key: currentSecret })
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
      if (data?.key?.value) {
        setInputValue(data.key.value);
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

  const handleSavePrompts = async () => {
    setIsSavingPrompts(true);
    setPromptsMessage(null);
    try {
      const response = await fetch('/api/admin/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemPrompt: settings.systemPrompt,
          visionPrompt: settings.visionPrompt
        })
      });
      
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || 'Failed to save prompts');
      }
      
      setPromptsMessage({ type: 'success', text: 'Global prompts updated successfully.' });
      setTimeout(() => setPromptsMessage(null), 3000);
    } catch (err: any) {
      setPromptsMessage({ type: 'error', text: err.message || 'Failed to save prompts.' });
    } finally {
      setIsSavingPrompts(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/40" onClick={onClose} />
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6" onClick={onClose}>
        <div
          className="w-full h-[34rem] max-h-[90vh] sm:w-[min(90vw,36rem)] lg:w-1/2 lg:max-w-[48rem] bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between p-4 border-b border-zinc-800 shrink-0">
            <div className="flex items-center gap-2">
              <Key className="w-4 h-4 text-zinc-400" />
              <h2 className="text-sm font-medium text-white">Admin</h2>
            </div>
            <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          {user.isAdmin && (
            <div className="flex items-center px-4 border-b border-zinc-800 bg-zinc-900/50">
              <button
                onClick={() => setActiveTab('keys')}
                className={`flex items-center gap-2 px-4 py-3 text-xs font-medium border-b-2 transition-colors ${
                  activeTab === 'keys' 
                    ? 'border-white text-white' 
                    : 'border-transparent text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <Key className="w-3.5 h-3.5" />
                API Keys
              </button>
              <button
                onClick={() => setActiveTab('users')}
                className={`flex items-center gap-2 px-4 py-3 text-xs font-medium border-b-2 transition-colors ${
                  activeTab === 'users' 
                    ? 'border-white text-white' 
                    : 'border-transparent text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                Manage Users
              </button>
              <button
                onClick={() => setActiveTab('prompts')}
                className={`flex items-center gap-2 px-4 py-3 text-xs font-medium border-b-2 transition-colors ${
                  activeTab === 'prompts' 
                    ? 'border-white text-white' 
                    : 'border-transparent text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                System Prompts
              </button>
              <button
                onClick={() => setActiveTab('library')}
                className={`flex items-center gap-2 px-4 py-3 text-xs font-medium border-b-2 transition-colors ${
                  activeTab === 'library'
                    ? 'border-white text-white'
                    : 'border-transparent text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <BookMarked className="w-3.5 h-3.5" />
                Reference Library
              </button>
            </div>
          )}

          {activeTab === 'library' && user.isAdmin ? (
            <div className="flex-1 p-3 overflow-hidden">
              <PrimarySourceModal
                variant="panel"
                isOpen={isOpen}
                onClose={() => {}}
                canManage={Boolean(user)}
                isAdmin={Boolean(user?.isAdmin)}
                sources={primarySources}
                selectedIds={selectedSourceIds}
                onToggleSource={onToggleSource}
                onUploaded={onPrimarySourceUploaded}
                onDeleted={onPrimarySourceDeleted}
                onRefresh={onPrimarySourcesRefresh}
                loading={primarySourcesLoading}
                error={primarySourcesError}
                referenceImages={referenceImages}
                referenceImagesLoading={referenceImagesLoading}
                referenceImagesError={referenceImagesError}
                onReferenceRefresh={onReferenceImagesRefresh}
                onReferenceUploaded={onReferenceImageUploaded}
                onReferenceDeleted={onReferenceImageDeleted}
              />
            </div>
          ) : (
            <div className="p-3 space-y-2 overflow-y-auto custom-scrollbar flex-1">
              {activeTab === 'users' && user.isAdmin ? (
                <UserManagementPanel user={user} />
              ) : activeTab === 'prompts' && user.isAdmin ? (
                <div className="space-y-6 p-1">
                  {/* Vision Prompt Section */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-medium text-white">Vision Prompt (Step 1)</h3>
                        <p className="text-[10px] text-zinc-400">
                          Controls how the vision model analyzes the image/video frames. Must output JSON.
                        </p>
                      </div>
                      <button
                        onClick={() => onUpdate({ ...settings, visionPrompt: null })}
                        className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-medium text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded transition-colors"
                        title="Reset to default vision prompt"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Reset Default
                      </button>
                    </div>
                    <textarea
                      value={settings.visionPrompt ?? DEFAULT_VISION_PROMPT}
                      onChange={(e) => onUpdate({ ...settings, visionPrompt: e.target.value })}
                      className="w-full h-64 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-zinc-300 focus:outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600 resize-none"
                      spellCheck={false}
                    />
                  </div>

                  {/* Reasoning Prompt Section */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-medium text-white">Reasoning Prompt (Step 2)</h3>
                        <p className="text-[10px] text-zinc-400">
                          Controls how the reasoning model interprets the vision data and grades the student.
                        </p>
                      </div>
                      <button
                        onClick={() => onUpdate({ ...settings, systemPrompt: null })}
                        className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-medium text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded transition-colors"
                        title="Reset to default reasoning prompt"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Reset Default
                      </button>
                    </div>
                    <textarea
                      value={settings.systemPrompt ?? DEFAULT_SYSTEM_PROMPT}
                      onChange={(e) => onUpdate({ ...settings, systemPrompt: e.target.value })}
                      className="w-full h-64 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-zinc-300 focus:outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600 resize-none"
                      spellCheck={false}
                    />
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
                    <div className="text-[10px]">
                      {promptsMessage && (
                        <span className={promptsMessage.type === 'success' ? 'text-green-400' : 'text-red-400'}>
                          {promptsMessage.text}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={handleSavePrompts}
                      disabled={isSavingPrompts}
                      className="flex items-center gap-2 px-4 py-2 bg-white text-black text-xs font-medium rounded-lg hover:bg-zinc-200 transition-colors disabled:opacity-50"
                    >
                      {isSavingPrompts && <Loader2 className="w-3 h-3 animate-spin" />}
                      Save Global Defaults
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {keyForm.id && (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        className="text-[10px] text-zinc-400 hover:text-white"
                        onClick={resetKeyForm}
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="text-xs text-zinc-300">Label</label>
                    <input
                      type="text"
                      value={keyForm.label}
                      onChange={(e) => handleKeyFormChange(e.target.value)}
                      placeholder="e.g. Production"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600 placeholder-zinc-600"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-zinc-300">API Key Value</label>
                    <input
                      type="password"
                      value={inputValue}
                      onChange={(e) => {
                        setInputValue(e.target.value);
                        if (testStatus !== 'idle') {
                          setTestStatus('idle');
                          setTestMessage('');
                        }
                      }}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600 placeholder-zinc-600"
                      placeholder="Enter API key"
                    />
                  </div>
                  
                  {testStatus !== 'idle' && (
                    <div
                      className={`text-[10px] px-3 py-2 rounded-lg border flex items-center gap-2 ${
                        testStatus === 'success'
                          ? 'bg-green-500/10 border-green-500/20 text-green-200'
                          : testStatus === 'error'
                          ? 'bg-red-500/10 border-red-500/20 text-red-200'
                          : 'bg-zinc-800 border-zinc-700 text-zinc-300'
                      }`}
                    >
                      {testStatus === 'loading' && <Loader2 className="w-3 h-3 animate-spin" />}
                      {testStatus === 'success' && <CheckCircle className="w-3 h-3" />}
                      {testStatus === 'error' && <AlertTriangle className="w-3 h-3 shrink-0" />}
                      <span className="truncate">{testMessage || 'Testing connection...'}</span>
                    </div>
                  )}

                  {keyActionError && (
                    <div className="text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-1.5">
                      {keyActionError}
                    </div>
                  )}

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleTestConnection}
                      disabled={testStatus === 'loading' || !inputValue}
                      className="flex-1 flex items-center justify-center gap-2 bg-[#a1a1aa] text-black text-sm font-medium rounded-lg py-2 hover:bg-zinc-300 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Wifi className="w-4 h-4" />
                      Test Connection
                    </button>
                    
                    <button
                      type="button"
                      disabled={isSavingKey}
                      className="flex-1 flex items-center justify-center gap-2 bg-[#a1a1aa] text-black text-sm font-medium rounded-lg py-2 hover:bg-zinc-300 transition disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={handleSavedKeySubmit}
                    >
                      {isSavingKey && <Loader2 className="w-4 h-4 animate-spin" />}
                      {keyForm.id ? 'Update' : 'Save'}
                    </button>
                  </div>

                  <div className="border-t border-zinc-800 pt-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[10px] text-zinc-500">Stored keys</p>
                      </div>
                      <button
                        type="button"
                        onClick={refreshSavedKeys}
                        disabled={loadingSavedKeys}
                        className="flex items-center gap-1 text-[10px] text-zinc-400 hover:text-white transition disabled:opacity-50"
                      >
                        <RefreshCcw className={`w-3 h-3 ${loadingSavedKeys ? 'animate-spin' : ''}`} />
                        Refresh
                      </button>
                    </div>

                    <div className="space-y-1.5 max-h-36 overflow-y-auto">
                      {loadingSavedKeys && savedOllamaKeys.length === 0 ? (
                        <div className="text-[10px] text-zinc-400">Loading saved keys...</div>
                      ) : savedOllamaKeys.length === 0 ? (
                        <div className="text-[10px] text-zinc-500">No saved keys yet.</div>
                      ) : (
                        savedOllamaKeys.map((key) => (
                          <div
                            key={key.id}
                            className="flex items-center justify-between gap-3 border border-zinc-800 rounded-lg px-3 py-1.5"
                          >
                            <div>
                              <p className="text-xs text-white font-medium">{key.label}</p>
                              <p className="text-[10px] text-zinc-500">•••• {key.lastFour || '????'}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleEditSavedKey(key)}
                                className="text-[10px] text-zinc-400 hover:text-white"
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
                                className="text-[10px] text-red-400 hover:text-red-300"
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
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

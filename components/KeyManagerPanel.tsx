import React, { useEffect, useMemo, useState } from 'react';
import { X, KeyRound, ShieldCheck, Loader2, Plus, Trash2, Edit3 } from 'lucide-react';
import { MODEL_LABELS } from '../constants';
import { ModelProvider } from '../types';

interface ManageKeysPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

interface StoredKeySummary {
  id: number;
  provider: string;
  label: string;
  createdAt: string;
  updatedAt: string;
  lastFour?: string | null;
}

const PROVIDER_OPTS = [
  { slug: 'ollama', label: MODEL_LABELS[ModelProvider.OLLAMA] },
  { slug: 'gemini', label: MODEL_LABELS[ModelProvider.GEMINI] },
  { slug: 'openai', label: MODEL_LABELS[ModelProvider.OPENAI] }
];

const providerLabel = (slug: string) => {
  return PROVIDER_OPTS.find((p) => p.slug === slug)?.label || slug;
};

const defaultFormState = {
  id: null as number | null,
  provider: 'ollama',
  label: '',
  key: ''
};

export const KeyManagerPanel: React.FC<ManageKeysPanelProps> = ({ isOpen, onClose }) => {
  const [keys, setKeys] = useState<StoredKeySummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(defaultFormState);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [fetchingKeyId, setFetchingKeyId] = useState<number | null>(null);

  const isEditing = useMemo(() => form.id !== null, [form.id]);

  const resetForm = () => {
    setForm(defaultFormState);
  };

  const loadKeys = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/keys');
      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(errText || 'Failed to load keys');
      }
      const data = await response.json();
      setKeys(Array.isArray(data?.keys) ? data.keys : []);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Unable to load keys');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    loadKeys();
    resetForm();
  }, [isOpen]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);

    try {
      if (!form.label.trim()) {
        throw new Error('Label is required');
      }
      if (!isEditing && !form.key.trim()) {
        throw new Error('API key is required');
      }

      const payload: Record<string, string> = {
        provider: form.provider,
        label: form.label.trim()
      };
      if (form.key.trim()) {
        payload.key = form.key.trim();
      }

      const endpoint = isEditing ? `/api/keys/${form.id}` : '/api/keys';
      const method = isEditing ? 'PUT' : 'POST';
      const response = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => null);
        throw new Error(errBody?.error || 'Failed to save key');
      }

      await loadKeys();
      resetForm();
    } catch (err: any) {
      setError(err.message || 'Unable to save key');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = async (id: number) => {
    setFetchingKeyId(id);
    setError(null);
    try {
      const response = await fetch(`/api/keys/${id}`);
      if (!response.ok) {
        const errBody = await response.json().catch(() => null);
        throw new Error(errBody?.error || 'Failed to load key');
      }
      const data = await response.json();
      const key = data?.key;
      if (!key) throw new Error('Key not found');
      setForm({
        id: key.id,
        provider: key.provider,
        label: key.label,
        key: key.value || ''
      });
    } catch (err: any) {
      setError(err.message || 'Unable to load key for editing');
    } finally {
      setFetchingKeyId(null);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Remove this key? This cannot be undone.')) return;
    setError(null);
    try {
      const response = await fetch(`/api/keys/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        const errBody = await response.json().catch(() => null);
        throw new Error(errBody?.error || 'Failed to delete key');
      }
      await loadKeys();
      if (form.id === id) {
        resetForm();
      }
    } catch (err: any) {
      setError(err.message || 'Unable to delete key');
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 w-full max-w-md z-50 bg-zinc-950 border-l border-zinc-900 shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-900/60">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <div>
              <h2 className="text-white text-sm font-semibold">Manage Keys</h2>
              <p className="text-xs text-zinc-500">Stored per account with encryption</p>
            </div>
          </div>
          <button
            onClick={() => {
              resetForm();
              onClose();
            }}
            className="p-2 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-900"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <section className="p-4 border-b border-zinc-900/60">
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <KeyRound className="w-4 h-4" />
                {isEditing ? 'Update existing key' : 'Add a new API key'}
              </div>
              <div>
                <label className="text-xs text-zinc-400 block mb-1">Provider</label>
                <select
                  value={form.provider}
                  onChange={(e) => setForm((prev) => ({ ...prev, provider: e.target.value }))}
                  disabled={isEditing}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:border-zinc-600"
                >
                  {PROVIDER_OPTS.map((opt) => (
                    <option key={opt.slug} value={opt.slug}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-zinc-400 block mb-1">Label</label>
                <input
                  type="text"
                  value={form.label}
                  onChange={(e) => setForm((prev) => ({ ...prev, label: e.target.value }))}
                  placeholder="e.g. Production"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:border-zinc-600"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-400 block mb-1">API Key</label>
                <input
                  type="password"
                  value={form.key}
                  onChange={(e) => setForm((prev) => ({ ...prev, key: e.target.value }))}
                  placeholder={isEditing ? 'Leave blank to keep existing secret' : 'sk-...'}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:border-zinc-600"
                />
              </div>
              <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                <ShieldCheck className="w-3 h-3" />
                Keys are encrypted using your workspace secret.
              </div>
              <button
                type="submit"
                disabled={isSaving}
                className="w-full inline-flex items-center justify-center gap-2 bg-white text-black text-sm font-semibold rounded-lg py-2 hover:bg-zinc-200 transition disabled:opacity-50"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {isEditing ? 'Save Changes' : 'Add Key'}
              </button>
              {isEditing && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="w-full text-xs text-zinc-500 hover:text-zinc-300"
                >
                  Cancel edit
                </button>
              )}
            </form>
          </section>

          <section className="p-4 space-y-3">
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <span>Stored Keys</span>
              <span>{keys.length}</span>
            </div>

            {loading && (
              <div className="flex items-center justify-center py-10 text-zinc-500">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            )}

            {!loading && keys.length === 0 && (
              <div className="text-center text-sm text-zinc-500 py-8 border border-dashed border-zinc-800 rounded-xl">
                No keys saved yet. Add one above.
              </div>
            )}

            {!loading && keys.map((key) => (
              <div key={key.id} className="border border-zinc-900 rounded-xl p-3 bg-zinc-900/50">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">{key.label}</p>
                    <p className="text-xs text-zinc-500">{providerLabel(key.provider)}</p>
                  </div>
                  <div className="text-xs text-zinc-400 font-mono">
                    {key.lastFour ? `•••• ${key.lastFour}` : '••••'}
                  </div>
                </div>
                <div className="flex items-center justify-between mt-3 text-[11px] text-zinc-500">
                  <span>Updated {new Date(key.updatedAt).toLocaleString()}</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleEdit(key.id)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-zinc-300 hover:bg-zinc-800 text-[11px]"
                    >
                      {fetchingKeyId === key.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Edit3 className="w-3 h-3" />}
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(key.id)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-red-400 hover:bg-red-900/20 text-[11px]"
                    >
                      <Trash2 className="w-3 h-3" />
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </section>
        </div>

        {error && (
          <div className="px-4 py-3 text-xs text-red-300 bg-red-500/10 border-t border-red-500/20">
            {error}
          </div>
        )}
      </div>
    </>
  );
};

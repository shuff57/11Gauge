import React from 'react';
import { BookMarked, Check, FileUp, Loader2, RefreshCw, Trash2, UploadCloud, X } from 'lucide-react';
import type { PrimarySourceSummary } from '../types';
import { deletePrimarySource, processAndUploadPrimarySource, type SourceUploadPhase } from '../services/sources';

interface PrimarySourceModalProps {
  isOpen: boolean;
  onClose: () => void;
  canManage: boolean;
  isAdmin: boolean;
  sources: PrimarySourceSummary[];
  selectedIds: string[];
  onToggleSource: (id: string) => void;
  onUploaded: (source: PrimarySourceSummary) => void;
  onDeleted: (id: string) => void;
  onRefresh: () => Promise<void>;
  loading?: boolean;
  error?: string | null;
}

export const PrimarySourceModal: React.FC<PrimarySourceModalProps> = ({
  isOpen,
  onClose,
  canManage,
  isAdmin,
  sources,
  selectedIds,
  onToggleSource,
  onUploaded,
  onDeleted,
  onRefresh,
  loading = false,
  error = null,
}) => {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [uploadPhase, setUploadPhase] = React.useState<SourceUploadPhase>('idle');
  const [uploadMessage, setUploadMessage] = React.useState('');
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  const triggerUpload = () => {
    if (!isAdmin) return;
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !isAdmin) return;

    setUploadError(null);
    try {
      const source = await processAndUploadPrimarySource(file, {
        onPhaseChange: (phase, message) => {
          setUploadPhase(phase);
          setUploadMessage(message || '');
        }
      });
      setUploadPhase('idle');
      setUploadMessage('');
      onUploaded(source);
      onToggleSource(source.id);
    } catch (err: any) {
      setUploadPhase('idle');
      setUploadMessage('');
      setUploadError(err?.message || 'Upload failed.');
    } finally {
      if (event.target) {
        event.target.value = '';
      }
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } catch (err) {
      console.warn('Primary source refresh failed', err);
    } finally {
      setRefreshing(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!isAdmin) return;
    const confirmed = window.confirm('Delete this primary source? This cannot be undone.');
    if (!confirmed) return;
    setDeleteError(null);
    setDeletingId(id);
    try {
      await deletePrimarySource(id);
      onDeleted(id);
    } catch (err: any) {
      setDeleteError(err?.message || 'Unable to delete source.');
    } finally {
      setDeletingId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div
          className="w-full max-w-4xl bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]"
          onClick={(e) => e.stopPropagation()}
        >
          <header className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
            <div className="flex items-center gap-2">
              <BookMarked className="w-4 h-4 text-zinc-400" />
              <h2 className="text-sm font-semibold text-white">Primary Sources</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleRefresh}
                disabled={refreshing || loading}
                className="p-2 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-900 disabled:opacity-40"
                title="Refresh list"
              >
                {refreshing || loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              </button>
              <button
                onClick={onClose}
                className="p-2 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-900"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-zinc-900">
            <section className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-widest text-zinc-500">Active Selection</p>
                  <p className="text-lg font-semibold text-white">
                    {selectedIds.length} source{selectedIds.length === 1 ? '' : 's'} attached
                  </p>
                </div>
                {isAdmin && (
                  <button
                    onClick={triggerUpload}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-black text-sm font-medium shadow hover:bg-zinc-100"
                    type="button"
                  >
                    <UploadCloud className="w-4 h-4" />
                    Upload PDF
                  </button>
                )}
              </div>

              {!canManage && (
                <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/50 text-sm text-zinc-300">
                  Sign in to upload and reuse primary sources. Cached excerpts are only visible to you.
                </div>
              )}

              {canManage && !isAdmin && (
                <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 text-sm text-amber-100">
                  Only workspace admins can upload or delete primary sources. Contact your workspace owner for access.
                </div>
              )}

              {uploadError && (
                <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2">
                  {uploadError}
                </div>
              )}

              {deleteError && (
                <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2">
                  {deleteError}
                </div>
              )}

              {uploadPhase !== 'idle' && (
                <div className="flex items-center gap-3 px-4 py-2 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-100 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{uploadMessage || (uploadPhase === 'extracting' ? 'Parsing PDF...' : 'Uploading...')}</span>
                </div>
              )}
            </section>

            <section className="p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs uppercase tracking-widest text-zinc-500">Saved Sources</p>
                <span className="text-xs text-zinc-500">{sources.length} total</span>
              </div>

              {error && (
                <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2 mb-4">
                  {error}
                </div>
              )}

              {loading ? (
                <div className="flex items-center justify-center py-12 text-zinc-400">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading sources...
                </div>
              ) : sources.length === 0 ? (
                <div className="py-12 text-center text-sm text-zinc-500">
                  <FileUp className="w-6 h-6 mx-auto mb-3 text-zinc-600" />
                  No primary sources yet. Upload a PDF to seed your analyses.
                </div>
              ) : (
                <ul className="space-y-3">
                  {sources.map((source) => {
                    const active = selectedIds.includes(source.id);
                    const disabled = !canManage;
                    return (
                      <li key={source.id}>
                        <div
                          className={`relative rounded-2xl border px-4 py-3 transition-colors ${
                            active
                              ? 'border-emerald-400/60 bg-emerald-400/10 text-white'
                              : 'border-zinc-800 bg-zinc-950 hover:border-zinc-800'
                          } ${disabled ? 'opacity-60' : ''}`}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              if (disabled) return;
                              onToggleSource(source.id);
                            }}
                            className="w-full flex items-center justify-between gap-4 text-left"
                            disabled={disabled}
                          >
                            <div className="pr-6">
                              <p className="text-sm font-semibold">{source.title}</p>
                              <p className="text-xs text-zinc-400 mt-1 line-clamp-2">
                                {source.summary || 'No summary extracted.'}
                              </p>
                              <p className="text-[10px] text-zinc-500 mt-2 uppercase tracking-widest">
                                {source.pageCount} page{source.pageCount === 1 ? '' : 's'} • {source.chunkCount} chunk{source.chunkCount === 1 ? '' : 's'}
                              </p>
                            </div>
                            <div
                              className={`w-6 h-6 rounded-full border flex items-center justify-center ${
                                active ? 'bg-emerald-400 border-transparent text-black' : 'border-zinc-600 text-transparent'
                              }`}
                            >
                              <Check className="w-4 h-4" />
                            </div>
                          </button>
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleDelete(source.id);
                              }}
                              className="absolute top-3 right-3 inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-red-300 hover:bg-red-900/20"
                              disabled={deletingId === source.id}
                            >
                              {deletingId === source.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Trash2 className="w-3 h-3" />
                              )}
                              Remove
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>

          <footer className="px-5 py-4 border-t border-zinc-900 text-xs text-zinc-500 flex items-center justify-between">
            <span>Only the chunks you select are merged into future prompts.</span>
            <span className="font-mono text-[11px] text-zinc-400">Cached · client-processed</span>
          </footer>
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept="application/pdf"
        onChange={handleFileChange}
        disabled={!isAdmin}
      />
    </>
  );
};

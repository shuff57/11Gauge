import React from 'react';
import {
  BookMarked,
  Check,
  FileUp,
  ImagePlus,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Trash2,
  UploadCloud,
  X
} from 'lucide-react';
import type { ExampleImageLabel, ExampleImageSummary, PrimarySourceSummary } from '../types';
import { deletePrimarySource, processAndUploadPrimarySource, type SourceUploadPhase } from '../services/sources';
import { deleteExampleImage, getCachedExampleImageUrl, uploadExampleImage } from '../services/exampleImages';
import { analyzeMedia } from '../services/llm';
import { DEFAULT_SETTINGS } from '../constants';
import {
  MATERIAL_TYPES,
  WELD_PROCESSES,
  MATERIAL_THICKNESSES,
  JOINT_TYPES,
  WELD_POSITIONS
} from '../constants';

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
  referenceImages: ExampleImageSummary[];
  referenceImagesLoading?: boolean;
  referenceImagesError?: string | null;
  onReferenceRefresh: () => Promise<void>;
  onReferenceUploaded: (image: ExampleImageSummary) => void;
  onReferenceDeleted: (id: string) => void;
  variant?: 'modal' | 'panel';
}

const LABEL_OPTIONS: Array<{ value: ExampleImageLabel; label: string; tone: string }> = [
  { value: 'good', label: 'Ideal', tone: 'text-emerald-300 bg-emerald-900/30 border-emerald-500/40' },
  { value: 'bad', label: 'Needs Work', tone: 'text-amber-200 bg-amber-900/30 border-amber-500/40' }
];

const formatBytes = (value: number) => `${(value / 1024).toFixed(1)} KB`;

const ReferenceImageCard: React.FC<{
  image: ExampleImageSummary;
  isAdmin: boolean;
  onDelete: (id: string) => void;
  onPreview: (image: ExampleImageSummary) => void;
  deleting: boolean;
}> = ({ image, isAdmin, onDelete, onPreview, deleting }) => {
  const [resolvedSrc, setResolvedSrc] = React.useState(image.imageUrl);
  const isIdeal = image.label === 'good';
  const badgeTone = isIdeal
    ? 'border-emerald-500/40 text-emerald-200 bg-emerald-900/40'
    : 'border-amber-500/40 text-amber-200 bg-amber-900/40';
  const accentBorderColor = isIdeal ? 'border-emerald-500/40' : 'border-amber-400/70';

  React.useEffect(() => {
    let active = true;
    getCachedExampleImageUrl(image.id, image.imageUrl)
      .then((url) => {
        if (active) setResolvedSrc(url);
      })
      .catch(() => {
        if (active) setResolvedSrc(image.imageUrl);
      });
    return () => {
      active = false;
    };
  }, [image.id, image.imageUrl]);

  const handlePreview = () => onPreview(image);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handlePreview();
    }
  };

  return (
    <article
      className={`relative group rounded-2xl bg-zinc-950 cursor-pointer focus:outline-none focus:ring-2 focus:ring-zinc-600 flex flex-col border-2 ${accentBorderColor}`}
      role="button"
      tabIndex={0}
      onClick={handlePreview}
      onKeyDown={handleKeyDown}
    >
      <div className={`p-3 pb-0 bg-black/60 border-b w-full ${accentBorderColor} rounded-t-[0.9rem]`}>
        <p className="text-sm font-semibold text-white line-clamp-2 pr-2 drop-shadow">{image.title}</p>
      </div>
      <div className="relative aspect-video bg-zinc-900">
        {image.mimeType.startsWith('video/') ? (
          <video
            src={resolvedSrc}
            className="w-full h-full object-cover pointer-events-none"
            playsInline
            muted
            loop
            preload="metadata"
          />
        ) : (
          <img src={resolvedSrc} alt={image.title} className="w-full h-full object-cover pointer-events-none" loading="lazy" />
        )}
      </div>
      <div className={`px-3 py-2 bg-black/70 border-t flex items-center justify-between text-[11px] text-white ${accentBorderColor} rounded-b-[0.9rem]`}>
        <span>View details</span>
        <button
          type="button"
          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-red-300 hover:bg-red-900/20 border border-red-500/30"
          onClick={(event) => {
            event.stopPropagation();
            onDelete(image.id);
          }}
          disabled={deleting}
        >
          {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
          Remove
        </button>
      </div>
    </article>
  );
};

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
  referenceImages,
  referenceImagesLoading = false,
  referenceImagesError = null,
  onReferenceRefresh,
  onReferenceUploaded,
  onReferenceDeleted,
  variant = 'modal'
}) => {
  const isPanel = variant === 'panel';
  const pdfInputRef = React.useRef<HTMLInputElement | null>(null);
  const imageInputRef = React.useRef<HTMLInputElement | null>(null);

  const [uploadPhase, setUploadPhase] = React.useState<SourceUploadPhase>('idle');
  const [uploadMessage, setUploadMessage] = React.useState('');
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  const [imageFilter, setImageFilter] = React.useState<'all' | ExampleImageLabel>('all');
  const [imageLabel, setImageLabel] = React.useState<ExampleImageLabel>('good');
  const [imageTitle, setImageTitle] = React.useState('');
  const [imageDescription, setImageDescription] = React.useState('');
  const [imageMaterialType, setImageMaterialType] = React.useState('');
  const [imageWeldProcess, setImageWeldProcess] = React.useState('');
  const [imageMaterialThickness, setImageMaterialThickness] = React.useState('');
  const [imageJointType, setImageJointType] = React.useState('');
  const [imageWeldPosition, setImageWeldPosition] = React.useState('');
  const [imageUploading, setImageUploading] = React.useState(false);
  const [imageUploadError, setImageUploadError] = React.useState<string | null>(null);
  const [imageDeleteError, setImageDeleteError] = React.useState<string | null>(null);
  const [imageDeletingId, setImageDeletingId] = React.useState<string | null>(null);
  const [imageRefreshing, setImageRefreshing] = React.useState(false);
  const [selectedMediaFile, setSelectedMediaFile] = React.useState<File | null>(null);
  const [previewingImage, setPreviewingImage] = React.useState<ExampleImageSummary | null>(null);
  const [previewSrc, setPreviewSrc] = React.useState<string | null>(null);

  const filteredImages = React.useMemo(() => {
    if (imageFilter === 'all') return referenceImages;
    return referenceImages.filter((img) => img.label === imageFilter);
  }, [referenceImages, imageFilter]);

  React.useEffect(() => {
    if (!previewingImage) {
      setPreviewSrc(null);
      return;
    }

    let active = true;
    getCachedExampleImageUrl(previewingImage.id, previewingImage.imageUrl)
      .then((url) => {
        if (active) setPreviewSrc(url);
      })
      .catch(() => {
        if (active) setPreviewSrc(previewingImage.imageUrl);
      });

    return () => {
      active = false;
    };
  }, [previewingImage]);

  const triggerPdfUpload = () => {
    if (!isAdmin) return;
    pdfInputRef.current?.click();
  };

  const triggerImageUpload = () => {
    if (!isAdmin) return;
    imageInputRef.current?.click();
  };

  const handlePdfChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
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
      if (event.target) event.target.value = '';
    }
  };

  const handlePrimaryRefresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } catch (err) {
      console.warn('Primary source refresh failed', err);
    } finally {
      setRefreshing(false);
    }
  };

  const handlePrimaryDelete = async (id: string) => {
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

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !isAdmin) return;

    setSelectedMediaFile(file);
    setImageTitle(file.name.replace(/\.[^.]+$/, ''));
    setImageDescription('');
    setImageLabel('good');
    setImageMaterialType('');
    setImageWeldProcess('');
    setImageMaterialThickness('');
    setImageJointType('');
    setImageWeldPosition('');
    setImageUploadError(null);

    if (event.target) event.target.value = '';
  };

  const handleConfirmUpload = async () => {
    if (!selectedMediaFile || !isAdmin) return;

    setImageUploadError(null);
    setImageUploading(true);
    try {
      let aiDescription = '';
      try {
        const savedSettings = localStorage.getItem('vision-settings');
        const settings = savedSettings ? JSON.parse(savedSettings) : DEFAULT_SETTINGS;
        const descriptionSettings = {
          ...settings,
          systemPrompt:
            'Describe this welding example in detail. Focus on visual characteristics, quality indicators, and technical specifications. Do not provide advice, just description.'
        };

        aiDescription = await analyzeMedia(selectedMediaFile, descriptionSettings);
      } catch (analysisErr) {
        console.warn('Failed to generate AI description for reference image:', analysisErr);
      }

      const image = await uploadExampleImage(selectedMediaFile, {
        label: imageLabel,
        title: imageTitle.trim() || undefined,
        description: imageDescription.trim() || undefined,
        materialType: imageMaterialType || undefined,
        weldProcess: imageWeldProcess || undefined,
        materialThickness: imageMaterialThickness || undefined,
        jointType: imageJointType || undefined,
        weldPosition: imageWeldPosition || undefined,
        aiDescription: aiDescription || undefined
      });
      onReferenceUploaded(image);
      setSelectedMediaFile(null);
      await onReferenceRefresh();
    } catch (err: any) {
      setImageUploadError(err?.message || 'Failed to upload example image.');
    } finally {
      setImageUploading(false);
    }
  };

  const handleCancelUpload = () => {
    setSelectedMediaFile(null);
    setImageUploadError(null);
  };

  const handleImageRefresh = async () => {
    setImageRefreshing(true);
    try {
      await onReferenceRefresh();
    } catch (err) {
      console.warn('Reference image refresh failed', err);
    } finally {
      setImageRefreshing(false);
    }
  };

  const handleImageDelete = async (id: string) => {
    if (!isAdmin) return;
    const confirmed = window.confirm('Delete this example image?');
    if (!confirmed) return;
    setImageDeleteError(null);
    setImageDeletingId(id);
    try {
      await deleteExampleImage(id);
      onReferenceDeleted(id);
    } catch (err: any) {
      setImageDeleteError(err?.message || 'Failed to delete example image.');
    } finally {
      setImageDeletingId(null);
    }
  };

  const handleOpenPreview = React.useCallback((image: ExampleImageSummary) => {
    setPreviewingImage(image);
  }, []);

  const handleClosePreview = () => {
    setPreviewingImage(null);
  };

  const handleContainerClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!isPanel) {
      event.stopPropagation();
    }
  };

  if (!isOpen && !isPanel) return null;

  const content = (
    <div
      className={
        isPanel
          ? 'h-full flex flex-col bg-zinc-950 border border-zinc-900 rounded-2xl overflow-hidden'
          : 'w-full max-w-5xl bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden'
      }
      onClick={handleContainerClick}
    >
      <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-900">
        <div className="flex items-center gap-2 text-white">
          <BookMarked className="w-5 h-5 text-zinc-400" />
          <div>
            <p className="text-sm font-semibold">Knowledge Library</p>
            <p className="text-xs text-zinc-500">Manage cached PDFs and curated reference images.</p>
          </div>
        </div>
        {!isPanel && (
          <button onClick={onClose} className="p-2 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-900">
            <X className="w-4 h-4" />
          </button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-zinc-900">
        {isAdmin && (
          <>
            <section className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-widest text-zinc-500">Primary Sources</p>
                  <p className="text-lg font-semibold text-white">
                    {selectedIds.length} source{selectedIds.length === 1 ? '' : 's'} attached
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handlePrimaryRefresh}
                    disabled={refreshing || loading}
                    className="px-4 py-2 rounded-xl border border-zinc-800 text-sm text-zinc-300 hover:border-zinc-600 disabled:opacity-40"
                    type="button"
                  >
                    {refreshing || loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={triggerPdfUpload}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-black text-sm font-medium shadow hover:bg-zinc-100"
                    type="button"
                  >
                    <UploadCloud className="w-4 h-4" />
                    Upload PDF
                  </button>
                </div>
              </div>

              {uploadError && <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2">{uploadError}</div>}
              {deleteError && <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2">{deleteError}</div>}
              {uploadPhase !== 'idle' && (
                <div className="flex items-center gap-3 px-4 py-2 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-100 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{uploadMessage || (uploadPhase === 'extracting' ? 'Parsing PDF...' : 'Uploading...')}</span>
                </div>
              )}
            </section>

            <section className="p-6 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-widest text-zinc-500">Saved Sources</p>
                <span className="text-xs text-zinc-500">{sources.length} total</span>
              </div>

              {error && <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2">{error}</div>}
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
                    return (
                      <li key={source.id}>
                        <div
                          className={`relative rounded-2xl border px-4 py-3 transition-colors ${
                            active ? 'border-emerald-400/60 bg-emerald-400/10 text-white' : 'border-zinc-800 bg-zinc-950 hover:border-zinc-800'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => onToggleSource(source.id)}
                            className="w-full flex items-center justify-between gap-4 text-left"
                          >
                            <div className="pr-6">
                              <p className="text-sm font-semibold">{source.title}</p>
                              <p className="text-xs text-zinc-400 mt-1 line-clamp-2">{source.summary || 'No summary extracted.'}</p>
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
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              handlePrimaryDelete(source.id);
                            }}
                            className="absolute top-3 right-3 inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-red-300 hover:bg-red-900/20"
                            disabled={deletingId === source.id}
                          >
                            {deletingId === source.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                            Remove
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </>
        )}

        <section className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-widest text-zinc-500">Reference Images</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleImageRefresh}
                disabled={imageRefreshing || referenceImagesLoading}
                className="px-4 py-2 rounded-xl border border-zinc-800 text-sm text-zinc-300 hover:border-zinc-600 disabled:opacity-40"
                type="button"
              >
                {imageRefreshing || referenceImagesLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              </button>
              {isAdmin && !selectedMediaFile && (
                <button
                  onClick={triggerImageUpload}
                  type="button"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-black text-sm font-medium shadow hover:bg-zinc-100 disabled:opacity-50"
                  disabled={imageUploading}
                >
                  {imageUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
                  Upload Media
                </button>
              )}
            </div>
          </div>

          {!canManage && (
            <div className="py-12 text-center text-sm text-zinc-500">
              <ShieldAlert className="w-6 h-6 mx-auto mb-3 text-zinc-600" />
              Sign in to view curated reference images.
            </div>
          )}

          {canManage && (
            <>
              {isAdmin && selectedMediaFile && (
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-4">
                  <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                    <h3 className="text-sm font-semibold text-white">New Reference Media</h3>
                    <button onClick={handleCancelUpload} className="text-xs text-zinc-400 hover:text-white">
                      Cancel
                    </button>
                  </div>

                  <div className="flex items-center gap-4 p-3 bg-zinc-950 rounded-xl border border-zinc-800">
                    <div className="w-16 h-16 bg-zinc-900 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center">
                      {selectedMediaFile.type.startsWith('video/') ? (
                        <video src={URL.createObjectURL(selectedMediaFile)} className="w-full h-full object-cover" />
                      ) : (
                        <img src={URL.createObjectURL(selectedMediaFile)} alt="Preview" className="w-full h-full object-cover" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-white truncate">{selectedMediaFile.name}</p>
                      <p className="text-xs text-zinc-500">
                        {formatBytes(selectedMediaFile.size)} · {selectedMediaFile.type}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-3 grid-cols-1 md:grid-cols-3">
                    <div className="space-y-2">
                      <p className="text-[11px] uppercase tracking-widest text-zinc-500">Label</p>
                      <div className="flex gap-2">
                        {LABEL_OPTIONS.map((item) => (
                          <button
                            key={item.value}
                            type="button"
                            onClick={() => setImageLabel(item.value)}
                            className={`flex-1 px-3 py-2 rounded-xl border text-sm font-medium transition-colors ${
                              imageLabel === item.value
                                ? `${item.tone} shadow-inner`
                                : 'border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'
                            }`}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="text-[11px] uppercase tracking-widest text-zinc-500">Title</p>
                      <input
                        value={imageTitle}
                        onChange={(event) => setImageTitle(event.target.value)}
                        placeholder="Cap pass – textbook"
                        className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-600"
                        type="text"
                      />
                    </div>
                    <div className="space-y-2">
                      <p className="text-[11px] uppercase tracking-widest text-zinc-500">Notes</p>
                      <input
                        value={imageDescription}
                        onChange={(event) => setImageDescription(event.target.value)}
                        placeholder="Uniform weave, zero undercut"
                        className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-600"
                        type="text"
                      />
                    </div>

                    <div className="space-y-2">
                      <p className="text-[11px] uppercase tracking-widest text-zinc-500">Material</p>
                      <select
                        value={imageMaterialType}
                        onChange={(e) => setImageMaterialType(e.target.value)}
                        className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-zinc-600"
                      >
                        <option value="">Any Material</option>
                        {MATERIAL_TYPES.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <p className="text-[11px] uppercase tracking-widest text-zinc-500">Process</p>
                      <select
                        value={imageWeldProcess}
                        onChange={(e) => setImageWeldProcess(e.target.value)}
                        className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-zinc-600"
                      >
                        <option value="">Any Process</option>
                        {WELD_PROCESSES.map((m) => (
                          <option key={m.code} value={m.code}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <p className="text-[11px] uppercase tracking-widest text-zinc-500">Thickness</p>
                      <select
                        value={imageMaterialThickness}
                        onChange={(e) => setImageMaterialThickness(e.target.value)}
                        className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-zinc-600"
                      >
                        <option value="">Any Thickness</option>
                        {MATERIAL_THICKNESSES.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <p className="text-[11px] uppercase tracking-widest text-zinc-500">Joint Type</p>
                      <select
                        value={imageJointType}
                        onChange={(e) => setImageJointType(e.target.value)}
                        className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-zinc-600"
                      >
                        <option value="">Any Joint</option>
                        {JOINT_TYPES.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <p className="text-[11px] uppercase tracking-widest text-zinc-500">Position</p>
                      <select
                        value={imageWeldPosition}
                        onChange={(e) => setImageWeldPosition(e.target.value)}
                        className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-zinc-600"
                      >
                        <option value="">Any Position</option>
                        {WELD_POSITIONS.map((group) => (
                          <optgroup key={group.label} label={group.label}>
                            {group.options.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      onClick={handleConfirmUpload}
                      disabled={imageUploading}
                      className="px-6 py-2 rounded-xl bg-white text-black text-sm font-medium shadow hover:bg-zinc-100 disabled:opacity-50 flex items-center gap-2"
                    >
                      {imageUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
                      {imageUploading ? 'Analyzing & Uploading...' : 'Confirm Upload'}
                    </button>
                  </div>

                  {imageUploadError && <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2">{imageUploadError}</div>}
                </div>
              )}

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setImageFilter('all')}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                    imageFilter === 'all'
                      ? 'border-white text-white bg-white/5'
                      : 'border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-white'
                  }`}
                >
                  All ({referenceImages.length})
                </button>
                {LABEL_OPTIONS.map((item) => {
                  const isActive = imageFilter === item.value;
                  const activeClasses =
                    item.value === 'good'
                      ? 'border-emerald-400 text-emerald-100 bg-emerald-500/10 shadow-[0_0_10px_rgba(16,185,129,0.25)]'
                      : 'border-amber-400 text-amber-100 bg-amber-500/10 shadow-[0_0_10px_rgba(251,191,36,0.35)]';
                  const inactiveClasses =
                    item.value === 'good'
                      ? 'border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/5'
                      : 'border-amber-400/70 text-amber-200 hover:bg-amber-500/5';

                  return (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setImageFilter(item.value)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${isActive ? activeClasses : inactiveClasses}`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>

              {imageDeleteError && <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2">{imageDeleteError}</div>}
              {referenceImagesError && <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2">{referenceImagesError}</div>}

              {referenceImagesLoading ? (
                <div className="flex items-center justify-center py-12 text-zinc-400">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading examples...
                </div>
              ) : filteredImages.length === 0 ? (
                <div className="py-12 text-center text-sm text-zinc-500">
                  <ImagePlus className="w-6 h-6 mx-auto mb-3 text-zinc-600" />
                  No examples yet. Add your first reference image.
                </div>
              ) : (
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredImages.map((image) => (
                    <ReferenceImageCard
                      key={image.id}
                      image={image}
                      isAdmin={isAdmin}
                      onDelete={handleImageDelete}
                      onPreview={handleOpenPreview}
                      deleting={imageDeletingId === image.id}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      </div>

      <footer className="px-6 py-4 border-t border-zinc-900 text-xs text-zinc-500 flex items-center justify-between flex-wrap gap-2">
        {isAdmin ? (
          <span>Only the PDFs you select are merged into prompts. Images act as coaching references.</span>
        ) : (
          <span>Reference images help define what “good” and “bad” welds look like.</span>
        )}
        <span className="font-mono text-[11px] text-zinc-400">Cached · client-processed</span>
      </footer>
    </div>
  );

  const previewModal =
    previewingImage && (
      <div className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center p-4" onClick={handleClosePreview}>
        <div
          className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
            <div>
              <p className="text-sm font-semibold text-white">{previewingImage.title || 'Reference Media'}</p>
              <p className="text-xs text-zinc-500">
                {previewingImage.label === 'good' ? 'Ideal reference example' : 'Needs work reference example'}
              </p>
            </div>
            <button onClick={handleClosePreview} className="p-2 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-5 space-y-6">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <div className="rounded-2xl border border-zinc-800 bg-black/30 p-2 flex items-center justify-center">
                {previewingImage.mimeType.startsWith('video/') ? (
                  <video
                    src={previewSrc || previewingImage.imageUrl}
                    controls
                    playsInline
                    className="w-full max-h-[480px] rounded-xl"
                  />
                ) : (
                  <img
                    src={previewSrc || previewingImage.imageUrl}
                    alt={previewingImage.title}
                    className="w-full max-h-[480px] object-contain rounded-xl"
                  />
                )}
              </div>
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 space-y-3">
                <p className="text-xs uppercase tracking-widest text-zinc-500">Material Settings</p>
                <dl className="text-xs text-zinc-400 space-y-2">
                  <div className="flex justify-between gap-6">
                    <dt>Material</dt>
                    <dd className="text-white">{previewingImage.materialType || 'Not specified'}</dd>
                  </div>
                  <div className="flex justify-between gap-6">
                    <dt>Process</dt>
                    <dd className="text-white">{previewingImage.weldProcess || 'Not specified'}</dd>
                  </div>
                  <div className="flex justify-between gap-6">
                    <dt>Thickness</dt>
                    <dd className="text-white">{previewingImage.materialThickness || 'Not specified'}</dd>
                  </div>
                  <div className="flex justify-between gap-6">
                    <dt>Joint</dt>
                    <dd className="text-white">{previewingImage.jointType || 'Not specified'}</dd>
                  </div>
                  <div className="flex justify-between gap-6">
                    <dt>Position</dt>
                    <dd className="text-white">{previewingImage.weldPosition || 'Not specified'}</dd>
                  </div>
                  <div className="flex justify-between gap-6">
                    <dt>File</dt>
                    <dd className="text-white">{formatBytes(previewingImage.sizeBytes)} · {previewingImage.mimeType.toUpperCase()}</dd>
                  </div>
                  <div className="flex justify-between gap-6">
                    <dt>Uploaded</dt>
                    <dd className="text-white">{new Date(previewingImage.createdAt).toLocaleString()}</dd>
                  </div>
                </dl>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">Grading & Analysis</p>
                  <p className="text-xs text-zinc-500">Model-observed rubric output.</p>
                </div>
              </div>

              {previewingImage.structuredAnalysis ? (
                <div className="space-y-4">
                  {(previewingImage.structuredAnalysis.overall_grade || previewingImage.structuredAnalysis.feedback) && (
                    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
                      {previewingImage.structuredAnalysis.overall_grade && (
                        <p className="text-xs uppercase tracking-widest text-emerald-300">
                          Grade · {previewingImage.structuredAnalysis.overall_grade}
                        </p>
                      )}
                      {previewingImage.structuredAnalysis.feedback && (
                        <p className="text-sm text-emerald-50 mt-1">{previewingImage.structuredAnalysis.feedback}</p>
                      )}
                    </div>
                  )}

                  {previewingImage.structuredAnalysis.student_observations?.length ? (
                    <div className="space-y-2">
                      <p className="text-xs uppercase tracking-widest text-zinc-500">Observations</p>
                      {previewingImage.structuredAnalysis.student_observations.map((obs, index) => (
                        <div key={`${obs.criterion}-${index}`} className="rounded-xl border border-zinc-800 p-3 bg-zinc-900/40">
                          <p className="text-sm font-semibold text-white">{obs.criterion}</p>
                          <p className="text-xs text-zinc-400 mt-1">{obs.observed_condition}</p>
                          <p className="text-[11px] text-zinc-500 mt-1">
                            Match: <span className="text-white">{obs.matches_reference}</span>
                            {obs.score && <span className="ml-2">Score: {obs.score}</span>}
                          </p>
                          {obs.variance_estimate && (
                            <p className="text-[11px] text-zinc-500">Variance: {obs.variance_estimate}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-500">No detailed observations captured.</p>
                  )}

                  {previewingImage.structuredAnalysis.detected_defects?.length ? (
                    <div className="space-y-2">
                      <p className="text-xs uppercase tracking-widest text-zinc-500">Detected Defects</p>
                      <div className="grid gap-2 md:grid-cols-2">
                        {previewingImage.structuredAnalysis.detected_defects.map((defect, index) => (
                          <div key={`${defect.type}-${index}`} className="rounded-xl border border-red-500/30 bg-red-500/5 p-3">
                            <p className="text-sm font-semibold text-red-200">{defect.type}</p>
                            <p className="text-xs text-red-200/80">Severity: {defect.severity}</p>
                            <p className="text-xs text-red-200/70">Location: {defect.location}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                </div>
              ) : (
                <p className="text-xs text-zinc-500">No structured grading data recorded for this media yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    );

  const fileInputs = (
    <>
      <input ref={pdfInputRef} type="file" className="hidden" accept="application/pdf" onChange={handlePdfChange} disabled={!isAdmin} />
      <input ref={imageInputRef} type="file" className="hidden" accept="image/*,video/*" onChange={handleImageChange} disabled={!isAdmin} />
    </>
  );

  if (isPanel) {
    return (
      <>
        {content}
        {previewModal}
        {fileInputs}
      </>
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
        {content}
      </div>
      {previewModal}
      {fileInputs}
    </>
  );
};

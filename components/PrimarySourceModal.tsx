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
  X,
  FileJson
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
  onViewRubric: (image: ExampleImageSummary) => void;
  deleting: boolean;
}> = ({ image, isAdmin, onDelete, onViewRubric, deleting }) => {
  const [resolvedSrc, setResolvedSrc] = React.useState(image.imageUrl);

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

  return (
    <article className="relative border border-zinc-800 rounded-2xl overflow-hidden bg-zinc-950">
      <div className="aspect-video bg-zinc-900">
        {image.mimeType.startsWith('video/') ? (
          <video src={resolvedSrc} className="w-full h-full object-cover" controls playsInline />
        ) : (
          <img src={resolvedSrc} alt={image.title} className="w-full h-full object-cover" loading="lazy" />
        )}
      </div>
      <div className="p-4 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-white">{image.title}</p>
          <span
            className={`text-[10px] uppercase tracking-widest px-2 py-1 rounded-full border ${
              image.label === 'good' ? 'border-emerald-500/40 text-emerald-200' : 'border-amber-500/40 text-amber-200'
            }`}
          >
            {image.label === 'good' ? 'Ideal' : 'Needs Work'}
          </span>
        </div>
        {image.description && <p className="text-xs text-zinc-400 line-clamp-2">{image.description}</p>}
        <p className="text-[10px] text-zinc-500 font-mono">
          {formatBytes(image.sizeBytes)} · {new Date(image.createdAt).toLocaleDateString()}
        </p>
      </div>
      {image.structuredAnalysis && (
        <button
          type="button"
          onClick={() => onViewRubric(image)}
          className="absolute top-3 right-20 inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-sky-300 hover:bg-sky-900/20 bg-black/50 backdrop-blur-sm border border-sky-500/30"
        >
          <FileJson className="w-3 h-3" />
          Rubric
        </button>
      )}
      {isAdmin && (
        <button
          type="button"
          onClick={() => onDelete(image.id)}
          className="absolute top-3 right-3 inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-red-300 hover:bg-red-900/20 bg-black/50 backdrop-blur-sm border border-red-500/30"
          disabled={deleting}
        >
          {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
          Remove
        </button>
      )}
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
  onReferenceDeleted
}) => {
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
  const [viewingRubric, setViewingRubric] = React.useState<ExampleImageSummary | null>(null);

  const filteredImages = React.useMemo(() => {
    if (imageFilter === 'all') return referenceImages;
    return referenceImages.filter((img) => img.label === imageFilter);
  }, [referenceImages, imageFilter]);

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
      // 1. Analyze the image/video to get a description for RAG
      let aiDescription = '';
      try {
        // Use a temporary settings object for this analysis
        // We assume the user has configured their keys in the main app settings
        // We'll try to read from localStorage to get the current configuration
        const savedSettings = localStorage.getItem('vision-settings');
        const settings = savedSettings ? JSON.parse(savedSettings) : DEFAULT_SETTINGS;
        
        // Override system prompt to force description
        const descriptionSettings = {
          ...settings,
          systemPrompt: "Describe this welding example in detail. Focus on visual characteristics, quality indicators, and technical specifications. Do not provide advice, just description."
        };

        aiDescription = await analyzeMedia(selectedMediaFile, descriptionSettings);
      } catch (analysisErr) {
        console.warn('Failed to generate AI description for reference image:', analysisErr);
        // Continue upload even if analysis fails, just won't be searchable via RAG
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

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div className="w-full max-w-5xl bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl flex flex-col max-h-[92vh]" onClick={(event) => event.stopPropagation()}>
          <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-900">
            <div className="flex items-center gap-2 text-white">
              <BookMarked className="w-5 h-5 text-zinc-400" />
              <div>
                <p className="text-sm font-semibold">Knowledge Library</p>
                <p className="text-xs text-zinc-500">Manage cached PDFs and curated reference images.</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-900">
              <X className="w-4 h-4" />
            </button>
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
                      <button onClick={triggerPdfUpload} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-black text-sm font-medium shadow hover:bg-zinc-100" type="button">
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
                            <div className={`relative rounded-2xl border px-4 py-3 transition-colors ${active ? 'border-emerald-400/60 bg-emerald-400/10 text-white' : 'border-zinc-800 bg-zinc-950 hover:border-zinc-800'}`}>
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
                                <div className={`w-6 h-6 rounded-full border flex items-center justify-center ${active ? 'bg-emerald-400 border-transparent text-black' : 'border-zinc-600 text-transparent'}`}>
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
                  <p className="text-lg font-semibold text-white">Curated guidance gallery</p>
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
                        <button onClick={handleCancelUpload} className="text-xs text-zinc-400 hover:text-white">Cancel</button>
                      </div>

                      {/* File Preview */}
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
                          <p className="text-xs text-zinc-500">{formatBytes(selectedMediaFile.size)} · {selectedMediaFile.type}</p>
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
                                  imageLabel === item.value ? `${item.tone} shadow-inner` : 'border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'
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
                        
                        {/* Material Properties */}
                        <div className="space-y-2">
                          <p className="text-[11px] uppercase tracking-widest text-zinc-500">Material</p>
                          <select
                            value={imageMaterialType}
                            onChange={(e) => setImageMaterialType(e.target.value)}
                            className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-zinc-600"
                          >
                            <option value="">Any Material</option>
                            {MATERIAL_TYPES.map(m => <option key={m} value={m}>{m}</option>)}
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
                            {WELD_PROCESSES.map(m => <option key={m.code} value={m.code}>{m.name}</option>)}
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
                            {MATERIAL_THICKNESSES.map(m => <option key={m} value={m}>{m}</option>)}
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
                            {JOINT_TYPES.map(m => <option key={m} value={m}>{m}</option>)}
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
                            {WELD_POSITIONS.map(group => (
                              <optgroup key={group.label} label={group.label}>
                                {group.options.map(opt => (
                                  <option key={opt.value} value={opt.value}>{opt.label}</option>
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
                        imageFilter === 'all' ? 'border-white text-white' : 'border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-white'
                      }`}
                    >
                      All ({referenceImages.length})
                    </button>
                    {LABEL_OPTIONS.map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => setImageFilter(item.value)}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                          imageFilter === item.value ? `${item.tone}` : 'border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-white'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
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
                          onViewRubric={setViewingRubric}
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
      </div>
      
      {viewingRubric && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4" onClick={() => setViewingRubric(null)}>
            <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-auto flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-white">Grading Rubric</h3>
                    <button onClick={() => setViewingRubric(null)} className="text-zinc-400 hover:text-white">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <div className="flex-1 overflow-auto custom-scrollbar bg-zinc-950 p-4 rounded-xl border border-zinc-800">
                    <pre className="text-xs text-zinc-300 font-mono whitespace-pre-wrap">
                        {JSON.stringify(viewingRubric.structuredAnalysis, null, 2)}
                    </pre>
                </div>
                <div className="mt-4 flex justify-end">
                    <button onClick={() => setViewingRubric(null)} className="px-4 py-2 bg-white text-black rounded-xl text-sm font-medium hover:bg-zinc-200">Close</button>
                </div>
            </div>
        </div>
      )}

      <input ref={pdfInputRef} type="file" className="hidden" accept="application/pdf" onChange={handlePdfChange} disabled={!isAdmin} />
      <input ref={imageInputRef} type="file" className="hidden" accept="image/*,video/*" onChange={handleImageChange} disabled={!isAdmin} />
    </>
  );
};

import React, { useState, useMemo } from 'react';
import { Key, RefreshCcw, Pencil, Trash2, Loader2, X, Wifi, CheckCircle, AlertTriangle, Users, FileText, RotateCcw, BookMarked, Plus } from 'lucide-react';
import { AppSettings, ExampleImageSummary, ModelProvider, PrimarySourceSummary, SessionUser } from '../types';
import { DEFAULT_SYSTEM_PROMPT, DEFAULT_VISION_PROMPT } from '../constants';
import { testConnection } from '../services/llm';
import { UserManagementPanel } from './UserManagementPanel';
import { PrimarySourceModal } from './PrimarySourceModal';
import { makePromptHumanReadable } from '../utils/prompt';
import { RubricObservation, RubricDefect } from '../types';

type ProviderSlug = 'ollama' | 'gemini';
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
  const [selectedProvider, setSelectedProvider] = useState<ProviderSlug>('ollama');
  const displayVisionPrompt = useMemo(
    () => makePromptHumanReadable(settings.visionPrompt) ?? DEFAULT_VISION_PROMPT,
    [settings.visionPrompt]
  );
  const displaySystemPrompt = useMemo(
    () => makePromptHumanReadable(settings.systemPrompt) ?? DEFAULT_SYSTEM_PROMPT,
    [settings.systemPrompt]
  );

  const DEFAULT_STATUS = 'not_evaluated';

  const normalizeToleranceStatus = React.useCallback((value?: string | null) => {
    const lower = (value || '').toLowerCase().trim();
    if (lower === 'pass') return 'within_tolerance';
    if (lower === 'fail') return 'out_of_tolerance';
    if (lower === 'partial') return 'borderline';
    if (['within_tolerance', 'borderline', 'out_of_tolerance', 'not_evaluated'].includes(lower)) return lower;
    return value || DEFAULT_STATUS;
  }, [DEFAULT_STATUS]);

    const DEFAULT_RUBRIC_CRITERIA = useMemo(() => [
      {
        name: 'Bead Consistency',
        measurement_notes: 'Record average bead width, variance %, and straightness deviation using handbook definitions.',
        key_indicators: 'Look for uniform bead appearance and straight travel; flag noticeable swings or wandering.'
      },
      {
        name: 'Penetration & Fusion',
        measurement_notes: 'Capture toe tie-in quality, fusion cues, and cold lap length % of total weld per handbook definitions.',
        key_indicators: 'Note smooth tie-in and absence of overlap; flag visible lack of fusion or cold lap segments.'
      },
      {
        name: 'Profile & Contour',
        measurement_notes: 'Describe crown shape and degree of convexity/concavity using the handbook terms.',
        key_indicators: 'Check for appropriate crown shape; flag obvious over-build or concavity outside expected profile.'
      },
      {
        name: 'Ripple Pattern',
        measurement_notes: 'Describe ripple spacing uniformity and pattern clarity using handbook guidance.',
        key_indicators: 'Expect consistent ripple spacing and clarity; flag coarse or irregular patterns.'
      },
      {
        name: 'Heat Control',
        measurement_notes: 'Estimate HAZ width and undercut presence/length using handbook definitions.',
        key_indicators: 'Look for minimal undercut and controlled HAZ; flag obvious burn-through or excessive HAZ.'
      }
    ], []);

    const DEFAULT_OBSERVATIONS: RubricObservation[] = useMemo(() => [
      {
        criterion: 'Bead Consistency',
        observed_condition: 'Avg bead width ~6.2mm; variance +/-0.8mm (~13%). Path mostly straight.',
        matches_reference: DEFAULT_STATUS,
        variance_estimate: '+/-13% width variance'
      },
      {
        criterion: 'Penetration & Fusion',
        observed_condition: 'Toe tie-in smooth; cold lap noted near start.',
        matches_reference: DEFAULT_STATUS,
        variance_estimate: '~4% cold lap length'
      },
      {
        criterion: 'Profile & Contour',
        observed_condition: 'Slightly convex crown; profile within expected range.',
        matches_reference: DEFAULT_STATUS,
        variance_estimate: 'N/A or % deviation'
      },
      {
        criterion: 'Ripple Pattern',
        observed_condition: 'Ripples mostly even; tighter spacing toward end.',
        matches_reference: DEFAULT_STATUS,
        variance_estimate: '~12% spacing variance'
      },
      {
        criterion: 'Heat Control',
        observed_condition: 'Even HAZ width; slight undercut mid-length.',
        matches_reference: DEFAULT_STATUS,
        variance_estimate: '~6% undercut length'
      }
    ], [DEFAULT_STATUS]);

    const DEFAULT_DEFECTS: RubricDefect[] = useMemo(() => ([
      {
        type: 'Defect Type (e.g. Porosity, Undercut, Spatter)',
        location: 'Location on weld',
        severity: 'minor'
      }
    ]), []);

    type VisionBuilderState = {
      rubric_criteria: typeof DEFAULT_RUBRIC_CRITERIA;
      student_observations: RubricObservation[];
      detected_defects: RubricDefect[];
    };

    const parseVisionPrompt = React.useCallback((raw: string | null | undefined): VisionBuilderState => {
      const mapObservations = (obsList: RubricObservation[]) =>
        obsList.map((obs) => ({
          ...obs,
          matches_reference: normalizeToleranceStatus(obs.matches_reference)
        }));

      const mapCriteria = (criteria: any[]) =>
        criteria.map((c) => ({
          name: c.name,
          measurement_notes: c.measurement_notes || c.pass_description || '',
          key_indicators: c.key_indicators || c.fail_description || ''
        }));

      try {
        if (!raw) {
          throw new Error('missing');
        }
        const parsed = JSON.parse(raw);
        return {
          rubric_criteria: Array.isArray(parsed?.rubric_criteria) && parsed.rubric_criteria.length ? mapCriteria(parsed.rubric_criteria) : DEFAULT_RUBRIC_CRITERIA,
          student_observations: Array.isArray(parsed?.student_observations) && parsed.student_observations.length ? mapObservations(parsed.student_observations) : mapObservations(DEFAULT_OBSERVATIONS),
          detected_defects: Array.isArray(parsed?.detected_defects) && parsed.detected_defects.length ? parsed.detected_defects : DEFAULT_DEFECTS,
        };
      } catch {
        return {
          rubric_criteria: DEFAULT_RUBRIC_CRITERIA,
          student_observations: mapObservations(DEFAULT_OBSERVATIONS),
          detected_defects: DEFAULT_DEFECTS,
        };
      }
    }, [DEFAULT_DEFECTS, DEFAULT_OBSERVATIONS, DEFAULT_RUBRIC_CRITERIA, normalizeToleranceStatus]);

    const [visionBuilder, setVisionBuilder] = useState<VisionBuilderState>(() => parseVisionPrompt(settings.visionPrompt ?? null));
    const [showVisionBuilder, setShowVisionBuilder] = useState(false);
    const [bulkMatchesReference, setBulkMatchesReference] = useState(DEFAULT_STATUS);
    const [bulkSeverity, setBulkSeverity] = useState('');

    const syncVisionBuilderFromSettings = React.useCallback(() => {
      const parsed = parseVisionPrompt(settings.visionPrompt);
      setVisionBuilder(parsed);
      const firstStatus = normalizeToleranceStatus(parsed.student_observations?.[0]?.matches_reference);
      setBulkMatchesReference(firstStatus || DEFAULT_STATUS);
      setBulkSeverity(parsed.detected_defects?.[0]?.severity || '');
    }, [DEFAULT_STATUS, normalizeToleranceStatus, parseVisionPrompt, settings.visionPrompt]);

    React.useEffect(() => {
      syncVisionBuilderFromSettings();
    }, [syncVisionBuilderFromSettings]);

    const saveVisionBuilderToPrompt = () => {
      const normalized = {
        rubric_criteria: visionBuilder.rubric_criteria,
        student_observations: visionBuilder.student_observations.map((obs) => ({
          ...obs,
          matches_reference: normalizeToleranceStatus(obs.matches_reference) || DEFAULT_STATUS
        })),
        detected_defects: visionBuilder.detected_defects.map((def) => ({
          ...def,
          severity: def.severity || 'minor'
        }))
      };

      const next = JSON.stringify(normalized, null, 2);
      onUpdate({ ...settings, visionPrompt: next });
      setPromptsMessage({ type: 'success', text: 'Vision prompt updated from builder.' });
      setTimeout(() => setPromptsMessage(null), 2500);
    };

  const fetchSavedKeysFromApi = React.useCallback(async (): Promise<SavedKeySummary[]> => {
    if (!user) return [];
    const response = await fetch('/api/keys');
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.error || 'Failed to load saved keys');
    }
    const parsed: SavedKeySummary[] = Array.isArray(payload?.keys)
      ? payload.keys
          .filter((key: any) => key.provider === 'ollama' || key.provider === 'gemini')
          .map((key: any) => ({
            id: key.id,
            provider: (key.provider as ProviderSlug) || 'ollama',
            label: key.label,
            updatedAt: key.updatedAt || key.updated_at || '',
            lastFour: key.lastFour ?? key.last_four ?? null,
          }))
          .sort((a: SavedKeySummary, b: SavedKeySummary) => a.label.localeCompare(b.label))
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

  const savedKeysByProvider = useMemo(
    () => savedKeys.filter((k) => k.provider === selectedProvider),
    [savedKeys, selectedProvider]
  );

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
      provider: selectedProvider === 'ollama' ? ModelProvider.OLLAMA : ModelProvider.GEMINI,
      ollamaKey: selectedProvider === 'ollama' ? inputValue : settings.ollamaKey,
      geminiKey: selectedProvider === 'gemini' ? inputValue : settings.geminiKey,
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
          body: JSON.stringify({ provider: selectedProvider, label, key: currentSecret })
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
      setSelectedProvider(key.provider);
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
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <h3 className="text-sm font-medium text-white">Vision Prompt (Step 1)</h3>
                        <p className="text-[10px] text-zinc-400">
                          Controls how the vision model analyzes the image/video frames. Must output JSON.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={syncVisionBuilderFromSettings}
                          className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-medium text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded transition-colors"
                          title="Refresh builder from current prompt"
                        >
                          <RefreshCcw className="w-3 h-3" />
                          Sync
                        </button>
                        <button
                          onClick={() => setShowVisionBuilder((prev) => !prev)}
                          className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-medium text-white bg-blue-600 hover:bg-blue-500 rounded transition-colors"
                        >
                          {showVisionBuilder ? 'Hide Builder' : 'Edit as Form'}
                        </button>
                        <button
                          onClick={() => onUpdate({ ...settings, visionPrompt: null })}
                          className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-medium text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded transition-colors"
                          title="Reset to default vision prompt"
                        >
                          <RotateCcw className="w-3 h-3" />
                          Reset Default
                        </button>
                      </div>
                    </div>
                    <textarea
                      value={displayVisionPrompt}
                      onChange={(e) => onUpdate({ ...settings, visionPrompt: e.target.value })}
                      className="w-full h-48 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-zinc-300 focus:outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600 resize-none"
                      spellCheck={false}
                    />
                    {showVisionBuilder && (
                      <div className="space-y-4 mt-3 border border-zinc-800 rounded-xl p-3 bg-zinc-900/50">
                        <div className="flex items-center justify-between">
                            <h4 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">Measurement Criteria</h4>
                          <button
                            type="button"
                            onClick={() => setVisionBuilder((prev) => ({
                              ...prev,
                              rubric_criteria: [...prev.rubric_criteria, { name: 'New Criterion', measurement_notes: '', key_indicators: '' }]
                            }))}
                            className="text-xs flex items-center gap-1 text-sky-400 hover:text-sky-300"
                          >
                            <Plus className="w-3 h-3" /> Add
                          </button>
                        </div>
                        <div className="space-y-2">
                          {visionBuilder.rubric_criteria.map((crit, idx) => (
                            <div key={idx} className="grid grid-cols-12 gap-2 items-start bg-zinc-900 p-2 rounded-lg border border-zinc-800">
                              <div className="col-span-3 space-y-1">
                                <span className="text-[10px] uppercase tracking-wide text-zinc-500">Feature</span>
                                <input
                                  value={crit.name}
                                  onChange={(e) => {
                                    const next = [...visionBuilder.rubric_criteria];
                                    next[idx] = { ...next[idx], name: e.target.value };
                                    setVisionBuilder((prev) => ({ ...prev, rubric_criteria: next }));
                                  }}
                                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-zinc-600"
                                />
                              </div>
                              <div className="col-span-4 space-y-1">
                                <span className="text-[10px] uppercase tracking-wide text-zinc-500">What to capture</span>
                                <textarea
                                  value={crit.measurement_notes || ''}
                                  onChange={(e) => {
                                    const next = [...visionBuilder.rubric_criteria];
                                    next[idx] = { ...next[idx], measurement_notes: e.target.value };
                                    setVisionBuilder((prev) => ({ ...prev, rubric_criteria: next }));
                                  }}
                                  placeholder="Key measurements, cues, or dimensions to record"
                                  rows={2}
                                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-300 focus:outline-none focus:border-zinc-600 resize-none"
                                />
                              </div>
                              <div className="col-span-4 space-y-1">
                                <span className="text-[10px] uppercase tracking-wide text-zinc-500">Indicators / Ranges</span>
                                <textarea
                                  value={crit.key_indicators || ''}
                                  onChange={(e) => {
                                    const next = [...visionBuilder.rubric_criteria];
                                    next[idx] = { ...next[idx], key_indicators: e.target.value };
                                    setVisionBuilder((prev) => ({ ...prev, rubric_criteria: next }));
                                  }}
                                  placeholder="Targets, tolerances, or notable indicators"
                                  rows={2}
                                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-300 focus:outline-none focus:border-zinc-600 resize-none"
                                />
                              </div>
                              <div className="col-span-1 flex justify-center pt-1">
                                <button
                                  type="button"
                                  onClick={() => setVisionBuilder((prev) => ({
                                    ...prev,
                                    rubric_criteria: prev.rubric_criteria.filter((_, i) => i !== idx)
                                  }))}
                                  className="text-zinc-600 hover:text-red-400 transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                          {visionBuilder.rubric_criteria.length === 0 && (
                            <p className="text-xs text-zinc-600 italic text-center py-2">No criteria defined.</p>
                          )}
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <h4 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">Observations & Measurements</h4>
                            <button
                              type="button"
                              onClick={() => setVisionBuilder((prev) => ({
                                ...prev,
                                student_observations: [...prev.student_observations, { criterion: visionBuilder.rubric_criteria[0]?.name || 'New Criterion', observed_condition: '', matches_reference: bulkMatchesReference || DEFAULT_STATUS, variance_estimate: '' }]
                              }))}
                              className="text-xs flex items-center gap-1 text-sky-400 hover:text-sky-300"
                            >
                              <Plus className="w-3 h-3" /> Add
                            </button>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <input
                              value={bulkMatchesReference}
                              onChange={(e) => {
                                const val = e.target.value;
                                setBulkMatchesReference(val);
                                setVisionBuilder((prev) => ({
                                  ...prev,
                                  student_observations: prev.student_observations.map((obs) => ({
                                    ...obs,
                                    matches_reference: normalizeToleranceStatus(val || obs.matches_reference)
                                  }))
                                }));
                              }}
                              placeholder="status (e.g., not_evaluated)"
                              className="w-56 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-[11px] text-white focus:outline-none focus:border-zinc-600"
                            />
                          </div>
                          <div className="space-y-2">
                            {visionBuilder.student_observations.map((obs, idx) => (
                              <div key={idx} className="grid grid-cols-12 gap-2 items-start bg-zinc-900 p-2 rounded-lg border border-zinc-800">
                                <div className="col-span-3 space-y-1">
                                  <select
                                    value={obs.criterion}
                                    onChange={(e) => setVisionBuilder((prev) => {
                                      const next = [...prev.student_observations];
                                      next[idx] = { ...next[idx], criterion: e.target.value };
                                      return { ...prev, student_observations: next };
                                    })}
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-zinc-600"
                                  >
                                    {visionBuilder.rubric_criteria.map((c) => (
                                      <option key={c.name} value={c.name}>{c.name}</option>
                                    ))}
                                    {!visionBuilder.rubric_criteria.find((c) => c.name === obs.criterion) && (
                                      <option value={obs.criterion}>{obs.criterion}</option>
                                    )}
                                  </select>
                                </div>
                                <div className="col-span-8 space-y-1">
                                  <textarea
                                    value={obs.observed_condition}
                                    onChange={(e) => setVisionBuilder((prev) => {
                                      const next = [...prev.student_observations];
                                      next[idx] = { ...next[idx], observed_condition: e.target.value };
                                      return { ...prev, student_observations: next };
                                    })}
                                    placeholder="Observation details..."
                                    rows={2}
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-300 focus:outline-none focus:border-zinc-600 resize-none"
                                  />
                                  <input
                                    value={obs.variance_estimate || ''}
                                    onChange={(e) => setVisionBuilder((prev) => {
                                      const next = [...prev.student_observations];
                                      next[idx] = { ...next[idx], variance_estimate: e.target.value };
                                      return { ...prev, student_observations: next };
                                    })}
                                    placeholder="Variance estimate (optional)"
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-300 focus:outline-none focus:border-zinc-600"
                                  />
                                </div>
                                <div className="col-span-1 flex justify-center pt-1">
                                  <button
                                    type="button"
                                    onClick={() => setVisionBuilder((prev) => ({
                                      ...prev,
                                      student_observations: prev.student_observations.filter((_, i) => i !== idx)
                                    }))}
                                    className="text-zinc-600 hover:text-red-400 transition-colors"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            ))}
                            {visionBuilder.student_observations.length === 0 && (
                              <p className="text-xs text-zinc-600 italic text-center py-2">No observations defined.</p>
                            )}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <h4 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">Defects</h4>
                            <button
                              type="button"
                              onClick={() => setVisionBuilder((prev) => ({
                                ...prev,
                                detected_defects: [...prev.detected_defects, { type: 'Porosity', location: '', severity: bulkSeverity || 'minor' }]
                              }))}
                              className="text-xs flex items-center gap-1 text-sky-400 hover:text-sky-300"
                            >
                              <Plus className="w-3 h-3" /> Add
                            </button>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <input
                              value={bulkSeverity}
                              onChange={(e) => {
                                const val = e.target.value;
                                setBulkSeverity(val);
                                setVisionBuilder((prev) => ({
                                  ...prev,
                                  detected_defects: prev.detected_defects.map((def) => ({
                                    ...def,
                                    severity: val || def.severity || 'minor'
                                  }))
                                }));
                              }}
                              placeholder="severity (minor/moderate/severe)"
                              className="w-56 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-[11px] text-white focus:outline-none focus:border-zinc-600"
                            />
                          </div>
                          <div className="space-y-2">
                            {visionBuilder.detected_defects.map((def, idx) => (
                              <div key={idx} className="grid grid-cols-12 gap-2 items-start bg-zinc-900 p-2 rounded-lg border border-zinc-800">
                                <div className="col-span-4 space-y-1">
                                  <input
                                    value={def.type}
                                    onChange={(e) => setVisionBuilder((prev) => {
                                      const next = [...prev.detected_defects];
                                      next[idx] = { ...next[idx], type: e.target.value };
                                      return { ...prev, detected_defects: next };
                                    })}
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-zinc-600"
                                  />
                                  <input
                                    value={def.severity || ''}
                                    onChange={(e) => setVisionBuilder((prev) => {
                                      const next = [...prev.detected_defects];
                                      next[idx] = { ...next[idx], severity: e.target.value };
                                      return { ...prev, detected_defects: next };
                                    })}
                                    placeholder="minor | moderate | severe"
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-zinc-600"
                                  />
                                </div>
                                <div className="col-span-7 space-y-1">
                                  <input
                                    value={def.location}
                                    onChange={(e) => setVisionBuilder((prev) => {
                                      const next = [...prev.detected_defects];
                                      next[idx] = { ...next[idx], location: e.target.value };
                                      return { ...prev, detected_defects: next };
                                    })}
                                    placeholder="Location (e.g. start, mid, end)"
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-300 focus:outline-none focus:border-zinc-600"
                                  />
                                </div>
                                <div className="col-span-1 flex justify-center pt-1">
                                  <button
                                    type="button"
                                    onClick={() => setVisionBuilder((prev) => ({
                                      ...prev,
                                      detected_defects: prev.detected_defects.filter((_, i) => i !== idx)
                                    }))}
                                    className="text-zinc-600 hover:text-red-400 transition-colors"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            ))}
                            {visionBuilder.detected_defects.length === 0 && (
                              <p className="text-xs text-zinc-600 italic text-center py-2">No defects defined.</p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2">
                          <button
                            type="button"
                            onClick={syncVisionBuilderFromSettings}
                            className="px-3 py-1.5 text-[11px] font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 rounded-lg"
                          >
                            Reset Changes
                          </button>
                          <button
                            type="button"
                            onClick={saveVisionBuilderToPrompt}
                            className="px-3 py-1.5 text-[11px] font-medium text-black bg-white hover:bg-zinc-200 rounded-lg"
                          >
                            Update Vision Prompt
                          </button>
                        </div>
                      </div>
                    )}
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
                      value={displaySystemPrompt}
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
                    <label className="text-xs text-zinc-300">Provider</label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedProvider('ollama')}
                        className={`flex-1 px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${selectedProvider === 'ollama' ? 'border-white text-white bg-zinc-800' : 'border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-600'}`}
                      >
                        <span className="flex items-center justify-center gap-1">
                          <span>Ollama</span>
                          {selectedProvider === 'ollama' && <CheckCircle className="w-3.5 h-3.5 text-green-400" />}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedProvider('gemini')}
                        className={`flex-1 px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${selectedProvider === 'gemini' ? 'border-white text-white bg-zinc-800' : 'border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-600'}`}
                      >
                        <span className="flex items-center justify-center gap-1">
                          <span>Gemini</span>
                          {selectedProvider === 'gemini' && <CheckCircle className="w-3.5 h-3.5 text-green-400" />}
                        </span>
                      </button>
                    </div>
                  </div>

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
                      {loadingSavedKeys && savedKeysByProvider.length === 0 ? (
                        <div className="text-[10px] text-zinc-400">Loading saved keys...</div>
                      ) : savedKeysByProvider.length === 0 ? (
                        <div className="text-[10px] text-zinc-500">No saved keys yet.</div>
                      ) : (
                        savedKeysByProvider.map((key) => (
                          <div
                            key={key.id}
                            className="flex items-center justify-between gap-3 border border-zinc-800 rounded-lg px-3 py-1.5"
                          >
                            <div className="min-w-0">
                              <p className="text-xs text-white font-medium truncate">{key.label}</p>
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

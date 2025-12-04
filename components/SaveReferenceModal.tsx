import React, { useState, useEffect } from 'react';
import { Loader2, UploadCloud, X, Plus, Trash2 } from 'lucide-react';
import { ExampleImageLabel, AppSettings } from '../types';
import { uploadExampleImage } from '../services/exampleImages';
import { MATERIAL_TYPES, WELD_PROCESSES, MATERIAL_THICKNESSES, JOINT_TYPES, WELD_POSITIONS } from '../constants';

interface SaveReferenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  file: File;
  initialDescription?: string;
  settings?: AppSettings;
  structuredAnalysis?: any;
  onSuccess: () => void;
}

const LABEL_OPTIONS: Array<{ value: ExampleImageLabel; label: string; tone: string }> = [
  { value: 'good', label: 'Ideal', tone: 'text-emerald-300 bg-emerald-900/30 border-emerald-500/40' },
  { value: 'bad', label: 'Needs Work', tone: 'text-amber-200 bg-amber-900/30 border-amber-500/40' }
];

const RUBRIC_CRITERIA = [
  "Bead Consistency",
  "Penetration & Fusion",
  "Profile & Contour",
  "Ripple Pattern",
  "Heat Control",
  "Travel Stability"
];

const DEFECT_TYPES = [
  "Porosity",
  "Undercut",
  "Spatter",
  "Cracks",
  "Lack of Fusion",
  "Burn Through",
  "Overlap",
  "Slag Inclusion",
  "Arc Strikes",
  "Whiskers"
];

const SEVERITY_LEVELS = ["minor", "moderate", "severe"];
const MATCH_STATUSES = ["pass", "partial", "fail"];

interface RubricFormProps {
  data: any;
  onChange: (data: any) => void;
}

const RubricForm: React.FC<RubricFormProps> = ({ data, onChange }) => {
  const observations = data?.student_observations || [];
  const defects = data?.detected_defects || [];
  const overallGrade = data?.overall_grade || '';
  const feedback = data?.feedback || '';

  const updateField = (field: string, value: string) => {
    onChange({ ...data, [field]: value });
  };

  const updateObservation = (index: number, field: string, value: string) => {
    const next = [...observations];
    next[index] = { ...next[index], [field]: value };
    onChange({ ...data, student_observations: next });
  };

  const removeObservation = (index: number) => {
    const next = [...observations];
    next.splice(index, 1);
    onChange({ ...data, student_observations: next });
  };

  const addObservation = () => {
    onChange({
      ...data,
      student_observations: [
        ...observations,
        { criterion: RUBRIC_CRITERIA[0], observed_condition: '', matches_reference: 'pass', score: '' }
      ]
    });
  };

  const updateDefect = (index: number, field: string, value: string) => {
    const next = [...defects];
    next[index] = { ...next[index], [field]: value };
    onChange({ ...data, detected_defects: next });
  };

  const removeDefect = (index: number) => {
    const next = [...defects];
    next.splice(index, 1);
    onChange({ ...data, detected_defects: next });
  };

  const addDefect = () => {
    onChange({
      ...data,
      detected_defects: [
        ...defects,
        { type: DEFECT_TYPES[0], severity: 'minor', location: '' }
      ]
    });
  };

  return (
    <div className="space-y-6 border border-zinc-800 rounded-xl p-4 bg-zinc-900/30">
      {/* Grade & Feedback Section */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
        <div className="space-y-2">
           <label className="text-[11px] uppercase tracking-widest text-zinc-500">Overall Grade</label>
           <input 
             value={overallGrade}
             onChange={(e) => updateField('overall_grade', e.target.value)}
             placeholder="e.g. 8.5/10"
             className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-600"
           />
        </div>
        <div className="col-span-1 md:col-span-2 space-y-2">
           <label className="text-[11px] uppercase tracking-widest text-zinc-500">Instructor Feedback</label>
           <textarea 
             value={feedback}
             onChange={(e) => updateField('feedback', e.target.value)}
             placeholder="General feedback summary..."
             rows={1}
             className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-600 resize-none"
           />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Grading Criteria</h4>
          <button
            type="button"
            onClick={addObservation}
            className="text-xs flex items-center gap-1 text-sky-400 hover:text-sky-300"
          >
            <Plus className="w-3 h-3" /> Add
          </button>
        </div>
        <div className="space-y-2">
          {observations.map((obs: any, i: number) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-start bg-zinc-900 p-2 rounded-lg border border-zinc-800">
              <div className="col-span-4 space-y-1">
                <select
                  value={obs.criterion}
                  onChange={(e) => updateObservation(i, 'criterion', e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-zinc-600"
                >
                  {RUBRIC_CRITERIA.map(c => <option key={c} value={c}>{c}</option>)}
                  {!RUBRIC_CRITERIA.includes(obs.criterion) && <option value={obs.criterion}>{obs.criterion}</option>}
                </select>
                <div className="flex gap-1">
                  <input
                    type="text"
                    placeholder="Score"
                    value={obs.score || ''}
                    onChange={(e) => updateObservation(i, 'score', e.target.value)}
                    className="w-16 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-zinc-600 text-center"
                  />
                  <select
                    value={obs.matches_reference}
                    onChange={(e) => updateObservation(i, 'matches_reference', e.target.value)}
                    className={`flex-1 border border-zinc-800 rounded px-2 py-1 text-xs focus:outline-none focus:border-zinc-600 ${
                      obs.matches_reference === 'pass' ? 'bg-emerald-900/20 text-emerald-400' :
                      obs.matches_reference === 'fail' ? 'bg-red-900/20 text-red-400' :
                      'bg-amber-900/20 text-amber-400'
                    }`}
                  >
                    {MATCH_STATUSES.map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}
                  </select>
                </div>
              </div>
              <div className="col-span-7">
                <textarea
                  value={obs.observed_condition}
                  onChange={(e) => updateObservation(i, 'observed_condition', e.target.value)}
                  placeholder="Observation details..."
                  rows={2}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-300 focus:outline-none focus:border-zinc-600 resize-none"
                />
              </div>
              <div className="col-span-1 flex justify-center pt-1">
                <button
                  type="button"
                  onClick={() => removeObservation(i)}
                  className="text-zinc-600 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
          {observations.length === 0 && (
            <p className="text-xs text-zinc-600 italic text-center py-2">No observations recorded.</p>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Defects</h4>
          <button
            type="button"
            onClick={addDefect}
            className="text-xs flex items-center gap-1 text-sky-400 hover:text-sky-300"
          >
            <Plus className="w-3 h-3" /> Add
          </button>
        </div>
        <div className="space-y-2">
          {defects.map((def: any, i: number) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-start bg-zinc-900 p-2 rounded-lg border border-zinc-800">
              <div className="col-span-4 space-y-1">
                <select
                  value={def.type}
                  onChange={(e) => updateDefect(i, 'type', e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-zinc-600"
                >
                  {DEFECT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  {!DEFECT_TYPES.includes(def.type) && <option value={def.type}>{def.type}</option>}
                </select>
                <select
                  value={def.severity}
                  onChange={(e) => updateDefect(i, 'severity', e.target.value)}
                  className={`w-full border border-zinc-800 rounded px-2 py-1 text-xs focus:outline-none focus:border-zinc-600 ${
                    def.severity === 'minor' ? 'bg-blue-900/20 text-blue-400' :
                    def.severity === 'moderate' ? 'bg-amber-900/20 text-amber-400' :
                    'bg-red-900/20 text-red-400'
                  }`}
                >
                  {SEVERITY_LEVELS.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                </select>
              </div>
              <div className="col-span-7">
                <input
                  value={def.location}
                  onChange={(e) => updateDefect(i, 'location', e.target.value)}
                  placeholder="Location (e.g. start, middle)..."
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-300 focus:outline-none focus:border-zinc-600"
                />
              </div>
              <div className="col-span-1 flex justify-center pt-1">
                <button
                  type="button"
                  onClick={() => removeDefect(i)}
                  className="text-zinc-600 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
          {defects.length === 0 && (
            <p className="text-xs text-zinc-600 italic text-center py-2">No defects detected.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export const SaveReferenceModal: React.FC<SaveReferenceModalProps> = ({
  isOpen,
  onClose,
  file,
  initialDescription,
  settings,
  structuredAnalysis,
  onSuccess
}) => {
  const [label, setLabel] = useState<ExampleImageLabel>('good');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState(initialDescription || '');
  const [materialType, setMaterialType] = useState(settings?.materialType || '');
  const [weldProcess, setWeldProcess] = useState(settings?.weldProcess || '');
  const [materialThickness, setMaterialThickness] = useState(settings?.materialThickness || '');
  const [jointType, setJointType] = useState(settings?.jointType || '');
  const [weldPosition, setWeldPosition] = useState(settings?.weldPosition || '');
  
  // Initialize with structuredAnalysis or a default empty structure
  const [rubricData, setRubricData] = useState(
    structuredAnalysis || { student_observations: [], detected_defects: [] }
  );
  
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!title.trim()) {
      setError('Please provide a title.');
      return;
    }

    setUploading(true);
    setError(null);
    
    try {
      await uploadExampleImage(file, {
        label,
        title: title.trim(),
        description: description.trim(),
        materialType: materialType || undefined,
        weldProcess: weldProcess || undefined,
        materialThickness: materialThickness || undefined,
        jointType: jointType || undefined,
        weldPosition: weldPosition || undefined,
        // We use the description as the AI description for RAG purposes as well
        aiDescription: description.trim(),
        structuredAnalysis: rubricData
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to save reference image.');
    } finally {
      setUploading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-[80] bg-black/60" onClick={onClose} />
      <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" onClick={onClose}>
        <div 
          className="w-full max-w-2xl bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]" 
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between p-4 border-b border-zinc-900">
            <h3 className="text-sm font-semibold text-white">Save as Reference Media</h3>
            <button onClick={onClose} className="text-zinc-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-6 overflow-y-auto custom-scrollbar space-y-6">
            {/* Preview */}
            <div className="flex items-center gap-4 p-3 bg-zinc-900/50 rounded-xl border border-zinc-800">
              <div className="w-20 h-20 bg-zinc-900 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center">
                {file.type.startsWith('video/') ? (
                  <video src={URL.createObjectURL(file)} className="w-full h-full object-cover" />
                ) : (
                  <img src={URL.createObjectURL(file)} alt="Preview" className="w-full h-full object-cover" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white truncate">{file.name}</p>
                <p className="text-xs text-zinc-500">{(file.size / 1024 / 1024).toFixed(2)} MB · {file.type}</p>
              </div>
            </div>

            <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-[11px] uppercase tracking-widest text-zinc-500">Classification</label>
                <div className="flex gap-2">
                  {LABEL_OPTIONS.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setLabel(item.value)}
                      className={`flex-1 px-3 py-2 rounded-xl border text-sm font-medium transition-colors ${
                        label === item.value ? `${item.tone} shadow-inner` : 'border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[11px] uppercase tracking-widest text-zinc-500">Title</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Vertical Up Fillet"
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-600"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] uppercase tracking-widest text-zinc-500">Description / Analysis Notes</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Detailed notes about this weld..."
                className="w-full h-32 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-600 resize-none"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[11px] uppercase tracking-widest text-zinc-500">Grading Rubric</label>
              <RubricForm data={rubricData} onChange={setRubricData} />
            </div>

            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3">
              <div className="space-y-2">
                <label className="text-[11px] uppercase tracking-widest text-zinc-500">Material</label>
                <select
                  value={materialType}
                  onChange={(e) => setMaterialType(e.target.value)}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-zinc-600"
                >
                  <option value="">Any Material</option>
                  {MATERIAL_TYPES.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[11px] uppercase tracking-widest text-zinc-500">Process</label>
                <select
                  value={weldProcess}
                  onChange={(e) => setWeldProcess(e.target.value)}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-zinc-600"
                >
                  <option value="">Any Process</option>
                  {WELD_PROCESSES.map(m => <option key={m.code} value={m.code}>{m.name}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[11px] uppercase tracking-widest text-zinc-500">Thickness</label>
                <select
                  value={materialThickness}
                  onChange={(e) => setMaterialThickness(e.target.value)}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-zinc-600"
                >
                  <option value="">Any Thickness</option>
                  {MATERIAL_THICKNESSES.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[11px] uppercase tracking-widest text-zinc-500">Joint Type</label>
                <select
                  value={jointType}
                  onChange={(e) => setJointType(e.target.value)}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-zinc-600"
                >
                  <option value="">Any Joint</option>
                  {JOINT_TYPES.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[11px] uppercase tracking-widest text-zinc-500">Position</label>
                <select
                  value={weldPosition}
                  onChange={(e) => setWeldPosition(e.target.value)}
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

            {error && (
              <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2">
                {error}
              </div>
            )}
          </div>

          <div className="p-4 border-t border-zinc-900 flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={uploading}
              className="px-6 py-2 rounded-xl bg-white text-black text-sm font-medium shadow hover:bg-zinc-200 disabled:opacity-50 flex items-center gap-2"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
              {uploading ? 'Saving...' : 'Save to Library'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

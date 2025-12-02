import React from 'react';
import { Layout, Zap, X } from 'lucide-react';
import { AppSettings } from '../types';
import { 
  MATERIAL_TYPES, 
  WELD_PROCESSES, 
  MATERIAL_THICKNESSES, 
  JOINT_TYPES, 
  WELD_POSITIONS 
} from '../constants';

interface SetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onUpdate: (newSettings: AppSettings) => void;
  onAnalyze: () => void;
  mediaKind: 'image' | 'video' | null;
}

export const SetupModal: React.FC<SetupModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdate,
  onAnalyze,
  mediaKind
}) => {
  if (!isOpen) return null;

  const handleChange = (key: keyof AppSettings, value: any) => {
    onUpdate({ ...settings, [key]: value });
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6" onClick={onClose}>
        <div
          className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between p-4 border-b border-zinc-800 bg-zinc-900/50">
            <div className="flex items-center gap-2">
              <Layout className="w-4 h-4 text-purple-400" />
              <h2 className="text-sm font-medium text-white">Analysis Setup</h2>
            </div>
            <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-6 space-y-5 overflow-y-auto max-h-[60vh] custom-scrollbar">
             <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Material Type</label>
                    <select
                      value={settings.materialType || ''}
                      onChange={(e) => handleChange('materialType', e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600"
                    >
                      <option value="">Select Material...</option>
                      {MATERIAL_TYPES.map(m => (
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
                      {WELD_PROCESSES.map(m => (
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
                      {MATERIAL_THICKNESSES.map(m => (
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
                      {JOINT_TYPES.map(m => (
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
          </div>

          <div className="p-4 border-t border-zinc-800 bg-zinc-900/50">
            <button 
              onClick={() => {
                onAnalyze();
                onClose();
              }}
              className="w-full h-12 bg-white hover:bg-zinc-200 text-black rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 shadow-lg hover:scale-[1.02] active:scale-[0.98]"
            >
              <Zap className="w-4 h-4 fill-black" />
              <span>Analyze {mediaKind === 'video' ? 'Video' : 'Image'}</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

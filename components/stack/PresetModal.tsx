import React, { useState } from 'react';
import { Button } from '../Button';

interface StackPreset {
  id: string;
  name: string;
  layers: Array<{ name: string; productCategory: string; targetZone: string }>;
  aspectRatio: string;
  imageSize: string;
  createdAt: number;
}

interface PresetModalProps {
  isOpen: boolean;
  mode: 'save' | 'load';
  presets: StackPreset[];
  onSave: (name: string) => void;
  onLoad: (presetId: string) => void;
  onDelete: (presetId: string) => void;
  onClose: () => void;
}

export const PresetModal: React.FC<PresetModalProps> = ({
  isOpen,
  mode,
  presets,
  onSave,
  onLoad,
  onDelete,
  onClose,
}) => {
  const [presetName, setPresetName] = useState('');

  if (!isOpen) return null;

  const handleSave = () => {
    const trimmed = presetName.trim();
    if (!trimmed) return;
    onSave(trimmed);
    setPresetName('');
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">
            {mode === 'save' ? 'Save Preset' : 'Load Preset'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Save mode */}
        {mode === 'save' && (
          <div className="space-y-4">
            <input
              type="text"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Preset name..."
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2.5 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleSave} disabled={!presetName.trim()}>
                Save
              </Button>
            </div>
          </div>
        )}

        {/* Load mode */}
        {mode === 'load' && (
          <div>
            {presets.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">
                No saved presets yet.
              </p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {presets.map((preset) => (
                  <div
                    key={preset.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {preset.name}
                      </p>
                      <p className="text-xs text-gray-400">
                        {preset.layers.length} layer{preset.layers.length !== 1 ? 's' : ''}
                        {' \u00b7 '}
                        {new Date(preset.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                      <Button
                        variant="primary"
                        onClick={() => {
                          onLoad(preset.id);
                          onClose();
                        }}
                        className="text-xs px-3 py-1.5"
                      >
                        Load
                      </Button>
                      <button
                        type="button"
                        onClick={() => onDelete(preset.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 transition-colors"
                        aria-label={`Delete preset ${preset.name}`}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end mt-4">
              <Button variant="ghost" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PresetModal;

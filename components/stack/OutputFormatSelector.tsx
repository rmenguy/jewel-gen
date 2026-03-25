import React from 'react';
import { SectionLabel } from '../ui/SectionLabel';
import PillButton from '../ui/PillButton';
import { ASPECT_RATIOS, IMAGE_SIZES } from '../../services/geminiService';

const ASPECT_RATIO_LABELS: Record<string, string> = {
  '1:1': 'Carré',
  '2:3': 'Portrait 2:3',
  '3:2': 'Paysage 3:2',
  '3:4': 'Portrait 3:4',
  '4:3': 'Paysage 4:3',
  '4:5': 'Portrait social',
  '5:4': 'Paysage social',
  '9:16': 'Story / Vertical',
  '16:9': 'Bannière / Large',
  '21:9': 'Ultra large',
};

const IMAGE_SIZE_LABELS: Record<string, string> = {
  '512': 'Brouillon (512px)',
  '1K': 'Standard (1K)',
  '2K': 'Haute définition (2K)',
  '4K': 'Ultra (4K)',
};

const MODEL_OPTIONS = [
  { value: 'gemini-3-pro-image-preview', label: 'Pro (qualité max)' },
  { value: 'gemini-3.1-flash-image-preview', label: 'Flash (rapide)' },
] as const;

const THINKING_OPTIONS = [
  { value: 'off', label: 'Désactivé' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'High', label: 'Élevé' },
] as const;

interface OutputFormatSelectorProps {
  aspectRatio: string;
  imageSize: string;
  onAspectRatioChange: (value: string) => void;
  onImageSizeChange: (value: string) => void;
  imageModel: string;
  onImageModelChange: (value: string) => void;
  thinkingLevel: string;
  onThinkingLevelChange: (value: string) => void;
  disabled?: boolean;
}

export const OutputFormatSelector: React.FC<OutputFormatSelectorProps> = ({
  aspectRatio,
  imageSize,
  onAspectRatioChange,
  onImageSizeChange,
  imageModel,
  onImageModelChange,
  thinkingLevel,
  onThinkingLevelChange,
  disabled = false,
}) => {
  const isFlash = imageModel.includes('flash');

  return (
    <div className="space-y-4">
      {/* Modèle IA */}
      <div>
        <SectionLabel>MODÈLE IA</SectionLabel>
        <div className="flex gap-2">
          {MODEL_OPTIONS.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => !disabled && onImageModelChange(m.value)}
              className={`flex-1 text-xs py-1.5 rounded-lg transition-colors ${
                imageModel === m.value
                  ? 'bg-indigo-600 text-white font-semibold'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              } disabled:opacity-40`}
              disabled={disabled}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Thinking — seulement pour Flash */}
      {isFlash && (
        <div>
          <SectionLabel>NIVEAU DE RÉFLEXION</SectionLabel>
          <div className="flex gap-1">
            {THINKING_OPTIONS.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => !disabled && onThinkingLevelChange(t.value)}
                className={`flex-1 text-[10px] py-1 rounded-md transition-colors ${
                  thinkingLevel === t.value
                    ? 'bg-indigo-600 text-white font-semibold'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                } disabled:opacity-40`}
                disabled={disabled}
              >
                {t.label}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-gray-400 mt-1">
            Élevé = meilleure qualité, plus lent
          </p>
        </div>
      )}

      {/* Format */}
      <div>
        <SectionLabel>FORMAT DE SORTIE</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {ASPECT_RATIOS.map((ar) => (
            <PillButton
              key={ar.value}
              label={ASPECT_RATIO_LABELS[ar.value] || ar.label}
              active={aspectRatio === ar.value}
              onClick={() => !disabled && onAspectRatioChange(ar.value)}
            />
          ))}
        </div>
      </div>

      {/* Résolution */}
      <div>
        <SectionLabel>RÉSOLUTION</SectionLabel>
        <select
          value={imageSize}
          onChange={(e) => onImageSizeChange(e.target.value)}
          disabled={disabled}
          className="w-full bg-white border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-700 outline-none focus:border-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {IMAGE_SIZES.map((size) => (
            <option key={size.value} value={size.value}>
              {IMAGE_SIZE_LABELS[size.value] || size.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};

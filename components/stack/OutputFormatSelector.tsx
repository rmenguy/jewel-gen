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

interface OutputFormatSelectorProps {
  aspectRatio: string;
  imageSize: string;
  onAspectRatioChange: (value: string) => void;
  onImageSizeChange: (value: string) => void;
  disabled?: boolean;
}

export const OutputFormatSelector: React.FC<OutputFormatSelectorProps> = ({
  aspectRatio,
  imageSize,
  onAspectRatioChange,
  onImageSizeChange,
  disabled = false,
}) => {
  return (
    <div className="space-y-4">
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

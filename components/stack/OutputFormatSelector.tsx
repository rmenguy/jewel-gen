import React from 'react';
import { SectionLabel } from '../ui/SectionLabel';
import PillButton from '../ui/PillButton';
import { ASPECT_RATIOS, IMAGE_SIZES } from '../../services/geminiService';

/** Business-friendly labels per UI-SPEC */
const ASPECT_RATIO_LABELS: Record<string, string> = {
  '1:1': 'Square',
  '2:3': 'Portrait 2:3',
  '3:2': 'Landscape 3:2',
  '3:4': 'Portrait 3:4',
  '4:3': 'Landscape 4:3',
  '4:5': 'Social Portrait',
  '5:4': 'Social Landscape',
  '9:16': 'Story / Vertical',
  '16:9': 'Banner / Wide',
  '21:9': 'Ultra Wide',
};

/** Business-friendly resolution labels per UI-SPEC */
const IMAGE_SIZE_LABELS: Record<string, string> = {
  '512': 'Draft (512px)',
  '1K': 'Standard (1K)',
  '2K': 'High-Res (2K)',
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
      {/* Aspect Ratio Pills */}
      <div>
        <SectionLabel>OUTPUT FORMAT</SectionLabel>
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

      {/* Resolution Dropdown */}
      <div>
        <SectionLabel>RESOLUTION</SectionLabel>
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

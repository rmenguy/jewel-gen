import React from 'react';
import { SectionLabel } from '../ui/SectionLabel';
import DropZone from '../ui/DropZone';
import { Button } from '../Button';

interface BasePhotoPanelProps {
  baseImage: string | null;
  onBaseImageSet: (base64: string) => void;
  onLock: () => void;
  isLocked: boolean;
  disabled?: boolean;
}

export const BasePhotoPanel: React.FC<BasePhotoPanelProps> = ({
  baseImage,
  onBaseImageSet,
  onLock,
  isLocked,
  disabled = false,
}) => {
  return (
    <div className="min-h-[320px]">
      <SectionLabel>IMAGE DE BASE</SectionLabel>

      {!baseImage && (
        <DropZone
          onFileDrop={onBaseImageSet}
          label="Importez ou transférez une photo mannequin pour commencer votre composition."
          accept="image/*"
        />
      )}

      {baseImage && !isLocked && (
        <div className="flex flex-col items-center gap-4">
          <div className="w-full max-w-[280px] aspect-square bg-gray-50 rounded-lg overflow-hidden flex items-center justify-center">
            <img
              src={baseImage}
              alt="Mannequin de base"
              className="max-w-full max-h-full object-contain"
            />
          </div>
          <Button
            variant="primary"
            onClick={onLock}
            disabled={disabled}
            className="w-full"
          >
            Verrouiller l'image de base
          </Button>
        </div>
      )}

      {baseImage && isLocked && (
        <div className="flex flex-col items-center gap-3">
          <div className="w-full max-w-[280px] aspect-square border-2 border-indigo-600 rounded-lg overflow-hidden flex items-center justify-center bg-gray-50 relative">
            <img
              src={baseImage}
              alt="Mannequin de base"
              className="max-w-full max-h-full object-contain"
            />
            <div
              className="absolute top-2 right-2 w-7 h-7 bg-indigo-600 rounded-full flex items-center justify-center shadow-sm"
              aria-label="Image de base verrouillée"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
          </div>
          <span className="text-xs text-indigo-600 font-medium uppercase tracking-wider">
            Base verrouillée
          </span>
        </div>
      )}
    </div>
  );
};

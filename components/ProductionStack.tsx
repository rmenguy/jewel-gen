import React, { useState } from 'react';
import { useProductionStore } from '../stores/useProductionStore';
import { BasePhotoPanel } from './stack/BasePhotoPanel';
import { OutputFormatSelector } from './stack/OutputFormatSelector';

export const ProductionStack: React.FC = () => {
  const { stackSession, createStackSession, updateStackSession } = useProductionStore();

  // Local state for pre-session setup
  const [pendingBaseImage, setPendingBaseImage] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [imageSize, setImageSize] = useState('1K');

  const isLocked = stackSession !== null;
  const baseImage = isLocked ? stackSession.baseImage : pendingBaseImage;

  const handleLock = () => {
    if (!pendingBaseImage) return;
    createStackSession(pendingBaseImage, aspectRatio, imageSize);
  };

  const handleBaseImageSet = (base64: string) => {
    setPendingBaseImage(base64);
  };

  const handleAspectRatioChange = (value: string) => {
    setAspectRatio(value);
    if (stackSession) {
      updateStackSession({ aspectRatio: value });
    }
  };

  const handleImageSizeChange = (value: string) => {
    setImageSize(value);
    if (stackSession) {
      updateStackSession({ imageSize: value });
    }
  };

  return (
    <div className="h-full flex flex-col lg:flex-row gap-6">
      {/* Left Panel — Session Setup */}
      <div className="w-full lg:w-[300px] lg:flex-shrink-0 space-y-6 overflow-y-auto">
        <BasePhotoPanel
          baseImage={baseImage}
          onBaseImageSet={handleBaseImageSet}
          onLock={handleLock}
          isLocked={isLocked}
          disabled={stackSession?.status === 'executing'}
        />

        <OutputFormatSelector
          aspectRatio={isLocked ? stackSession.aspectRatio : aspectRatio}
          imageSize={isLocked ? stackSession.imageSize : imageSize}
          onAspectRatioChange={handleAspectRatioChange}
          onImageSizeChange={handleImageSizeChange}
          disabled={stackSession?.status === 'executing'}
        />
      </div>

      {/* Center Panel — Generation & Preview */}
      <div className="flex-1 min-h-0 flex flex-col">
        {!isLocked ? (
          <div className="flex-1 flex flex-col items-center justify-center bg-white border border-gray-200 rounded-2xl p-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              No Production Stack Session
            </h2>
            <p className="text-sm text-gray-500 text-center max-w-sm">
              Upload or transfer a base mannequin image to start building your jewelry stack.
            </p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center bg-white border border-gray-200 rounded-2xl p-8">
            <p className="text-sm text-gray-400">
              Generation preview area
            </p>
          </div>
        )}
      </div>

      {/* Right Panel — Stack Plan & Debug */}
      <div className="w-full lg:w-[300px] lg:flex-shrink-0">
        {!isLocked ? (
          <div className="flex flex-col items-center justify-center bg-white border border-gray-200 rounded-2xl p-8 h-full min-h-[200px]">
            <p className="text-sm text-gray-400 text-center">
              No layers yet. Add jewelry pieces to build your placement plan.
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center bg-white border border-gray-200 rounded-2xl p-8 h-full min-h-[200px]">
            <p className="text-sm text-gray-400">
              Stack plan area
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

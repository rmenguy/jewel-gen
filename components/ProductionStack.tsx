import React, { useState, useCallback } from 'react';
import { useProductionStore } from '../stores/useProductionStore';
import { StackLayer } from '../types';
import {
  executeStackPlan,
  initializeStepStates,
  compactSnapshots,
  retryStep,
  initFollowUpSession,
  sendFollowUpEdit,
} from '../services/stackEngine';
import { downloadBase64Image } from '../services/downloadService';

// Child components — Plans 01 + 02
import { BasePhotoPanel } from './stack/BasePhotoPanel';
import { OutputFormatSelector } from './stack/OutputFormatSelector';
import { StackPlanPanel } from './stack/StackPlanPanel';
import { GenerationProgressBar } from './stack/GenerationProgressBar';
import { FollowUpInput } from './stack/FollowUpInput';
import { StepHistoryStrip } from './stack/StepHistoryStrip';

// Child components — Plan 03
import { ReferenceBundlePanel } from './stack/ReferenceBundlePanel';
import { DebugInspector } from './stack/DebugInspector';
import { SessionToolbar } from './stack/SessionToolbar';
import { PresetModal } from './stack/PresetModal';

import { Button } from './Button';

export const ProductionStack: React.FC = () => {
  const {
    stackSession,
    createStackSession,
    updateStackSession,
    addLayerToStack,
    removeLayerFromStack,
    reorderStackLayers,
    updateStepState,
    resetStackSession,
    duplicateStackSession,
    stackPresets,
    saveStackPreset,
    loadStackPreset,
    deleteStackPreset,
  } = useProductionStore();

  // Local state for pre-session setup
  const [pendingBaseImage, setPendingBaseImage] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [imageSize, setImageSize] = useState('1K');

  // Step history viewer
  const [viewingStepIndex, setViewingStepIndex] = useState<number | null>(null);

  // Preset modal
  const [presetModalOpen, setPresetModalOpen] = useState(false);
  const [presetModalMode, setPresetModalMode] = useState<'save' | 'load'>('save');

  // Execution state
  const [isExecuting, setIsExecuting] = useState(false);
  const [isFollowingUp, setIsFollowingUp] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isLocked = stackSession !== null;
  const baseImage = isLocked ? stackSession.baseImage : pendingBaseImage;
  const isDisabled = stackSession?.status === 'executing' || isExecuting;

  // ── Handlers ────────────────────────────────────────────────

  const handleLock = useCallback(() => {
    if (!pendingBaseImage) return;
    createStackSession(pendingBaseImage, aspectRatio, imageSize);
  }, [pendingBaseImage, aspectRatio, imageSize, createStackSession]);

  const handleBaseImageSet = useCallback((base64: string) => {
    setPendingBaseImage(base64);
  }, []);

  const handleAspectRatioChange = useCallback((value: string) => {
    setAspectRatio(value);
    if (stackSession) {
      updateStackSession({ aspectRatio: value });
    }
  }, [stackSession, updateStackSession]);

  const handleImageSizeChange = useCallback((value: string) => {
    setImageSize(value);
    if (stackSession) {
      updateStackSession({ imageSize: value });
    }
  }, [stackSession, updateStackSession]);

  const handleAddLayer = useCallback((layer: StackLayer) => {
    addLayerToStack(layer);
  }, [addLayerToStack]);

  const handleRemoveLayer = useCallback((id: string) => {
    removeLayerFromStack(id);
  }, [removeLayerFromStack]);

  const handleReorderLayers = useCallback((layerIds: string[]) => {
    reorderStackLayers(layerIds);
  }, [reorderStackLayers]);

  // ── Engine execution (Pattern 1 from research) ─────────────

  const handleExecuteStack = useCallback(async () => {
    const store = useProductionStore.getState();
    const session = store.stackSession;
    if (!session || session.layers.length === 0) return;

    setIsExecuting(true);
    setError(null);
    setViewingStepIndex(null);

    // Work on a mutable copy (engine mutates the session object)
    const mutableSession = structuredClone(session);
    mutableSession.chatSession = null; // Not cloneable

    initializeStepStates(mutableSession);
    store.updateStackSession({ status: 'executing', stepStates: mutableSession.stepStates });

    try {
      await executeStackPlan(mutableSession, (stepIndex, stepState) => {
        // Real-time progress sync
        useProductionStore.getState().updateStepState(stepIndex, {
          status: stepState.status,
          currentAttempt: stepState.currentAttempt,
          snapshots: stepState.snapshots,
          approvedSnapshotIndex: stepState.approvedSnapshotIndex,
          error: stepState.error,
        });
        useProductionStore.getState().updateStackSession({
          currentImage: mutableSession.currentImage,
        });
      });

      // Compact memory after completion
      compactSnapshots(mutableSession);

      // Final store update
      store.updateStackSession({
        status: mutableSession.status,
        currentImage: mutableSession.currentImage,
        stepStates: mutableSession.stepStates,
        referenceBundle: mutableSession.referenceBundle,
        excludedReferences: mutableSession.excludedReferences,
        validationResults: mutableSession.validationResults,
      });
    } catch (err: any) {
      setError(err.message || 'Execution failed');
      store.updateStackSession({ status: 'planning' });
    } finally {
      setIsExecuting(false);
    }
  }, []);

  // ── Follow-up editing ──────────────────────────────────────

  const handleFollowUp = useCallback(async (prompt: string) => {
    const store = useProductionStore.getState();
    const session = store.stackSession;
    if (!session || !session.currentImage) return;

    setIsFollowingUp(true);
    setError(null);

    try {
      const mutableSession = { ...session };

      if (!mutableSession.chatSession) {
        initFollowUpSession(mutableSession);
        store.updateStackSession({ status: 'follow-up', chatSession: mutableSession.chatSession });
      }

      const newImage = await sendFollowUpEdit(mutableSession, prompt);
      store.updateStackSession({
        currentImage: newImage,
        followUpHistory: mutableSession.followUpHistory,
      });
    } catch (err: any) {
      setError(err.message || 'Follow-up edit failed');
    } finally {
      setIsFollowingUp(false);
    }
  }, []);

  // ── Step history ───────────────────────────────────────────

  const handleStepClick = useCallback((stepIndex: number) => {
    setViewingStepIndex((prev) => (prev === stepIndex ? null : stepIndex));
  }, []);

  // Determine the image to display in center panel
  const getDisplayImage = (): string | null => {
    if (!stackSession) return null;

    if (viewingStepIndex !== null) {
      const step = stackSession.stepStates[viewingStepIndex];
      if (step?.approvedSnapshotIndex !== null && step?.snapshots.length > 0) {
        return step.snapshots[step.approvedSnapshotIndex!]?.outputImage || null;
      }
    }

    return stackSession.currentImage;
  };

  const displayImage = getDisplayImage();

  // ── Download ───────────────────────────────────────────────

  const handleDownload = useCallback(() => {
    if (!displayImage) return;
    const sessionId = stackSession?.id?.slice(0, 8) || 'stack';
    downloadBase64Image(displayImage, `stack-${sessionId}-${Date.now()}.png`);
  }, [displayImage, stackSession?.id]);

  // ── Duplicate ──────────────────────────────────────────────

  const handleDuplicate = useCallback(() => {
    duplicateStackSession();
    console.log('Session duplicated. Modify and re-run.');
  }, [duplicateStackSession]);

  // ── Preset modal ───────────────────────────────────────────

  const handleOpenSavePreset = useCallback(() => {
    setPresetModalMode('save');
    setPresetModalOpen(true);
  }, []);

  const handleOpenLoadPreset = useCallback(() => {
    setPresetModalMode('load');
    setPresetModalOpen(true);
  }, []);

  const handleSavePreset = useCallback((name: string) => {
    saveStackPreset(name);
  }, [saveStackPreset]);

  const handleLoadPreset = useCallback((presetId: string) => {
    loadStackPreset(presetId);
  }, [loadStackPreset]);

  const handleDeletePreset = useCallback((presetId: string) => {
    deleteStackPreset(presetId);
  }, [deleteStackPreset]);

  // ── Render ─────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col">
      {/* Session Toolbar — only when session exists */}
      {stackSession && (
        <SessionToolbar
          sessionId={stackSession.id}
          onDuplicate={handleDuplicate}
          onSavePreset={handleOpenSavePreset}
          onLoadPreset={handleOpenLoadPreset}
          onClearSession={resetStackSession}
          disabled={isDisabled}
        />
      )}

      {/* 3-column layout */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-6">
        {/* Left Panel — Session Setup */}
        <div className="w-full lg:w-[300px] lg:flex-shrink-0 space-y-6 overflow-y-auto">
          <BasePhotoPanel
            baseImage={baseImage}
            onBaseImageSet={handleBaseImageSet}
            onLock={handleLock}
            isLocked={isLocked}
            disabled={isDisabled}
          />

          <OutputFormatSelector
            aspectRatio={isLocked ? stackSession!.aspectRatio : aspectRatio}
            imageSize={isLocked ? stackSession!.imageSize : imageSize}
            onAspectRatioChange={handleAspectRatioChange}
            onImageSizeChange={handleImageSizeChange}
            disabled={isDisabled}
          />

          <ReferenceBundlePanel
            referenceBundle={stackSession?.referenceBundle ?? null}
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
            <div className="flex-1 min-h-0 flex flex-col bg-white border border-gray-200 rounded-2xl overflow-hidden">
              {/* Main image display */}
              <div className="flex-1 min-h-0 relative flex items-center justify-center p-4">
                {displayImage ? (
                  <img
                    src={displayImage}
                    alt="Stack result"
                    className="max-w-full max-h-full object-contain rounded-lg"
                  />
                ) : (
                  <p className="text-sm text-gray-400">
                    {stackSession.status === 'executing'
                      ? 'Generating...'
                      : 'Add layers and execute to see results'}
                  </p>
                )}

                {/* Step viewing indicator */}
                {viewingStepIndex !== null && (
                  <div className="absolute top-3 left-3 bg-indigo-600 text-white text-xs font-medium px-2 py-1 rounded">
                    Viewing Step {viewingStepIndex + 1}
                  </div>
                )}
              </div>

              {/* Generation Progress Bar */}
              {stackSession.stepStates.length > 0 && (
                <div className="px-4 pb-2">
                  <GenerationProgressBar
                    stepStates={stackSession.stepStates}
                    layers={stackSession.layers}
                  />
                </div>
              )}

              {/* Step History Strip */}
              {stackSession.stepStates.length > 0 && (
                <div className="px-4">
                  <StepHistoryStrip
                    stepStates={stackSession.stepStates}
                    currentViewIndex={viewingStepIndex}
                    onStepClick={handleStepClick}
                  />
                </div>
              )}

              {/* Error display */}
              {error && (
                <div className="px-4 py-2">
                  <p className="text-xs text-red-600 bg-red-50 rounded-lg p-2">{error}</p>
                </div>
              )}

              {/* Action buttons + Follow-up — pinned at bottom */}
              <div className="flex-shrink-0">
                {/* Execute / Download buttons */}
                {stackSession.status === 'planning' && stackSession.layers.length >= 1 && (
                  <div className="px-4 py-3 border-t border-gray-200">
                    <Button
                      variant="primary"
                      onClick={handleExecuteStack}
                      isLoading={isExecuting}
                      disabled={isDisabled}
                      className="w-full"
                    >
                      Execute Stack
                    </Button>
                  </div>
                )}

                {displayImage && (
                  <div className="px-4 pb-2">
                    <Button
                      variant="secondary"
                      onClick={handleDownload}
                      className="w-full text-xs"
                    >
                      Download Image
                    </Button>
                  </div>
                )}

                {/* Follow-up input — only after execution completes */}
                {(stackSession.status === 'completed' || stackSession.status === 'follow-up') && (
                  <FollowUpInput
                    onSendEdit={handleFollowUp}
                    disabled={isDisabled}
                    isLoading={isFollowingUp}
                  />
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Panel — Stack Plan & Debug */}
        <div className="w-full lg:w-[300px] lg:flex-shrink-0 overflow-y-auto">
          {!isLocked ? (
            <div className="flex flex-col items-center justify-center bg-white border border-gray-200 rounded-2xl p-8 h-full min-h-[200px]">
              <p className="text-sm text-gray-400 text-center">
                No layers yet. Add jewelry pieces to build your placement plan.
              </p>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden h-full flex flex-col">
              <StackPlanPanel
                layers={stackSession.layers}
                stepStates={stackSession.stepStates}
                onReorder={handleReorderLayers}
                onRemove={handleRemoveLayer}
                onAddLayer={handleAddLayer}
                disabled={isDisabled}
              />

              {/* Debug Inspector — collapsed by default */}
              <div className="px-3 pb-3">
                <DebugInspector
                  stepStates={stackSession.stepStates}
                  excludedReferences={stackSession.excludedReferences}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Preset Modal */}
      <PresetModal
        isOpen={presetModalOpen}
        mode={presetModalMode}
        presets={stackPresets}
        onSave={handleSavePreset}
        onLoad={handleLoadPreset}
        onDelete={handleDeletePreset}
        onClose={() => setPresetModalOpen(false)}
      />
    </div>
  );
};

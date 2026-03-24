import React, { useState, useCallback } from 'react';
import { useProductionStore } from '../stores/useProductionStore';
import { StackLayer } from '../types';
import {
  executeComposition,
  resolveGenerationFlow,
  initializeStepStates,
  compactSnapshots,
  retryStep,
  sendFollowUpEdit,
} from '../services/stackEngine';
import type { GenerationFlow } from '../services/stackEngine';
import { downloadBase64Image } from '../services/downloadService';

// Panneaux enfants
import { BasePhotoPanel } from './stack/BasePhotoPanel';
import { OutputFormatSelector } from './stack/OutputFormatSelector';
import { StackPlanPanel } from './stack/StackPlanPanel';
import { FollowUpInput } from './stack/FollowUpInput';
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

  // État local pour la configuration pré-session
  const [pendingBaseImage, setPendingBaseImage] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [imageSize, setImageSize] = useState('1K');

  // Modale de préréglages
  const [presetModalOpen, setPresetModalOpen] = useState(false);
  const [presetModalMode, setPresetModalMode] = useState<'save' | 'load'>('save');

  // État d'exécution
  const [isExecuting, setIsExecuting] = useState(false);
  const [isFollowingUp, setIsFollowingUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progressText, setProgressText] = useState<string | null>(null);

  const isLocked = stackSession !== null;
  const baseImage = isLocked ? stackSession.baseImage : pendingBaseImage;
  const isDisabled = stackSession?.status === 'executing' || isExecuting;

  // L'image finale composite — toujours une seule
  const displayImage = stackSession?.currentImage ?? null;

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

  // ── Détection du flot de génération ──────────────────────────

  const detectedFlow: GenerationFlow | null = stackSession
    ? resolveGenerationFlow(stackSession)
    : null;

  // ── Exécution du moteur de composition ──────────────────────

  const handleExecuteStack = useCallback(async () => {
    const store = useProductionStore.getState();
    const session = store.stackSession;
    if (!session || session.layers.length === 0) return;

    setIsExecuting(true);
    setError(null);

    const mutableSession = structuredClone(session);
    mutableSession.chatSession = null;

    initializeStepStates(mutableSession);
    store.updateStackSession({ status: 'executing', stepStates: mutableSession.stepStates });

    try {
      await executeComposition(
        mutableSession,
        // onProgress — met à jour le texte de progression
        (message) => setProgressText(message),
        // onStepUpdate — synchronise le store en temps réel
        (stepIndex, stepState) => {
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
        },
      );

      compactSnapshots(mutableSession);

      store.updateStackSession({
        status: mutableSession.status,
        currentImage: mutableSession.currentImage,
        stepStates: mutableSession.stepStates,
        referenceBundle: mutableSession.referenceBundle,
        excludedReferences: mutableSession.excludedReferences,
        validationResults: mutableSession.validationResults,
      });

      setProgressText('Composition terminée ✓');
      setTimeout(() => setProgressText(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la composition');
      store.updateStackSession({ status: 'planning' });
      setProgressText(null);
    } finally {
      setIsExecuting(false);
    }
  }, []);

  // ── Modification de suivi ───────────────────────────────────

  const handleFollowUp = useCallback(async (prompt: string) => {
    const store = useProductionStore.getState();
    const session = store.stackSession;
    if (!session || !session.currentImage) return;

    setIsFollowingUp(true);
    setError(null);

    try {
      const mutableSession = { ...session };

      const newImage = await sendFollowUpEdit(mutableSession, prompt);
      store.updateStackSession({
        currentImage: newImage,
        followUpHistory: mutableSession.followUpHistory,
        chatSession: mutableSession.chatSession,
        status: 'follow-up',
      });
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la modification');
    } finally {
      setIsFollowingUp(false);
    }
  }, []);

  // ── Réessayer une étape spécifique ──────────────────────────

  const handleRetryStep = useCallback(async (layerId: string) => {
    const store = useProductionStore.getState();
    const session = store.stackSession;
    if (!session) return;

    const stepIndex = session.layers.findIndex((l) => l.id === layerId);
    if (stepIndex === -1) return;

    setIsExecuting(true);
    setError(null);
    setProgressText(`Nouveau placement de ${session.layers[stepIndex].name}…`);

    try {
      const mutableSession = structuredClone(session);
      mutableSession.chatSession = null;

      await retryStep(mutableSession, stepIndex, (msg) => setProgressText(msg));

      store.updateStackSession({
        currentImage: mutableSession.currentImage,
        stepStates: mutableSession.stepStates,
      });

      setProgressText('Composition mise à jour ✓');
      setTimeout(() => setProgressText(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Échec du nouveau placement');
      setProgressText(null);
    } finally {
      setIsExecuting(false);
    }
  }, []);

  // ── Téléchargement ──────────────────────────────────────────

  const handleDownload = useCallback(() => {
    if (!displayImage) return;
    const sessionId = stackSession?.id?.slice(0, 8) || 'composition';
    downloadBase64Image(displayImage, `composition-${sessionId}-${Date.now()}.png`);
  }, [displayImage, stackSession?.id]);

  // ── Dupliquer / Préréglages ─────────────────────────────────

  const handleDuplicate = useCallback(() => {
    duplicateStackSession();
  }, [duplicateStackSession]);

  const handleOpenSavePreset = useCallback(() => {
    setPresetModalMode('save');
    setPresetModalOpen(true);
  }, []);

  const handleOpenLoadPreset = useCallback(() => {
    setPresetModalMode('load');
    setPresetModalOpen(true);
  }, []);

  // ── Rendu ───────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col">
      {/* Barre de session */}
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

      {/* Disposition 3 colonnes */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-6">
        {/* Panneau gauche — Configuration */}
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

        {/* Panneau central — Composition unique */}
        <div className="flex-1 min-h-0 flex flex-col">
          {!isLocked ? (
            <div className="flex-1 flex flex-col items-center justify-center bg-white border border-gray-200 rounded-2xl p-8">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">
                Aucune session de composition
              </h2>
              <p className="text-sm text-gray-500 text-center max-w-sm">
                Importez ou transférez une photo mannequin pour commencer à composer vos bijoux.
              </p>
            </div>
          ) : (
            <div className="flex-1 min-h-0 flex flex-col bg-white border border-gray-200 rounded-2xl overflow-hidden">
              {/* Zone d'affichage de l'image finale unique */}
              <div className="flex-1 min-h-0 relative flex items-center justify-center p-4">
                {displayImage ? (
                  <img
                    src={displayImage}
                    alt="Composition finale"
                    className="max-w-full max-h-full object-contain rounded-lg"
                  />
                ) : (
                  <p className="text-sm text-gray-400">
                    {stackSession.status === 'executing'
                      ? 'Composition en cours…'
                      : 'Ajoutez des calques bijoux puis lancez la composition'}
                  </p>
                )}

                {/* Indicateur de progression — simple texte, pas de barre segmentée */}
                {progressText && (
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-gray-900/80 text-white text-xs font-medium px-4 py-2 rounded-full backdrop-blur-sm">
                    {progressText}
                  </div>
                )}
              </div>

              {/* Erreur */}
              {error && (
                <div className="px-4 py-2">
                  <p className="text-xs text-red-600 bg-red-50 rounded-lg p-2">{error}</p>
                </div>
              )}

              {/* Actions — toujours en bas */}
              <div className="flex-shrink-0">
                {stackSession.status === 'planning' && stackSession.layers.length >= 1 && (
                  <div className="px-4 py-3 border-t border-gray-200">
                    <Button
                      variant="primary"
                      onClick={handleExecuteStack}
                      isLoading={isExecuting}
                      disabled={isDisabled}
                      className="w-full"
                    >
                      {detectedFlow === 'direct'
                        ? `Composer (${stackSession!.layers.length} bijoux)`
                        : 'Ajouter à la composition'}
                    </Button>
                  </div>
                )}

                {displayImage && !isExecuting && (
                  <div className="px-4 pb-2">
                    <Button
                      variant="secondary"
                      onClick={handleDownload}
                      className="w-full text-xs"
                    >
                      Télécharger l'image
                    </Button>
                  </div>
                )}

                {/* Modification de suivi — après la composition terminée */}
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

        {/* Panneau droit — Plan de superposition & Debug */}
        <div className="w-full lg:w-[300px] lg:flex-shrink-0 overflow-y-auto">
          {!isLocked ? (
            <div className="flex flex-col items-center justify-center bg-white border border-gray-200 rounded-2xl p-8 h-full min-h-[200px]">
              <p className="text-sm text-gray-400 text-center">
                Aucun calque. Ajoutez des bijoux pour construire votre plan de superposition.
              </p>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden h-full flex flex-col">
              <StackPlanPanel
                layers={stackSession.layers}
                stepStates={stackSession.stepStates}
                onReorder={handleReorderLayers}
                onRemove={handleRemoveLayer}
                onRetry={handleRetryStep}
                onAddLayer={handleAddLayer}
                disabled={isDisabled}
              />

              {/* Inspecteur debug — replié par défaut */}
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

      {/* Modale de préréglages */}
      <PresetModal
        isOpen={presetModalOpen}
        mode={presetModalMode}
        presets={stackPresets}
        onSave={(name) => saveStackPreset(name)}
        onLoad={(id) => loadStackPreset(id)}
        onDelete={(id) => deleteStackPreset(id)}
        onClose={() => setPresetModalOpen(false)}
      />
    </div>
  );
};

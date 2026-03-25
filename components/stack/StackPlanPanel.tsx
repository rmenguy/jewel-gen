import React, { useCallback } from 'react';
import { StackLayer, StepState } from '../../types';
import { SectionLabel } from '../ui/SectionLabel';
import StackLayerRow from './StackLayerRow';
import AddLayerForm from './AddLayerForm';

interface StackPlanPanelProps {
  layers: StackLayer[];
  stepStates: StepState[];
  onReorder: (layerIds: string[]) => void;
  onRemove: (id: string) => void;
  onRetry?: (id: string) => void;
  onAddLayer: (layer: StackLayer) => void;
  selectedLayerIds?: string[];
  onToggleSelect?: (id: string) => void;
  onRefineSelection?: () => void;
  isRefining?: boolean;
  selectable?: boolean;
  disabled?: boolean;
}

export const StackPlanPanel: React.FC<StackPlanPanelProps> = ({
  layers,
  stepStates,
  onReorder,
  onRemove,
  onRetry,
  onAddLayer,
  selectedLayerIds = [],
  onToggleSelect,
  onRefineSelection,
  isRefining = false,
  selectable = false,
  disabled = false,
}) => {
  const handleReorder = useCallback(
    (dragId: string, dropId: string) => {
      const currentIds = layers.map((l) => l.id);
      const filtered = currentIds.filter((id) => id !== dragId);
      const dropIndex = filtered.indexOf(dropId);
      if (dropIndex === -1) return;
      filtered.splice(dropIndex, 0, dragId);
      onReorder(filtered);
    },
    [layers, onReorder]
  );

  const getStepState = useCallback(
    (layerId: string): StepState | undefined =>
      stepStates.find((s) => s.layerId === layerId),
    [stepStates]
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 pt-4 pb-2">
        <SectionLabel>Plan de superposition</SectionLabel>
        {layers.length > 0 && (
          <span className="text-[10px] font-medium text-gray-400 ml-1">
            ({layers.length} calque{layers.length !== 1 ? 's' : ''})
          </span>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {layers.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-gray-400">
              Aucun calque. Ajoutez des bijoux pour construire votre plan de superposition.
            </p>
          </div>
        ) : (
          <div>
            {layers.map((layer) => (
              <StackLayerRow
                key={layer.id}
                layer={layer}
                stepState={getStepState(layer.id)}
                onReorder={handleReorder}
                onRemove={onRemove}
                onRetry={onRetry}
                selectable={selectable}
                isSelected={selectedLayerIds.includes(layer.id)}
                onToggleSelect={onToggleSelect}
                disabled={disabled}
              />
            ))}
          </div>
        )}
      </div>

      {/* Bouton d'amélioration ciblée */}
      {selectable && selectedLayerIds.length > 0 && onRefineSelection && (
        <div className="px-3 py-2 border-t border-gray-200">
          <button
            type="button"
            onClick={onRefineSelection}
            disabled={disabled || isRefining}
            className="w-full text-xs font-semibold py-2 px-3 rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {isRefining ? (
              <>
                <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Amélioration en cours…
              </>
            ) : (
              `✦ Améliorer ${selectedLayerIds.length > 1 ? `${selectedLayerIds.length} bijoux` : 'ce bijou'}`
            )}
          </button>
        </div>
      )}

      <div className="flex-shrink-0">
        <AddLayerForm onAddLayer={onAddLayer} disabled={disabled} />
      </div>
    </div>
  );
};

export default StackPlanPanel;

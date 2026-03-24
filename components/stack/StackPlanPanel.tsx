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
  disabled?: boolean;
}

export const StackPlanPanel: React.FC<StackPlanPanelProps> = ({
  layers,
  stepStates,
  onReorder,
  onRemove,
  onRetry,
  onAddLayer,
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
                disabled={disabled}
              />
            ))}
          </div>
        )}
      </div>

      <div className="flex-shrink-0">
        <AddLayerForm onAddLayer={onAddLayer} disabled={disabled} />
      </div>
    </div>
  );
};

export default StackPlanPanel;

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
  // Handle reorder: remove dragId from current position, insert before dropId
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

  // Find step state for a given layer
  const getStepState = useCallback(
    (layerId: string): StepState | undefined =>
      stepStates.find((s) => s.layerId === layerId),
    [stepStates]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 pt-4 pb-2">
        <SectionLabel>Stack Plan</SectionLabel>
        {layers.length > 0 && (
          <span className="text-[10px] font-medium text-gray-400 ml-1">
            ({layers.length} layer{layers.length !== 1 ? 's' : ''})
          </span>
        )}
      </div>

      {/* Layer list */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {layers.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-gray-400">
              No layers yet. Add jewelry pieces to build your placement plan.
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

      {/* Add layer form at bottom */}
      <div className="flex-shrink-0">
        <AddLayerForm onAddLayer={onAddLayer} disabled={disabled} />
      </div>
    </div>
  );
};

export default StackPlanPanel;

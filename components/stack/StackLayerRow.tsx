import React, { useState, useCallback } from 'react';
import { StackLayer, StepState } from '../../types';

interface StackLayerRowProps {
  layer: StackLayer;
  stepState?: StepState;
  onReorder: (dragId: string, dropId: string) => void;
  onRemove: (id: string) => void;
  onRetry?: (id: string) => void;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
  selectable?: boolean;
  disabled?: boolean;
}

const ZONE_LABELS: Record<string, string> = {
  'neck-base': 'Base du cou',
  'collarbone': 'Clavicule',
  'upper-chest': 'Haut poitrine',
  'mid-chest': 'Milieu poitrine',
  'navel': 'Nombril',
  'ear-lobe': 'Lobe',
  'ear-upper': 'Haut oreille',
  'wrist': 'Poignet',
  'finger': 'Doigt',
};

const StackLayerRow: React.FC<StackLayerRowProps> = React.memo(({
  layer,
  stepState,
  onReorder,
  onRemove,
  onRetry,
  isSelected = false,
  onToggleSelect,
  selectable = false,
  disabled = false,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isDropTarget, setIsDropTarget] = useState(false);

  const status = stepState?.status;

  const handleDragStart = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData('text/plain', layer.id);
    e.dataTransfer.effectAllowed = 'move';
    setIsDragging(true);
  }, [layer.id]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsDropTarget(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDropTarget(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDropTarget(false);
    const dragId = e.dataTransfer.getData('text/plain');
    if (dragId && dragId !== layer.id) {
      onReorder(dragId, layer.id);
    }
  }, [layer.id, onReorder]);

  let rowClasses = 'flex items-center gap-3 px-3 py-2 transition-all duration-150 relative';

  if (isDragging) {
    rowClasses += ' bg-indigo-50 border border-indigo-300 shadow-lg opacity-90 rounded-md';
  } else if (isDropTarget) {
    rowClasses += ' bg-indigo-100 border-t-2 border-indigo-400';
  } else {
    rowClasses += ' bg-white border-b border-gray-200 hover:bg-gray-50';
  }

  if (status === 'executing') {
    rowClasses += ' border-l-[3px] border-l-indigo-600';
  } else if (status === 'completed') {
    rowClasses += ' border-l-[3px] border-l-emerald-500';
  } else if (status === 'failed') {
    rowClasses += ' border-l-[3px] border-l-red-500';
  }

  return (
    <div
      draggable={!disabled}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={rowClasses}
    >
      <button
        type="button"
        className="flex-shrink-0 cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 p-1"
        aria-label={`Réordonner ${layer.name}`}
        tabIndex={-1}
      >
        <svg width="12" height="20" viewBox="0 0 12 20" fill="currentColor">
          <circle cx="3" cy="3" r="1.5" />
          <circle cx="9" cy="3" r="1.5" />
          <circle cx="3" cy="10" r="1.5" />
          <circle cx="9" cy="10" r="1.5" />
          <circle cx="3" cy="17" r="1.5" />
          <circle cx="9" cy="17" r="1.5" />
        </svg>
      </button>

      {/* Checkbox de sélection — visible quand composition terminée */}
      {selectable && onToggleSelect && (
        <button
          type="button"
          onClick={() => onToggleSelect(layer.id)}
          className={`flex-shrink-0 w-5 h-5 rounded border-2 transition-colors flex items-center justify-center ${
            isSelected
              ? 'bg-indigo-600 border-indigo-600'
              : 'border-gray-300 hover:border-indigo-400'
          }`}
          aria-label={`Sélectionner ${layer.name}`}
        >
          {isSelected && (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </button>
      )}

      <div className="relative flex-shrink-0 w-10 h-10 rounded overflow-hidden bg-gray-100">
        <img
          src={layer.productImage}
          alt={layer.name}
          className={`w-full h-full object-cover ${status === 'executing' ? 'animate-pulse' : ''}`}
        />
        {status === 'completed' && (
          <div className="absolute inset-0 flex items-center justify-center bg-emerald-500/20">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
        )}
        {status === 'failed' && (
          <div className="absolute inset-0 flex items-center justify-center bg-red-500/20">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="8" x2="12" y2="12" />
              <circle cx="12" cy="16" r="0.5" fill="#dc2626" />
            </svg>
          </div>
        )}
      </div>

      <span className="flex-1 text-sm text-gray-700 truncate">{layer.name}</span>

      <span className="flex-shrink-0 text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
        {ZONE_LABELS[layer.targetZone] || layer.targetZone}
      </span>

      {layer.sizePreset && layer.sizePreset !== 'medium' && (
        <span className="flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600">
          {layer.sizePreset === 'very_small' ? 'XS' : layer.sizePreset === 'small' ? 'S' : 'L'}
        </span>
      )}

      {layer.earringMode && (
        <span className="flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-600">
          {layer.earringMode === 'pair' ? '×2' : layer.earringSide === 'left' ? '←G' : 'D→'}
        </span>
      )}

      {status === 'failed' && onRetry && (
        <button
          type="button"
          onClick={() => onRetry(layer.id)}
          disabled={disabled}
          className="flex-shrink-0 px-2 py-1 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded transition-colors disabled:opacity-40"
          aria-label={`Réessayer ${layer.name}`}
        >
          Réessayer
        </button>
      )}

      <button
        type="button"
        onClick={() => onRemove(layer.id)}
        disabled={disabled}
        className="flex-shrink-0 p-1 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-40"
        aria-label={`Retirer ${layer.name}`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
});

StackLayerRow.displayName = 'StackLayerRow';

export default StackLayerRow;

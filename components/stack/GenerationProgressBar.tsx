import React from 'react';
import { StepState, StackLayer } from '../../types';

interface GenerationProgressBarProps {
  stepStates: StepState[];
  layers: StackLayer[];
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-200',
  executing: 'bg-indigo-600 animate-pulse',
  validating: 'bg-amber-500',
  completed: 'bg-emerald-500',
  failed: 'bg-red-500',
  retrying: 'bg-amber-500 animate-pulse',
};

export const GenerationProgressBar: React.FC<GenerationProgressBarProps> = ({
  stepStates,
  layers,
}) => {
  if (stepStates.length === 0) return null;

  // Find the currently executing step for status text
  const executingStep = stepStates.find(
    (s) => s.status === 'executing' || s.status === 'validating' || s.status === 'retrying'
  );
  const executingIndex = executingStep
    ? stepStates.indexOf(executingStep)
    : -1;
  const completedCount = stepStates.filter((s) => s.status === 'completed').length;

  // Derive status text
  let statusText = '';
  if (executingStep) {
    const layer = layers.find((l) => l.id === executingStep.layerId);
    const stepNum = executingIndex + 1;
    const verb =
      executingStep.status === 'validating'
        ? 'Validating'
        : executingStep.status === 'retrying'
        ? 'Retrying'
        : 'Applying';
    statusText = `Step ${stepNum}/${stepStates.length}: ${verb} ${layer?.name || 'layer'}...`;
  } else if (completedCount === stepStates.length) {
    statusText = `All ${stepStates.length} steps completed`;
  } else {
    statusText = `${completedCount}/${stepStates.length} steps completed`;
  }

  return (
    <div className="w-full">
      {/* Progress bar segments */}
      <div className="flex gap-0.5 h-2 rounded-full overflow-hidden">
        {stepStates.map((step, i) => {
          const layer = layers.find((l) => l.id === step.layerId);
          const colorClass = STATUS_COLORS[step.status] || 'bg-gray-200';
          return (
            <div
              key={step.layerId || i}
              className={`flex-1 ${colorClass} transition-colors duration-300`}
              title={layer?.name || `Step ${i + 1}`}
            />
          );
        })}
      </div>

      {/* Status text below */}
      <p className="text-xs text-gray-500 mt-1.5">{statusText}</p>
    </div>
  );
};

export default GenerationProgressBar;

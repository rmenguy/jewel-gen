import React from 'react';
import { StepState } from '../../types';

interface StepHistoryStripProps {
  stepStates: StepState[];
  currentViewIndex: number | null;
  onStepClick: (stepIndex: number) => void;
}

const StepThumbnail: React.FC<{
  src: string;
  index: number;
  isSelected: boolean;
  onClick: () => void;
}> = React.memo(({ src, index, isSelected, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex-shrink-0 w-16 h-16 rounded-md overflow-hidden transition-all duration-150 ${
      isSelected ? 'ring-2 ring-indigo-600' : 'ring-1 ring-gray-200 hover:ring-gray-400'
    }`}
    aria-label={`View step ${index + 1} result`}
  >
    <img
      src={src}
      alt={`Step ${index + 1}`}
      className="w-full h-full object-cover"
    />
  </button>
));
StepThumbnail.displayName = 'StepThumbnail';

export const StepHistoryStrip: React.FC<StepHistoryStripProps> = ({
  stepStates,
  currentViewIndex,
  onStepClick,
}) => {
  // Only show completed steps with approved snapshots
  const completedSteps = stepStates
    .map((step, index) => ({ step, index }))
    .filter(
      ({ step }) =>
        step.status === 'completed' &&
        step.approvedSnapshotIndex !== null &&
        step.snapshots.length > 0
    );

  if (completedSteps.length === 0) return null;

  return (
    <div className="flex gap-2 overflow-x-auto py-2 px-1 scrollbar-thin">
      {completedSteps.map(({ step, index }) => {
        const snapshot = step.snapshots[step.approvedSnapshotIndex!];
        if (!snapshot?.outputImage) return null;

        return (
          <StepThumbnail
            key={step.layerId}
            src={snapshot.outputImage}
            index={index}
            isSelected={currentViewIndex === index}
            onClick={() => onStepClick(index)}
          />
        );
      })}
    </div>
  );
};

export default StepHistoryStrip;

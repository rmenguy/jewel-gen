import React, { useState, useMemo } from 'react';
import { StepState, ReferenceImage } from '../../types';
import { SectionLabel } from '../ui/SectionLabel';

interface DebugInspectorProps {
  stepStates: StepState[];
  excludedReferences: ReferenceImage[];
}

export const DebugInspector: React.FC<DebugInspectorProps> = ({
  stepStates,
  excludedReferences,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const latestSnapshot = useMemo(() => {
    for (let i = stepStates.length - 1; i >= 0; i--) {
      const step = stepStates[i];
      if (step.status === 'completed' && step.approvedSnapshotIndex !== null) {
        return step.snapshots[step.approvedSnapshotIndex] ?? null;
      }
    }
    return null;
  }, [stepStates]);

  const hasCompletedStep = stepStates.some((s) => s.status === 'completed');

  if (!hasCompletedStep) return null;

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between py-2 text-left"
        aria-label={isOpen ? 'Replier l\'inspecteur' : 'Déplier l\'inspecteur'}
      >
        <SectionLabel>INSPECTEUR DE RÉFÉRENCES</SectionLabel>
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className={`text-gray-400 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {isOpen && latestSnapshot && (
        <div className="space-y-4 mt-2">
          <div>
            <p className="text-xs font-medium text-gray-600 mb-1">
              Références incluses ({latestSnapshot.referencesUsed.length})
            </p>
            {latestSnapshot.referencesUsed.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {latestSnapshot.referencesUsed.map((ref_, idx) => (
                  <div
                    key={ref_.id || idx}
                    className="w-10 h-10 rounded overflow-hidden bg-gray-100 border border-gray-200"
                    title={ref_.role}
                  >
                    {ref_.base64 ? (
                      <img
                        src={ref_.base64.startsWith('data:') ? ref_.base64 : `data:${ref_.mimeType};base64,${ref_.base64}`}
                        alt={ref_.role}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300 text-[8px]">IMG</div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400">Aucune</p>
            )}
          </div>

          <div>
            <p className="text-xs font-medium text-gray-600 mb-1">
              Références exclues ({excludedReferences.length})
            </p>
            {excludedReferences.length > 0 ? (
              <ul className="space-y-1">
                {excludedReferences.map((ref_, idx) => (
                  <li key={ref_.id || idx} className="text-xs text-gray-500">
                    {ref_.role} (type : {ref_.kind}, priorité : {ref_.priority})
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-gray-400">Aucune</p>
            )}
          </div>

          <div>
            <p className="text-xs font-medium text-gray-600 mb-1">
              Configuration de génération
            </p>
            <pre className="font-mono text-xs bg-gray-50 p-2 rounded text-gray-700 overflow-x-auto">
              {JSON.stringify(latestSnapshot.generationConfig, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};

export default DebugInspector;

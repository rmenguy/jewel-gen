import React, { useState } from 'react';
import { ReferenceBundle, ReferenceImage } from '../../types';
import { SectionLabel } from '../ui/SectionLabel';

interface ReferenceBundlePanelProps {
  referenceBundle: ReferenceBundle | null;
}

const SECTION_CONFIG: { key: keyof ReferenceBundle; label: string }[] = [
  { key: 'characterReferences', label: 'Personnage' },
  { key: 'objectReferences', label: 'Objet' },
  { key: 'compositionReferences', label: 'Composition' },
  { key: 'styleReferences', label: 'Style' },
];

const ReferenceItem: React.FC<{ ref_: ReferenceImage }> = ({ ref_ }) => (
  <div className="flex items-center gap-2 py-1">
    <div className="flex-shrink-0 w-10 h-10 rounded overflow-hidden bg-gray-100 border border-gray-200">
      {ref_.base64 ? (
        <img
          src={ref_.base64.startsWith('data:') ? ref_.base64 : `data:${ref_.mimeType};base64,${ref_.base64}`}
          alt={ref_.role}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-gray-400 text-[10px]">N/A</div>
      )}
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-xs text-gray-700 truncate">{ref_.role}</p>
      <p className="text-[10px] text-gray-400">Priorité : {ref_.priority}</p>
    </div>
  </div>
);

const CollapsibleSection: React.FC<{
  label: string;
  count: number;
  references: ReferenceImage[];
}> = ({ label, count, references }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-2 py-2 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="text-xs font-medium text-gray-700">
          {label}
          <span className="ml-1.5 text-[10px] font-semibold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
            {count}
          </span>
        </span>
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className={`text-gray-400 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {isOpen && references.length > 0 && (
        <div className="px-2 pb-2 space-y-1">
          {references.map((ref_) => (
            <ReferenceItem key={ref_.id} ref_={ref_} />
          ))}
        </div>
      )}
    </div>
  );
};

export const ReferenceBundlePanel: React.FC<ReferenceBundlePanelProps> = ({
  referenceBundle,
}) => {
  return (
    <div>
      <SectionLabel>GROUPE DE RÉFÉRENCES</SectionLabel>

      {!referenceBundle ? (
        <p className="text-xs text-gray-400 mt-2">
          Les références apparaîtront après le lancement de la composition
        </p>
      ) : (
        <div className="mt-2 bg-white border border-gray-200 rounded-lg overflow-hidden">
          {SECTION_CONFIG.map(({ key, label }) => {
            const refs = referenceBundle[key];
            return (
              <CollapsibleSection
                key={key}
                label={label}
                count={refs.length}
                references={refs}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ReferenceBundlePanel;

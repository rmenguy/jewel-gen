import React from 'react';

interface SectionLabelProps {
  children: React.ReactNode;
}

export const SectionLabel: React.FC<SectionLabelProps> = ({ children }) => (
  <span className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2 select-none">
    {children}
  </span>
);

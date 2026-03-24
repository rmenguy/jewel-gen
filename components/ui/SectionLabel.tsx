import React from 'react';

export const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2 select-none">
    {children}
  </span>
);

export default SectionLabel;

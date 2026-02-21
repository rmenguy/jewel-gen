import React from "react";

interface PillButtonProps {
  label: string;
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
}

const PillButton: React.FC<PillButtonProps> = ({
  label,
  active,
  onClick,
  icon,
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium
        transition-all duration-200 ease-in-out select-none
        ${
          active
            ? "bg-indigo-600 text-white shadow-md"
            : "bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200"
        }
      `}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      {label}
    </button>
  );
};

export default PillButton;

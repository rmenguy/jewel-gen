import React from "react";

interface SceneCardProps {
  label: string;
  icon: React.ReactNode;
  selected: boolean;
  onClick: () => void;
}

const SceneCard: React.FC<SceneCardProps> = ({
  label,
  icon,
  selected,
  onClick,
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer
        transition-all duration-200 ease-in-out w-full text-left
        ${
          selected
            ? "border-indigo-600 bg-indigo-50 shadow-sm"
            : "border-gray-200 bg-white hover:bg-gray-50"
        }
      `}
    >
      <span className="text-xl flex-shrink-0">{icon}</span>
      <span
        className={`text-sm font-medium flex-1 ${
          selected ? "text-indigo-700" : "text-gray-700"
        }`}
      >
        {label}
      </span>
      {selected && (
        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="2,6 5,9 10,3" />
          </svg>
        </span>
      )}
    </button>
  );
};

export default SceneCard;

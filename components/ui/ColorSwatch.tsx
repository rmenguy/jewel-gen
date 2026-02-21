import React from "react";

interface ColorSwatchProps {
  color: string;
  selected: boolean;
  onClick: () => void;
  label?: string;
}

const ColorSwatch: React.FC<ColorSwatchProps> = ({
  color,
  selected,
  onClick,
  label,
}) => {
  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={onClick}
        title={label || color}
        className={`
          w-8 h-8 rounded-full cursor-pointer transition-all duration-200 ease-in-out
          border border-gray-200
          ${
            selected
              ? "ring-2 ring-offset-2 ring-indigo-600 scale-110"
              : "hover:scale-105"
          }
        `}
        style={{ backgroundColor: color }}
        aria-label={label || `Color ${color}`}
      />
      {label && (
        <span className="text-[10px] text-gray-500 font-medium text-center leading-tight">
          {label}
        </span>
      )}
    </div>
  );
};

interface ColorSwatchGroupProps {
  children: React.ReactNode;
}

const ColorSwatchGroup: React.FC<ColorSwatchGroupProps> = ({ children }) => {
  return <div className="flex flex-row items-start gap-3">{children}</div>;
};

export default ColorSwatch;
export { ColorSwatchGroup };

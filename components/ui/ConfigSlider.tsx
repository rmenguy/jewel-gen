import React from "react";

interface ConfigSliderProps {
  value: number;
  onChange: (value: number) => void;
  leftLabel: string;
  rightLabel: string;
  badge?: string;
}

const ConfigSlider: React.FC<ConfigSliderProps> = ({
  value,
  onChange,
  leftLabel,
  rightLabel,
  badge,
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(Number(e.target.value));
  };

  return (
    <div className="w-full space-y-2">
      {badge && (
        <div className="flex items-center gap-2 mb-1">
          <span className="inline-block bg-indigo-100 text-indigo-700 text-xs px-2 py-0.5 rounded-full font-medium">
            {badge}
          </span>
        </div>
      )}
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={handleChange}
        className="w-full h-2 rounded-full appearance-none cursor-pointer accent-indigo-600 bg-gray-200
          [&::-webkit-slider-thumb]:appearance-none
          [&::-webkit-slider-thumb]:w-4
          [&::-webkit-slider-thumb]:h-4
          [&::-webkit-slider-thumb]:rounded-full
          [&::-webkit-slider-thumb]:bg-indigo-600
          [&::-webkit-slider-thumb]:shadow-md
          [&::-webkit-slider-thumb]:cursor-pointer
          [&::-webkit-slider-thumb]:transition-transform
          [&::-webkit-slider-thumb]:hover:scale-110
          [&::-moz-range-thumb]:w-4
          [&::-moz-range-thumb]:h-4
          [&::-moz-range-thumb]:rounded-full
          [&::-moz-range-thumb]:bg-indigo-600
          [&::-moz-range-thumb]:border-0
          [&::-moz-range-thumb]:shadow-md
          [&::-moz-range-thumb]:cursor-pointer
        "
      />
      <div className="flex justify-between">
        <span className="text-xs text-gray-500 uppercase tracking-wider">
          {leftLabel}
        </span>
        <span className="text-xs text-gray-500 uppercase tracking-wider">
          {rightLabel}
        </span>
      </div>
    </div>
  );
};

export default ConfigSlider;

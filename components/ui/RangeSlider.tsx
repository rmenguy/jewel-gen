import React from "react";

interface RangeSliderProps {
  value: number;
  onChange: (value: number) => void;
  label: string;
}

const RangeSlider: React.FC<RangeSliderProps> = ({
  value,
  onChange,
  label,
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(Number(e.target.value));
  };

  // Clamp value between 0 and 100 for percentage calculation
  const clampedValue = Math.min(100, Math.max(0, value));

  return (
    <div className="w-full space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <span className="text-sm font-bold text-indigo-600 tabular-nums">
          {clampedValue}%
        </span>
      </div>
      <div className="relative w-full">
        <input
          type="range"
          min={0}
          max={100}
          value={value}
          onChange={handleChange}
          className="w-full h-2 rounded-full appearance-none cursor-pointer bg-gray-200
            [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:w-5
            [&::-webkit-slider-thumb]:h-5
            [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:bg-indigo-600
            [&::-webkit-slider-thumb]:shadow-md
            [&::-webkit-slider-thumb]:cursor-pointer
            [&::-webkit-slider-thumb]:transition-transform
            [&::-webkit-slider-thumb]:hover:scale-110
            [&::-webkit-slider-thumb]:relative
            [&::-webkit-slider-thumb]:z-10
            [&::-moz-range-thumb]:w-5
            [&::-moz-range-thumb]:h-5
            [&::-moz-range-thumb]:rounded-full
            [&::-moz-range-thumb]:bg-indigo-600
            [&::-moz-range-thumb]:border-0
            [&::-moz-range-thumb]:shadow-md
            [&::-moz-range-thumb]:cursor-pointer
            [&::-moz-range-track]:bg-gray-200
            [&::-moz-range-track]:rounded-full
            [&::-moz-range-track]:h-2
          "
          style={{
            background: `linear-gradient(to right, #4f46e5 0%, #4f46e5 ${clampedValue}%, #e5e7eb ${clampedValue}%, #e5e7eb 100%)`,
          }}
        />
      </div>
    </div>
  );
};

export default RangeSlider;

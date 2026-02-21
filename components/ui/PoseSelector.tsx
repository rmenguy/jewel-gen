import React from "react";

type Pose = "standing" | "walking" | "arms_up" | "sitting";

interface PoseSelectorProps {
  selected: Pose;
  onSelect: (pose: Pose) => void;
}

const poseIcons: Record<Pose, React.ReactNode> = {
  standing: (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="4" r="2" />
      <line x1="12" y1="6" x2="12" y2="16" />
      <line x1="8" y1="10" x2="16" y2="10" />
      <line x1="12" y1="16" x2="9" y2="22" />
      <line x1="12" y1="16" x2="15" y2="22" />
    </svg>
  ),
  walking: (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="13" cy="4" r="2" />
      <line x1="13" y1="6" x2="12" y2="15" />
      <polyline points="9,10 15,9" />
      <line x1="12" y1="15" x2="8" y2="22" />
      <line x1="12" y1="15" x2="16" y2="21" />
    </svg>
  ),
  arms_up: (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="4" r="2" />
      <line x1="12" y1="6" x2="12" y2="16" />
      <line x1="8" y1="2" x2="12" y2="8" />
      <line x1="16" y1="2" x2="12" y2="8" />
      <line x1="12" y1="16" x2="9" y2="22" />
      <line x1="12" y1="16" x2="15" y2="22" />
    </svg>
  ),
  sitting: (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="4" r="2" />
      <line x1="12" y1="6" x2="12" y2="14" />
      <line x1="8" y1="10" x2="16" y2="10" />
      <polyline points="12,14 17,14 17,18" />
      <line x1="12" y1="14" x2="9" y2="22" />
    </svg>
  ),
};

const poseLabels: Record<Pose, string> = {
  standing: "Standing",
  walking: "Walking",
  arms_up: "Arms Up",
  sitting: "Sitting",
};

const poses: Pose[] = ["standing", "walking", "arms_up", "sitting"];

const PoseSelector: React.FC<PoseSelectorProps> = ({ selected, onSelect }) => {
  return (
    <div className="flex items-center gap-3">
      {poses.map((pose) => {
        const isActive = selected === pose;
        return (
          <button
            key={pose}
            type="button"
            onClick={() => onSelect(pose)}
            title={poseLabels[pose]}
            className={`
              w-14 h-14 rounded-xl border-2 flex items-center justify-center
              transition-all duration-200 ease-in-out cursor-pointer
              ${
                isActive
                  ? "border-indigo-600 bg-indigo-50 text-indigo-600"
                  : "border-gray-200 bg-white text-gray-400 hover:border-gray-300 hover:text-gray-500"
              }
            `}
          >
            {poseIcons[pose]}
          </button>
        );
      })}
    </div>
  );
};

export default PoseSelector;
export type { Pose };

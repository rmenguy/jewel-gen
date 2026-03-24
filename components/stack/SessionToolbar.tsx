import React from 'react';
import { Button } from '../Button';

interface SessionToolbarProps {
  sessionId: string;
  onDuplicate: () => void;
  onSavePreset: () => void;
  onLoadPreset: () => void;
  onClearSession: () => void;
  disabled?: boolean;
}

export const SessionToolbar: React.FC<SessionToolbarProps> = ({
  sessionId,
  onDuplicate,
  onSavePreset,
  onLoadPreset,
  onClearSession,
  disabled = false,
}) => {
  const handleClearSession = () => {
    const confirmed = window.confirm(
      'This will discard the current session, all layers, and generation history. Continue?'
    );
    if (confirmed) onClearSession();
  };

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-white border border-gray-200 rounded-lg mb-4">
      {/* Session ID */}
      <span className="text-xs font-mono text-gray-400 flex-shrink-0">
        {sessionId.slice(0, 8)}
      </span>

      {/* Duplicate button */}
      <button
        type="button"
        onClick={onDuplicate}
        disabled={disabled}
        aria-label="Duplicate session"
        className="p-1.5 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      </button>

      <div className="flex-1" />

      {/* Save Preset */}
      <Button
        variant="ghost"
        onClick={onSavePreset}
        disabled={disabled}
        className="text-xs px-3 py-1.5"
      >
        Save Preset
      </Button>

      {/* Load Preset */}
      <Button
        variant="ghost"
        onClick={onLoadPreset}
        disabled={disabled}
        className="text-xs px-3 py-1.5"
      >
        Load Preset
      </Button>

      {/* Clear Session */}
      <Button
        variant="ghost"
        onClick={handleClearSession}
        disabled={disabled}
        className="text-xs px-3 py-1.5 text-red-600 hover:text-red-700 hover:bg-red-50"
      >
        Clear
      </Button>
    </div>
  );
};

export default SessionToolbar;

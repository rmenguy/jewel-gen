import React, { useState, useCallback } from 'react';

interface FollowUpInputProps {
  onSendEdit: (prompt: string) => void;
  disabled?: boolean;
  isLoading?: boolean;
}

export const FollowUpInput: React.FC<FollowUpInputProps> = ({
  onSendEdit,
  disabled = false,
  isLoading = false,
}) => {
  const [text, setText] = useState('');

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || disabled || isLoading) return;
    onSendEdit(trimmed);
    setText('');
  }, [text, disabled, isLoading, onSendEdit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  return (
    <div className="flex-shrink-0 flex items-center gap-2 p-3 border-t border-gray-200 bg-white">
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Décrivez une modification à appliquer…"
        disabled={disabled || isLoading}
        className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50 disabled:bg-gray-50"
      />
      <button
        type="button"
        onClick={handleSubmit}
        disabled={disabled || isLoading || !text.trim()}
        className="flex-shrink-0 text-sm font-medium px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
      >
        {isLoading && (
          <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        Appliquer
      </button>
    </div>
  );
};

export default FollowUpInput;

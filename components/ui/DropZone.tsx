import React, { useCallback, useRef, useState } from "react";

interface DropZoneProps {
  onFileDrop: (base64: string) => void;
  label?: string;
  accept?: string;
}

const DropZone: React.FC<DropZoneProps> = ({
  onFileDrop,
  label = "Drop a file here or click to upload",
  accept = "image/*",
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const readFileAsBase64 = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        onFileDrop(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        readFileAsBase64(files[0]);
      }
    },
    [onFileDrop]
  );

  const handleClick = () => {
    inputRef.current?.click();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      readFileAsBase64(files[0]);
    }
    // Reset input so the same file can be selected again
    e.target.value = "";
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
      className={`
        border-2 border-dashed rounded-xl p-6 text-center cursor-pointer
        transition-all duration-200 ease-in-out
        ${
          isDragOver
            ? "border-indigo-400 bg-indigo-50"
            : "border-gray-300 bg-white hover:border-gray-400 hover:bg-gray-50"
        }
      `}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleInputChange}
        className="hidden"
      />
      <div className="flex flex-col items-center gap-2">
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`transition-colors duration-200 ${
            isDragOver ? "text-indigo-500" : "text-gray-400"
          }`}
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <span
          className={`text-sm transition-colors duration-200 ${
            isDragOver ? "text-indigo-600 font-medium" : "text-gray-500"
          }`}
        >
          {label}
        </span>
      </div>
    </div>
  );
};

export default DropZone;

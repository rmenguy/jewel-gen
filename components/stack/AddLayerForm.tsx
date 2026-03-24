import React, { useState, useEffect } from 'react';
import { StackLayer, TargetZone } from '../../types';
import { autoAssignZone } from '../../services/geminiService';
import DropZone from '../ui/DropZone';

interface AddLayerFormProps {
  onAddLayer: (layer: StackLayer) => void;
  disabled?: boolean;
}

const CATEGORIES = [
  'collier',
  'sautoir',
  'boucles',
  'bracelet',
  'bague',
  'pendentif',
  'broche',
] as const;

const ALL_ZONES: TargetZone[] = [
  'neck-base', 'collarbone', 'upper-chest', 'mid-chest', 'navel',
  'ear-lobe', 'ear-upper', 'wrist', 'finger',
];

const ZONE_LABELS: Record<TargetZone, string> = {
  'neck-base': 'Neck Base',
  'collarbone': 'Collarbone',
  'upper-chest': 'Upper Chest',
  'mid-chest': 'Mid Chest',
  'navel': 'Navel',
  'ear-lobe': 'Ear Lobe',
  'ear-upper': 'Ear Upper',
  'wrist': 'Wrist',
  'finger': 'Finger',
};

const AddLayerForm: React.FC<AddLayerFormProps> = ({ onAddLayer, disabled = false }) => {
  const [productImage, setProductImage] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [targetZone, setTargetZone] = useState<TargetZone>(() => autoAssignZone(CATEGORIES[0]));

  // Auto-assign zone when category changes
  useEffect(() => {
    setTargetZone(autoAssignZone(category));
    if (!name || CATEGORIES.includes(name as typeof CATEGORIES[number])) {
      setName(category);
    }
  }, [category]);

  const handleSubmit = () => {
    if (!productImage) return;

    const layer: StackLayer = {
      id: crypto.randomUUID(),
      ordinal: 0, // parent recomputes
      name: name || category,
      productImage,
      productCategory: category,
      targetZone,
    };

    onAddLayer(layer);

    // Reset form
    setProductImage(null);
    setName(CATEGORIES[0]);
    setCategory(CATEGORIES[0]);
    setTargetZone(autoAssignZone(CATEGORIES[0]));
  };

  return (
    <div className="p-3 space-y-3 border-t border-gray-200 bg-gray-50/50">
      {/* Product image upload */}
      {productImage ? (
        <div className="flex items-center gap-3">
          <img
            src={productImage}
            alt="Product preview"
            className="w-12 h-12 object-cover rounded border border-gray-200"
          />
          <button
            type="button"
            onClick={() => setProductImage(null)}
            className="text-xs text-gray-500 hover:text-red-600 transition-colors"
          >
            Change image
          </button>
        </div>
      ) : (
        <DropZone
          onFileDrop={(base64) => setProductImage(base64)}
          label="Drop jewelry image"
          accept="image/*"
        />
      )}

      {/* Category select */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          disabled={disabled}
          className="w-full text-sm border border-gray-300 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
        >
          {CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {cat.charAt(0).toUpperCase() + cat.slice(1)}
            </option>
          ))}
        </select>
      </div>

      {/* Name input */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={disabled}
          placeholder="Layer name"
          className="w-full text-sm border border-gray-300 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
        />
      </div>

      {/* Target zone pills */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Target Zone</label>
        <div className="flex flex-wrap gap-1">
          {ALL_ZONES.map((zone) => (
            <button
              key={zone}
              type="button"
              onClick={() => setTargetZone(zone)}
              disabled={disabled}
              className={`text-[10px] px-2 py-0.5 rounded-full transition-colors ${
                targetZone === zone
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              } disabled:opacity-40`}
            >
              {ZONE_LABELS[zone]}
            </button>
          ))}
        </div>
      </div>

      {/* Add button */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={disabled || !productImage}
        className="w-full text-sm font-medium py-2 px-4 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Add Jewelry Layer
      </button>
    </div>
  );
};

export default AddLayerForm;

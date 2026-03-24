import React, { useState, useEffect } from 'react';
import { StackLayer, TargetZone, SizePreset } from '../../types';
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

const CATEGORY_LABELS: Record<string, string> = {
  collier: 'Collier',
  sautoir: 'Sautoir',
  boucles: 'Boucles d\'oreilles',
  bracelet: 'Bracelet',
  bague: 'Bague',
  pendentif: 'Pendentif',
  broche: 'Broche',
};

const ALL_ZONES: TargetZone[] = [
  'neck-base', 'collarbone', 'upper-chest', 'mid-chest', 'navel',
  'ear-lobe', 'ear-upper', 'wrist', 'finger',
];

const ZONE_LABELS: Record<TargetZone, string> = {
  'neck-base': 'Base du cou',
  'collarbone': 'Clavicule',
  'upper-chest': 'Haut de poitrine',
  'mid-chest': 'Milieu de poitrine',
  'navel': 'Nombril',
  'ear-lobe': 'Lobe d\'oreille',
  'ear-upper': 'Haut d\'oreille',
  'wrist': 'Poignet',
  'finger': 'Doigt',
};

const AddLayerForm: React.FC<AddLayerFormProps> = ({ onAddLayer, disabled = false }) => {
  const [productImage, setProductImage] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [targetZone, setTargetZone] = useState<TargetZone>(() => autoAssignZone(CATEGORIES[0]));
  const [sizePreset, setSizePreset] = useState<SizePreset>('medium');

  useEffect(() => {
    setTargetZone(autoAssignZone(category));
    if (!name || Object.values(CATEGORY_LABELS).includes(name) || CATEGORIES.includes(name as typeof CATEGORIES[number])) {
      setName(CATEGORY_LABELS[category] || category);
    }
  }, [category]);

  const handleSubmit = () => {
    if (!productImage) return;

    const layer: StackLayer = {
      id: crypto.randomUUID(),
      ordinal: 0,
      name: name || CATEGORY_LABELS[category] || category,
      productImage,
      productCategory: category,
      targetZone,
      sizePreset,
    };

    onAddLayer(layer);

    setProductImage(null);
    setName(CATEGORY_LABELS[CATEGORIES[0]] || CATEGORIES[0]);
    setCategory(CATEGORIES[0]);
    setTargetZone(autoAssignZone(CATEGORIES[0]));
    setSizePreset('medium');
  };

  return (
    <div className="p-3 space-y-3 border-t border-gray-200 bg-gray-50/50">
      {productImage ? (
        <div className="flex items-center gap-3">
          <img
            src={productImage}
            alt="Aperçu du produit"
            className="w-12 h-12 object-cover rounded border border-gray-200"
          />
          <button
            type="button"
            onClick={() => setProductImage(null)}
            className="text-xs text-gray-500 hover:text-red-600 transition-colors"
          >
            Changer l'image
          </button>
        </div>
      ) : (
        <DropZone
          onFileDrop={(base64) => setProductImage(base64)}
          label="Déposez une image du bijou"
          accept="image/*"
        />
      )}

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Catégorie</label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          disabled={disabled}
          className="w-full text-sm border border-gray-300 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
        >
          {CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {CATEGORY_LABELS[cat] || cat}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Nom</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={disabled}
          placeholder="Nom du calque"
          className="w-full text-sm border border-gray-300 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Zone cible</label>
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

      {/* Sélecteur de taille */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Taille du bijou</label>
        <div className="flex gap-1">
          {([
            { key: 'very_small' as SizePreset, label: 'Très petit' },
            { key: 'small' as SizePreset, label: 'Petit' },
            { key: 'medium' as SizePreset, label: 'Moyen' },
            { key: 'large' as SizePreset, label: 'Grand' },
          ]).map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setSizePreset(key)}
              disabled={disabled}
              className={`flex-1 text-[10px] py-1 rounded-md transition-colors ${
                sizePreset === key
                  ? 'bg-indigo-600 text-white font-semibold'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              } disabled:opacity-40`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={disabled || !productImage}
        className="w-full text-sm font-medium py-2 px-4 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Ajouter un calque bijou
      </button>
    </div>
  );
};

export default AddLayerForm;

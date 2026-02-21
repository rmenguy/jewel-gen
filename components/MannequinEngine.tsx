import React, { useState, useCallback, useRef } from 'react';
import { useMannequinStore } from '../stores/useMannequinStore';
import { useProductionStore } from '../stores/useProductionStore';
import { useAppStore } from '../stores/useAppStore';
import { generateMannequin, generateMannequinFromReference, applyBatchRefinements } from '../services/geminiService';
import { downloadBase64Image } from '../services/downloadService';
import { RefinementSelections } from '../types';
import PillButton from './ui/PillButton';
import ConfigSlider from './ui/ConfigSlider';
import PoseSelector, { type Pose } from './ui/PoseSelector';

// ---------------------------------------------------------------------------
// Inline sub-components (kept local to this file)
// ---------------------------------------------------------------------------

/** Section label used throughout both panels */
const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2 select-none">
    {children}
  </span>
);

/** A color swatch circle for hair tone selection */
const ColorSwatch: React.FC<{
  color: string;
  active: boolean;
  onClick: () => void;
  gradient?: boolean;
  title?: string;
}> = ({ color, active, onClick, gradient, title }) => (
  <button
    type="button"
    title={title}
    onClick={onClick}
    className={`
      w-8 h-8 rounded-full border-2 transition-all duration-200 cursor-pointer flex-shrink-0
      ${active ? 'border-indigo-600 ring-2 ring-indigo-300 scale-110' : 'border-gray-200 hover:border-gray-400'}
    `}
    style={
      gradient
        ? { background: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)' }
        : { backgroundColor: color }
    }
  />
);

/** Range slider for post-generation refinement (e.g. skin retouching) */
const RangeSlider: React.FC<{
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  label?: string;
}> = ({ value, onChange, disabled, label }) => (
  <div className="w-full space-y-1">
    <div className="flex justify-between items-center">
      {label && <span className="text-xs text-gray-400">{label}</span>}
      <span className="text-xs font-medium text-gray-700 tabular-nums">{value}%</span>
    </div>
    <input
      type="range"
      min={0}
      max={100}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full h-2 rounded-full appearance-none cursor-pointer accent-indigo-600 bg-gray-200
        disabled:opacity-40 disabled:cursor-not-allowed
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
  </div>
);

/** Drop zone for garment / outfit swap */
const DropZone: React.FC<{
  onDrop: (base64: string) => void;
  disabled?: boolean;
}> = ({ onDrop, disabled }) => {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          onDrop(reader.result);
        }
      };
      reader.readAsDataURL(file);
    },
    [onDrop]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => setIsDragging(false), []);

  const handleDropEvent = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file && file.type.startsWith('image/')) handleFile(file);
    },
    [handleFile]
  );

  const handleClick = useCallback(() => inputRef.current?.click(), []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  return (
    <div
      onDragOver={disabled ? undefined : handleDragOver}
      onDragLeave={disabled ? undefined : handleDragLeave}
      onDrop={disabled ? undefined : handleDropEvent}
      onClick={disabled ? undefined : handleClick}
      className={`
        flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed
        py-5 text-center transition-colors cursor-pointer select-none
        ${isDragging ? 'border-indigo-400 bg-indigo-50' : 'border-gray-300 bg-gray-50 hover:border-gray-400'}
        ${disabled ? 'opacity-40 pointer-events-none' : ''}
      `}
    >
      {/* Upload icon */}
      <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
      </svg>
      <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Drop Garment File</span>
      <span className="text-[10px] text-gray-400">or click to browse</span>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleInputChange} />
    </div>
  );
};

/** Scene card for background selection */
const SceneCard: React.FC<{
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}> = ({ label, icon, active, onClick, disabled }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={`
      flex-1 flex flex-col items-center justify-center gap-2 rounded-lg border-2 py-4 px-3
      transition-all duration-200 cursor-pointer select-none
      ${active ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'}
      ${disabled ? 'opacity-40 pointer-events-none' : ''}
    `}
  >
    {icon}
    <span className="text-xs font-medium">{label}</span>
  </button>
);

// ---------------------------------------------------------------------------
// Hair color definitions
// ---------------------------------------------------------------------------
const HAIR_COLORS: { label: string; hex: string }[] = [
  { label: 'Black', hex: '#1a1a1a' },
  { label: 'Dark Brown', hex: '#3d2314' },
  { label: 'Brown', hex: '#6b3a2a' },
  { label: 'Light Brown', hex: '#a0764a' },
  { label: 'Blonde', hex: '#d4b896' },
];

const HAIR_STYLES: { label: string; prompt: string }[] = [
  { label: 'Straight', prompt: 'straight sleek smooth hair' },
  { label: 'Wavy', prompt: 'wavy flowing hair with natural waves' },
  { label: 'Curly', prompt: 'curly voluminous hair with defined curls' },
  { label: 'Tied Up', prompt: 'hair tied up in a neat high ponytail' },
  { label: 'Braids', prompt: 'elegantly braided hair' },
  { label: 'Bob', prompt: 'short bob haircut, chin-length' },
];

const SCENE_OPTIONS: { label: string; prompt: string }[] = [
  { label: 'Minimalist Studio', prompt: 'clean minimalist white studio with soft shadows, concrete floor, seamless backdrop' },
  { label: 'Urban Loft', prompt: 'industrial urban loft with exposed brick walls, large windows, warm natural light' },
  { label: 'Garden', prompt: 'lush green garden setting, dappled sunlight through leaves, natural outdoor ambiance' },
  { label: 'Marble', prompt: 'luxurious marble interior, elegant architectural details, warm indirect lighting' },
  { label: 'Campagne Chic', prompt: 'French countryside setting, golden wheat fields or lavender meadow, warm afternoon light, rustic stone wall or wooden barn, chic rural elegance' },
  { label: 'Desert Dunes', prompt: 'sun-drenched desert dunes, warm golden sand, minimalist horizon, editorial outdoor setting, clean warm tones' },
];

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export const MannequinEngine: React.FC = () => {
  // --- Store hooks ---
  const {
    criteria,
    setCriteria,
    currentImage,
    setCurrentImage,
    referenceImage,
    setReferenceImage,
    isGenerating,
    setIsGenerating,
    isRefining,
    setIsRefining,
    imageHistory,
    pushToHistory,
    undo,
    error,
    setError,
    resetAll,
  } = useMannequinStore();

  const { setMannequinImage } = useProductionStore();
  const { setActiveEngine } = useAppStore();

  // --- Refinement selections (no auto-trigger, user clicks Apply) ---
  const [customHairColor, setCustomHairColor] = useState('#c0392b');
  const [refHairColor, setRefHairColor] = useState<string | null>(null);
  const [refHairHex, setRefHairHex] = useState<string | null>(null);
  const [refHairStyle, setRefHairStyle] = useState<string | null>(null);
  const [refSkin, setRefSkin] = useState(85);
  const [refSkinDirty, setRefSkinDirty] = useState(false);
  const [refMakeup, setRefMakeup] = useState<string | null>(null);
  const [refAccessory, setRefAccessory] = useState<string | null>(null);
  const [refStyle, setRefStyle] = useState<string | null>(null);
  const [refLighting, setRefLighting] = useState<string | null>(null);
  const [refScene, setRefScene] = useState<string | null>(null);
  const [refOutfit, setRefOutfit] = useState<string | null>(null);

  // --- Count pending refinements ---
  const pendingCount = [
    refHairColor, refHairStyle, refMakeup, refAccessory,
    refStyle, refLighting, refScene, refOutfit,
  ].filter(v => v != null).length + (refSkinDirty ? 1 : 0);

  // --- Clear all refinement selections ---
  const clearRefinements = useCallback(() => {
    setRefHairColor(null);
    setRefHairHex(null);
    setRefHairStyle(null);
    setRefSkin(85);
    setRefSkinDirty(false);
    setRefMakeup(null);
    setRefAccessory(null);
    setRefStyle(null);
    setRefLighting(null);
    setRefScene(null);
    setRefOutfit(null);
  }, []);

  // --- Reference photo upload handler ---
  const handleReferenceUpload = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') setReferenceImage(reader.result);
    };
    reader.readAsDataURL(file);
  }, [setReferenceImage]);

  // --- Generation ---
  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const base64Image = referenceImage
        ? await generateMannequinFromReference(referenceImage, criteria)
        : await generateMannequin(criteria);
      setCurrentImage(base64Image);
      clearRefinements();
    } catch (err: any) {
      setError(err.message || 'Generation failed.');
    } finally {
      setIsGenerating(false);
    }
  }, [criteria, referenceImage, setCurrentImage, setIsGenerating, setError, clearRefinements]);

  // --- Apply all pending refinements at once ---
  const handleApplyRefinements = useCallback(async () => {
    if (!currentImage || pendingCount === 0) return;
    setIsRefining(true);
    setError(null);
    pushToHistory(currentImage);

    const selections: RefinementSelections = {};
    if (refHairColor) selections.hairColor = refHairColor;
    if (refHairStyle) selections.hairStyle = refHairStyle;
    if (refSkinDirty) selections.skinRetouching = refSkin;
    if (refMakeup) selections.makeup = refMakeup;
    if (refAccessory && refAccessory !== 'None') selections.accessory = refAccessory;
    if (refStyle) selections.style = refStyle;
    if (refLighting) selections.lighting = refLighting;
    if (refScene) {
      const sceneOption = SCENE_OPTIONS.find(s => s.label === refScene);
      selections.scene = sceneOption?.prompt || refScene;
    }
    if (refOutfit) selections.outfitBase64 = refOutfit;

    try {
      const refined = await applyBatchRefinements(currentImage, selections);
      setCurrentImage(refined);
      clearRefinements();
    } catch (err: any) {
      console.error('[REFINE] Error:', err);
      const msg = err?.message || String(err);
      setError(msg.length > 200 ? msg.substring(0, 200) + '...' : msg);
      undo();
    } finally {
      setIsRefining(false);
    }
  }, [currentImage, pendingCount, pushToHistory, setCurrentImage, setError, setIsRefining, undo, clearRefinements,
      refHairColor, refHairStyle, refSkin, refSkinDirty, refMakeup, refAccessory, refStyle, refLighting, refScene, refOutfit]);

  // --- Export ---
  const handleExport = useCallback(() => {
    if (!currentImage) return;
    const filename = `mannequin_${Date.now()}.png`;
    downloadBase64Image(currentImage, filename);
  }, [currentImage]);

  // --- Transfer to Production ---
  const handleTransfer = useCallback(() => {
    if (!currentImage) return;
    setMannequinImage(currentImage);
    setActiveEngine('PRODUCTION');
  }, [currentImage, setMannequinImage, setActiveEngine]);

  // --- Derived state ---
  const hasImage = !!currentImage;
  const isBusy = isGenerating || isRefining;
  const canUndo = imageHistory.length > 0;
  const refinementDisabled = !hasImage || isBusy;

  // =======================================================================
  // RENDER
  // =======================================================================
  return (
    <div className="w-full h-[calc(100vh-64px)] flex bg-white text-gray-900 select-none">
      {/* ================================================================= */}
      {/* LEFT PANEL - PRE-GENERATION Configuration                         */}
      {/* ================================================================= */}
      <aside className="w-72 flex-shrink-0 border-r border-gray-200 bg-white flex flex-col">
        {/* Header */}
        <div className="px-5 pt-6 pb-4">
          <span className="block text-xs font-bold uppercase tracking-widest text-indigo-600 mb-0.5">
            Pre-Generation
          </span>
          <h2 className="text-2xl font-bold text-gray-900 leading-tight">Configuration</h2>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 pb-6 space-y-7">
          {/* REFERENCE PHOTO */}
          <div>
            <SectionLabel>Photo de référence</SectionLabel>
            {referenceImage ? (
              <div className="relative rounded-lg border-2 border-indigo-400 bg-indigo-50 overflow-hidden">
                <img src={referenceImage} alt="Reference" className="w-full h-32 object-cover object-top" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                <span className="absolute bottom-2 left-2.5 text-[10px] font-bold text-white uppercase tracking-wider">
                  Mode référence actif
                </span>
                <button
                  type="button"
                  onClick={() => setReferenceImage(null)}
                  className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-black/50 text-white text-xs flex items-center justify-center hover:bg-black/70"
                >
                  ×
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 hover:border-indigo-400 hover:bg-indigo-50/50 py-4 text-center cursor-pointer transition-colors">
                <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                <span className="text-xs font-semibold text-gray-500">Déposer une photo</span>
                <span className="text-[10px] text-gray-400">L'IA génère un look similaire, identité différente</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleReferenceUpload(f); }}
                />
              </label>
            )}
          </div>

          {/* MODEL ETHNICITY */}
          <div>
            <SectionLabel>Model Ethnicity</SectionLabel>
            <div className="grid grid-cols-2 gap-2">
              {([
                { key: 'european', label: 'European' },
                { key: 'east_asian', label: 'East Asian' },
                { key: 'african', label: 'African' },
                { key: 'south_asian', label: 'South Asian' },
                { key: 'latin', label: 'Latin' },
                { key: 'middle_eastern', label: 'Middle Eastern' },
              ] as const).map(({ key, label }) => (
                <PillButton
                  key={key}
                  label={label}
                  active={criteria.ethnicity === key}
                  onClick={() => setCriteria({ ethnicity: key })}
                />
              ))}
            </div>
          </div>

          {/* AGE */}
          <div>
            <SectionLabel>Age</SectionLabel>
            <div className="grid grid-cols-3 gap-2">
              {(['20', '25', '30', '38', '45', '55'] as const).map((a) => (
                <PillButton
                  key={a}
                  label={a}
                  active={criteria.age === a}
                  onClick={() => setCriteria({ age: a })}
                />
              ))}
            </div>
          </div>

          {/* AESTHETIC / VIBE */}
          <div>
            <SectionLabel>Aesthetic</SectionLabel>
            <div className="grid grid-cols-2 gap-2">
              {(['Minimalist', 'Luxury', 'Ethereal', 'Street/Urban', 'Classic', 'Sunkissed', 'Bohème Chic'] as const).map((v) => (
                <PillButton
                  key={v}
                  label={v}
                  active={criteria.vibe === v}
                  onClick={() => setCriteria({ vibe: v })}
                />
              ))}
            </div>
          </div>

          {/* MAKEUP */}
          <div>
            <SectionLabel>Makeup</SectionLabel>
            <div className="grid grid-cols-2 gap-2">
              {(['No Makeup', 'Barely There', 'Natural', 'Soft Glam', 'Editorial', 'Bold Night'] as const).map((m) => (
                <PillButton
                  key={m}
                  label={m}
                  active={criteria.makeup === m}
                  onClick={() => setCriteria({ makeup: m })}
                />
              ))}
            </div>
          </div>

          {/* CORPULENCE */}
          <div>
            <SectionLabel>Corpulence</SectionLabel>
            <ConfigSlider
              value={criteria.bodyComposition ?? 50}
              onChange={(v) => setCriteria({ bodyComposition: v })}
              leftLabel="Slim"
              rightLabel="Plus Size"
              badge={
                (criteria.bodyComposition ?? 50) < 20 ? 'Slim / Petite' :
                (criteria.bodyComposition ?? 50) < 40 ? 'Athletic' :
                (criteria.bodyComposition ?? 50) < 60 ? 'Standard' :
                (criteria.bodyComposition ?? 50) < 80 ? 'Curvy' : 'Plus Size'
              }
            />
          </div>

          {/* DYNAMIC POSE */}
          <div>
            <SectionLabel>Dynamic Pose</SectionLabel>
            <PoseSelector
              selected={(criteria.pose as Pose) || 'standing'}
              onSelect={(pose) => setCriteria({ pose })}
            />
          </div>

          {/* LIGHTING ENVIRONMENT */}
          <div>
            <SectionLabel>Lighting Environment</SectionLabel>
            <div className="flex gap-2">
              {(['soft', 'studio', 'dramatic'] as const).map((l) => (
                <PillButton
                  key={l}
                  label={l.charAt(0).toUpperCase() + l.slice(1)}
                  active={criteria.lighting === l}
                  onClick={() => setCriteria({ lighting: l })}
                />
              ))}
            </div>
          </div>
        </div>

        {/* CUSTOM PROMPT */}
        <div className="px-5 pb-4">
          <span className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2 select-none">
            Prompt libre
          </span>
          <div className="relative rounded-lg border border-gray-200 bg-gray-50 focus-within:border-indigo-400 transition-colors">
            <textarea
              value={criteria.customPrompt ?? ''}
              onChange={(e) => setCriteria({ customPrompt: e.target.value })}
              placeholder="Ex: wearing a flowing red silk dress, standing near a window..."
              rows={3}
              className="w-full bg-transparent text-xs text-gray-700 placeholder-gray-400 rounded-lg px-3 py-2.5 outline-none resize-none leading-relaxed"
            />
            {criteria.customPrompt && (
              <button
                type="button"
                onClick={() => setCriteria({ customPrompt: '' })}
                className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-gray-300 text-white text-[10px] flex items-center justify-center hover:bg-gray-400"
              >
                ×
              </button>
            )}
          </div>
        </div>

        {/* Reset button */}
        <div className="px-5 py-4 border-t border-gray-100">
          <button
            type="button"
            onClick={resetAll}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            {/* Reset icon */}
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Reset All Parameters
          </button>
        </div>
      </aside>

      {/* ================================================================= */}
      {/* CENTER PANEL - Main Preview                                       */}
      {/* ================================================================= */}
      <main className="flex-1 flex flex-col min-w-0 bg-gray-100">
        {/* Preview area */}
        <div
          className="flex-1 min-h-0 relative flex items-center justify-center overflow-hidden"
          style={{
            backgroundImage:
              'radial-gradient(circle, #e5e7eb 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          }}
        >
          {/* Corner crop marks */}
          <div className="absolute top-6 left-6 w-8 h-8 border-l-2 border-t-2 border-gray-300 pointer-events-none" />
          <div className="absolute top-6 right-6 w-8 h-8 border-r-2 border-t-2 border-gray-300 pointer-events-none" />
          <div className="absolute bottom-6 left-6 w-8 h-8 border-l-2 border-b-2 border-gray-300 pointer-events-none" />
          <div className="absolute bottom-6 right-6 w-8 h-8 border-r-2 border-b-2 border-gray-300 pointer-events-none" />

          {/* Error banner */}
          {error && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-red-50 border border-red-200 rounded-lg px-5 py-3 shadow-sm max-w-md text-center">
              <p className="text-sm text-red-700">{error}</p>
              <button
                type="button"
                onClick={() => setError(null)}
                className="mt-1 text-xs text-red-500 hover:text-red-700 underline"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Refining overlay */}
          {isRefining && hasImage && (
            <div className="absolute inset-0 z-20 bg-white/60 backdrop-blur-sm flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <svg className="w-10 h-10 text-indigo-600 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span className="text-sm font-medium text-indigo-700 animate-pulse">Refining...</span>
              </div>
            </div>
          )}

          {/* Content states */}
          {isGenerating ? (
            <div className="flex flex-col items-center gap-4">
              <svg className="w-12 h-12 text-indigo-600 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="text-sm font-medium text-gray-600">Processing...</span>
            </div>
          ) : currentImage ? (
            <img
              src={currentImage}
              alt="Generated mannequin"
              className="max-h-full object-contain rounded-lg shadow-xl"
              draggable={false}
            />
          ) : (
            <div className="flex flex-col items-center gap-3 text-gray-400">
              {/* Placeholder person icon */}
              <svg className="w-20 h-20 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span className="text-sm opacity-50">Configure and generate your model</span>
            </div>
          )}
        </div>

        {/* Bottom bar */}
        <div className="flex-shrink-0 px-6 py-4 bg-white border-t border-gray-200 flex items-center justify-center gap-4">
          {/* Undo button */}
          {canUndo && (
            <button
              type="button"
              onClick={undo}
              disabled={isBusy}
              className="flex items-center gap-1.5 px-4 py-3 rounded-full border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h10a5 5 0 015 5v2M3 10l4-4m-4 4l4 4" />
              </svg>
              Undo
            </button>
          )}

          {/* GENERATE button */}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isBusy}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full px-8 py-4 font-bold text-sm transition-colors shadow-lg shadow-indigo-300/30 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {/* Sparkle icon */}
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
            {isGenerating ? 'Generating...' : referenceImage ? 'Generate from Reference' : 'Generate New Look'}
          </button>

          {/* Status dot */}
          <div className="flex items-center gap-2 text-xs font-medium select-none">
            {isBusy ? (
              <>
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                <span className="text-amber-600 uppercase tracking-wider">Generating...</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-gray-500 uppercase tracking-wider">AI Engine Ready</span>
              </>
            )}
          </div>
        </div>
      </main>

      {/* ================================================================= */}
      {/* RIGHT PANEL - POST-GENERATION Refinement                          */}
      {/* ================================================================= */}
      <aside className="w-80 flex-shrink-0 border-l border-gray-200 bg-white flex flex-col">
        {/* Header */}
        <div className="px-5 pt-6 pb-4">
          <span className="block text-xs font-bold uppercase tracking-widest text-indigo-600 mb-0.5">
            Post-Generation
          </span>
          <h2 className="text-2xl font-bold text-gray-900 leading-tight">Refinement</h2>
        </div>

        {/* Scrollable body */}
        <div
          className={`flex-1 overflow-y-auto px-5 pb-6 space-y-6 ${refinementDisabled ? 'opacity-50 pointer-events-none' : ''}`}
        >
          {/* OUTFIT SWAP */}
          <div>
            <SectionLabel>Outfit Swap</SectionLabel>
            {refOutfit ? (
              <div className="relative rounded-lg border-2 border-indigo-400 bg-indigo-50 p-2">
                <img src={refOutfit} alt="Outfit" className="w-full h-24 object-contain rounded" />
                <button
                  type="button"
                  onClick={() => setRefOutfit(null)}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center hover:bg-red-600"
                >
                  x
                </button>
              </div>
            ) : (
              <DropZone onDrop={(b64) => setRefOutfit(b64)} disabled={refinementDisabled} />
            )}
          </div>

          {/* HAIR TONE */}
          <div>
            <SectionLabel>Hair Tone</SectionLabel>
            <div className="flex items-center gap-2.5">
              {HAIR_COLORS.map((hc) => (
                <ColorSwatch
                  key={hc.hex}
                  color={hc.hex}
                  title={hc.label}
                  active={refHairHex === hc.hex}
                  onClick={() => {
                    setRefHairHex(hc.hex);
                    setRefHairColor(hc.label);
                  }}
                />
              ))}
              <div className="relative">
                <ColorSwatch
                  color={customHairColor}
                  title="Custom"
                  active={refHairHex === 'custom'}
                  onClick={() => {
                    setRefHairHex('custom');
                    setRefHairColor(customHairColor);
                  }}
                  gradient={refHairHex !== 'custom'}
                />
                {refHairHex === 'custom' && (
                  <input
                    type="color"
                    value={customHairColor}
                    onChange={(e) => {
                      setCustomHairColor(e.target.value);
                      setRefHairColor(e.target.value);
                    }}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    title="Pick custom hair color"
                  />
                )}
              </div>
            </div>
          </div>

          {/* HAIRSTYLE */}
          <div>
            <SectionLabel>Hairstyle</SectionLabel>
            <div className="grid grid-cols-3 gap-2">
              {HAIR_STYLES.map((hs) => (
                <PillButton
                  key={hs.label}
                  label={hs.label}
                  active={refHairStyle === hs.prompt}
                  onClick={() => setRefHairStyle(refHairStyle === hs.prompt ? null : hs.prompt)}
                />
              ))}
            </div>
          </div>

          {/* SKIN RETOUCHING */}
          <div>
            <SectionLabel>Skin Retouching</SectionLabel>
            <RangeSlider
              value={refSkin}
              onChange={(v) => { setRefSkin(v); setRefSkinDirty(true); }}
              disabled={refinementDisabled}
            />
          </div>

          {/* MAKEUP */}
          <div>
            <SectionLabel>Makeup</SectionLabel>
            <div className="grid grid-cols-2 gap-2">
              {['Natural', 'Editorial', 'Glamour', 'Bold'].map((m) => (
                <PillButton
                  key={m}
                  label={m}
                  active={refMakeup === m}
                  onClick={() => setRefMakeup(refMakeup === m ? null : m)}
                />
              ))}
            </div>
          </div>

          {/* ACCESSORIES */}
          <div>
            <SectionLabel>Accessories</SectionLabel>
            <div className="flex flex-wrap gap-2">
              {['Sunglasses', 'Earrings', 'Hat', 'None'].map((a) => (
                <PillButton
                  key={a}
                  label={a}
                  active={refAccessory === a}
                  onClick={() => setRefAccessory(refAccessory === a ? null : a)}
                />
              ))}
            </div>
          </div>

          {/* STYLE */}
          <div>
            <SectionLabel>Style</SectionLabel>
            <div className="flex flex-wrap gap-2">
              {['Editorial', 'Vintage', 'Film', 'Minimalist'].map((s) => (
                <PillButton
                  key={s}
                  label={s}
                  active={refStyle === s}
                  onClick={() => setRefStyle(refStyle === s ? null : s)}
                />
              ))}
            </div>
          </div>

          {/* LIGHTING (post) */}
          <div>
            <SectionLabel>Lighting</SectionLabel>
            <div className="flex gap-2">
              {['Soft', 'Studio', 'Dramatic'].map((l) => (
                <PillButton
                  key={l}
                  label={l}
                  active={refLighting === l}
                  onClick={() => setRefLighting(refLighting === l ? null : l)}
                />
              ))}
            </div>
          </div>

          {/* SCENE BACKGROUND */}
          <div>
            <SectionLabel>Scene Background</SectionLabel>
            <div className="grid grid-cols-2 gap-2">
              {SCENE_OPTIONS.map((sc) => (
                <SceneCard
                  key={sc.label}
                  label={sc.label}
                  active={refScene === sc.label}
                  onClick={() => setRefScene(refScene === sc.label ? null : sc.label)}
                  disabled={refinementDisabled}
                  icon={
                    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  }
                />
              ))}
            </div>
          </div>
        </div>

        {/* APPLY REFINEMENTS BUTTON */}
        {pendingCount > 0 && !refinementDisabled && (
          <div className="flex-shrink-0 px-5 py-3 border-t border-gray-100">
            <button
              type="button"
              onClick={handleApplyRefinements}
              disabled={isBusy}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg px-4 py-3 font-bold text-sm transition-colors shadow-lg shadow-indigo-300/30 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
              {isRefining ? 'Refining...' : `Apply Refinements (${pendingCount})`}
            </button>
            <button
              type="button"
              onClick={clearRefinements}
              className="w-full mt-2 text-xs text-gray-400 hover:text-gray-600 transition-colors text-center"
            >
              Clear selections
            </button>
          </div>
        )}

        {/* Footer: Export + Share */}
        <div className="flex-shrink-0 px-5 py-4 border-t border-gray-200 flex items-center gap-3">
          <button
            type="button"
            onClick={handleExport}
            disabled={!hasImage || isBusy}
            className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export
          </button>
          <button
            type="button"
            onClick={handleTransfer}
            disabled={!hasImage || isBusy}
            className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
            Share
          </button>
        </div>
      </aside>
    </div>
  );
};

export default MannequinEngine;

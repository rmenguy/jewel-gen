# Mode Libre + Production Reference Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow mannequin generation to bypass config params when a reference photo or custom prompt is provided (hybrid mode), and allow production to analyze reference photos to extract reusable scene prompts.

**Architecture:** Two independent features. Feature A modifies mannequin generation flow: auto-detect "mode libre" when ref image or custom prompt is set, gray out params, only include `overrideParams` in prompt construction. Feature B adds a new `analyzeProductionReference()` API function + UI modal in ProductionEngine for uploading a reference photo, choosing extraction level, and saving as custom preset.

**Tech Stack:** React 19 + TypeScript + Zustand + Gemini API (REST fetch) + TailwindCSS

---

## Task 1: Add `overrideParams` to Mannequin Store

**Files:**
- Modify: `stores/useMannequinStore.ts`

**Step 1: Add `overrideParams` state and actions**

In `stores/useMannequinStore.ts`, add to the `MannequinStore` interface (after line 31):

```typescript
// Mode libre: params to force even when ref/custom prompt is active
overrideParams: string[];
toggleOverrideParam: (param: string) => void;
clearOverrideParams: () => void;
```

**Step 2: Add initial state and implementations**

In the `create<MannequinStore>` body (after line 66):

```typescript
overrideParams: [],
```

Add actions (after line 75):

```typescript
toggleOverrideParam: (param) =>
  set((state) => ({
    overrideParams: state.overrideParams.includes(param)
      ? state.overrideParams.filter(p => p !== param)
      : [...state.overrideParams, param],
  })),

clearOverrideParams: () => set({ overrideParams: [] }),
```

Also reset `overrideParams` in `resetAll` (line 96):

```typescript
resetAll: () =>
  set({
    criteria: { ...DEFAULT_CRITERIA },
    currentImage: null,
    referenceImage: null,
    imageHistory: [],
    error: null,
    overrideParams: [],
    bookImages: [],
    bookProgress: 0,
  }),
```

**Step 3: Verify build**

Run: `npm run build`

**Step 4: Commit**

```bash
git add stores/useMannequinStore.ts
git commit -m "feat: add overrideParams to mannequin store for mode libre"
```

---

## Task 2: Mode Libre prompt construction in geminiService

**Files:**
- Modify: `services/geminiService.ts`

**Step 1: Modify `generateMannequin` to accept `overrideParams`**

Change signature at line 167:

```typescript
export const generateMannequin = async (criteria: MannequinCriteria, overrideParams?: string[]): Promise<string> => {
```

The function already builds a `basePrompt`. After the maps and before prompt construction (around line 259), add mode libre logic:

```typescript
    // Mode libre: if customPrompt is set and no overrideParams specified,
    // the custom prompt IS the main prompt
    const isModeLivre = !!criteria.customPrompt?.trim() && !overrideParams;
    // When called with overrideParams, only include those specific params
    const shouldIncludeParam = (param: string): boolean => {
      if (!overrideParams) return true; // normal mode: include all
      return overrideParams.includes(param);
    };
```

Replace the basePrompt construction (lines 259-267) with:

```typescript
    let basePrompt: string;

    if (isModeLivre) {
      // Custom prompt IS the entire prompt — no params appended
      basePrompt = criteria.customPrompt!.trim();
    } else if (overrideParams) {
      // Mode libre with some overrides: start from custom prompt, append only forced params
      const parts: string[] = [];
      if (criteria.customPrompt?.trim()) parts.push(criteria.customPrompt.trim());
      if (shouldIncludeParam('ethnicity') || shouldIncludeParam('age') || shouldIncludeParam('gender')) {
        const subject: string[] = [];
        if (shouldIncludeParam('gender')) subject.push(criteria.gender);
        if (shouldIncludeParam('age')) subject.push(`${criteria.age} years old`);
        if (shouldIncludeParam('ethnicity')) subject.push(`${ethnicityPrompt} ethnicity`);
        if (subject.length) parts.push(`SUBJECT: ${subject.join(', ')}.`);
      }
      if (shouldIncludeParam('hair')) {
        parts.push(`HAIR: ${criteria.hairColor}, ${hairCutMap[criteria.hairCut] || 'Hair worn loose and natural'}, ${hairLengthMap[criteria.hairLength] || 'medium, shoulder-length'}.`);
      }
      if (shouldIncludeParam('pose')) parts.push(posePrompt);
      if (shouldIncludeParam('vibe')) parts.push(`MOOD: ${vibePrompt}.`);
      if (shouldIncludeParam('lighting') && lightingPrompt) parts.push(`LIGHTING: ${lightingPrompt}.`);
      if (shouldIncludeParam('skin')) parts.push(`SKIN: ${skinPrompt}.`);
      if (shouldIncludeParam('makeup')) parts.push(`MAKEUP: ${makeupPrompt}.`);
      if (shouldIncludeParam('body')) parts.push(`BODY: ${morphologyPrompt}.`);
      basePrompt = parts.join('\n');
    } else {
      // Normal mode: full basePrompt (existing code unchanged)
      basePrompt = `EDITORIAL FASHION PORTRAIT shot on medium format film camera. RAW UNPROCESSED LOOK.
SUBJECT: ${criteria.gender}, ${criteria.age} years old, ${ethnicityPrompt} ethnicity.
HAIR: ${criteria.hairColor}, ${hairCutMap[criteria.hairCut] || 'Hair worn loose and natural'}, ${hairLengthMap[criteria.hairLength] || 'medium, shoulder-length'}.
${posePrompt} Direct eye contact with camera.
MOOD: ${vibePrompt}.${lightingPrompt ? `\nLIGHTING: ${lightingPrompt}.` : ''}
SKIN (CRITICAL): ${skinPrompt}. Photorealistic skin with natural texture — visible pores and subtle skin grain, healthy even complexion. NO blemishes, NO red patches, NO skin conditions. The skin must look like a real healthy person in a professional fashion editorial: real texture but clear, healthy and flattering. Think Vogue/Elle editorial photography standards.
MAKEUP: ${makeupPrompt}.
CLOTHING: Simple dark or neutral top.
TECHNICAL: Shot on Hasselblad H6D loaded with Kodak Portra 400 film. Lens 80mm f/2.8, ${lightingPrompt || 'natural window light with soft fill'}. CRITICAL TEXTURE: Film grain CLEARLY visible on skin and across the image. Skin pores, peach fuzz, and natural micro-texture must be photographic and tactile — NOT smooth, NOT digitally retouched, NOT AI-generated. The image must look like a scanned medium format negative: organic, grainy, human. Color grading: muted, slightly desaturated, warm analog tones.`;
    }

    // In normal mode (no overrideParams), customPrompt is appended as additional instructions
    const prompt = (!overrideParams && criteria.customPrompt?.trim())
      ? `${basePrompt}\nADDITIONAL INSTRUCTIONS: ${criteria.customPrompt.trim()}`
      : basePrompt;
```

**Step 2: Modify `generateMannequinFromReference` to accept `overrideParams`**

Change signature at line 302:

```typescript
export const generateMannequinFromReference = async (
    referenceImageBase64: string,
    criteria: MannequinCriteria,
    overrideParams?: string[]
): Promise<string> => {
```

Replace the Step 2 prompt construction (lines 369-380). Instead of always including ethnicity, age, body, build a prompt that only includes overrideParams:

```typescript
    // ── STEP 2: Generate via Imagen using style notes ──
    const shouldInclude = (param: string): boolean => {
      if (!overrideParams) return true; // legacy behavior
      return overrideParams.includes(param);
    };

    const promptParts: string[] = [
      'EDITORIAL FASHION PORTRAIT shot on medium format analog film.',
    ];

    // Subject line: only include overridden params
    const subjectParts: string[] = [];
    if (shouldInclude('gender')) subjectParts.push(criteria.gender);
    if (shouldInclude('age')) subjectParts.push(`${criteria.age} years old`);
    if (shouldInclude('ethnicity')) subjectParts.push(`${ethnicityPrompt} ethnicity`);
    if (subjectParts.length > 0) {
      promptParts.push(`SUBJECT: ${subjectParts.join(', ')}. Unique individual, original face, original identity.`);
    } else {
      promptParts.push('SUBJECT: Unique individual, original face, original identity.');
    }

    promptParts.push(`STYLE DIRECTION (reproduce this aesthetic precisely, NOT the person):\n${styleNotes}`);
    promptParts.push('SKIN (CRITICAL): Photographic organic skin — visible pores, natural Kodak Portra 400 film grain on skin, peach fuzz, natural micro-texture. Absolutely NO digital smoothing or AI-skin appearance. Looks like a scanned medium format negative.');

    if (shouldInclude('body')) {
      const bodyPrompt =
        (criteria.bodyComposition ?? 50) < 20 ? 'slim petite frame' :
        (criteria.bodyComposition ?? 50) < 40 ? 'slender athletic build' :
        (criteria.bodyComposition ?? 50) < 60 ? 'standard fashion model proportions' :
        (criteria.bodyComposition ?? 50) < 80 ? 'curvy feminine figure' : 'plus-size full figure';
      promptParts.push(`BODY: ${bodyPrompt}.`);
    }
    if (shouldInclude('pose')) {
      const poseMap: Record<string, string> = {
        'standing': 'Standing straight facing camera, relaxed editorial pose.',
        'walking': 'Mid-stride walking towards camera, dynamic movement.',
        'arms_up': 'Standing with hand on hip, confident editorial stance.',
        'sitting': 'Seated pose, upright posture, relaxed shoulders.',
      };
      promptParts.push(poseMap[criteria.pose || ''] || '');
    }
    if (shouldInclude('lighting') && criteria.lighting) {
      const lightMap: Record<string, string> = {
        'soft': 'LIGHTING: soft diffused natural window light.',
        'studio': 'LIGHTING: professional studio lighting.',
        'dramatic': 'LIGHTING: dramatic chiaroscuro lighting.',
      };
      promptParts.push(lightMap[criteria.lighting] || '');
    }
    if (criteria.customPrompt?.trim()) promptParts.push(`ADDITIONAL: ${criteria.customPrompt.trim()}`);

    const generationPrompt = promptParts.filter(Boolean).join('\n');
```

Then update the Imagen call (line 384) to use `generationPrompt` (it already does, just make sure the variable name matches).

**Step 3: Verify build**

Run: `npm run build`

**Step 4: Commit**

```bash
git add services/geminiService.ts
git commit -m "feat: mode libre prompt construction — skip params when overrideParams provided"
```

---

## Task 3: Mode Libre UI in MannequinEngine

**Files:**
- Modify: `components/MannequinEngine.tsx`

**Step 1: Import overrideParams from store and compute mode libre state**

At the top of the component (around line 190 where store destructuring happens), add:

```typescript
const overrideParams = useMannequinStore(s => s.overrideParams);
const toggleOverrideParam = useMannequinStore(s => s.toggleOverrideParam);
const clearOverrideParams = useMannequinStore(s => s.clearOverrideParams);
```

Compute mode libre detection:

```typescript
const isModeLibre = !!(referenceImage || criteria.customPrompt?.trim());
```

**Step 2: Create a `ParamSection` wrapper component**

Add this inline component near the top of the file (after `SectionLabel`, around line 21):

```typescript
/** Wraps a parameter section with mode libre override toggle */
const ParamSection: React.FC<{
  paramKey: string;
  label: string;
  isModeLibre: boolean;
  isOverridden: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}> = ({ paramKey, label, isModeLibre, isOverridden, onToggle, children }) => (
  <div className={`relative transition-opacity ${isModeLibre && !isOverridden ? 'opacity-40' : ''}`}>
    <div className="flex items-center justify-between mb-2">
      <span className="block text-xs font-semibold uppercase tracking-wider text-gray-500 select-none">
        {label}
      </span>
      {isModeLibre && (
        <button
          type="button"
          onClick={onToggle}
          className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded transition-colors ${
            isOverridden
              ? 'bg-indigo-100 text-indigo-600 border border-indigo-300'
              : 'bg-gray-100 text-gray-400 border border-gray-200 hover:border-indigo-300 hover:text-indigo-500'
          }`}
          title={isOverridden ? 'Ce paramètre sera inclus dans la génération' : 'Cliquer pour forcer ce paramètre'}
        >
          {isOverridden ? 'Actif' : 'Ignoré'}
        </button>
      )}
    </div>
    {isModeLibre && !isOverridden ? (
      <div className="pointer-events-none">{children}</div>
    ) : (
      children
    )}
  </div>
);
```

**Step 3: Replace `SectionLabel` + `<div>` with `ParamSection` in left panel**

For each parameter section in the left panel (Model Ethnicity, Age, Coupe, Longueur, Aesthetic, Makeup, Corpulence, Dynamic Pose, Lighting Environment), replace the pattern:

```tsx
{/* Before */}
<div>
  <SectionLabel>Model Ethnicity</SectionLabel>
  ...
</div>

{/* After */}
<ParamSection paramKey="ethnicity" label="Model Ethnicity" isModeLibre={isModeLibre} isOverridden={overrideParams.includes('ethnicity')} onToggle={() => toggleOverrideParam('ethnicity')}>
  ...
</ParamSection>
```

Apply this pattern for all sections with these paramKeys:
- `ethnicity` → "Model Ethnicity"
- `age` → "Age"
- `hair` → "Coupe" (covers hairCut)
- `hair` → "Longueur" (same key, covers hairLength — use `hair` for both)
- `vibe` → "Aesthetic"
- `makeup` → "Makeup"
- `body` → "Corpulence"
- `pose` → "Dynamic Pose"
- `lighting` → "Lighting Environment"

Note: "Coupe" and "Longueur" share the `hair` paramKey since they're related.

**Step 4: Add mode libre banner at top of left panel**

Just before the "Photo de référence" section (around line 403), add:

```tsx
{isModeLibre && (
  <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 mb-4">
    <div className="flex items-center gap-2 mb-1">
      <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse" />
      <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">
        Mode libre actif
      </span>
    </div>
    <p className="text-[10px] text-indigo-500/80 leading-relaxed">
      {referenceImage ? 'La photo de référence guide le style.' : 'Le prompt libre guide la génération.'}
      {' '}Paramètres ignorés par défaut — cliquez "Ignoré" pour forcer un paramètre.
    </p>
    {overrideParams.length > 0 && (
      <button
        type="button"
        onClick={clearOverrideParams}
        className="text-[9px] text-indigo-400 hover:text-indigo-600 mt-1.5 underline"
      >
        Tout désactiver ({overrideParams.length} actifs)
      </button>
    )}
  </div>
)}
```

**Step 5: Pass overrideParams to generation functions**

In `handleGenerate` (line 300), update the calls:

```typescript
const handleGenerate = useCallback(async () => {
  setIsGenerating(true);
  setError(null);
  try {
    const effectiveOverrides = isModeLibre ? overrideParams : undefined;
    const base64Image = referenceImage
      ? await generateMannequinFromReference(referenceImage, criteria, effectiveOverrides)
      : await generateMannequin(criteria, effectiveOverrides);
    setCurrentImage(base64Image);
    clearRefinements();
  } catch (err: any) {
    setError(err.message || 'Generation failed.');
  } finally {
    setIsGenerating(false);
  }
}, [criteria, referenceImage, isModeLibre, overrideParams, setCurrentImage, setIsGenerating, setError, clearRefinements]);
```

**Step 6: Verify build**

Run: `npm run build`

**Step 7: Commit**

```bash
git add components/MannequinEngine.tsx
git commit -m "feat: mode libre UI — auto-gray params, override toggles, banner"
```

---

## Task 4: Add `ExtractionLevel` type and `CustomPreset` type

**Files:**
- Modify: `types.ts`

**Step 1: Add types**

At the end of `types.ts` (after line 132):

```typescript
// Production reference photo analysis
export type ExtractionLevel = 'scene-pose-style' | 'scene-pose-style-placement' | 'full';

export interface CustomPreset {
  id: string;
  name: string;
  prompt: string;
  createdAt: string;
}
```

**Step 2: Commit**

```bash
git add types.ts
git commit -m "feat: add ExtractionLevel and CustomPreset types"
```

---

## Task 5: Add `analyzeProductionReference` to geminiService

**Files:**
- Modify: `services/geminiService.ts`

**Step 1: Add imports**

At line 1, add `ExtractionLevel` to the import:

```typescript
import { ExtractionResult, MannequinCriteria, RefinementType, RefinementSelections, ExtractionLevel } from "../types";
```

**Step 2: Add `analyzeProductionReference` function**

After `generateStackedProductionPhoto` (after line 650), add:

```typescript
/**
 * Analyze a production reference photo and extract a reusable scene/style prompt.
 * The analysis deliberately excludes specific jewelry and model identity.
 */
export const analyzeProductionReference = async (
    imageBase64: string,
    extractionLevel: ExtractionLevel
): Promise<string> => {
    const imageData = imageBase64.includes('base64,')
        ? imageBase64.split(',')[1]
        : imageBase64;

    const mimeType = imageBase64.startsWith('data:image/jpeg') ? 'image/jpeg'
        : imageBase64.startsWith('data:image/webp') ? 'image/webp'
        : 'image/png';

    const levelPrompts: Record<ExtractionLevel, string> = {
        'scene-pose-style': `Analyze this jewelry/fashion production photo and extract a reusable scene description. You MUST describe:

1. SCENE: Background setting, environment, props, colors, textures
2. LIGHTING: Direction, quality (hard/soft), color temperature, shadows, highlights
3. POSE: Model's body position, hand placement, head angle, gaze direction
4. PHOTOGRAPHY STYLE: Camera angle, framing, depth of field, mood, color grading

CRITICAL RULES:
- Do NOT describe any jewelry, accessories, or specific products visible in the photo
- Do NOT describe the model's physical identity (face features, skin color, ethnicity, age)
- Write as a PRODUCTION DIRECTIVE that could be used to recreate this exact scene with a DIFFERENT model and DIFFERENT jewelry
- Use imperative language: "Position the model...", "Light from...", "Frame with..."
- Be specific about distances, angles, and technical details`,

        'scene-pose-style-placement': `Analyze this jewelry/fashion production photo and extract a reusable scene description. You MUST describe:

1. SCENE: Background setting, environment, props, colors, textures
2. LIGHTING: Direction, quality (hard/soft), color temperature, shadows, highlights
3. POSE: Model's body position, hand placement, head angle, gaze direction
4. PHOTOGRAPHY STYLE: Camera angle, framing, depth of field, mood, color grading
5. JEWELRY PRESENTATION: How the jewelry is showcased — angle of display, proximity to camera, how the model's pose emphasizes the jewelry, whether hair is tucked to show earrings, hand positioned to show ring, etc.

CRITICAL RULES:
- Do NOT describe the specific jewelry pieces (no "gold chain", "diamond ring", etc.)
- Do NOT describe the model's physical identity (face features, skin color, ethnicity, age)
- For jewelry presentation, describe HOW jewelry is showcased, not WHAT jewelry is shown
- Write as a PRODUCTION DIRECTIVE for recreating this scene with different model and different jewelry
- Use imperative language and be specific about technical details`,

        'full': `Analyze this jewelry/fashion production photo and extract a comprehensive, reusable production description. You MUST describe:

1. SCENE: Background setting, environment, props, colors, textures, depth
2. LIGHTING: Direction, quality, color temperature, shadows, highlights, reflections
3. POSE: Body position, hand placement, head angle, gaze, weight distribution, expression mood
4. PHOTOGRAPHY STYLE: Camera angle, lens type, framing, depth of field, color grading
5. CLOTHING: Outfit style, color, fabric type, neckline, sleeves (without brand names)
6. MAKEUP & HAIR STYLING: Makeup intensity and style, hair arrangement relative to jewelry display
7. MOOD & ATMOSPHERE: Overall emotional tone, luxury level, editorial vs commercial feel
8. JEWELRY PRESENTATION: How jewelry is emphasized through pose, framing, and styling

CRITICAL RULES:
- Do NOT describe specific jewelry pieces (no "gold necklace", "pearl earrings", etc.)
- Do NOT describe the model's physical identity (face shape, skin color, ethnicity, specific age)
- Write as a PRODUCTION DIRECTIVE for recreating this exact atmosphere with a different model and different jewelry
- Use imperative language: "Position...", "Light from...", "Style hair to..."
- Be specific and technical — another photographer should be able to recreate this scene`,
    };

    const analysisModels = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-3-pro-image-preview'];
    let result = '';

    for (const model of analysisModels) {
        try {
            const response = await callGeminiAPI(model, {
                contents: [{
                    parts: [
                        { text: levelPrompts[extractionLevel] },
                        { inlineData: { mimeType, data: imageData } },
                    ],
                }],
                generationConfig: { responseModalities: ['TEXT'] },
            });
            const extracted = response.candidates?.[0]?.content?.parts
                ?.filter((p: any) => p.text)
                ?.map((p: any) => p.text)
                ?.join('') || '';
            if (extracted.length > 50) {
                result = extracted;
                console.log(`[REF-ANALYSIS] Extracted via ${model}:`, result.substring(0, 200));
                break;
            }
        } catch (err: any) {
            console.warn(`[REF-ANALYSIS] ${model} failed:`, err?.message || err);
        }
    }

    if (!result) {
        throw new Error('Could not analyze reference photo. Try a different image or try again.');
    }

    return result;
};
```

**Step 3: Verify build**

Run: `npm run build`

**Step 4: Commit**

```bash
git add services/geminiService.ts
git commit -m "feat: add analyzeProductionReference for extracting scene prompts from photos"
```

---

## Task 6: Add custom presets to Production Store

**Files:**
- Modify: `stores/useProductionStore.ts`

**Step 1: Import types and add custom presets state**

Update imports at line 1-2:

```typescript
import { create } from 'zustand';
import { ProductionItem, Product, CustomPreset } from '../types';
```

Add to the interface (after line 12):

```typescript
  // Custom presets from reference photo analysis
  customPresets: CustomPreset[];
  addCustomPreset: (preset: CustomPreset) => void;
  removeCustomPreset: (id: string) => void;
```

Add to the store body:

```typescript
  customPresets: JSON.parse(localStorage.getItem('production-custom-presets') || '[]'),

  addCustomPreset: (preset) =>
    set((state) => {
      const updated = [...state.customPresets, preset];
      localStorage.setItem('production-custom-presets', JSON.stringify(updated));
      return { customPresets: updated };
    }),

  removeCustomPreset: (id) =>
    set((state) => {
      const updated = state.customPresets.filter(p => p.id !== id);
      localStorage.setItem('production-custom-presets', JSON.stringify(updated));
      return { customPresets: updated };
    }),
```

**Step 2: Verify build**

Run: `npm run build`

**Step 3: Commit**

```bash
git add stores/useProductionStore.ts
git commit -m "feat: add custom presets to production store with localStorage persistence"
```

---

## Task 7: Reference Photo Analysis UI in ProductionEngine

**Files:**
- Modify: `components/ProductionEngine.tsx`

**Step 1: Add imports**

```typescript
import { generateProductionPhoto, generateStackedProductionPhoto, analyzeProductionReference } from '../services/geminiService';
import { useProductionStore } from '../stores/useProductionStore';
import { ExtractionLevel, CustomPreset } from '../types';
```

**Step 2: Add state for the reference analysis modal**

Inside the component, add state variables (after line 41):

```typescript
const [showRefModal, setShowRefModal] = useState(false);
const [refImage, setRefImage] = useState<string | null>(null);
const [extractionLevel, setExtractionLevel] = useState<ExtractionLevel>('scene-pose-style');
const [isAnalyzing, setIsAnalyzing] = useState(false);
const [extractedPrompt, setExtractedPrompt] = useState('');
const [presetName, setPresetName] = useState('');

// Access custom presets from store
const { customPresets, addCustomPreset, removeCustomPreset } = useProductionStore();
```

**Step 3: Add handler for reference photo upload and analysis**

```typescript
const handleRefUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (file) {
    const reader = new FileReader();
    reader.onloadend = () => {
      setRefImage(reader.result as string);
      setExtractedPrompt('');
    };
    reader.readAsDataURL(file);
  }
};

const handleAnalyze = async () => {
  if (!refImage) return;
  setIsAnalyzing(true);
  try {
    const result = await analyzeProductionReference(refImage, extractionLevel);
    setExtractedPrompt(result);
  } catch (err: any) {
    alert(err.message || 'Analysis failed');
  } finally {
    setIsAnalyzing(false);
  }
};

const handleApplyExtracted = () => {
  setArtisticDirection(extractedPrompt);
  setSelectedPreset('custom');
  setShowRefModal(false);
};

const handleSaveAsPreset = () => {
  if (!presetName.trim() || !extractedPrompt.trim()) return;
  const preset: CustomPreset = {
    id: crypto.randomUUID(),
    name: presetName.trim(),
    prompt: extractedPrompt,
    createdAt: new Date().toISOString(),
  };
  addCustomPreset(preset);
  setPresetName('');
};
```

**Step 4: Add "Import Reference" button next to preset dropdown**

In the right panel, after the preset `<select>` (around line 423), add:

```tsx
<button
  onClick={() => setShowRefModal(true)}
  className="text-[9px] font-bold uppercase text-indigo-600 hover:text-indigo-500 border border-indigo-300 rounded px-2 py-1 transition-colors"
>
  Import Ref
</button>
```

**Step 5: Add custom presets to the preset dropdown**

In the `<select>` for presets (lines 409-422), add custom preset options after the existing ones:

```tsx
{customPresets.length > 0 && <option disabled>──────────</option>}
{customPresets.map(p => (
  <option key={p.id} value={`custom-${p.id}`}>{p.name}</option>
))}
```

Update `handlePresetChange` to handle custom presets:

```typescript
const handlePresetChange = (preset: string) => {
  if (preset.startsWith('custom-')) {
    const customId = preset.replace('custom-', '');
    const found = customPresets.find(p => p.id === customId);
    if (found) {
      setArtisticDirection(found.prompt);
      setSelectedPreset('custom');
      return;
    }
  }
  setSelectedPreset(preset as keyof typeof PROMPT_PRESETS);
  if (preset === 'custom') return;
  setArtisticDirection(PROMPT_PRESETS[preset as keyof typeof PROMPT_PRESETS] || '');
};
```

**Step 6: Add the reference analysis modal**

At the end of the component JSX (just before the closing `</div>` of the root), add:

```tsx
{/* Reference Photo Analysis Modal */}
{showRefModal && (
  <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowRefModal(false)}>
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
      <div className="p-5 border-b border-gray-200">
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-bold uppercase tracking-widest text-gray-900">Import Reference Photo</h3>
          <button onClick={() => setShowRefModal(false)} className="w-6 h-6 rounded-full bg-gray-100 text-gray-500 text-xs flex items-center justify-center hover:bg-gray-200">×</button>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Upload zone */}
        {refImage ? (
          <div className="relative rounded-lg border border-indigo-300 overflow-hidden">
            <img src={refImage} className="w-full h-48 object-cover" />
            <button onClick={() => { setRefImage(null); setExtractedPrompt(''); }} className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/50 text-white text-xs flex items-center justify-center hover:bg-black/70">×</button>
          </div>
        ) : (
          <label className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 hover:border-indigo-400 hover:bg-indigo-50/50 py-8 cursor-pointer transition-colors">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            <span className="text-xs font-semibold text-gray-500">Upload a production reference photo</span>
            <span className="text-[10px] text-gray-400">The AI will extract the scene, pose, and style</span>
            <input type="file" accept="image/*" className="hidden" onChange={handleRefUpload} />
          </label>
        )}

        {/* Extraction level selector */}
        {refImage && !extractedPrompt && (
          <>
            <div>
              <label className="text-[9px] font-bold uppercase text-gray-400 block mb-2">Extraction Level</label>
              <div className="space-y-2">
                {([
                  { key: 'scene-pose-style' as ExtractionLevel, label: 'Scène + Pose + Style', desc: 'Décor, lumière, pose, style photo. Ignore bijoux et identité.' },
                  { key: 'scene-pose-style-placement' as ExtractionLevel, label: '+ Placement bijoux', desc: 'Idem + comment les bijoux sont mis en valeur (sans les décrire).' },
                  { key: 'full' as ExtractionLevel, label: 'Extraction complète', desc: 'Scène, pose, style, vêtements, maquillage, ambiance. Tout sauf identité et bijoux.' },
                ] as const).map(({ key, label, desc }) => (
                  <button
                    key={key}
                    onClick={() => setExtractionLevel(key)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      extractionLevel === key
                        ? 'border-indigo-400 bg-indigo-50'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <span className="text-xs font-bold text-gray-900">{label}</span>
                    <span className="block text-[10px] text-gray-500 mt-0.5">{desc}</span>
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={handleAnalyze}
              disabled={isAnalyzing}
              className="w-full h-10 text-sm tracking-widest uppercase font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg disabled:opacity-60 flex items-center justify-center gap-2 transition-colors"
            >
              {isAnalyzing ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Analyzing...
                </>
              ) : 'Analyze Photo'}
            </button>
          </>
        )}

        {/* Extracted prompt display */}
        {extractedPrompt && (
          <>
            <div>
              <label className="text-[9px] font-bold uppercase text-gray-400 block mb-2">Extracted Prompt (editable)</label>
              <textarea
                className="w-full h-40 bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-700 outline-none resize-none focus:border-indigo-400 transition-colors"
                value={extractedPrompt}
                onChange={(e) => setExtractedPrompt(e.target.value)}
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleApplyExtracted}
                className="flex-1 h-10 text-xs tracking-widest uppercase font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
              >
                Apply to Batch
              </button>
              <button
                onClick={() => { handleApplyExtracted(); }}
                className="h-10 px-4 text-xs tracking-widest uppercase font-bold bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Apply & Close
              </button>
            </div>

            {/* Save as preset */}
            <div className="border-t border-gray-200 pt-3">
              <label className="text-[9px] font-bold uppercase text-gray-400 block mb-2">Save as Custom Preset</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Preset name..."
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  className="flex-1 h-9 bg-gray-50 border border-gray-200 rounded-lg px-3 text-xs outline-none focus:border-indigo-400 transition-colors"
                />
                <button
                  onClick={handleSaveAsPreset}
                  disabled={!presetName.trim()}
                  className="h-9 px-4 text-[10px] font-bold uppercase bg-purple-600 hover:bg-purple-500 text-white rounded-lg disabled:opacity-40 transition-colors"
                >
                  Save
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  </div>
)}
```

**Step 7: Verify build**

Run: `npm run build`

**Step 8: Commit**

```bash
git add components/ProductionEngine.tsx types.ts
git commit -m "feat: reference photo analysis modal in Production Engine with custom presets"
```

---

## Task 8: Manual testing & polish

**Step 1: Test Mode Libre (Mannequin Engine)**

1. Open the app, go to Mannequin Engine
2. Enter a custom prompt like "A young woman in a red dress, standing in a garden" — verify that left panel params are grayed out, mode libre banner shows
3. Click "Ignoré" on "Lighting" → verify it turns to "Actif" and the lighting param is no longer grayed
4. Generate → verify the prompt uses mainly the custom text + the forced lighting param
5. Upload a reference photo → verify mode libre activates, params grayed
6. Clear the reference photo and custom prompt → verify normal mode returns

**Step 2: Test Production Reference**

1. Go to Production Engine
2. Click "Import Ref" button → verify modal opens
3. Upload a production photo → verify image appears
4. Select extraction level → click "Analyze Photo"
5. Verify extracted prompt appears in textarea, is editable
6. Click "Apply to Batch" → verify prompt fills the Atmosphere Prompt textarea
7. Enter a name and click "Save" → verify preset appears in dropdown
8. Select the saved preset from dropdown → verify prompt loads

**Step 3: Commit any polish fixes**

```bash
git add -A
git commit -m "fix: polish mode libre and production reference UI"
```

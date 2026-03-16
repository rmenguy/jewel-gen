# Banner Engine Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Banner Engine module that generates 4K 16:9 jewelry banner photos from identity reference photos, with automatic placement point detection and interactive jewelry assignment.

**Architecture:** 4-step pipeline (mannequin generation → point detection → jewelry composition → repositioning) implemented as a new engine tab. Uses `gemini-3-pro-image-preview` for all passes. Follows existing 3-column layout pattern (config / preview / jewelry list) with a step indicator.

**Tech Stack:** React 19, TypeScript, Zustand, TailwindCSS, Gemini API (direct browser fetch)

**Spec:** `docs/superpowers/specs/2026-03-16-banner-engine-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `types.ts` | Modify | Add `PlacementPoint`, `BannerJewelry`, extend `EngineType` |
| `stores/useBannerStore.ts` | Create | Banner module state: inputs, mannequin, points, jewelry, banner, history, error |
| `services/geminiService.ts` | Modify | Add `generateBannerMannequin()`, `detectPlacementPoints()`, `generateBannerWithJewelry()` |
| `stores/useAppStore.ts` | Modify | Add `'BANNER'` to `EngineType` (handled via types.ts) |
| `App.tsx` | Modify | Add Banner tab + routing |
| `components/BannerEngine.tsx` | Create | Main UI: stepper, 3-column layout, step-specific panels |

---

## Chunk 1: Types + Store + Routing

### Task 1: Add types to types.ts

**Files:**
- Modify: `types.ts` — add `PlacementPoint`, `BannerJewelry`, extend `EngineType`

- [ ] **Step 1: Add `'BANNER'` to EngineType**

In `types.ts`, find the `EngineType` definition and add `'BANNER'`:

```typescript
export type EngineType = 'CATALOG' | 'MANNEQUIN' | 'PRODUCTION' | 'BATCH' | 'BANNER';
```

- [ ] **Step 2: Add PlacementPoint and BannerJewelry interfaces**

Append at the end of `types.ts`:

```typescript
// ─── Banner Engine ───────────────────────────────────────────

export interface PlacementPoint {
  id: number;
  label: string;
  zone: 'ear' | 'neck' | 'chest' | 'finger' | 'wrist' | 'ankle';
  x: number;  // 0-100 (% from left)
  y: number;  // 0-100 (% from top)
  assignedJewelryId: string | null;
}

export interface BannerJewelry {
  id: string;
  name: string;
  imageBase64: string;
  assignedPointId: number | null;
}
```

- [ ] **Step 3: Commit**

```bash
git add types.ts
git commit -m "feat(banner): add PlacementPoint, BannerJewelry types + BANNER engine type"
```

---

### Task 2: Create useBannerStore.ts

**Files:**
- Create: `stores/useBannerStore.ts`

- [ ] **Step 1: Create the store**

Create `stores/useBannerStore.ts` following the `useMannequinStore.ts` pattern (flat state + actions in same interface, `create<T>()` pattern):

```typescript
import { create } from 'zustand';
import { PlacementPoint, BannerJewelry } from '../types';

const MAX_HISTORY = 10;

interface BannerStore {
  // Step tracking
  currentStep: 1 | 2 | 3 | 4;

  // Step 1: Inputs
  identityPhotos: string[];
  poseReference: string | null;
  backgroundImage: string | null;
  outfitPrompt: string;
  ambiancePrompt: string;
  posePrompt: string;

  // Step 1: Output
  mannequinImage: string | null;
  isGeneratingMannequin: boolean;

  // Step 2: Placement
  detectedPoints: PlacementPoint[];
  jewelryItems: BannerJewelry[];
  isDetectingPoints: boolean;

  // Step 3: Generation
  bannerImage: string | null;
  isGeneratingBanner: boolean;

  // Step 4: Refinement
  selectedJewelryId: string | null;
  isRepositioning: boolean;

  // History
  mannequinHistory: string[];
  bannerHistory: string[];

  // Error
  error: string | null;

  // Actions — Step
  setCurrentStep: (step: 1 | 2 | 3 | 4) => void;

  // Actions — Inputs
  addIdentityPhoto: (base64: string) => void;
  removeIdentityPhoto: (index: number) => void;
  setPoseReference: (base64: string | null) => void;
  setBackgroundImage: (base64: string | null) => void;
  setOutfitPrompt: (text: string) => void;
  setAmbiancePrompt: (text: string) => void;
  setPosePrompt: (text: string) => void;

  // Actions — Mannequin
  setMannequinImage: (base64: string | null) => void;
  setIsGeneratingMannequin: (v: boolean) => void;

  // Actions — Placement
  setDetectedPoints: (points: PlacementPoint[]) => void;
  setIsDetectingPoints: (v: boolean) => void;
  addJewelry: (item: BannerJewelry) => void;
  removeJewelry: (id: string) => void;
  assignJewelry: (jewelryId: string, pointId: number) => void;
  unassignJewelry: (jewelryId: string) => void;

  // Actions — Banner
  setBannerImage: (base64: string | null) => void;
  setIsGeneratingBanner: (v: boolean) => void;

  // Actions — Refinement
  setSelectedJewelryId: (id: string | null) => void;
  setIsRepositioning: (v: boolean) => void;

  // Actions — History
  pushToMannequinHistory: (base64: string) => void;
  undoMannequin: () => void;
  pushToBannerHistory: (base64: string) => void;
  undoBanner: () => void;

  // Actions — Error & Reset
  setError: (e: string | null) => void;
  resetAll: () => void;

  // Navigation helpers
  goBackToStep: (step: 1 | 2 | 3) => void;
}

export const useBannerStore = create<BannerStore>((set) => ({
  // Defaults
  currentStep: 1,
  identityPhotos: [],
  poseReference: null,
  backgroundImage: null,
  outfitPrompt: '',
  ambiancePrompt: '',
  posePrompt: '',
  mannequinImage: null,
  isGeneratingMannequin: false,
  detectedPoints: [],
  jewelryItems: [],
  isDetectingPoints: false,
  bannerImage: null,
  isGeneratingBanner: false,
  selectedJewelryId: null,
  isRepositioning: false,
  mannequinHistory: [],
  bannerHistory: [],
  error: null,

  // Step
  setCurrentStep: (step) => set({ currentStep: step, error: null }),

  // Inputs
  addIdentityPhoto: (base64) => set((s) => {
    if (s.identityPhotos.length >= 3) return s;
    return { identityPhotos: [...s.identityPhotos, base64] };
  }),
  removeIdentityPhoto: (index) => set((s) => ({
    identityPhotos: s.identityPhotos.filter((_, i) => i !== index),
  })),
  setPoseReference: (base64) => set({ poseReference: base64 }),
  setBackgroundImage: (base64) => set({ backgroundImage: base64 }),
  setOutfitPrompt: (text) => set({ outfitPrompt: text }),
  setAmbiancePrompt: (text) => set({ ambiancePrompt: text }),
  setPosePrompt: (text) => set({ posePrompt: text }),

  // Mannequin
  setMannequinImage: (base64) => set({ mannequinImage: base64 }),
  setIsGeneratingMannequin: (v) => set({ isGeneratingMannequin: v }),

  // Placement
  setDetectedPoints: (points) => set({ detectedPoints: points }),
  setIsDetectingPoints: (v) => set({ isDetectingPoints: v }),
  addJewelry: (item) => set((s) => {
    if (s.jewelryItems.length >= 8) return s;
    return { jewelryItems: [...s.jewelryItems, item] };
  }),
  removeJewelry: (id) => set((s) => ({
    jewelryItems: s.jewelryItems.filter((j) => j.id !== id),
    detectedPoints: s.detectedPoints.map((p) =>
      p.assignedJewelryId === id ? { ...p, assignedJewelryId: null } : p
    ),
  })),
  assignJewelry: (jewelryId, pointId) => set((s) => ({
    jewelryItems: s.jewelryItems.map((j) =>
      j.id === jewelryId ? { ...j, assignedPointId: pointId } : j
    ),
    detectedPoints: s.detectedPoints.map((p) => {
      if (p.id === pointId) return { ...p, assignedJewelryId: jewelryId };
      if (p.assignedJewelryId === jewelryId) return { ...p, assignedJewelryId: null };
      return p;
    }),
  })),
  unassignJewelry: (jewelryId) => set((s) => ({
    jewelryItems: s.jewelryItems.map((j) =>
      j.id === jewelryId ? { ...j, assignedPointId: null } : j
    ),
    detectedPoints: s.detectedPoints.map((p) =>
      p.assignedJewelryId === jewelryId ? { ...p, assignedJewelryId: null } : p
    ),
  })),

  // Banner
  setBannerImage: (base64) => set({ bannerImage: base64 }),
  setIsGeneratingBanner: (v) => set({ isGeneratingBanner: v }),

  // Refinement
  setSelectedJewelryId: (id) => set({ selectedJewelryId: id }),
  setIsRepositioning: (v) => set({ isRepositioning: v }),

  // History — Mannequin
  pushToMannequinHistory: (base64) => set((s) => ({
    mannequinHistory: [base64, ...s.mannequinHistory].slice(0, MAX_HISTORY),
  })),
  undoMannequin: () => set((s) => {
    if (s.mannequinHistory.length === 0) return s;
    const [restored, ...rest] = s.mannequinHistory;
    return { mannequinImage: restored, mannequinHistory: rest };
  }),

  // History — Banner
  pushToBannerHistory: (base64) => set((s) => ({
    bannerHistory: [base64, ...s.bannerHistory].slice(0, MAX_HISTORY),
  })),
  undoBanner: () => set((s) => {
    if (s.bannerHistory.length === 0) return s;
    const [restored, ...rest] = s.bannerHistory;
    return { bannerImage: restored, bannerHistory: rest };
  }),

  // Error & Reset
  setError: (e) => set({ error: e }),
  resetAll: () => set({
    currentStep: 1,
    identityPhotos: [],
    poseReference: null,
    backgroundImage: null,
    outfitPrompt: '',
    ambiancePrompt: '',
    posePrompt: '',
    mannequinImage: null,
    isGeneratingMannequin: false,
    detectedPoints: [],
    jewelryItems: [],
    isDetectingPoints: false,
    bannerImage: null,
    isGeneratingBanner: false,
    selectedJewelryId: null,
    isRepositioning: false,
    mannequinHistory: [],
    bannerHistory: [],
    error: null,
  }),

  // Navigation helpers — handle state resets per spec
  goBackToStep: (step) => set((s) => {
    if (step === 1) {
      return {
        currentStep: 1,
        detectedPoints: [],
        bannerImage: null,
        bannerHistory: [],
        selectedJewelryId: null,
        error: null,
        // Reset assignments on jewelry items
        jewelryItems: s.jewelryItems.map((j) => ({ ...j, assignedPointId: null })),
      };
    }
    if (step === 2) {
      return {
        currentStep: 2,
        bannerImage: null,
        bannerHistory: [],
        selectedJewelryId: null,
        error: null,
      };
    }
    return { currentStep: step as 1 | 2 | 3 | 4, error: null };
  }),
}));
```

- [ ] **Step 2: Commit**

```bash
git add stores/useBannerStore.ts
git commit -m "feat(banner): create useBannerStore with full state management"
```

---

### Task 3: Wire Banner tab into App.tsx

**Files:**
- Modify: `App.tsx` — add Banner tab + routing

- [ ] **Step 1: Add import**

At the top of `App.tsx`, add the import alongside the other engine imports:

```typescript
import BannerEngine from './components/BannerEngine';
```

Note: `BannerEngine.tsx` doesn't exist yet — we'll create a placeholder in the next step to avoid a build error.

- [ ] **Step 2: Add 'BANNER' to engine tabs array**

Find the tabs array (around line 99) and add `'BANNER'`:

```typescript
{['CATALOG', 'MANNEQUIN', 'PRODUCTION', 'BATCH', 'BANNER'].map((engine) => (
```

- [ ] **Step 3: Add mobile dropdown option**

Find the mobile select dropdown (around line 120-123) and add:

```html
<option value="BANNER">BANNER</option>
```

- [ ] **Step 4: Add engine routing block**

Find the engine routing section (around line 131-150) and add a new block:

```tsx
<div className={activeEngine === 'BANNER' ? 'block' : 'hidden'}>
  <BannerEngine />
</div>
```

- [ ] **Step 5: Create placeholder BannerEngine.tsx**

Create `components/BannerEngine.tsx` with a minimal placeholder:

```tsx
export default function BannerEngine() {
  return (
    <div className="flex items-center justify-center h-96 text-gray-400">
      Banner Engine — Coming soon
    </div>
  );
}
```

- [ ] **Step 6: Verify build**

Run: `cd /Users/raphael.menguy/Desktop/PERSO/catalogue-engine-1902 && npm run build`

Expected: Build succeeds with no errors.

- [ ] **Step 7: Commit**

```bash
git add App.tsx components/BannerEngine.tsx
git commit -m "feat(banner): wire Banner tab into app routing with placeholder"
```

---

## Chunk 2: API Functions (geminiService.ts)

### Task 4: Add generateBannerMannequin()

**Files:**
- Modify: `services/geminiService.ts` — append after line 1881

- [ ] **Step 1: Add the function**

Append at the end of `services/geminiService.ts`:

```typescript
// ─── Banner Engine ───────────────────────────────────────────

/**
 * Generate a 16:9 mannequin photo from identity reference photos.
 * The mannequin preserves the identity of the person in the photos.
 * Optionally uses a pose reference and/or background image.
 * Output has NO jewelry — clean skin at placement areas.
 */
export async function generateBannerMannequin(
  identityPhotos: string[],
  poseReference: string | null,
  backgroundImage: string | null,
  outfitPrompt: string,
  ambiancePrompt: string,
  posePrompt: string,
): Promise<string> {
  if (identityPhotos.length === 0) {
    throw new Error('At least one identity photo is required');
  }

  const parts: any[] = [];

  // Identity photos
  for (const photo of identityPhotos) {
    const raw = photo.includes('base64,') ? photo.split(',')[1] : photo;
    parts.push({ inlineData: { mimeType: 'image/jpeg', data: raw } });
  }

  // Pose reference
  if (poseReference) {
    const raw = poseReference.includes('base64,') ? poseReference.split(',')[1] : poseReference;
    parts.push({ inlineData: { mimeType: 'image/jpeg', data: raw } });
  }

  // Background image
  if (backgroundImage) {
    const raw = backgroundImage.includes('base64,') ? backgroundImage.split(',')[1] : backgroundImage;
    parts.push({ inlineData: { mimeType: 'image/jpeg', data: raw } });
  }

  // Build prompt
  let prompt = `Generate a HIGH-QUALITY professional banner photograph in LANDSCAPE 16:9 format.

CRITICAL — IDENTITY PRESERVATION:
The model in the photo MUST look IDENTICAL to the person in the ${identityPhotos.length} reference photo(s) provided. Same face, same skin tone, same features. This is a real person — preserve their exact appearance.

OUTFIT: ${outfitPrompt || 'Elegant, fashionable clothing appropriate for a luxury jewelry brand banner.'}

ATMOSPHERE & LIGHTING: ${ambiancePrompt || 'Professional studio lighting, warm and luxurious.'}
`;

  if (poseReference) {
    prompt += `\nPOSE & FRAMING: Match the EXACT pose, body position, and camera framing of the pose reference image provided. Reproduce the composition precisely.\n`;
  } else if (posePrompt) {
    prompt += `\nPOSE & FRAMING: ${posePrompt}\n`;
  } else {
    prompt += `\nPOSE & FRAMING: Tight bust crop, confident direct gaze at camera, hands visible near décolleté area. Professional fashion editorial composition.\n`;
  }

  if (backgroundImage) {
    prompt += `\nBACKGROUND: Use the background/environment from the background reference image provided. Integrate the model naturally into this setting.\n`;
  }

  prompt += `
CRITICAL — NO JEWELRY:
Do NOT add any jewelry, accessories, or adornments. The model's ears, neck, décolleté, wrists, and fingers must be COMPLETELY BARE and clean. These areas will receive jewelry in a later step.

OUTPUT: Wide landscape 16:9 banner format. Highest possible resolution and photographic quality.`;

  parts.push({ text: prompt });

  const requestBody = {
    contents: [{ parts }],
    generationConfig: {
      responseModalities: ['IMAGE', 'TEXT'],
      imageConfig: { imageSize: '4K' },
    },
  };

  return withRetry(async () => {
    const response = await callGeminiAPI('gemini-3-pro-image-preview', requestBody);

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }
    }
    throw new Error('No image in banner mannequin response');
  });
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add services/geminiService.ts
git commit -m "feat(banner): add generateBannerMannequin() API function"
```

---

### Task 5: Add detectPlacementPoints()

**Files:**
- Modify: `services/geminiService.ts` — append after `generateBannerMannequin()`
- Modify: `types.ts` — import for type reference

- [ ] **Step 1: Add the import at top of geminiService.ts**

Add `PlacementPoint` to the existing import from `../types`:

```typescript
import { ExtractionResult, MannequinCriteria, RefinementType, RefinementSelections, ExtractionLevel, JewelryBlueprint, PixelFidelityResult, ProductDimensions, PoseKey, SegmentationResult, PlacementPoint } from "../types";
```

- [ ] **Step 2: Add the function**

Append after `generateBannerMannequin()`:

```typescript
/**
 * Analyze a mannequin image and detect all possible jewelry placement points.
 * Returns structured JSON with coordinates (x,y as percentages).
 * Uses TEXT-only output mode for reliable JSON parsing.
 */
export async function detectPlacementPoints(
  mannequinImage: string,
): Promise<PlacementPoint[]> {
  const raw = mannequinImage.includes('base64,') ? mannequinImage.split(',')[1] : mannequinImage;

  const prompt = `Analyze this image of a model/mannequin. Identify ALL body areas visible in the image where jewelry could be placed.

For each area, return a JSON object with:
- "id": sequential number starting at 1
- "label": descriptive label in French (e.g., "Oreille gauche lobe", "Cou ras-de-cou", "Index main droite")
- "zone": one of "ear", "neck", "chest", "finger", "wrist", "ankle"
- "x": horizontal position as percentage from LEFT edge (0 = far left, 100 = far right)
- "y": vertical position as percentage from TOP edge (0 = top, 100 = bottom)

IMPORTANT:
- Only include areas that are CLEARLY VISIBLE in the image
- Use "neck" for choker/ras-de-cou level, "chest" for collier/sautoir level
- For ears, distinguish lobe vs helix positions
- For fingers, specify which finger and which hand
- Coordinates must be precise — place the point at the EXACT center of where the jewelry would sit

Return ONLY a valid JSON array. No explanation, no markdown fences.`;

  const requestBody = {
    contents: [{
      parts: [
        { inlineData: { mimeType: 'image/png', data: raw } },
        { text: prompt },
      ],
    }],
    generationConfig: {
      responseModalities: ['TEXT'],
      responseMimeType: 'application/json',
    },
  };

  return withRetry(async () => {
    const response = await callGeminiAPI('gemini-3-pro-image-preview', requestBody);

    const textPart = response.candidates?.[0]?.content?.parts?.find(
      (p: any) => p.text
    );
    if (!textPart?.text) {
      console.warn('[BANNER] No text in detectPlacementPoints response');
      return [];
    }

    // Strip markdown fences if present
    let jsonStr = textPart.text.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    let points: PlacementPoint[];
    try {
      points = JSON.parse(jsonStr);
    } catch (e) {
      console.warn('[BANNER] Failed to parse placement points JSON:', jsonStr.substring(0, 200));
      return [];
    }

    if (!Array.isArray(points)) return [];

    // Validate and clean — filter out-of-range, add null assignments
    return points
      .filter((p) => p.id && p.label && p.zone && typeof p.x === 'number' && typeof p.y === 'number')
      .filter((p) => p.x >= 0 && p.x <= 100 && p.y >= 0 && p.y <= 100)
      .map((p) => ({ ...p, assignedJewelryId: null }));
  });
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add services/geminiService.ts types.ts
git commit -m "feat(banner): add detectPlacementPoints() with JSON parsing + fallback"
```

---

### Task 6: Add generateBannerWithJewelry()

**Files:**
- Modify: `services/geminiService.ts` — append after `detectPlacementPoints()`
- Add `BannerJewelry` to the import from `../types`

- [ ] **Step 1: Update import**

Add `BannerJewelry` to the import line:

```typescript
import { ..., PlacementPoint, BannerJewelry } from "../types";
```

- [ ] **Step 2: Add the function**

Append after `detectPlacementPoints()`:

```typescript
/**
 * Generate the final banner with all jewelry pieces placed on the mannequin.
 * Sends mannequin image + all jewelry images + structured placement prompt.
 */
export async function generateBannerWithJewelry(
  mannequinImage: string,
  assignments: Array<{
    jewelry: BannerJewelry;
    point: PlacementPoint;
  }>,
): Promise<string> {
  if (assignments.length === 0) {
    throw new Error('At least one jewelry assignment is required');
  }

  const parts: any[] = [];

  // Mannequin image
  const mannequinRaw = mannequinImage.includes('base64,') ? mannequinImage.split(',')[1] : mannequinImage;
  parts.push({ inlineData: { mimeType: 'image/png', data: mannequinRaw } });

  // Jewelry images — each labeled
  for (const { jewelry } of assignments) {
    const raw = jewelry.imageBase64.includes('base64,') ? jewelry.imageBase64.split(',')[1] : jewelry.imageBase64;
    parts.push({ inlineData: { mimeType: 'image/jpeg', data: raw } });
  }

  // Build structured placement prompt
  const placementInstructions = assignments.map(({ jewelry, point }, i) =>
    `${i + 1}. "${jewelry.name}" (image ${i + 2}) → Place at "${point.label}" (${point.zone} zone, position: ${point.x}% from left, ${point.y}% from top)`
  ).join('\n');

  const prompt = `You are a professional jewelry photographer. Add jewelry to this banner photo.

FIRST IMAGE: The model/mannequin — this is the base photo. Preserve EVERYTHING about this image (face, pose, outfit, lighting, background) EXACTLY as-is.

JEWELRY TO ADD (images ${2} through ${assignments.length + 1}):
${placementInstructions}

CRITICAL RULES:
- Each jewelry piece must match its reference image EXACTLY — same design, same materials, same proportions
- Place each piece at the PRECISE location described
- Jewelry must look photorealistic and naturally worn — proper shadows, reflections, and integration with skin/clothing
- Multiple necklaces/chains must layer naturally with proper drape and spacing
- Do NOT modify the model's face, pose, outfit, background, or lighting
- Maintain the 16:9 landscape banner format
- Highest possible resolution and photographic quality`;

  parts.push({ text: prompt });

  const requestBody = {
    contents: [{ parts }],
    generationConfig: {
      responseModalities: ['IMAGE', 'TEXT'],
      imageConfig: { imageSize: '4K' },
    },
  };

  return withRetry(async () => {
    const response = await callGeminiAPI('gemini-3-pro-image-preview', requestBody);

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }
    }
    throw new Error('No image in banner jewelry generation response');
  });
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add services/geminiService.ts types.ts
git commit -m "feat(banner): add generateBannerWithJewelry() for final composition"
```

---

## Chunk 3: BannerEngine UI — Step 1 (Mannequin Generation)

### Task 7: Build BannerEngine.tsx — Stepper + Step 1 UI

**Files:**
- Modify: `components/BannerEngine.tsx` — replace placeholder with full component

- [ ] **Step 1: Implement the component with stepper + step 1 panels**

Replace the placeholder `BannerEngine.tsx` with the full component. This is a large file — implement in one go following the MannequinEngine.tsx 3-column pattern:

```tsx
import { useState } from 'react';
import { useBannerStore } from '../stores/useBannerStore';
import { generateBannerMannequin, detectPlacementPoints, generateBannerWithJewelry, freeformEditImage } from '../services/geminiService';
import { downloadBase64Image } from '../services/downloadService';
import { BannerJewelry } from '../types';

// ─── Stepper ────────────────────────────────────────────────

const STEPS = [
  { num: 1, label: 'Mannequin' },
  { num: 2, label: 'Placement' },
  { num: 3, label: 'Génération' },
  { num: 4, label: 'Refinement' },
] as const;

function Stepper({ current }: { current: 1 | 2 | 3 | 4 }) {
  return (
    <div className="flex items-center justify-center gap-2 py-3 bg-gray-50 border-b border-gray-200">
      {STEPS.map((step, i) => (
        <div key={step.num} className="flex items-center gap-2">
          {i > 0 && (
            <div className={`w-8 h-0.5 ${current >= step.num ? 'bg-green-500' : 'bg-gray-300'}`} />
          )}
          <div className="flex items-center gap-1.5">
            <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
              current > step.num ? 'bg-green-500 text-white' :
              current === step.num ? 'bg-indigo-500 text-white' :
              'bg-gray-300 text-gray-500'
            }`}>
              {current > step.num ? '✓' : step.num}
            </span>
            <span className={`text-xs font-semibold ${
              current > step.num ? 'text-green-500' :
              current === step.num ? 'text-indigo-500' :
              'text-gray-400'
            }`}>{step.label}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── File Upload Helper ─────────────────────────────────────

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── Main Component ─────────────────────────────────────────

export default function BannerEngine() {
  const store = useBannerStore();
  const [selectedJewelryForAssign, setSelectedJewelryForAssign] = useState<string | null>(null);
  const [repositionPrompt, setRepositionPrompt] = useState('');

  // ── Handlers ──

  const handleAddIdentityPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const base64 = await readFileAsBase64(file);
    store.addIdentityPhoto(base64);
    e.target.value = '';
  };

  const handleSetPoseReference = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    store.setPoseReference(await readFileAsBase64(file));
    e.target.value = '';
  };

  const handleSetBackground = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    store.setBackgroundImage(await readFileAsBase64(file));
    e.target.value = '';
  };

  const handleAddJewelry = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const base64 = await readFileAsBase64(file);
    const name = file.name.replace(/\.[^.]+$/, '');
    const item: BannerJewelry = {
      id: crypto.randomUUID(),
      name,
      imageBase64: base64,
      assignedPointId: null,
    };
    store.addJewelry(item);
    e.target.value = '';
  };

  const handleGenerateMannequin = async () => {
    if (store.identityPhotos.length === 0) {
      store.setError('Ajoute au moins une photo d\'identité');
      return;
    }
    store.setError(null);
    store.setIsGeneratingMannequin(true);
    try {
      if (store.mannequinImage) {
        store.pushToMannequinHistory(store.mannequinImage);
      }
      const result = await generateBannerMannequin(
        store.identityPhotos,
        store.poseReference,
        store.backgroundImage,
        store.outfitPrompt,
        store.ambiancePrompt,
        store.posePrompt,
      );
      store.setMannequinImage(result);
    } catch (err: any) {
      store.setError(err.message || 'Erreur de génération');
    } finally {
      store.setIsGeneratingMannequin(false);
    }
  };

  const handleAcceptMannequin = async () => {
    store.setIsDetectingPoints(true);
    store.setError(null);
    try {
      const points = await detectPlacementPoints(store.mannequinImage!);
      store.setDetectedPoints(points);
      store.setCurrentStep(2);
    } catch (err: any) {
      store.setError(err.message || 'Erreur de détection');
    } finally {
      store.setIsDetectingPoints(false);
    }
  };

  const handlePointClick = (pointId: number) => {
    if (!selectedJewelryForAssign) return;
    store.assignJewelry(selectedJewelryForAssign, pointId);
    setSelectedJewelryForAssign(null);
  };

  const handleGenerateBanner = async () => {
    const assignments = store.jewelryItems
      .filter((j) => j.assignedPointId !== null)
      .map((j) => ({
        jewelry: j,
        point: store.detectedPoints.find((p) => p.id === j.assignedPointId)!,
      }))
      .filter((a) => a.point);

    if (assignments.length === 0) {
      store.setError('Assigne au moins un bijou à un point');
      return;
    }

    store.setError(null);
    store.setIsGeneratingBanner(true);
    try {
      if (store.bannerImage) {
        store.pushToBannerHistory(store.bannerImage);
      }
      const result = await generateBannerWithJewelry(store.mannequinImage!, assignments);
      store.setBannerImage(result);
      store.setCurrentStep(3);
    } catch (err: any) {
      store.setError(err.message || 'Erreur de génération');
    } finally {
      store.setIsGeneratingBanner(false);
    }
  };

  const handleReposition = async () => {
    if (!store.selectedJewelryId || !repositionPrompt.trim()) return;
    const jewelry = store.jewelryItems.find((j) => j.id === store.selectedJewelryId);
    if (!jewelry) return;

    store.setIsRepositioning(true);
    store.setError(null);
    try {
      store.pushToBannerHistory(store.bannerImage!);
      const result = await freeformEditImage(
        store.bannerImage!,
        `Reposition the ${jewelry.name}: ${repositionPrompt}. Keep EVERYTHING else EXACTLY identical.`,
      );
      store.setBannerImage(result);
      setRepositionPrompt('');
    } catch (err: any) {
      store.setError(err.message || 'Erreur de repositionnement');
    } finally {
      store.setIsRepositioning(false);
    }
  };

  // ── Computed ──

  const assignedCount = store.jewelryItems.filter((j) => j.assignedPointId !== null).length;
  const isLoading = store.isGeneratingMannequin || store.isDetectingPoints || store.isGeneratingBanner || store.isRepositioning;

  // ── Render ──

  return (
    <div className="flex flex-col h-full">
      <Stepper current={store.currentStep} />

      {/* Error banner */}
      {store.error && (
        <div className="px-4 py-2 bg-red-50 border-b border-red-200 text-red-700 text-sm flex items-center justify-between">
          <span>{store.error}</span>
          <button onClick={() => store.setError(null)} className="text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* ── LEFT PANEL ── */}
        <div className="w-72 border-r border-gray-200 p-4 overflow-y-auto bg-white flex-shrink-0">
          {store.currentStep === 1 ? (
            <>
              <h3 className="text-sm font-bold text-gray-700 mb-3">Références</h3>

              {/* Identity photos */}
              <div className="mb-4">
                <div className="text-xs font-semibold text-gray-500 mb-1.5">Photos identité ({store.identityPhotos.length}/3)</div>
                <div className="flex gap-1.5 flex-wrap">
                  {store.identityPhotos.map((photo, i) => (
                    <div key={i} className="relative w-14 h-14 rounded-lg overflow-hidden border border-gray-200">
                      <img src={photo} alt="" className="w-full h-full object-cover" />
                      <button onClick={() => store.removeIdentityPhoto(i)} className="absolute top-0 right-0 w-4 h-4 bg-red-500 text-white text-[10px] rounded-bl">✕</button>
                    </div>
                  ))}
                  {store.identityPhotos.length < 3 && (
                    <label className="w-14 h-14 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center text-gray-400 text-xl cursor-pointer hover:border-indigo-400 hover:text-indigo-400">
                      +
                      <input type="file" accept="image/*" className="hidden" onChange={handleAddIdentityPhoto} />
                    </label>
                  )}
                </div>
              </div>

              {/* Pose reference */}
              <div className="mb-4">
                <div className="text-xs font-semibold text-gray-500 mb-1.5">Photo de pose (opt.)</div>
                {store.poseReference ? (
                  <div className="relative w-full h-12 rounded-lg overflow-hidden border border-gray-200">
                    <img src={store.poseReference} alt="" className="w-full h-full object-cover" />
                    <button onClick={() => store.setPoseReference(null)} className="absolute top-0 right-0 w-4 h-4 bg-red-500 text-white text-[10px] rounded-bl">✕</button>
                  </div>
                ) : (
                  <label className="w-full h-12 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center text-gray-400 text-xs cursor-pointer hover:border-indigo-400">
                    Drop pose reference
                    <input type="file" accept="image/*" className="hidden" onChange={handleSetPoseReference} />
                  </label>
                )}
              </div>

              {/* Background */}
              <div className="mb-4">
                <div className="text-xs font-semibold text-gray-500 mb-1.5">Image décor (opt.)</div>
                {store.backgroundImage ? (
                  <div className="relative w-full h-12 rounded-lg overflow-hidden border border-gray-200">
                    <img src={store.backgroundImage} alt="" className="w-full h-full object-cover" />
                    <button onClick={() => store.setBackgroundImage(null)} className="absolute top-0 right-0 w-4 h-4 bg-red-500 text-white text-[10px] rounded-bl">✕</button>
                  </div>
                ) : (
                  <label className="w-full h-12 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center text-gray-400 text-xs cursor-pointer hover:border-indigo-400">
                    Drop background image
                    <input type="file" accept="image/*" className="hidden" onChange={handleSetBackground} />
                  </label>
                )}
              </div>

              <hr className="my-4 border-gray-200" />
              <h3 className="text-sm font-bold text-gray-700 mb-3">Prompts</h3>

              <div className="mb-3">
                <div className="text-xs font-semibold text-gray-500 mb-1">Habits</div>
                <textarea
                  value={store.outfitPrompt}
                  onChange={(e) => store.setOutfitPrompt(e.target.value)}
                  placeholder="White crochet top, bohemian..."
                  className="w-full h-16 border border-gray-300 rounded-lg p-2 text-xs resize-none focus:border-indigo-400 focus:outline-none"
                />
              </div>

              <div className="mb-3">
                <div className="text-xs font-semibold text-gray-500 mb-1">Ambiance / Éclairage</div>
                <textarea
                  value={store.ambiancePrompt}
                  onChange={(e) => store.setAmbiancePrompt(e.target.value)}
                  placeholder="Warm golden hour, sun-kissed..."
                  className="w-full h-16 border border-gray-300 rounded-lg p-2 text-xs resize-none focus:border-indigo-400 focus:outline-none"
                />
              </div>

              <div className="mb-3">
                <div className="text-xs font-semibold text-gray-500 mb-1">Pose / Cadrage</div>
                <textarea
                  value={store.posePrompt}
                  onChange={(e) => store.setPosePrompt(e.target.value)}
                  placeholder="Tight bust crop, hands framing..."
                  className="w-full h-16 border border-gray-300 rounded-lg p-2 text-xs resize-none focus:border-indigo-400 focus:outline-none"
                />
              </div>

              <button
                onClick={handleGenerateMannequin}
                disabled={isLoading || store.identityPhotos.length === 0}
                className="w-full py-2.5 bg-indigo-500 text-white rounded-lg font-bold text-sm disabled:opacity-50 hover:bg-indigo-600 transition-colors"
              >
                {store.isGeneratingMannequin ? 'Génération...' : 'Générer le mannequin →'}
              </button>
            </>
          ) : (
            /* Steps 2-4: Summary of inputs */
            <div className="text-xs text-gray-500">
              <h3 className="text-sm font-bold text-gray-700 mb-2">Récapitulatif</h3>
              <p>{store.identityPhotos.length} photo(s) identité</p>
              {store.poseReference && <p>Photo de pose fournie</p>}
              {store.backgroundImage && <p>Image décor fournie</p>}
              {store.outfitPrompt && <p className="truncate">Habits: {store.outfitPrompt}</p>}
              {store.ambiancePrompt && <p className="truncate">Ambiance: {store.ambiancePrompt}</p>}
            </div>
          )}
        </div>

        {/* ── CENTER PANEL ── */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 flex items-center justify-center p-4 min-h-0">
            <div className="relative w-full max-w-[600px] aspect-video bg-gradient-to-br from-amber-50 to-orange-100 rounded-xl border-2 border-gray-200 overflow-hidden">
              {/* Current image based on step */}
              {(store.currentStep >= 3 && store.bannerImage) ? (
                <img src={store.bannerImage} alt="Banner" className="w-full h-full object-contain" />
              ) : store.mannequinImage ? (
                <img src={store.mannequinImage} alt="Mannequin" className="w-full h-full object-contain" />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-gray-400">
                  <div className="text-3xl mb-2">16:9</div>
                  <div className="text-xs">Bannière preview</div>
                </div>
              )}

              {/* Placement points overlay (step 2) */}
              {store.currentStep === 2 && store.detectedPoints.map((point) => {
                const assigned = point.assignedJewelryId !== null;
                const jewelry = assigned ? store.jewelryItems.find((j) => j.id === point.assignedJewelryId) : null;
                return (
                  <div
                    key={point.id}
                    className="absolute transform -translate-x-1/2 -translate-y-1/2 cursor-pointer"
                    style={{ left: `${point.x}%`, top: `${point.y}%` }}
                    onClick={() => handlePointClick(point.id)}
                    title={point.label}
                  >
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white border-2 border-white shadow-lg ${
                      assigned ? 'bg-amber-500 ring-2 ring-amber-300' : 'bg-indigo-500 hover:bg-indigo-600'
                    }`}>
                      {point.id}
                    </div>
                    {jewelry && (
                      <div className="absolute -top-5 left-1/2 -translate-x-1/2 bg-amber-500 text-white text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap font-semibold">
                        {jewelry.name}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Refinement highlight (step 4) */}
              {store.currentStep === 4 && store.selectedJewelryId && (() => {
                const jewelry = store.jewelryItems.find((j) => j.id === store.selectedJewelryId);
                const point = jewelry?.assignedPointId ? store.detectedPoints.find((p) => p.id === jewelry.assignedPointId) : null;
                if (!point) return null;
                return (
                  <div className="absolute border-2 border-dashed border-purple-500 rounded-lg w-24 h-24 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ left: `${point.x}%`, top: `${point.y}%` }} />
                );
              })()}

              {/* Loading overlay */}
              {isLoading && (
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                  <div className="bg-white rounded-lg px-4 py-2 text-sm font-semibold text-indigo-600">
                    {store.isGeneratingMannequin ? 'Génération du mannequin...' :
                     store.isDetectingPoints ? 'Détection des points...' :
                     store.isGeneratingBanner ? 'Génération de la bannière...' :
                     'Repositionnement...'}
                  </div>
                </div>
              )}

              {/* Crop marks */}
              <div className="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-indigo-500" />
              <div className="absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-indigo-500" />
              <div className="absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-indigo-500" />
              <div className="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-indigo-500" />
            </div>
          </div>

          {/* ── BOTTOM ACTION BAR ── */}
          <div className="px-4 py-2.5 border-t border-gray-200 flex items-center justify-center gap-2 bg-white flex-shrink-0">
            {store.currentStep === 1 && (
              <>
                <button onClick={() => store.undoMannequin()} disabled={store.mannequinHistory.length === 0 || isLoading}
                  className="px-3 py-1.5 bg-gray-100 border border-gray-300 rounded-md text-xs text-gray-600 disabled:opacity-30">← Undo</button>
                <button onClick={handleGenerateMannequin} disabled={isLoading || store.identityPhotos.length === 0}
                  className="px-3 py-1.5 bg-gray-100 border border-gray-300 rounded-md text-xs text-gray-600 disabled:opacity-30">Regénérer</button>
                <button onClick={handleAcceptMannequin} disabled={!store.mannequinImage || isLoading}
                  className="px-3 py-1.5 bg-indigo-500 text-white rounded-md text-xs font-semibold disabled:opacity-30">Accepter → Placement</button>
                {store.mannequinImage && (
                  <button onClick={() => downloadBase64Image(store.mannequinImage!, 'banner-mannequin.png')}
                    className="px-3 py-1.5 bg-gray-100 border border-gray-300 rounded-md text-xs text-gray-600">Download</button>
                )}
              </>
            )}
            {store.currentStep === 2 && (
              <>
                <button onClick={() => store.goBackToStep(1)} disabled={isLoading}
                  className="px-3 py-1.5 bg-gray-100 border border-gray-300 rounded-md text-xs text-gray-600 disabled:opacity-30">← Mannequin</button>
                <button onClick={handleAcceptMannequin} disabled={isLoading}
                  className="px-3 py-1.5 bg-gray-100 border border-gray-300 rounded-md text-xs text-gray-600 disabled:opacity-30">Re-détecter</button>
                <button onClick={handleGenerateBanner} disabled={assignedCount === 0 || isLoading}
                  className="px-3 py-1.5 bg-indigo-500 text-white rounded-md text-xs font-semibold disabled:opacity-30">
                  Générer bannière → ({assignedCount}/{store.jewelryItems.length})
                </button>
              </>
            )}
            {store.currentStep === 3 && (
              <>
                <button onClick={() => store.goBackToStep(2)} disabled={isLoading}
                  className="px-3 py-1.5 bg-gray-100 border border-gray-300 rounded-md text-xs text-gray-600 disabled:opacity-30">← Placement</button>
                <button onClick={() => store.undoBanner()} disabled={store.bannerHistory.length === 0 || isLoading}
                  className="px-3 py-1.5 bg-gray-100 border border-gray-300 rounded-md text-xs text-gray-600 disabled:opacity-30">← Undo</button>
                <button onClick={handleGenerateBanner} disabled={isLoading}
                  className="px-3 py-1.5 bg-gray-100 border border-gray-300 rounded-md text-xs text-gray-600 disabled:opacity-30">Regénérer</button>
                <button onClick={() => store.setCurrentStep(4)} disabled={isLoading}
                  className="px-3 py-1.5 bg-purple-600 text-white rounded-md text-xs font-semibold disabled:opacity-30">Repositionner un bijou</button>
                <button onClick={() => downloadBase64Image(store.bannerImage!, 'banner-final.png')}
                  className="px-3 py-1.5 bg-green-500 text-white rounded-md text-xs font-semibold">Download ↓</button>
              </>
            )}
            {store.currentStep === 4 && (
              <div className="flex items-center gap-2 w-full max-w-xl">
                <input
                  type="text"
                  value={repositionPrompt}
                  onChange={(e) => setRepositionPrompt(e.target.value)}
                  placeholder="Ex: Monte le collier de 2cm, plus près du cou"
                  className="flex-1 px-3 py-1.5 border-2 border-purple-500 rounded-lg text-xs focus:outline-none"
                  onKeyDown={(e) => e.key === 'Enter' && handleReposition()}
                />
                <button onClick={handleReposition} disabled={!store.selectedJewelryId || !repositionPrompt.trim() || isLoading}
                  className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-semibold disabled:opacity-30 whitespace-nowrap">Repositionner</button>
                <button onClick={() => { store.setCurrentStep(3); store.setSelectedJewelryId(null); }}
                  className="px-3 py-1.5 bg-green-500 text-white rounded-lg text-xs font-semibold whitespace-nowrap">Terminé ✓</button>
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT PANEL ── */}
        <div className="w-60 border-l border-gray-200 p-4 overflow-y-auto bg-white flex-shrink-0">
          {/* Jewelry list — always visible */}
          <h3 className="text-sm font-bold text-gray-700 mb-1">
            {store.currentStep === 4 ? 'Quel bijou repositionner ?' : 'Bijoux à placer'}
          </h3>
          {store.currentStep === 2 && (
            <p className="text-[11px] text-gray-400 mb-3">Clique un bijou → clique un point</p>
          )}
          {store.currentStep === 4 && (
            <p className="text-[11px] text-gray-400 mb-3">Clique pour sélectionner</p>
          )}

          {/* Add jewelry button */}
          <label className="block w-full h-10 mb-3 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center text-gray-400 text-xs cursor-pointer hover:border-indigo-400 hover:text-indigo-400">
            + Ajouter bijou ({store.jewelryItems.length}/8)
            <input type="file" accept="image/*" className="hidden" onChange={handleAddJewelry} disabled={store.jewelryItems.length >= 8} />
          </label>

          {/* Jewelry items */}
          <div className="flex flex-col gap-2">
            {store.jewelryItems.map((jewelry) => {
              const point = jewelry.assignedPointId !== null
                ? store.detectedPoints.find((p) => p.id === jewelry.assignedPointId)
                : null;
              const isSelected = store.currentStep === 2
                ? selectedJewelryForAssign === jewelry.id
                : store.currentStep === 4
                ? store.selectedJewelryId === jewelry.id
                : false;
              const isAssigned = jewelry.assignedPointId !== null;

              return (
                <div
                  key={jewelry.id}
                  className={`flex gap-2 items-center p-2 rounded-lg border cursor-pointer transition-colors ${
                    isSelected ? 'border-indigo-500 bg-indigo-50' :
                    isAssigned ? 'border-amber-400 bg-amber-50' :
                    'border-gray-200 bg-gray-50'
                  }`}
                  onClick={() => {
                    if (store.currentStep === 2) setSelectedJewelryForAssign(jewelry.id);
                    if (store.currentStep === 4) store.setSelectedJewelryId(jewelry.id);
                  }}
                >
                  <img src={jewelry.imageBase64} alt="" className="w-10 h-10 rounded-md object-cover flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-gray-700 truncate">{jewelry.name}</div>
                    <div className={`text-[11px] ${isAssigned ? 'text-amber-600 font-semibold' : 'text-gray-400'}`}>
                      {isAssigned && point ? `→ Point ${point.id} · ${point.label}` : 'Non assigné'}
                    </div>
                  </div>
                  {isAssigned && store.currentStep === 2 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); store.unassignJewelry(jewelry.id); }}
                      className="w-5 h-5 rounded-full bg-red-100 text-red-500 text-[10px] flex items-center justify-center hover:bg-red-200"
                    >✕</button>
                  )}
                  {store.currentStep !== 2 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); store.removeJewelry(jewelry.id); }}
                      className="w-5 h-5 rounded-full bg-red-100 text-red-500 text-[10px] flex items-center justify-center hover:bg-red-200"
                    >✕</button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Points legend (step 2) */}
          {store.currentStep === 2 && store.detectedPoints.length > 0 && (
            <>
              <hr className="my-3 border-gray-200" />
              <h3 className="text-xs font-bold text-gray-700 mb-2">Points détectés</h3>
              <div className="flex flex-col gap-1 text-[11px] text-gray-500">
                {store.detectedPoints.map((point) => {
                  const jewelry = point.assignedJewelryId ? store.jewelryItems.find((j) => j.id === point.assignedJewelryId) : null;
                  return (
                    <div key={point.id} className="flex items-center gap-1.5">
                      <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white ${
                        jewelry ? 'bg-amber-500' : 'bg-indigo-500'
                      }`}>{point.id}</span>
                      <span className="truncate">
                        {point.label}
                        {jewelry && <strong className="text-amber-500"> · {jewelry.name}</strong>}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Summary (step 3) */}
          {store.currentStep === 3 && (
            <>
              <hr className="my-3 border-gray-200" />
              <div className="text-[11px] text-gray-500">
                <div><strong>Résolution :</strong> 4K native</div>
                <div><strong>Format :</strong> 16:9</div>
                <div><strong>Bijoux :</strong> {assignedCount} placés</div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Manual smoke test**

Run: `npm run dev`

Verify:
1. Banner tab appears in the navigation
2. Clicking it shows the 3-column layout with stepper
3. Can upload identity photos (up to 3)
4. Can upload pose reference and background
5. Prompt fields accept text input
6. Can add jewelry items (up to 8)
7. "Générer le mannequin" button is disabled when no identity photos

- [ ] **Step 4: Commit**

```bash
git add components/BannerEngine.tsx
git commit -m "feat(banner): implement full BannerEngine UI with 4-step pipeline"
```

---

## Chunk 4: Integration + Final Verification

### Task 8: End-to-end verification

- [ ] **Step 1: Full build check**

Run: `npm run build`
Expected: Clean build, no errors, no type errors.

- [ ] **Step 2: Manual end-to-end test**

With the app running (`npm run dev`), test the full pipeline:

1. Go to Banner tab
2. Upload 1 identity photo
3. Type outfit/ambiance/pose prompts
4. Click "Générer le mannequin" → wait for result
5. Click "Accepter → Placement" → points should appear on image
6. Add 2 jewelry items
7. Click a jewelry item, then click a point to assign
8. Click "Générer bannière" → wait for result
9. Click "Repositionner un bijou" → select a jewelry → type instruction → click Repositionner
10. Click "Terminé" → Download the banner

- [ ] **Step 3: Verify navigation**

Test all back-navigation:
- Step 2 → "← Mannequin" → should go back to step 1, keep jewelry items
- Step 3 → "← Placement" → should go back to step 2, keep assignments
- Step 3 → "Regénérer" → should re-run generation

- [ ] **Step 4: Verify error handling**

Test error states:
- Click "Générer" with no identity photos → should show error
- Click "Générer bannière" with no assignments → should show error

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat(banner): complete Banner Engine module — 4K jewelry banner generation"
```

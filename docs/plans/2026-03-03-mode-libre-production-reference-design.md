# Design: Mode Libre Mannequin + Photo Référence Production

**Date**: 2026-03-03

## Feature A — Mode Libre Mannequin (Hybride)

### Problem
When uploading a reference photo or entering a custom prompt, the system combines it with ALL configuration parameters (ethnicity, age, body composition, hair, etc.), causing conflicts. Users need to be able to generate from a photo or prompt alone, without the preconfigured params interfering.

### Design

**Auto-detection**: When `referenceImage` OR `customPrompt` is set, "mode libre" activates automatically. All left-panel params are ignored by default.

**Override mechanism**: Each param section gets a lock/unlock toggle. Clicking it adds the param to `overrideParams[]`, making it active again even in mode libre. This lets users force specific values (e.g., lighting) while ignoring the rest.

**Store changes** (`useMannequinStore`):
- New field: `overrideParams: string[]` — list of param keys to force in mode libre

**Prompt construction changes** (`geminiService.ts`):
- Normal mode (no ref, no custom prompt): unchanged
- Ref photo mode: two-step — Step 1 extracts style, Step 2 uses ONLY extracted style + any overrideParams (not the full basePrompt)
- Custom prompt mode: the custom prompt IS the main prompt, with only overrideParams appended

**UI changes** (`MannequinEngine.tsx`):
- Banner at top of left panel: "Mode libre — paramètres ignorés"
- Each param section: grayed out with lock icon; click to re-enable
- Visual feedback: active overrides shown in normal color, rest grayed

---

## Feature B — Photo Référence en Production

### Problem
Users want to upload an existing production photo and reuse its "vibe" (scene, pose, lighting) for new productions with different mannequins and jewelry. The system must analyze the photo intelligently — extracting the scene/style while ignoring the specific jewelry and model identity.

### Design

**New API function**: `analyzeProductionReference(imageBase64, extractionLevel)` in `geminiService.ts`

Three extraction levels:
1. **`scene-pose-style`**: Scene (setting, lighting), model pose, photography style. Ignores jewelry and identity.
2. **`scene-pose-style-placement`**: Same + how jewelry is worn/showcased (angles, framing). Without describing the jewelry itself.
3. **`full`**: Maximum extraction (scene, pose, style, lighting, clothing, makeup, mood). Only model identity and specific jewelry excluded.

Returns structured text usable as production prompt.

**UI changes** (`ProductionEngine.tsx`):
- "Import Reference" button next to artistic presets
- Modal: upload zone + extraction level selector (3 options)
- After analysis: editable textarea showing extracted prompt
- Two actions: "Apply" (replaces current preset) + "Save as Preset" (named, stored)

**Custom presets storage** (`useProductionStore`):
- New field: `customPresets: { name: string, prompt: string }[]`
- Persisted in localStorage

**Integration with batch**: Extracted/edited prompt replaces `artisticDirection` in `generateProductionPhoto()`. Jewelry placement (category) stays managed by existing logic unless extraction level includes placement.

---

## Files Impacted

| File | Feature A | Feature B |
|------|-----------|-----------|
| `services/geminiService.ts` | Modify `generateMannequin`, `generateMannequinFromReference` prompt logic | New `analyzeProductionReference()`, modify `generateProductionPhoto()` |
| `stores/useMannequinStore.ts` | Add `overrideParams` field + actions | — |
| `stores/useProductionStore.ts` | — | Add `customPresets` field + actions |
| `components/MannequinEngine.tsx` | Mode libre UI (grayed params, lock toggles, banner) | — |
| `components/ProductionEngine.tsx` | — | Import reference button, modal, preset save UI |
| `types.ts` | Update `MannequinCriteria` if needed | Add `ExtractionLevel` type, `CustomPreset` type |

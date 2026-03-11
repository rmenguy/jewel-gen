# Dual-Output + Prompt Optimization — Design Spec

## Problem

The production pipeline generates 1 photo per item. With ~70% success rate, 2-3 items per batch of 8 are unusable (bad placement, wrong dimensions, duplication). Regenerating failed items is slow because each pipeline run takes 3 sequential API calls.

## Solution

Run 2 pipelines **in parallel** per item with prompt variants, producing 2 result images instead of 1. Combined with structured prompt engineering to reduce placement/dimension errors.

## Pipeline

```
Per item:

  Promise.all([
    pipeline(prompt variant A),   // single-pass → segment → composite → harmonize
    pipeline(prompt variant B),   // single-pass → segment → composite → harmonize
  ])

  → 2 resultImages stored on item
```

Each branch is independent, runs in parallel. Wall-clock time = ~1 pipeline (~20-30s). 6 API calls but only 3 in real time.

### Prompt Variants

Same base prompt, different pose/framing directive appended:
- **Variant A**: `"Editorial pose, slight head tilt, natural confidence"`
- **Variant B**: `"Classic straight pose, direct gaze, symmetric framing"`

This produces visual diversity without affecting placement or biometric instructions.

### Prompt Restructuring

Current prompt is a continuous text block. Restructure into numbered sections:

```
1. IDENTITY: [biometric mandate — reconstruct exact person from reference]
2. JEWELRY: [product from image 2, reproduce exactly]
3. PLACEMENT: [category-specific with anatomical landmarks and cm measurements]
4. CONSTRAINTS: [single piece only, no duplication, no extra accessories]
5. SCENE: [artistic direction]
6. QUALITY: [8K, hyper-realistic]
```

LLMs follow numbered instructions more reliably than prose paragraphs.

## Data Model

```typescript
// types.ts — ProductionItem
resultImages?: string[];  // NEW — array of variant results
resultImage?: string;     // KEEP — backwards compat, = resultImages[0]
```

## API

`generateProductionPhoto` signature change:

```typescript
// Before
generateProductionPhoto(...): Promise<string>

// After
generateProductionPhoto(...): Promise<string[]>  // returns [variantA, variantB]
```

Internally runs 2 pipelines via `Promise.all`. Each pipeline: single-pass → segmentJewelry → compositeJewelryOnModel → harmonizeJewelryComposite. If one variant fails, returns the other alone.

## UI

### Queue Thumbnails
- COMPLETED item shows a small **"2"** badge on the thumbnail
- Thumbnail displays the first variant image

### Preview Panel
- When a dual-result item is selected, show navigation: **◀ 1/2 ▶** indicator
- Click arrows or swipe to switch between variants
- Both variants are full-size in the preview

### Download
- "DOWNLOAD 4K" downloads the currently displayed variant
- "DOWNLOAD ALL" (when multiple selected) downloads all variants of all selected items

## Files Modified

| File | Change |
|------|--------|
| `types.ts` | Add `resultImages?: string[]` to `ProductionItem` |
| `services/geminiService.ts` | `generateProductionPhoto` returns `string[]`, prompt restructured with numbered sections + variants |
| `components/ProductionEngine.tsx` | Dual-result display, variant navigation, download adaptation |

No store changes. No new dependencies.

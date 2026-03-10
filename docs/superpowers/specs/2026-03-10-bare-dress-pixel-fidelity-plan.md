# Implementation Plan — Bare + Dress + Pixel Validation

Based on design: `2026-03-10-bare-dress-pixel-fidelity-design.md`

## Task Breakdown

### Task 1: New types in types.ts
Add `PoseKey`, `BareCache`, `SegmentationResult`, `PixelFidelityResult`. Update `FidelityScore`/`FidelityResult` to pixel-based. Keep `JewelryBlueprint` and `ProductDimensions` as-is.

### Task 2: Create services/pixelCompare.ts (NEW FILE)
Pure client-side module, zero dependencies:
- `computePHash(imageData: ImageData): bigint` — resize to 32x32 grayscale, DCT, median threshold → 64-bit hash
- `hammingDistance(a: bigint, b: bigint): number` — XOR + popcount
- `computeHSVHistogram(imageData: ImageData, mask?: ImageData): number[]` — 3-channel histogram on masked pixels
- `histogramCorrelation(a: number[], b: number[]): number` — Pearson correlation
- `compareJewelryCrops(cropA: ImageData, cropB: ImageData): PixelFidelityResult` — orchestrator returning { pHashDistance, histogramCorrelation, passed, diagnosis }
- Helper: `base64ToImageData(base64: string, width: number, height: number): Promise<ImageData>` — via offscreen canvas
- Helper: `cropFromSegmentation(imageBase64: string, box: number[], maskBase64: string): Promise<ImageData>` — extract crop using segmentation data

### Task 3: Add generateBareMannequin() in geminiService.ts
New function. Takes: mannequinBase64, artisticDirection, poseKey, category. Returns bare mannequin image as base64. Prompt = current biometric prompt + pose-specific framing + "NO jewelry whatsoever on bare skin".

### Task 4: Add dressWithJewelry() in geminiService.ts
New function. Takes: bareBase64, productBase64, blueprint, dimensions, category. Returns dressed image. Prompt focuses ONLY on jewelry placement fidelity — no mannequin instructions.

### Task 5: Add segmentJewelry() in geminiService.ts
New function. Takes: imageBase64. Calls gemini-2.5-flash with segmentation prompt. Returns { box_2d, mask (base64 PNG), label }.

### Task 6: Add bare cache to useProductionStore.ts
Add `bareCache: Record<string, string>` and `setBareCache(key: string, image: string)`, `getBareCache(key: string): string | null`, `clearBareCache()`.

### Task 7: Refactor generateProductionPhoto() in geminiService.ts
Replace current single-pass with: bare generation (with cache check) → dress pass → dual segmentation → pixel comparison → correction loop. Remove validateJewelryFidelity(). Keep analyzeJewelryProduct() and buildDimensionAnchors().

### Task 8: Update processItem() in ProductionEngine.tsx
Update the processing flow to use the new pipeline. Update fidelityStatus messages. Show pixel scores under each completed item.

### Task 9: Update stacking flow
Update generateStackedProductionPhoto() and handleGenerateStacked() to use bare + dress pipeline.

### Task 10: Build verification
Run `npm run build` and fix any TypeScript errors.

## Dependency Graph

```
Task 1 (types) ──→ Task 2 (pixelCompare) ──┐
                                              ├──→ Task 7 (refactor generateProductionPhoto)
Task 3 (bare) ──→ Task 4 (dress) ──→ Task 5 (segment) ──→ Task 6 (store) ──┘
                                                                              │
                                                              Task 8 (UI) ←──┘
                                                              Task 9 (stacking) ←──┘
                                                              Task 10 (build) ←── all
```

## Parallel Groups

- **Group A** (independent): Task 1, Task 2 (types + pixelCompare can be written in parallel since Task 2 can use preliminary types)
- **Group B** (sequential, depends on A): Tasks 3→4→5 (bare→dress→segment, each builds on previous)
- **Group C** (depends on A+B): Task 6 (store)
- **Group D** (depends on all): Tasks 7, 8, 9 (refactor + UI + stacking)
- **Group E** (final): Task 10 (build check)

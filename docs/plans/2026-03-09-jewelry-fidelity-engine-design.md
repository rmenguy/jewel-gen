# Jewelry Fidelity Engine — Design Document

## Problem
Generated production photos show jewelry that is similar but not identical to the product: chain types change, square stones become round, proportions drift. Clients in the jewelry industry require exact visual fidelity.

## Solution
3-step pipeline wrapping the existing `generateProductionPhoto` and `generateStackedProductionPhoto` flows:

1. **Pre-analysis** — Gemini text extracts a detailed PRODUCT BLUEPRINT from the product image
2. **Dimension anchoring** — User-provided cm dimensions are converted to body-relative descriptions (mannequin = 1m65)
3. **Validation loop** — Post-generation comparison scores fidelity; low scores trigger targeted correction re-generation (max 2 retries)

## Architecture

```
Photo produit + dimensions (cm)
        |
        v
[Step 1] analyzeJewelryProduct() → PRODUCT BLUEPRINT
        |
        v
[Step 2] buildDimensionAnchors() → body-relative placement text
        |
        v
[Generation] gemini-3-pro-image-preview (existing flow, enriched prompt)
        |
        v
[Step 3] validateJewelryFidelity() → compare generated vs original
        |
        +-- Score OK → return image
        |
        +-- Score KO → correction prompt → re-generate (max 2x)
```

## New Functions (geminiService.ts)

### analyzeJewelryProduct(productImageBase64: string): Promise<JewelryBlueprint>
- Calls Gemini text model (gemini-2.5-flash) with the product image
- Extracts: material, chain type, stone shapes, stone setting, pendant shape, finish, color details
- Returns structured JewelryBlueprint object

### buildDimensionAnchors(dimensions: ProductDimensions, category: string): string
- Pure function, no API call
- Converts cm to body-relative descriptions based on 1m65 mannequin
- Chain: 35cm=choker, 40cm=collarbone, 50cm=upper chest, 60cm=sternum, 80cm=navel
- Pendant: <1.5cm=small/dainty, 1.5-3cm=thumbnail-sized, 3-5cm=palm-width, >5cm=statement
- In stacking mode: computes ratios between pieces

### validateJewelryFidelity(generatedBase64: string, originalProductBase64: string, blueprint: JewelryBlueprint): Promise<FidelityResult>
- Calls Gemini text model with both images
- Scores 5 criteria (chain, stones, pendant, material, proportions) 1-5
- Returns { scores, overallScore, corrections: string[] }
- Corrections are specific ("stones must be SQUARE cut not round")

## Modified Functions

### generateProductionPhoto / generateStackedProductionPhoto
- Accept optional `blueprint` and `dimensions` params
- Inject PRODUCT BLUEPRINT and DIMENSION ANCHORS sections into prompt
- After generation, run validation loop if blueprint is provided
- Max 2 correction iterations

## Types (types.ts)

```typescript
interface ProductDimensions {
  chainLength?: number;    // cm
  pendantSize?: number;    // cm
}

interface JewelryBlueprint {
  material: string;
  chainType: string;
  stoneShape: string;
  stoneSetting: string;
  pendantShape: string;
  finish: string;
  colorDetails: string;
  rawDescription: string;  // full text for prompt injection
}

interface FidelityResult {
  scores: Record<string, number>;
  overallScore: number;
  corrections: string[];
  passed: boolean;
}
```

## UI Changes (ProductionEngine.tsx)
- Minimal: progress indicator during validation ("Verifying fidelity... attempt 2/3")
- No new inputs (dimensions already entered at catalog import)

## Files Impacted
- `services/geminiService.ts` — new functions + modified production functions
- `types.ts` — new interfaces
- `components/ProductionEngine.tsx` — progress indicator
- `stores/useProductionStore.ts` — cache blueprints per product

## What Does NOT Change
- Mannequin engine
- API model (stays gemini-3-pro-image-preview)
- Catalog engine
- Download service

## Performance Impact
- Best case (passes first try): +1 API call (pre-analysis) + 1 API call (validation) = ~4s extra
- Worst case (2 retries): +1 pre-analysis + 3 validations + 2 re-generations = ~20s extra
- Blueprint can be cached per product to avoid repeated pre-analysis

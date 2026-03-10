# Add Jewelry Refinement — Design Spec

## Problem

After generating a production photo (mannequin + jewelry), the user wants to add another jewelry piece to the same image without regenerating everything from scratch. The existing mannequin, pose, lighting, and already-placed jewelry must remain identical.

## Solution

A "refinement" mode in the Production Engine preview panel. The user provides a base image (import or existing result) and a new jewelry packshot, then the system adds the new piece using the full fidelity pipeline.

## API

New function in `services/geminiService.ts`:

```typescript
addJewelryToExisting(
  existingImage: string,          // base64 — image with existing jewelry
  productBase64: string,          // base64 — new jewelry packshot
  category: string,               // jewelry category for placement
  blueprint?: JewelryBlueprint,
  dimensions?: ProductDimensions
): Promise<string>
```

Pipeline (reuses existing functions):
1. `dressWithJewelry(existingImage, product, blueprint, dimensions, category)` — existingImage acts as "bare"
2. Compositing 2-pass: segment → canvas paste (source-over + multiply 0.15) → Gemini harmonize
3. Pixel validation + correction loop (3 iterations max)

The dress prompt already says "place jewelry on model, don't alter anything else" — works naturally when the "model" already wears other jewelry.

## UI

### Import Base Image
- Button "Import" next to STUDIO 4K badge in preview panel header
- Loads image via FileReader.readAsDataURL → stored as `importedBaseImage`
- Displayed in preview exactly like a COMPLETED item result

### Add Jewelry Panel
- Button "+ ADD JEWELRY" in preview footer bar (between resolution text and DOWNLOAD 4K)
- Visible when an image is displayed (COMPLETED item or imported base)
- Opens inline slide-down panel with:
  - **Source**: dropdown of queue items + "Upload" button for ad-hoc packshot
  - **Category**: dropdown (collier, sautoir, sautoir-long, boucles, bague, bracelet)
  - **Dimensions**: 3 optional fields (Ch cm, Pd H, Pd L) — same as existing
  - **APPLY button**: launches `addJewelryToExisting()`, shows spinner
- Result replaces current image. Previous image saved for 1-level undo.

## State

Local state in `ProductionEngine.tsx` only (no store changes):

| State | Type | Purpose |
|-------|------|---------|
| `importedBaseImage` | `string \| null` | Manually imported base image |
| `refineMode` | `boolean` | Add Jewelry panel open/closed |
| `refineProduct` | `{ base64, category, dimensions? } \| null` | Selected jewelry for refinement |
| `refineUndo` | `string \| null` | Previous image for undo |
| `isRefining` | `boolean` | Processing spinner |

## Files Modified

| File | Change |
|------|--------|
| `services/geminiService.ts` | New `addJewelryToExisting()` function |
| `components/ProductionEngine.tsx` | State + UI (import button, add jewelry button, inline panel) |

No changes to types.ts, stores, or pixelCompare.ts.

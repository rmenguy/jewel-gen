# Bare + Dress + Pixel Validation — Jewelry Fidelity Engine v2

## Problem

The current fidelity engine (v1) asks the generative model to handle everything in a single pass: mannequin identity, pose, lighting, scene, AND jewelry reproduction. The model "re-interprets" the jewelry instead of copying it — chains change type, stones become round instead of square, pendants get invented.

The validation loop (text-based scoring via Flash) is slow (~3-5s per call), subjective, and not scalable for batch.

## Solution: Approach C — Bare + Dress + Pixel Validation

Split the generation into two focused passes, replace text-based validation with client-side pixel comparison.

## Pipeline Architecture

```
Packshot ──┐
            ├──→ [1] BARE GENERATION ──→ Mannequin nu (cached by pose-key)
Mannequin ─┘         (Pro Image 4K)
                          │
Packshot ──┐              │
            ├──→ [2] DRESS PASS ──→ Mannequin + bijou
Mannequin  ─┘      (Pro Image 4K, jewelry-only prompt)
  nu                      │
                    [3] DUAL SEGMENTATION ──→ 2 crops bijou
                       (Flash 2.5, parallel)   (généré + original)
                          │
                    [4] PIXEL COMPARISON ──→ pHash + Histogramme
                       (client-side, 0 API, <50ms)
                          │
                     score < seuil ?
                    ╱              ╲
                  NON              OUI
                   │                │
               TERMINÉ    [5] CORRECTION LOOP
                              (Pro Image 4K, targeted edit)
                              ↳ retour à [3], max 3 iterations
```

## Step 1: Bare Generation

Generate mannequin WITHOUT any jewelry. Same prompt as today (biometric reconstruction, pose, lighting, scene) plus explicit instruction: no jewelry on bare skin.

Pose is adapted per jewelry category:

| Pose Key | Categories | Framing |
|---|---|---|
| `neck` | collier, sautoir, sautoir-long | Bust, clear neck, face or 3/4 |
| `ear` | boucles d'oreilles | Head tilted, 3/4 profile, hair pulled back |
| `wrist` | bracelet | Forearm visible, relaxed hand |
| `hand` | bague | Close-up hand, relaxed fingers |

**Cache**: keyed by `poseKey + mannequinHash + artisticDirection`. A batch of 10 items (5 necklaces, 3 earrings, 2 bracelets) = only 3 bare generations instead of 10.

For stacking: use the widest framing that covers all categories (e.g., necklace + earrings → neck pose in 3/4 showing ear).

## Step 2: Dress Pass

Send bare mannequin + packshot to `gemini-3-pro-image-preview`. Prompt focuses ONLY on jewelry placement fidelity — zero instructions about mannequin identity/pose/lighting (already baked in).

Blueprint (from pre-analysis) and dimension anchors are still injected for textual reinforcement.

For stacking: bare + N packshots, prompt lists each piece and placement.

## Step 3: Dual Segmentation

Two parallel calls to `gemini-2.5-flash`:
- Segment jewelry in generated photo → bounding box + mask
- Segment jewelry in original packshot → bounding box + mask

Prompt: "Give the segmentation mask for the jewelry piece. Return JSON: box_2d [y0,x0,y1,x1] normalized 0-1000, mask as base64 PNG, label."

Extract crops via Canvas API (client-side).

## Step 4: Pixel Comparison (client-side)

Two complementary metrics, zero API cost:

| Metric | Detects | Implementation |
|---|---|---|
| Perceptual Hash (pHash) | Shape/silhouette changes | Resize both crops to 32x32 grayscale, DCT, compare bits → Hamming distance |
| HSV Histogram Correlation | Color/material changes | HSV histogram on masked pixels, correlation coefficient |

**Pass threshold**: pHash distance ≤ 8 (of 64 bits) AND histogram correlation ≥ 0.75.

## Step 5: Correction Loop

Diagnostic drives the correction prompt:

| Diagnosis | Condition | Correction Focus |
|---|---|---|
| Shape altered | pHash > 8, histogram OK | "The jewelry SHAPE is wrong. Correct shape only." |
| Color altered | pHash OK, histogram < 0.75 | "The jewelry COLOR/MATERIAL is wrong. Correct color only." |
| Both | pHash > 8 AND histogram < 0.75 | "Regenerate jewelry placement from scratch using reference." |

Send generated photo + packshot + targeted correction to Pro Image (image-to-image edit). Return to step 3. Max 3 iterations. If threshold not met after 3, keep best score and flag "fidelity: partial".

## UI Status Feedback

Per-item status during processing:
- `Generating pose...` → bare pass
- `Placing jewelry...` → dress pass
- `Verifying fidelity...` → segmentation + comparison
- `Correcting shape...` / `Correcting color...` → correction loop
- `Verified` or `Partial match` → final result

Final pHash + histogram scores displayed under each item.

## Files Impacted

| File | Changes |
|---|---|
| `services/geminiService.ts` | New: `generateBareMannequin()`, `dressWithJewelry()`, `segmentJewelry()`. Refactor `generateProductionPhoto()`. Remove `validateJewelryFidelity()` |
| `types.ts` | New: `PoseKey`, `BareCache`, `PixelFidelityResult`, `SegmentationResult` |
| `components/ProductionEngine.tsx` | New flow in `processItem()`, bare cache, enriched status UI |
| `services/pixelCompare.ts` (NEW) | pHash + HSV histogram, 100% client-side, zero dependencies |
| `stores/useProductionStore.ts` | Add `bareCache: Record<string, string>` |

## What Does NOT Change

- Overall ProductionEngine UI (queue, presets, stacking toggle)
- Mannequin Engine
- Catalog Engine
- Architecture (browser fetch, user API key)
- Existing scene/preset prompts (reused in bare pass)

## Rollback

Backup branch `backup-fidelity-v1` on commit `2531299`.

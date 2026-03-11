# Dual-Output + Prompt Optimization Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each production item generates 2 photo variants in parallel (with pose-variant prompts), displayed side by side, doubling output without increasing wall-clock time. Prompts restructured as numbered sections for better LLM compliance.

**Architecture:** `generateProductionPhoto` runs 2 full pipelines (single-pass → segment → composite → harmonize) via `Promise.all` with different pose directives. Returns `string[]`. `ProductionItem` gains `resultImages: string[]`. UI adds variant navigation (◀ 1/2 ▶) in the preview panel and a "2" badge on thumbnails.

**Tech Stack:** React 19, TypeScript, Gemini API (REST), Zustand, Canvas API

---

## Chunk 1: Data Model + Service Layer

### Task 1: Add `resultImages` to ProductionItem type

**Files:**
- Modify: `types.ts:45-58`

- [ ] **Step 1: Add `resultImages` field**

In `types.ts`, add `resultImages?: string[];` to the `ProductionItem` interface, right after `resultImage`:

```typescript
export interface ProductionItem {
  id: string;
  sku: string;
  name: string;
  imageUrl: string;
  category?: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'ERROR';
  resultImage?: string;
  resultImages?: string[];  // dual-output variants
  error?: string;
  chainLength?: number;
  pendantSize?: number;
  pendantHeight?: number;
  pendantWidth?: number;
}
```

- [ ] **Step 2: Build to verify no type errors**

Run: `npm run build`
Expected: Success, no errors (field is optional, nothing references it yet)

- [ ] **Step 3: Commit**

```bash
git add types.ts
git commit -m "feat: add resultImages field to ProductionItem for dual-output"
```

---

### Task 2: Restructure prompt + dual pipeline in generateProductionPhoto

**Files:**
- Modify: `services/geminiService.ts` — `generateProductionPhoto` function (currently lines ~632-725)

- [ ] **Step 1: Extract single-pipeline into a helper function**

Inside `geminiService.ts`, create a private helper `_runSinglePipeline` that encapsulates the current logic (single-pass → segment → composite → harmonize). This helper takes an extra `poseVariant: string` parameter appended to the prompt.

```typescript
// Place this ABOVE generateProductionPhoto

const POSE_VARIANTS = [
  'Editorial pose, slight head tilt, natural confidence, asymmetric composition.',
  'Classic straight pose, direct gaze, symmetric framing, centered composition.',
];

async function _runSinglePipeline(
  mannequinBase64: string | null,
  productBase64: string,
  artisticDirection: string,
  category: string,
  blueprint: JewelryBlueprint | undefined,
  dimensions: ProductDimensions | undefined,
  poseVariant: string,
): Promise<string> {
  // --- Build structured prompt ---
  let prompt = '';

  // 1. IDENTITY
  if (mannequinBase64) {
    prompt += `1. IDENTITY: You are a high-end Digital Double specialist. Reconstruct the EXACT physical identity of the subject in the reference image (image 1). BIOMETRIC CONSTRAINTS: (a) Bone Structure — match precise jawline, cheekbone height, brow ridge geometry. (b) Ocular Detail — replicate eye shape, iris color, eyelid fold. (c) Identity Marks — retain wrinkles, skin pores, moles, authentic hairline. The subject must be 100% recognizable as the INDIVIDUAL in the reference photo.\n`;
  } else {
    prompt += `1. IDENTITY: Professional fashion model with natural beauty.\n`;
  }

  // 2. JEWELRY
  prompt += `2. JEWELRY: The product is shown in the packshot image${mannequinBase64 ? ' (image 2)' : ' (image 1)'}. ${category ? `Category: ${category}.` : ''} Reproduce the jewelry EXACTLY as shown — same chain type, stone shapes, metal color, proportions. Do NOT approximate or substitute any element.\n`;

  // 3. PLACEMENT
  const categoryLower = category.toLowerCase();
  if (categoryLower.includes('sautoir-long')) {
    prompt += `3. PLACEMENT: EXTRA-LONG sautoir necklace. Chain starts at back of neck, pendant/lowest point hangs at NAVEL LEVEL (belly button height). The chain covers the FULL distance: neck → past collarbone → past breasts → past ribcage → to navel. Approximately 40-50cm visible chain on front. NOT a chest-level necklace. Natural gravity drape, visible arc, chain swings freely.\n`;
  } else if (categoryLower.includes('sautoir')) {
    prompt += `3. PLACEMENT: SHORT SAUTOIR necklace. Chain starts at back of neck, pendant/lowest point hangs at BREAST LEVEL (between breasts or slightly below, at bra line). Chain covers: neck → past collarbone → to mid-chest. Approximately 25-35cm visible chain. NOT on collarbone (too short), NOT at stomach (too long). Natural gravity drape, visible arc.\n`;
  } else if (categoryLower.includes('collier') || categoryLower.includes('necklace')) {
    prompt += `3. PLACEMENT: Short necklace (collier) sitting ON or just below the collarbone. Hugging base of neck. Approximately 15-20cm visible chain on front.\n`;
  } else if (categoryLower.includes('bague') || categoryLower.includes('ring')) {
    prompt += `3. PLACEMENT: Ring worn on finger, hand visible and relaxed.\n`;
  } else if (categoryLower.includes('boucles') || categoryLower.includes('earring')) {
    prompt += `3. PLACEMENT: Earrings on earlobes. Head angled to showcase. Hair pulled back if needed.\n`;
  } else if (categoryLower.includes('bracelet')) {
    prompt += `3. PLACEMENT: Bracelet on wrist, forearm visible, hand relaxed.\n`;
  } else {
    prompt += `3. PLACEMENT: Jewelry worn naturally in the most appropriate position for this type of piece.\n`;
  }

  // 4. CONSTRAINTS
  prompt += `4. CONSTRAINTS: The product image shows ONE jewelry piece. Place it ONLY at the location specified above. Do NOT duplicate it as earrings, rings, bracelets, or any other accessory. Do NOT add ANY jewelry not in the product image. The model wears ONLY this single piece and nothing else.\n`;

  // 5. BLUEPRINT (optional)
  if (blueprint) {
    prompt += `5. BLUEPRINT: ${blueprint.rawDescription} — Reproduce EXACTLY.\n`;
  }

  // 6. DIMENSIONS (optional)
  if (dimensions) {
    const anchors = buildDimensionAnchors(dimensions, category);
    if (anchors) prompt += `6. DIMENSIONS: ${anchors}\n`;
  }

  // 7. SCENE + POSE VARIANT
  prompt += `${blueprint ? '7' : dimensions ? '7' : '5'}. SCENE: ${artisticDirection}. POSE: ${poseVariant}\n`;

  // 8. QUALITY
  prompt += `${blueprint ? '8' : dimensions ? '8' : '6'}. QUALITY: Luxury commercial photography, 4K resolution, 8K hyper-realistic rendering, ultra-detailed.\n`;

  const parts: any[] = [{ text: prompt }];
  if (mannequinBase64) {
    const mannequinData = mannequinBase64.includes('base64,') ? mannequinBase64.split(',')[1] : mannequinBase64;
    parts.push({ inlineData: { mimeType: 'image/png', data: mannequinData } });
  }
  parts.push({ inlineData: { mimeType: 'image/jpeg', data: productBase64 } });

  // Single-pass generation
  const response = await callGeminiAPI('gemini-3-pro-image-preview', {
    contents: [{ parts }],
    generationConfig: {
      responseModalities: ['IMAGE', 'TEXT'],
      imageConfig: { imageSize: '4K' },
    }
  });

  let generatedImage: string | null = null;
  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      generatedImage = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      break;
    }
  }
  if (!generatedImage) throw new Error("Aucune image générée.");

  // Segment + Composite + Harmonize
  try {
    const seg = await segmentJewelry(generatedImage);
    const composited = await compositeJewelryOnModel(generatedImage, `data:image/jpeg;base64,${productBase64}`, seg);
    const harmonized = await harmonizeJewelryComposite(composited, generatedImage);
    return harmonized;
  } catch (err) {
    console.warn('[PIPELINE] Composite/harmonize failed, returning raw:', err);
    return generatedImage;
  }
}
```

- [ ] **Step 2: Rewrite generateProductionPhoto to call dual pipelines**

Replace the body of `generateProductionPhoto` with:

```typescript
export const generateProductionPhoto = async (
    mannequinBase64: string | null,
    productUrl: string,
    artisticDirection: string,
    category: string = '',
    blueprint?: JewelryBlueprint,
    dimensions?: ProductDimensions,
    bareCache?: { get: (key: string) => string | undefined; set: (key: string, img: string) => void }
): Promise<string[]> => {
    console.log('[PRODUCTION] Starting dual-output generation');
    return withRetry(async () => {
        const productBase64 = await fetchImageAsBase64(productUrl);
        console.log('[PRODUCTION] Product image loaded');

        // Run 2 pipelines in parallel with different pose variants
        const results = await Promise.all(
            POSE_VARIANTS.map(async (variant, idx) => {
                try {
                    console.log(`[PRODUCTION] Pipeline ${idx + 1} — ${variant.substring(0, 30)}...`);
                    return await _runSinglePipeline(
                        mannequinBase64, productBase64, artisticDirection,
                        category, blueprint, dimensions, variant,
                    );
                } catch (err) {
                    console.warn(`[PRODUCTION] Pipeline ${idx + 1} failed:`, err);
                    return null;
                }
            })
        );

        const validResults = results.filter((r): r is string => r !== null);
        if (validResults.length === 0) throw new Error("Aucune image générée.");

        console.log(`[PRODUCTION] Dual-output complete — ${validResults.length} variants`);
        return validResults;
    });
};
```

- [ ] **Step 3: Build to verify**

Run: `npm run build`
Expected: Type error in `ProductionEngine.tsx` at the call site (now returns `string[]` instead of `string`). This is expected — we fix it in Task 3.

- [ ] **Step 4: Commit**

```bash
git add services/geminiService.ts
git commit -m "feat: dual-output pipeline with structured prompts and pose variants"
```

---

### Task 3: Update ProductionEngine to handle string[] results

**Files:**
- Modify: `components/ProductionEngine.tsx` — `processItem` function (~lines 248-259) and download handler (~lines 303-309)

- [ ] **Step 1: Update processItem to store resultImages**

In the `processItem` function, change the call site from:

```typescript
const resultImage = await generateProductionPhoto(
    mannequinImage, item.imageUrl, itemPrompt,
    item.category, blueprint, dimensions, bareCache
);
updateItemStatus(item.id, { status: 'COMPLETED', resultImage });
```

To:

```typescript
const resultImages = await generateProductionPhoto(
    mannequinImage, item.imageUrl, itemPrompt,
    item.category, blueprint, dimensions, bareCache
);
updateItemStatus(item.id, {
    status: 'COMPLETED',
    resultImage: resultImages[0],
    resultImages,
});
```

- [ ] **Step 2: Update handleDownloadSelected to download all variants**

Change the download handler from:

```typescript
const handleDownloadSelected = () => {
    const targets = queue.filter(q => selectedForDownload.has(q.id) && q.status === 'COMPLETED' && q.resultImage);
    for (const item of targets) {
        const base64 = item.resultImage!.includes('base64,') ? item.resultImage! : `data:image/png;base64,${item.resultImage!}`;
        downloadBase64Image(base64, `production_4K_${item.sku}_${Date.now()}.png`);
    }
};
```

To:

```typescript
const handleDownloadSelected = () => {
    const targets = queue.filter(q => selectedForDownload.has(q.id) && q.status === 'COMPLETED' && (q.resultImages?.length || q.resultImage));
    for (const item of targets) {
        const images = item.resultImages || (item.resultImage ? [item.resultImage] : []);
        images.forEach((img, idx) => {
            const base64 = img.includes('base64,') ? img : `data:image/png;base64,${img}`;
            downloadBase64Image(base64, `production_4K_${item.sku}_v${idx + 1}_${Date.now()}.png`);
        });
    }
};
```

- [ ] **Step 3: Build to verify no errors**

Run: `npm run build`
Expected: Success

- [ ] **Step 4: Commit**

```bash
git add components/ProductionEngine.tsx
git commit -m "feat: handle dual-output results in production engine"
```

---

## Chunk 2: UI — Variant Navigation + Badges

### Task 4: Add variant index state and activeImage logic

**Files:**
- Modify: `components/ProductionEngine.tsx` — state declarations (~line 37-57) and `activeImage` memo (~line 374-378)

- [ ] **Step 1: Add variantIndex state**

After the existing state declarations (around line 50), add:

```typescript
const [variantIndex, setVariantIndex] = useState(0);
```

- [ ] **Step 2: Reset variantIndex when item changes**

After the `selectedItem` declaration (line 371), add:

```typescript
useEffect(() => { setVariantIndex(0); }, [selectedItemId]);
```

Make sure `useEffect` is imported (it should already be — verify the imports at the top of the file).

- [ ] **Step 3: Update activeImage memo for variant navigation**

Replace the `activeImage` useMemo:

```typescript
const activeImage = useMemo(() => {
    if (importedBaseImage) return importedBaseImage;
    if (selectedItem?.status === 'COMPLETED' && selectedItem?.resultImage) return selectedItem.resultImage;
    return null;
}, [importedBaseImage, selectedItem]);
```

With:

```typescript
const activeImage = useMemo(() => {
    if (importedBaseImage) return importedBaseImage;
    if (selectedItem?.status === 'COMPLETED') {
        const images = selectedItem.resultImages || (selectedItem.resultImage ? [selectedItem.resultImage] : []);
        if (images.length > 0) return images[Math.min(variantIndex, images.length - 1)];
    }
    return null;
}, [importedBaseImage, selectedItem, variantIndex]);

const variantCount = useMemo(() => {
    if (!selectedItem || selectedItem.status !== 'COMPLETED') return 0;
    return selectedItem.resultImages?.length || (selectedItem.resultImage ? 1 : 0);
}, [selectedItem]);
```

- [ ] **Step 4: Build to verify**

Run: `npm run build`
Expected: Success

- [ ] **Step 5: Commit**

```bash
git add components/ProductionEngine.tsx
git commit -m "feat: variant index state and activeImage logic for dual-output"
```

---

### Task 5: Add variant navigation UI in preview panel

**Files:**
- Modify: `components/ProductionEngine.tsx` — preview panel area (~lines 600-615) and footer (~lines 614-635)

- [ ] **Step 1: Add ◀ 1/2 ▶ navigation overlay on the preview image**

Find the preview image display (around line 601-602):

```tsx
{activeImage ? (
    <img src={activeImage} className="w-full h-full object-contain shadow-2xl" />
```

Replace with:

```tsx
{activeImage ? (
    <div className="relative w-full h-full">
        <img src={activeImage} className="w-full h-full object-contain shadow-2xl" />
        {variantCount > 1 && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/60 backdrop-blur-sm rounded-full px-3 py-1.5">
                <button onClick={() => setVariantIndex(Math.max(0, variantIndex - 1))} disabled={variantIndex === 0} className="text-white/80 hover:text-white disabled:text-white/30 transition-colors">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
                </button>
                <span className="text-white text-xs font-mono font-bold">{variantIndex + 1}/{variantCount}</span>
                <button onClick={() => setVariantIndex(Math.min(variantCount - 1, variantIndex + 1))} disabled={variantIndex >= variantCount - 1} className="text-white/80 hover:text-white disabled:text-white/30 transition-colors">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
                </button>
            </div>
        )}
    </div>
```

- [ ] **Step 2: Add "2" badge on queue thumbnails for dual-result items**

Find the thumbnail display for completed items (around line 488):

```tsx
{item.status === 'COMPLETED' && item.resultImage ? <img src={item.resultImage} ...
```

Replace with:

```tsx
{item.status === 'COMPLETED' && item.resultImage ? (
    <div className="relative w-full h-full">
        <img src={item.resultImage} className="w-full h-full object-cover" loading="lazy" />
        {(item.resultImages?.length || 0) > 1 && (
            <div className="absolute bottom-1 left-1 bg-indigo-600 text-white text-[7px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center">{item.resultImages!.length}</div>
        )}
    </div>
) : <div className="w-full h-full bg-gray-100 flex items-center justify-center"><span className="text-[8px] font-mono text-gray-400 break-all px-1 text-center">{item.sku}</span></div>}
```

- [ ] **Step 3: Update single-image download button to indicate variant**

Find the DOWNLOAD 4K button handler (around line 630-631):

```tsx
const base64 = activeImage.includes('base64,') ? activeImage : `data:image/png;base64,${activeImage}`;
downloadBase64Image(base64, `4K_studio_${selectedItem?.sku || 'import'}.png`);
```

Replace with:

```tsx
const base64 = activeImage.includes('base64,') ? activeImage : `data:image/png;base64,${activeImage}`;
const suffix = variantCount > 1 ? `_v${variantIndex + 1}` : '';
downloadBase64Image(base64, `4K_studio_${selectedItem?.sku || 'import'}${suffix}.png`);
```

- [ ] **Step 4: Build to verify**

Run: `npm run build`
Expected: Success

- [ ] **Step 5: Manual test checklist**

1. Run `npm run dev`, open http://localhost:3000
2. Add items to production queue
3. Execute batch — each item should show a "2" badge when complete
4. Click a completed item — preview shows the first variant
5. Click ◀ ▶ arrows — switches between variants
6. Download 4K — downloads current variant with `_v1` or `_v2` suffix
7. Select multiple + Download — downloads all variants of all selected items

- [ ] **Step 6: Commit**

```bash
git add components/ProductionEngine.tsx
git commit -m "feat: variant navigation UI — badges, arrows, download per variant"
```

---

### Task 6: Deploy

- [ ] **Step 1: Final build**

```bash
npm run build
```

- [ ] **Step 2: Deploy to Vercel**

```bash
npx vercel --prod --yes
```

- [ ] **Step 3: Push to git**

```bash
git push origin main
```

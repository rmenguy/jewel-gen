# Add Jewelry Refinement — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users add new jewelry pieces to an existing production photo without regenerating from scratch.

**Architecture:** New `addJewelryToExisting()` function in geminiService.ts that reuses the existing dress+composite+validation pipeline with the existing image as "bare". UI adds an import button, an "Add Jewelry" panel in the preview footer, and 1-level undo.

**Tech Stack:** React, Gemini API (gemini-3-pro-image-preview), Canvas 2-pass compositing

---

## File Map

| File | Role | Change |
|------|------|--------|
| `services/geminiService.ts` | All Gemini API logic | Add `addJewelryToExisting()` (~60 lines), export it |
| `components/ProductionEngine.tsx` | Production UI | Add state vars, import button, add jewelry panel, undo |

No changes to types.ts, stores, or pixelCompare.ts.

---

### Task 1: Add `addJewelryToExisting()` to geminiService.ts

**Files:**
- Modify: `services/geminiService.ts` (add after `generateProductionPhoto` at ~line 845, update exports)

- [ ] **Step 1: Add the function**

Add this function after the closing `};` of `generateProductionPhoto` (line 845) in `services/geminiService.ts`:

```typescript
/**
 * Add a new jewelry piece to an existing production image.
 * Reuses dress+composite+validation pipeline with the existing image as "bare".
 */
export const addJewelryToExisting = async (
    existingImage: string,
    productBase64: string,
    category: string,
    blueprint?: JewelryBlueprint,
    dimensions?: ProductDimensions
): Promise<string> => {
    console.log('[REFINE] Adding jewelry to existing image');
    return withRetry(async () => {
        const productData = productBase64.includes('base64,') ? productBase64.split(',')[1] : productBase64;
        const productDataUri = productBase64.startsWith('data:') ? productBase64 : `data:image/jpeg;base64,${productData}`;

        // --- Step 1: Dress pass — add new jewelry onto existing image ---
        console.log('[REFINE] Dressing existing image with new jewelry');
        let dressedImage = await dressWithJewelry(existingImage, productDataUri, blueprint || null, dimensions || null, category);
        console.log('[REFINE] Dress pass complete');

        // --- Step 2: 2-pass compositing ---
        console.log('[REFINE] Starting 2-pass compositing');
        const compositeSeg = await segmentJewelry(dressedImage);
        console.log(`[REFINE] Jewelry segmented — box: [${compositeSeg.box_2d}]`);

        const composited = await compositeJewelryOnModel(dressedImage, productDataUri, compositeSeg);
        console.log('[REFINE] Canvas 2-pass blend complete');

        dressedImage = await harmonizeJewelryComposite(composited, existingImage);
        console.log('[REFINE] Gemini harmonization complete');

        // --- Step 3: Pixel validation (only if blueprint) ---
        if (blueprint) {
            console.log('[REFINE] Starting pixel validation');

            const [dressedSeg, productSeg] = await Promise.all([
                segmentJewelry(dressedImage),
                segmentJewelry(productDataUri),
            ]);

            const [dressedCrop, productCrop] = await Promise.all([
                cropFromSegmentation(dressedImage, dressedSeg),
                cropFromSegmentation(productDataUri, productSeg),
            ]);

            let pixelResult: PixelFidelityResult = compareJewelryCrops(dressedCrop, productCrop);
            console.log(`[REFINE-PIXEL] Initial — pHash: ${pixelResult.scores.pHashDistance}, histogram: ${pixelResult.scores.histogramCorrelation.toFixed(3)}, passed: ${pixelResult.passed}`);

            if (pixelResult.passed) {
                return dressedImage;
            }

            let bestImage = dressedImage;
            let bestPHash = pixelResult.scores.pHashDistance;
            let currentImage = dressedImage;

            for (let attempt = 0; attempt < 3; attempt++) {
                const diagnosis = pixelResult.diagnosis;
                let correctionPrompt: string;
                if (diagnosis === 'shape') {
                    correctionPrompt = "The NEWLY ADDED jewelry SHAPE is wrong. Look at the reference image again. Reproduce the exact shape, chain type, stone cuts, and pendant form. Do NOT change the model, lighting, or ANY existing jewelry already on the model.";
                } else if (diagnosis === 'color') {
                    correctionPrompt = `The NEWLY ADDED jewelry COLOR/MATERIAL is wrong. The original shows ${blueprint.colorDetails}. Correct metal color and stone colors to match exactly. Do NOT modify existing jewelry.`;
                } else {
                    correctionPrompt = "The newly added jewelry is significantly different. Regenerate placement with strict fidelity to the reference image. Do NOT modify existing jewelry on the model.";
                }

                console.log(`[REFINE-PIXEL] Correction attempt ${attempt + 1}/3 — diagnosis: ${diagnosis}`);

                const currentData = currentImage.includes('base64,') ? currentImage.split(',')[1] : currentImage;
                const correctionParts: any[] = [
                    { text: correctionPrompt },
                    { inlineData: { mimeType: 'image/png', data: currentData } },
                    { inlineData: { mimeType: 'image/jpeg', data: productData } },
                ];

                const correctionResponse = await callGeminiAPI('gemini-3-pro-image-preview', {
                    contents: [{ parts: correctionParts }],
                    generationConfig: {
                        responseModalities: ['IMAGE', 'TEXT'],
                        imageConfig: { imageSize: '4K' },
                    }
                });

                let correctedImage: string | null = null;
                for (const part of correctionResponse.candidates?.[0]?.content?.parts || []) {
                    if (part.inlineData) {
                        correctedImage = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                        break;
                    }
                }

                if (!correctedImage) continue;

                const correctedSeg = await segmentJewelry(correctedImage);
                const correctedCrop = await cropFromSegmentation(correctedImage, correctedSeg);
                pixelResult = compareJewelryCrops(correctedCrop, productCrop);
                console.log(`[REFINE-PIXEL] Attempt ${attempt + 1} — pHash: ${pixelResult.scores.pHashDistance}, histogram: ${pixelResult.scores.histogramCorrelation.toFixed(3)}, passed: ${pixelResult.passed}`);

                if (pixelResult.scores.pHashDistance < bestPHash) {
                    bestPHash = pixelResult.scores.pHashDistance;
                    bestImage = correctedImage;
                }
                currentImage = correctedImage;

                if (pixelResult.passed) return correctedImage;
            }

            console.log(`[REFINE] Pixel validation ended — returning best (pHash: ${bestPHash})`);
            return bestImage;
        }

        return dressedImage;
    });
};
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors (function uses existing imports already in scope)

- [ ] **Step 3: Commit**

```bash
git add services/geminiService.ts
git commit -m "feat: add addJewelryToExisting() for refinement pipeline"
```

---

### Task 2: Add state variables and import button to ProductionEngine.tsx

**Files:**
- Modify: `components/ProductionEngine.tsx` (imports at line 5, state at ~line 49, new ref + handlers)

- [ ] **Step 1: Update imports**

At line 5, add `addJewelryToExisting` to the geminiService import:

```typescript
import { generateProductionPhoto, generateStackedProductionPhoto, analyzeProductionReference, analyzeJewelryProduct, generateBareMannequin, dressWithJewelry, segmentJewelry, addJewelryToExisting } from '../services/geminiService';
```

- [ ] **Step 2: Add state variables**

After the `fidelityStatus` state (line 49), add:

```typescript
const [importedBaseImage, setImportedBaseImage] = useState<string | null>(null);
const [refineMode, setRefineMode] = useState(false);
const [refineCategory, setRefineCategory] = useState('collier');
const [refineDims, setRefineDims] = useState<{ chainLength?: number; pendantHeight?: number; pendantWidth?: number }>({});
const [refineUndo, setRefineUndo] = useState<string | null>(null);
const [isRefining, setIsRefining] = useState(false);
const refineFileRef = useRef<HTMLInputElement>(null);
const baseImportRef = useRef<HTMLInputElement>(null);
```

- [ ] **Step 3: Add base image import handler**

After the existing `handleRefUpload` handler, add:

```typescript
const handleBaseImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
        const reader = new FileReader();
        reader.onloadend = () => {
            setImportedBaseImage(reader.result as string);
            setSelectedItemId(null); // deselect queue items
        };
        reader.readAsDataURL(file);
    }
};
```

- [ ] **Step 4: Add a computed `activeImage` variable**

After the `stats` useMemo, add:

```typescript
const activeImage = useMemo(() => {
    if (importedBaseImage) return importedBaseImage;
    if (selectedItem?.status === 'COMPLETED' && selectedItem?.resultImage) return selectedItem.resultImage;
    return null;
}, [importedBaseImage, selectedItem]);
```

Note: `selectedItem` is derived from `selectedItemId` — check where it's computed and make sure `activeImage` is declared after it. Find the line `const selectedItem = ...` and place `activeImage` after it.

- [ ] **Step 5: Verify build**

Run: `npx tsc --noEmit`
Expected: Warnings about unused vars (refineMode, etc.) — OK for now, they'll be used in Task 3.

- [ ] **Step 6: Commit**

```bash
git add components/ProductionEngine.tsx
git commit -m "feat: add refinement state and base image import handler"
```

---

### Task 3: Add "Import" button and "Add Jewelry" panel to preview UI

**Files:**
- Modify: `components/ProductionEngine.tsx` (preview panel header ~line 499, footer ~line 518, and new panel)

- [ ] **Step 1: Add hidden file inputs**

Right after the existing `<input type="file" ref={fileInputRef}` (line 537), add:

```tsx
<input type="file" ref={baseImportRef} className="hidden" accept="image/*" onChange={handleBaseImport} />
<input type="file" ref={refineFileRef} className="hidden" accept="image/*" onChange={(e) => {
    const file = e.target.files?.[0];
    if (file) {
        const reader = new FileReader();
        reader.onloadend = () => {
            // Will be used in the refine handler
            handleRefineApply(reader.result as string);
        };
        reader.readAsDataURL(file);
    }
}} />
```

- [ ] **Step 2: Add "Import" button next to STUDIO 4K badge**

At line 499-503, modify the header badge area. After the existing badge div, add an Import button:

```tsx
<div className="absolute top-4 left-4 z-10 flex gap-2">
    <div className="bg-white/90 backdrop-blur border border-gray-200 px-2 py-1 rounded text-[10px] font-bold text-gray-900 flex items-center gap-2 shadow-sm">
        <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div> STUDIO <span className="text-indigo-600">4K PRO</span>
    </div>
    <button
        onClick={() => baseImportRef.current?.click()}
        className="bg-white/90 backdrop-blur border border-gray-200 px-2 py-1 rounded text-[10px] font-bold text-indigo-600 hover:text-indigo-500 hover:border-indigo-300 transition-colors shadow-sm"
    >
        IMPORT
    </button>
    {importedBaseImage && (
        <button
            onClick={() => { setImportedBaseImage(null); setRefineMode(false); setRefineUndo(null); }}
            className="bg-white/90 backdrop-blur border border-gray-200 px-2 py-1 rounded text-[10px] font-bold text-red-500 hover:text-red-400 transition-colors shadow-sm"
        >
            CLEAR
        </button>
    )}
</div>
```

- [ ] **Step 3: Update preview area to show imported base image**

Replace the preview content area (lines 504-516) to also handle `importedBaseImage`:

```tsx
<div className="flex-1 bg-gray-50 flex items-center justify-center relative overflow-hidden">
    {activeImage ? (
        <img src={activeImage} className="w-full h-full object-contain shadow-2xl" />
    ) : selectedItem ? (
        <div className="flex flex-col items-center justify-center opacity-60 p-4">
            <div className="w-32 h-32 border border-gray-200 flex items-center justify-center mb-4 bg-white overflow-hidden rounded-lg shadow-sm">
                {selectedItem.imageUrl ? <img src={selectedItem.imageUrl.split('|')[0]} className="w-full h-full object-contain opacity-50 grayscale" /> : <span className="text-xs text-gray-400">NO PREVIEW</span>}
            </div>
            <p className="text-xs font-mono text-gray-500 uppercase tracking-widest">{selectedItem.sku}</p>
            <p className="text-[10px] text-gray-400 mt-1 uppercase">{selectedItem.status}</p>
            {selectedItem.error && <p className="text-[9px] text-red-500 mt-2 px-6 text-center border border-red-200 bg-red-50 py-1 rounded font-mono">{selectedItem.error}</p>}
        </div>
    ) : <p className="text-xs text-gray-400 uppercase tracking-widest">No Selection</p>}
</div>
```

- [ ] **Step 4: Update footer bar to show "+ ADD JEWELRY" and undo**

Replace the footer section (lines 518-529) with:

```tsx
{activeImage && (
    <div className="border-t border-gray-200 bg-white">
        <div className="h-14 flex items-center justify-between px-4">
            <span className="text-[9px] font-mono text-gray-400">RES: 4096 x 5461 // UHD_4K</span>
            <div className="flex items-center gap-2">
                {refineUndo && (
                    <Button variant="secondary" className="text-[10px] h-8" onClick={() => {
                        if (importedBaseImage) {
                            setImportedBaseImage(refineUndo);
                        } else if (selectedItem) {
                            const updated = queue.map(q => q.id === selectedItem.id ? { ...q, resultImage: refineUndo } : q);
                            setQueue(updated);
                        }
                        setRefineUndo(null);
                    }}>
                        UNDO
                    </Button>
                )}
                <Button
                    variant="secondary"
                    className="text-[10px] h-8"
                    onClick={() => setRefineMode(!refineMode)}
                    disabled={isRefining}
                >
                    {refineMode ? 'CANCEL' : '+ ADD JEWELRY'}
                </Button>
                <Button variant="secondary" className="text-[10px] h-8" onClick={() => {
                    const base64 = activeImage.includes('base64,') ? activeImage : `data:image/png;base64,${activeImage}`;
                    downloadBase64Image(base64, `4K_studio_${selectedItem?.sku || 'import'}.png`);
                }}>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                    DOWNLOAD 4K
                </Button>
            </div>
        </div>

        {refineMode && (
            <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 space-y-3">
                <div className="flex items-center gap-3">
                    <div className="flex-1">
                        <label className="text-[9px] uppercase font-bold text-gray-400 mb-1 block">Jewelry Source</label>
                        <div className="flex gap-2">
                            <select
                                className="flex-1 h-8 bg-white border border-gray-200 rounded text-[10px] font-mono px-2 outline-none"
                                onChange={(e) => {
                                    const item = queue.find(q => q.id === e.target.value);
                                    if (item) handleRefineApply(item.imageUrl);
                                }}
                                defaultValue=""
                            >
                                <option value="" disabled>Select from queue...</option>
                                {queue.map(q => (
                                    <option key={q.id} value={q.id}>{q.sku} — {q.category || q.name}</option>
                                ))}
                            </select>
                            <button
                                onClick={() => refineFileRef.current?.click()}
                                className="h-8 px-3 bg-white border border-gray-200 rounded text-[10px] font-bold text-indigo-600 hover:border-indigo-300 transition-colors"
                            >
                                UPLOAD
                            </button>
                        </div>
                    </div>
                </div>
                <div className="flex items-end gap-3">
                    <div>
                        <label className="text-[9px] uppercase font-bold text-gray-400 mb-1 block">Category</label>
                        <select
                            className="h-8 bg-white border border-gray-200 rounded text-[10px] font-mono px-2 outline-none"
                            value={refineCategory}
                            onChange={(e) => setRefineCategory(e.target.value)}
                        >
                            <option value="collier">Collier</option>
                            <option value="sautoir">Sautoir</option>
                            <option value="sautoir-long">Sautoir Long</option>
                            <option value="boucles">Boucles</option>
                            <option value="bague">Bague</option>
                            <option value="bracelet">Bracelet</option>
                        </select>
                    </div>
                    <div className="flex gap-1">
                        <div>
                            <label className="text-[8px] uppercase text-gray-400 mb-1 block">Ch cm</label>
                            <input type="number" className="w-14 h-8 bg-white border border-gray-200 rounded text-[10px] font-mono px-1 text-center outline-none" placeholder="—" onChange={(e) => setRefineDims(d => ({ ...d, chainLength: e.target.value ? Number(e.target.value) : undefined }))} />
                        </div>
                        <div>
                            <label className="text-[8px] uppercase text-gray-400 mb-1 block">Pd H</label>
                            <input type="number" className="w-14 h-8 bg-white border border-gray-200 rounded text-[10px] font-mono px-1 text-center outline-none" placeholder="—" onChange={(e) => setRefineDims(d => ({ ...d, pendantHeight: e.target.value ? Number(e.target.value) : undefined }))} />
                        </div>
                        <div>
                            <label className="text-[8px] uppercase text-gray-400 mb-1 block">Pd L</label>
                            <input type="number" className="w-14 h-8 bg-white border border-gray-200 rounded text-[10px] font-mono px-1 text-center outline-none" placeholder="—" onChange={(e) => setRefineDims(d => ({ ...d, pendantWidth: e.target.value ? Number(e.target.value) : undefined }))} />
                        </div>
                    </div>
                </div>
                {isRefining && (
                    <div className="flex items-center gap-2 text-[10px] text-indigo-600 font-mono">
                        <div className="w-3 h-3 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                        Adding jewelry (dress + composite + validation)...
                    </div>
                )}
            </div>
        )}
    </div>
)}
```

- [ ] **Step 5: Verify build**

Run: `npx tsc --noEmit`
Expected: Error about missing `handleRefineApply` — that's OK, we add it in Task 4.

- [ ] **Step 6: Commit**

```bash
git add components/ProductionEngine.tsx
git commit -m "feat: add jewelry refinement UI (import, add jewelry panel, undo)"
```

---

### Task 4: Add the `handleRefineApply` handler

**Files:**
- Modify: `components/ProductionEngine.tsx` (add handler after `handleBaseImport`)

- [ ] **Step 1: Add the handler**

After the `handleBaseImport` handler, add:

```typescript
const handleRefineApply = async (productSource: string) => {
    if (!activeImage || isRefining) return;

    setIsRefining(true);
    try {
        // Fetch product image if it's a URL, otherwise use as-is (base64)
        let productBase64 = productSource;
        if (productSource.startsWith('http')) {
            const resp = await fetch(productSource);
            const blob = await resp.blob();
            productBase64 = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(blob);
            });
        }

        // Pre-analyze for blueprint
        let blueprint: JewelryBlueprint | undefined;
        try {
            blueprint = await analyzeJewelryProduct(productBase64);
        } catch {
            console.warn('[REFINE] Blueprint analysis failed, proceeding without');
        }

        const dimensions: ProductDimensions | undefined =
            (refineDims.chainLength || refineDims.pendantHeight || refineDims.pendantWidth)
                ? refineDims
                : undefined;

        // Save current image for undo
        setRefineUndo(activeImage);

        const result = await addJewelryToExisting(
            activeImage,
            productBase64,
            refineCategory,
            blueprint,
            dimensions
        );

        // Apply result
        if (importedBaseImage) {
            setImportedBaseImage(result);
        } else if (selectedItem) {
            const updated = queue.map(q => q.id === selectedItem.id ? { ...q, resultImage: result } : q);
            setQueue(updated);
        }

        setRefineMode(false);
    } catch (err: any) {
        console.error('[REFINE] Error:', err);
        alert(`Refinement failed: ${err.message || err}`);
    } finally {
        setIsRefining(false);
    }
};
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Full build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add components/ProductionEngine.tsx services/geminiService.ts
git commit -m "feat: complete add jewelry refinement feature"
```

---

### Task 5: Manual test and deploy

- [ ] **Step 1: Start dev server**

Run: `npm run dev`

- [ ] **Step 2: Test import flow**

1. Open Production Engine
2. Click "IMPORT" in preview header → select any model photo with jewelry
3. Verify image displays in preview
4. Click "+ ADD JEWELRY" → verify panel slides down
5. Upload a packshot or select from queue
6. Select category, optionally fill dimensions
7. Verify processing spinner appears and result replaces image
8. Verify UNDO restores previous image
9. Verify DOWNLOAD 4K works on refined image

- [ ] **Step 3: Test queue flow**

1. Generate a production photo normally (COMPLETED item)
2. Click the completed item to view it
3. Click "+ ADD JEWELRY" → add a new piece
4. Verify the item's result image is updated in the queue

- [ ] **Step 4: Deploy**

Run: `npx vercel --prod --yes`

- [ ] **Step 5: Final commit with all changes**

```bash
git add -A
git commit -m "feat: add jewelry refinement — import base + add jewelry to existing photos"
```

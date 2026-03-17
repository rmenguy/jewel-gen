# Enhanced Jewelry Stacking — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance Stack Mode in ProductionEngine to support mannequin photo upload, multiple generation attempts with per-variant retry, and aspect ratio selection.

**Architecture:** Two files are modified: `geminiService.ts` gets a new `aspectRatio` parameter on `generateStackedProductionPhoto`, and `ProductionEngine.tsx` gets new local state + UI for the stacking config bar and variant grid. No store changes needed.

**Tech Stack:** React 19, TypeScript, TailwindCSS, Gemini API (REST)

---

## Chunk 1: API — Add aspectRatio to generateStackedProductionPhoto

### Task 1: Add aspectRatio parameter to generateStackedProductionPhoto

**Files:**
- Modify: `services/geminiService.ts:965-970` (function signature)
- Modify: `services/geminiService.ts:1052-1059` (imageConfig in API call)

- [ ] **Step 1: Update function signature**

In `services/geminiService.ts`, line 965-970, change:

```ts
export const generateStackedProductionPhoto = async (
    mannequinBase64: string | null,
    products: Array<{ imageUrl: string; category: string; name: string; blueprint?: JewelryBlueprint; dimensions?: ProductDimensions }>,
    artisticDirection: string,
    bareCache?: { get: (key: string) => string | undefined; set: (key: string, img: string) => void },
    aspectRatio?: string
): Promise<string> => {
```

- [ ] **Step 2: Inject aspectRatio into imageConfig**

In `services/geminiService.ts`, around line 1052-1059, change the `generationConfig` block:

```ts
generationConfig: {
    responseModalities: ['IMAGE', 'TEXT'],
    imageConfig: {
        imageSize: '4K',
        ...(aspectRatio && { aspectRatio }),
    },
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: No TypeScript errors (existing callers don't pass aspectRatio, which is fine since it's optional)

- [ ] **Step 4: Commit**

```bash
git add services/geminiService.ts
git commit -m "feat(stacking): add aspectRatio param to generateStackedProductionPhoto"
```

---

## Chunk 2: UI — Stacking config bar (upload, attempts, ratio)

### Task 2: Add new local state for stacking config

**Files:**
- Modify: `components/ProductionEngine.tsx:39-41` (add state after existing stack state)

- [ ] **Step 1: Add state declarations**

After line 41 (`const [isStacking, setIsStacking] = useState(false);`), add:

```ts
const [stackMannequinImage, setStackMannequinImage] = useState<string | null>(null);
const [stackAttempts, setStackAttempts] = useState(1);
const [stackRatio, setStackRatio] = useState('1:1');
const [stackResults, setStackResults] = useState<(string | null)[]>([]);
const [stackGenerating, setStackGenerating] = useState(false);
const stackFileRef = useRef<HTMLInputElement>(null);
```

- [ ] **Step 2: Add mannequin upload handler**

After the new state declarations, add:

```ts
const handleStackMannequinUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
        const reader = new FileReader();
        reader.onloadend = () => setStackMannequinImage(reader.result as string);
        reader.readAsDataURL(file);
    }
    if (e.target) e.target.value = '';
};
```

- [ ] **Step 3: Commit**

```bash
git add components/ProductionEngine.tsx
git commit -m "feat(stacking): add local state for config bar"
```

### Task 3: Render the stacking config bar UI

**Files:**
- Modify: `components/ProductionEngine.tsx:508-509` (insert config bar after Stack Mode button, before the queue grid)

- [ ] **Step 1: Add hidden file input for stack mannequin**

Right after the existing `<input type="file" ref={baseImportRef}` block (line 629), add:

```tsx
<input type="file" ref={stackFileRef} className="hidden" accept="image/*" onChange={handleStackMannequinUpload} />
```

- [ ] **Step 2: Insert config bar between header and queue grid**

After the closing `</div>` of the header bar (line 508, after the `</div>` that closes the `p-3 border-b` div), and before the `<div className="p-4 overflow-y-auto` (line 510), insert:

```tsx
{stackingMode && (
    <div className="px-3 py-2 border-b border-gray-200 bg-purple-50/50 flex items-center gap-4 flex-wrap">
        {/* Upload Pose */}
        <div className="flex items-center gap-2">
            <span className="text-[9px] uppercase font-bold text-purple-600">Pose</span>
            {stackMannequinImage ? (
                <div className="flex items-center gap-1">
                    <img src={stackMannequinImage} className="w-8 h-8 rounded object-cover border border-purple-300" />
                    <button onClick={() => setStackMannequinImage(null)} className="w-4 h-4 rounded-full bg-red-100 hover:bg-red-200 text-red-500 flex items-center justify-center text-[10px] font-bold">&times;</button>
                </div>
            ) : (
                <button onClick={() => stackFileRef.current?.click()} className="text-[9px] px-2 py-1 rounded border border-purple-300 bg-white text-purple-600 hover:bg-purple-50 font-bold transition-colors">
                    Upload
                </button>
            )}
        </div>
        {/* Attempts */}
        <div className="flex items-center gap-1.5">
            <span className="text-[9px] uppercase font-bold text-purple-600">Essais</span>
            {[1, 2, 3, 4, 6].map(n => (
                <button key={n} onClick={() => setStackAttempts(n)} className={`text-[9px] w-6 h-6 rounded font-bold transition-colors ${stackAttempts === n ? 'bg-purple-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-purple-300'}`}>
                    {n}
                </button>
            ))}
        </div>
        {/* Ratio */}
        <div className="flex items-center gap-1.5">
            <span className="text-[9px] uppercase font-bold text-purple-600">Ratio</span>
            {['1:1', '3:4', '4:3', '9:16', '16:9'].map(r => (
                <button key={r} onClick={() => setStackRatio(r)} className={`text-[9px] px-2 py-1 rounded font-bold transition-colors ${stackRatio === r ? 'bg-purple-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-purple-300'}`}>
                    {r}
                </button>
            ))}
        </div>
    </div>
)}
```

- [ ] **Step 3: Verify dev server renders correctly**

Run: `npm run dev`
Expected: Stack Mode toggle shows the config bar with upload, attempts, and ratio selectors.

- [ ] **Step 4: Commit**

```bash
git add components/ProductionEngine.tsx
git commit -m "feat(stacking): add config bar UI (upload, attempts, ratio)"
```

---

## Chunk 3: Multi-attempt generation + variant grid

### Task 4: Rewrite handleGenerateStacked for multi-attempt support

**Files:**
- Modify: `components/ProductionEngine.tsx:332-378` (replace `handleGenerateStacked`)

- [ ] **Step 1: Replace handleGenerateStacked**

Replace the entire `handleGenerateStacked` function (lines 332-378) with:

```ts
const handleGenerateStacked = async () => {
    const selectedItems = queue.filter(i => stackSelection.has(i.id));
    if (selectedItems.length < 2) return;
    setStackGenerating(true);
    setStackResults(new Array(stackAttempts).fill(null));

    const bareCache = { get: getBareCache, set: setBareCache };
    const effectiveMannequin = stackMannequinImage || mannequinImage;

    // Pre-analyze products
    const products = await Promise.all(selectedItems.map(async (item) => {
        let blueprint: JewelryBlueprint | undefined;
        if (blueprintEnabled) {
            try { blueprint = await analyzeJewelryProduct(item.imageUrl); } catch { /* proceed without */ }
        }
        return {
            imageUrl: item.imageUrl,
            category: item.category || '',
            name: item.name,
            blueprint,
            dimensions: (item.chainLength || item.pendantSize || item.pendantHeight || item.pendantWidth)
                ? { chainLength: item.chainLength, pendantSize: item.pendantSize, pendantHeight: item.pendantHeight, pendantWidth: item.pendantWidth }
                : undefined,
        };
    }));

    let effectivePrompt = artisticDirection;
    if (!effectivePrompt.trim()) effectivePrompt = PROMPT_PRESETS.default;

    // Generate N attempts sequentially
    for (let i = 0; i < stackAttempts; i++) {
        try {
            const resultImage = await generateStackedProductionPhoto(effectiveMannequin, products, effectivePrompt, bareCache, stackRatio);
            setStackResults(prev => { const next = [...prev]; next[i] = resultImage; return next; });
        } catch (err: any) {
            console.error(`[STACK] Attempt ${i + 1} failed:`, err.message);
            // Leave null — shown as error in grid
        }
    }

    setStackGenerating(false);
};
```

- [ ] **Step 2: Add retry handler for individual variants**

After `handleGenerateStacked`, add:

```ts
const handleRetryStackVariant = async (index: number) => {
    const selectedItems = queue.filter(i => stackSelection.has(i.id));
    if (selectedItems.length < 2) return;
    setStackGenerating(true);

    const bareCache = { get: getBareCache, set: setBareCache };
    const effectiveMannequin = stackMannequinImage || mannequinImage;

    const products = await Promise.all(selectedItems.map(async (item) => {
        let blueprint: JewelryBlueprint | undefined;
        if (blueprintEnabled) {
            try { blueprint = await analyzeJewelryProduct(item.imageUrl); } catch { /* proceed without */ }
        }
        return {
            imageUrl: item.imageUrl,
            category: item.category || '',
            name: item.name,
            blueprint,
            dimensions: (item.chainLength || item.pendantSize || item.pendantHeight || item.pendantWidth)
                ? { chainLength: item.chainLength, pendantSize: item.pendantSize, pendantHeight: item.pendantHeight, pendantWidth: item.pendantWidth }
                : undefined,
        };
    }));

    let effectivePrompt = artisticDirection;
    if (!effectivePrompt.trim()) effectivePrompt = PROMPT_PRESETS.default;

    try {
        setStackResults(prev => { const next = [...prev]; next[index] = null; return next; });
        const resultImage = await generateStackedProductionPhoto(effectiveMannequin, products, effectivePrompt, bareCache, stackRatio);
        setStackResults(prev => { const next = [...prev]; next[index] = resultImage; return next; });
    } catch (err: any) {
        console.error(`[STACK] Retry ${index} failed:`, err.message);
    }

    setStackGenerating(false);
};
```

- [ ] **Step 3: Add handler to select a variant as favorite**

```ts
const handleSelectStackFavorite = (index: number) => {
    const image = stackResults[index];
    if (!image) return;
    const selectedItems = queue.filter(i => stackSelection.has(i.id));
    const stackedItem: ProductionItem = {
        id: crypto.randomUUID(),
        sku: `STACK-${selectedItems.map(i => i.sku).join('+')}`,
        name: `Stacked: ${selectedItems.map(i => i.name).join(' + ')}`,
        imageUrl: selectedItems[0].imageUrl,
        category: 'stacked',
        status: 'COMPLETED',
        resultImage: image,
    };
    setQueue(prev => [...prev, stackedItem]);
    setSelectedItemId(stackedItem.id);
    setStackSelection(new Set());
    setStackingMode(false);
    setStackResults([]);
};
```

- [ ] **Step 4: Commit**

```bash
git add components/ProductionEngine.tsx
git commit -m "feat(stacking): multi-attempt generation + retry + favorite selection"
```

### Task 5: Render the variant grid in the preview panel

**Files:**
- Modify: `components/ProductionEngine.tsx:647-672` (preview panel content area)

- [ ] **Step 1: Add variant grid rendering**

In the preview panel's content area (the `<div className="flex-1 bg-gray-50 flex items-center justify-center relative overflow-hidden min-h-0">` at line 647), wrap the existing content with a condition: if `stackResults.length > 0`, show the grid; otherwise show existing content.

Replace the block from line 647 to line 672 with:

```tsx
<div className="flex-1 bg-gray-50 flex items-center justify-center relative overflow-hidden min-h-0">
    {stackResults.length > 0 ? (
        <div className={`w-full h-full p-3 grid gap-2 overflow-y-auto ${
            stackResults.length === 1 ? 'grid-cols-1' :
            stackResults.length === 2 ? 'grid-cols-2' :
            stackResults.length <= 4 ? 'grid-cols-2' :
            'grid-cols-3'
        }`}>
            {stackResults.map((result, idx) => (
                <div key={idx} className="relative bg-white rounded-lg border border-gray-200 overflow-hidden flex items-center justify-center group">
                    {result ? (
                        <>
                            <img src={result} className="w-full h-full object-contain" />
                            <div className="absolute top-1.5 left-1.5 bg-purple-600 text-white text-[8px] font-bold w-5 h-5 rounded-full flex items-center justify-center">#{idx + 1}</div>
                            <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                    onClick={() => handleRetryStackVariant(idx)}
                                    disabled={stackGenerating}
                                    className="w-6 h-6 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center disabled:opacity-40"
                                    title="Retry"
                                >
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                </button>
                                <button
                                    onClick={() => {
                                        const base64 = result.includes('base64,') ? result : `data:image/png;base64,${result}`;
                                        downloadBase64Image(base64, `stack_v${idx + 1}.png`);
                                    }}
                                    className="w-6 h-6 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center"
                                    title="Download"
                                >
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                </button>
                                <button
                                    onClick={() => handleSelectStackFavorite(idx)}
                                    className="w-6 h-6 rounded-full bg-purple-500 hover:bg-purple-600 text-white flex items-center justify-center"
                                    title="Use this"
                                >
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                                </button>
                            </div>
                        </>
                    ) : (
                        <div className="flex flex-col items-center justify-center gap-2">
                            <div className="w-6 h-6 border-2 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
                            <span className="text-[9px] text-purple-500 font-bold">#{idx + 1}</span>
                        </div>
                    )}
                </div>
            ))}
        </div>
    ) : activeImage ? (
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

- [ ] **Step 2: Add "Download All" button in the footer**

In the preview panel footer (line 674-700, the `{activeImage && (` block), add a condition before it for stack results. Insert before the existing `{activeImage && (` block:

```tsx
{stackResults.length > 0 && stackResults.some(r => r !== null) && (
    <div className="border-t border-gray-200 bg-white flex-shrink-0">
        <div className="h-14 flex items-center justify-between px-4">
            <span className="text-[9px] font-mono text-purple-500 font-bold">
                {stackResults.filter(r => r !== null).length}/{stackResults.length} generated
                {stackGenerating && ' — generating...'}
            </span>
            <div className="flex items-center gap-2">
                <button
                    onClick={() => {
                        stackResults.forEach((r, i) => {
                            if (r) {
                                const base64 = r.includes('base64,') ? r : `data:image/png;base64,${r}`;
                                downloadBase64Image(base64, `stack_v${i + 1}.png`);
                            }
                        });
                    }}
                    className="text-[10px] h-8 px-3 bg-purple-600 text-white rounded font-bold hover:bg-purple-500 transition-colors flex items-center gap-1"
                >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    DOWNLOAD ALL ({stackResults.filter(r => r !== null).length})
                </button>
                <button
                    onClick={() => { setStackResults([]); }}
                    className="text-[10px] h-8 px-3 bg-gray-100 text-gray-600 rounded font-bold hover:bg-gray-200 transition-colors border border-gray-200"
                >
                    CLEAR
                </button>
            </div>
        </div>
    </div>
)}
```

- [ ] **Step 3: Update the stacking button text to reflect config**

In the existing stacking button (line 595-613), update the label to show the attempt count and ratio:

Change:
```tsx
Stack {stackSelection.size} Items
```
To:
```tsx
Stack {stackSelection.size} Items — {stackAttempts} essai{stackAttempts > 1 ? 's' : ''} {stackRatio}
```

Also update the disabled condition to also check `stackGenerating`:
```tsx
disabled={isStacking || stackGenerating}
```

- [ ] **Step 4: Clear stack results when exiting stack mode**

In the Stack Mode toggle button (line 504), update the onClick:

Change:
```tsx
onClick={() => { setStackingMode(!stackingMode); setStackSelection(new Set()); }}
```
To:
```tsx
onClick={() => { setStackingMode(!stackingMode); setStackSelection(new Set()); setStackResults([]); }}
```

- [ ] **Step 5: Verify build and dev server**

Run: `npm run build`
Expected: No TypeScript errors

Run: `npm run dev`
Expected: Full flow works — stack mode shows config bar, generation produces grid, retry/download/favorite all functional.

- [ ] **Step 6: Commit**

```bash
git add components/ProductionEngine.tsx
git commit -m "feat(stacking): variant grid with retry, download all, and favorite selection"
```

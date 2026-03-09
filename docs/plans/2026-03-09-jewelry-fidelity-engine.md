# Jewelry Fidelity Engine — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve jewelry reproduction fidelity in production photos by adding pre-analysis, dimension anchoring, and a validation loop.

**Architecture:** 3-step pipeline wrapping existing `generateProductionPhoto` and `generateStackedProductionPhoto`. Step 1 analyzes the product image to extract a detailed blueprint. Step 2 converts user-provided cm dimensions into body-relative prompts. Step 3 validates the generated image against the original and re-generates with corrections if needed (max 2 retries).

**Tech Stack:** Gemini API (gemini-2.5-flash for text analysis, gemini-3-pro-image-preview for generation), React, Zustand, TypeScript.

---

### Task 1: Add new types for jewelry fidelity

**Files:**
- Modify: `types.ts`

**Step 1: Add the new interfaces at the end of types.ts**

```typescript
// Jewelry Fidelity Engine types
export interface ProductDimensions {
  chainLength?: number;    // cm
  pendantSize?: number;    // cm
}

export interface JewelryBlueprint {
  material: string;
  chainType: string;
  stoneShape: string;
  stoneSetting: string;
  pendantShape: string;
  finish: string;
  colorDetails: string;
  rawDescription: string;  // full text for prompt injection
}

export interface FidelityScore {
  chain: number;           // 1-5
  stones: number;          // 1-5
  pendant: number;         // 1-5
  material: number;        // 1-5
  proportions: number;     // 1-5
}

export interface FidelityResult {
  scores: FidelityScore;
  overallScore: number;
  corrections: string[];
  passed: boolean;
}
```

**Step 2: Add dimensions to ProductionItem**

In the existing `ProductionItem` interface, add optional fields:

```typescript
export interface ProductionItem {
  // ... existing fields ...
  chainLength?: number;    // cm — user-entered
  pendantSize?: number;    // cm — user-entered
}
```

**Step 3: Commit**

```bash
git add types.ts
git commit -m "feat: add jewelry fidelity engine types (blueprint, dimensions, fidelity scoring)"
```

---

### Task 2: Implement `analyzeJewelryProduct()` in geminiService.ts

**Files:**
- Modify: `services/geminiService.ts`

**Step 1: Add the function after the existing `analyzeProductionReference` function (around line 850)**

```typescript
/**
 * Pre-analyze a jewelry product image to extract a detailed technical blueprint.
 * Used to enrich production prompts for better fidelity.
 */
export const analyzeJewelryProduct = async (
    productImageBase64: string
): Promise<JewelryBlueprint> => {
    const imageData = productImageBase64.includes('base64,')
        ? productImageBase64.split(',')[1]
        : productImageBase64;
    const mimeType = productImageBase64.startsWith('data:image/jpeg') ? 'image/jpeg'
        : productImageBase64.startsWith('data:image/webp') ? 'image/webp'
        : 'image/png';

    const prompt = `You are an expert gemologist and jewelry appraiser. Analyze this jewelry product image with EXTREME precision. Describe every physical detail as if writing a certificate of authenticity.

Return a JSON object with these fields:
{
  "material": "exact metal type and color (e.g., 'yellow gold', 'white gold rhodium-plated', 'sterling silver oxidized')",
  "chainType": "exact chain/link type (e.g., 'cable chain 1mm', 'curb chain 3mm', 'snake chain', 'box chain', 'rope chain', 'none' if no chain)",
  "stoneShape": "exact stone cut shapes present (e.g., 'square princess-cut', 'round brilliant', 'pear drop', 'marquise', 'oval cabochon', 'none' if no stones)",
  "stoneSetting": "how stones are set (e.g., 'four-prong claw setting', 'bezel/clos setting', 'pavé micro-setting', 'channel setting', 'none')",
  "pendantShape": "pendant/charm shape and proportions (e.g., 'circular medallion 15mm diameter', 'rectangular bar 5x20mm', 'none' if no pendant)",
  "finish": "surface treatment (e.g., 'high polish mirror', 'brushed matte satin', 'hammered texture', 'mixed polish and matte')",
  "colorDetails": "all colors visible (e.g., 'warm yellow gold chain, deep green emerald stones, white diamond accents')",
  "rawDescription": "A single paragraph (3-5 sentences) describing the COMPLETE piece as you see it, focusing on shapes, textures, proportions, and distinctive visual features. Be extremely specific — mention exact shapes (square NOT round), exact chain patterns, exact setting styles. This description will be used to reproduce the piece visually."
}

CRITICAL: Be EXTREMELY specific about shapes. If stones are square, say SQUARE. If round, say ROUND. If the chain is thick cable, say THICK CABLE. Precision is everything — this will be used to reproduce the piece.

Return ONLY the JSON, no markdown fences.`;

    const response = await callGeminiAPI('gemini-2.5-flash', {
        contents: [{
            parts: [
                { text: prompt },
                { inlineData: { mimeType, data: imageData } },
            ],
        }],
        generationConfig: { responseModalities: ['TEXT'] },
    });

    const text = response.candidates?.[0]?.content?.parts
        ?.filter((p: any) => p.text)
        ?.map((p: any) => p.text)
        ?.join('') || '';

    try {
        // Strip markdown fences if present
        const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(cleaned);
        return {
            material: parsed.material || 'unknown',
            chainType: parsed.chainType || 'unknown',
            stoneShape: parsed.stoneShape || 'none',
            stoneSetting: parsed.stoneSetting || 'none',
            pendantShape: parsed.pendantShape || 'none',
            finish: parsed.finish || 'unknown',
            colorDetails: parsed.colorDetails || '',
            rawDescription: parsed.rawDescription || text,
        };
    } catch {
        // If JSON parsing fails, use raw text
        return {
            material: 'unknown',
            chainType: 'unknown',
            stoneShape: 'unknown',
            stoneSetting: 'unknown',
            pendantShape: 'unknown',
            finish: 'unknown',
            colorDetails: '',
            rawDescription: text,
        };
    }
};
```

**Step 2: Add import for JewelryBlueprint at the top of the file**

Update the import line (line 1) to include the new types:

```typescript
import { ExtractionResult, MannequinCriteria, RefinementType, RefinementSelections, ExtractionLevel, JewelryBlueprint, FidelityResult, FidelityScore, ProductDimensions } from "../types";
```

**Step 3: Commit**

```bash
git add services/geminiService.ts
git commit -m "feat: add analyzeJewelryProduct() for detailed product pre-analysis"
```

---

### Task 3: Implement `buildDimensionAnchors()` in geminiService.ts

**Files:**
- Modify: `services/geminiService.ts`

**Step 1: Add the pure function right after `analyzeJewelryProduct()`**

```typescript
/**
 * Convert cm dimensions to body-relative placement descriptions.
 * Based on a 1m65 mannequin reference height.
 * Pure function — no API call.
 */
export const buildDimensionAnchors = (
    dimensions: ProductDimensions,
    category: string
): string => {
    const parts: string[] = [];
    const catLower = category.toLowerCase();

    if (dimensions.chainLength) {
        const cm = dimensions.chainLength;
        let anchor: string;
        if (cm <= 35) anchor = 'choker length, tight around the neck';
        else if (cm <= 42) anchor = 'princess length, sitting on the collarbone';
        else if (cm <= 50) anchor = 'matinee length, falling to upper chest';
        else if (cm <= 60) anchor = 'opera length, falling to the sternum/mid-chest';
        else if (cm <= 80) anchor = 'long sautoir, falling to the navel area';
        else anchor = 'extra-long sautoir, falling below the navel toward the hips';

        parts.push(`CHAIN LENGTH: ${cm}cm on a 1m65 model = ${anchor}`);
    }

    if (dimensions.pendantSize) {
        const cm = dimensions.pendantSize;
        let anchor: string;
        if (cm <= 1) anchor = 'very small/dainty, smaller than a fingernail';
        else if (cm <= 2) anchor = 'small, approximately thumbnail-sized';
        else if (cm <= 3.5) anchor = 'medium, roughly the width of two fingers';
        else if (cm <= 5) anchor = 'large, approximately palm-width';
        else anchor = 'statement piece, larger than the palm';

        parts.push(`PENDANT SIZE: ${cm}cm = ${anchor}`);
    }

    // For stacking: relative sizing hint
    if (dimensions.chainLength && dimensions.pendantSize) {
        const ratio = dimensions.chainLength / dimensions.pendantSize;
        if (ratio > 20) parts.push('The pendant is very small relative to the chain length — delicate, subtle.');
        else if (ratio > 10) parts.push('The pendant is proportional to the chain — balanced look.');
        else parts.push('The pendant is large relative to the chain — statement/bold pendant.');
    }

    return parts.length > 0 ? `DIMENSION ANCHORS (based on 1m65 mannequin):\n${parts.join('\n')}` : '';
};

/**
 * Build relative dimension descriptions for stacking multiple pieces.
 * Compares pieces against each other for accurate proportional rendering.
 */
export const buildStackingDimensionAnchors = (
    products: Array<{ category: string; dimensions?: ProductDimensions }>
): string => {
    const withChains = products.filter(p => p.dimensions?.chainLength);
    if (withChains.length < 2) return '';

    const sorted = [...withChains].sort((a, b) => (a.dimensions!.chainLength!) - (b.dimensions!.chainLength!));
    const comparisons: string[] = [];

    for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const curr = sorted[i];
        const ratio = curr.dimensions!.chainLength! / prev.dimensions!.chainLength!;
        comparisons.push(
            `${curr.category} chain (${curr.dimensions!.chainLength}cm) is ${ratio.toFixed(1)}x longer than ${prev.category} chain (${prev.dimensions!.chainLength}cm)`
        );
    }

    return comparisons.length > 0
        ? `RELATIVE PROPORTIONS:\n${comparisons.join('\n')}`
        : '';
};
```

**Step 2: Commit**

```bash
git add services/geminiService.ts
git commit -m "feat: add buildDimensionAnchors() for cm-to-body-relative conversion"
```

---

### Task 4: Implement `validateJewelryFidelity()` in geminiService.ts

**Files:**
- Modify: `services/geminiService.ts`

**Step 1: Add the validation function after `buildStackingDimensionAnchors()`**

```typescript
/**
 * Compare a generated production image against the original product image.
 * Returns fidelity scores and specific corrections if fidelity is low.
 */
export const validateJewelryFidelity = async (
    generatedBase64: string,
    originalProductBase64: string,
    blueprint: JewelryBlueprint
): Promise<FidelityResult> => {
    const generatedData = generatedBase64.includes('base64,')
        ? generatedBase64.split(',')[1]
        : generatedBase64;
    const originalData = originalProductBase64.includes('base64,')
        ? originalProductBase64.split(',')[1]
        : originalProductBase64;

    const prompt = `You are a jewelry quality control specialist. Compare the GENERATED production photo (image 1) against the ORIGINAL product photo (image 2).

The original product has these characteristics:
- Material: ${blueprint.material}
- Chain type: ${blueprint.chainType}
- Stone shape: ${blueprint.stoneShape}
- Stone setting: ${blueprint.stoneSetting}
- Pendant shape: ${blueprint.pendantShape}
- Finish: ${blueprint.finish}
- Details: ${blueprint.rawDescription}

Score the GENERATED image's fidelity to the ORIGINAL on these 5 criteria (1=very different, 5=identical):

Return a JSON object:
{
  "scores": {
    "chain": <1-5 how accurately the chain type/style matches>,
    "stones": <1-5 how accurately stone shapes and cuts match>,
    "pendant": <1-5 how accurately pendant shape matches>,
    "material": <1-5 how accurately metal color/finish matches>,
    "proportions": <1-5 how accurately size proportions match>
  },
  "corrections": [
    "specific correction instruction if a score is <= 3, e.g., 'The stones must be SQUARE princess-cut, not ROUND brilliant — the original clearly shows square faceted stones'",
    "another correction if needed"
  ]
}

CRITICAL RULES:
- Be HARSH in scoring. If the chain type changed (e.g., cable became snake), score chain as 1-2.
- If stone shapes changed (square became round), score stones as 1-2.
- corrections array should contain SPECIFIC, ACTIONABLE instructions that could fix each low-scoring issue.
- If a criterion doesn't apply (e.g., no stones), score it 5 and skip it in corrections.
- Return ONLY the JSON, no markdown fences.`;

    const response = await callGeminiAPI('gemini-2.5-flash', {
        contents: [{
            parts: [
                { text: prompt },
                { inlineData: { mimeType: 'image/png', data: generatedData } },
                { inlineData: { mimeType: 'image/png', data: originalData } },
            ],
        }],
        generationConfig: { responseModalities: ['TEXT'] },
    });

    const text = response.candidates?.[0]?.content?.parts
        ?.filter((p: any) => p.text)
        ?.map((p: any) => p.text)
        ?.join('') || '';

    try {
        const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(cleaned);
        const scores: FidelityScore = {
            chain: Math.min(5, Math.max(1, parsed.scores?.chain || 3)),
            stones: Math.min(5, Math.max(1, parsed.scores?.stones || 3)),
            pendant: Math.min(5, Math.max(1, parsed.scores?.pendant || 3)),
            material: Math.min(5, Math.max(1, parsed.scores?.material || 3)),
            proportions: Math.min(5, Math.max(1, parsed.scores?.proportions || 3)),
        };
        const overallScore = Object.values(scores).reduce((a, b) => a + b, 0) / 5;
        const corrections: string[] = parsed.corrections || [];

        return {
            scores,
            overallScore,
            corrections,
            passed: overallScore >= 3.5 && corrections.length === 0,
        };
    } catch {
        // If parsing fails, assume it passed (don't block generation)
        return {
            scores: { chain: 3, stones: 3, pendant: 3, material: 3, proportions: 3 },
            overallScore: 3,
            corrections: [],
            passed: true,
        };
    }
};
```

**Step 2: Commit**

```bash
git add services/geminiService.ts
git commit -m "feat: add validateJewelryFidelity() for post-generation quality scoring"
```

---

### Task 5: Integrate fidelity pipeline into `generateProductionPhoto()`

**Files:**
- Modify: `services/geminiService.ts`

**Step 1: Modify the `generateProductionPhoto` function signature (line ~617)**

Add optional `blueprint` and `dimensions` parameters:

```typescript
export const generateProductionPhoto = async (
    mannequinBase64: string | null,
    productUrl: string,
    artisticDirection: string,
    category: string = '',
    blueprint?: JewelryBlueprint,
    dimensions?: ProductDimensions
): Promise<string> => {
```

**Step 2: After the existing prompt construction (after the category placement block, before the SCENE line ~650)**

Inject the blueprint and dimension anchors into the prompt if provided:

```typescript
        // Inject jewelry blueprint if available (fidelity engine)
        if (blueprint) {
            prompt += `\nPRODUCT BLUEPRINT (REPRODUCE THIS EXACTLY):\n`;
            prompt += `Material: ${blueprint.material}. `;
            prompt += `Chain: ${blueprint.chainType}. `;
            if (blueprint.stoneShape !== 'none') prompt += `Stones: ${blueprint.stoneShape}, set in ${blueprint.stoneSetting}. `;
            if (blueprint.pendantShape !== 'none') prompt += `Pendant: ${blueprint.pendantShape}. `;
            prompt += `Finish: ${blueprint.finish}. `;
            prompt += `\nCRITICAL FIDELITY: ${blueprint.rawDescription} `;
            prompt += `The jewelry in the output MUST match the product reference image EXACTLY — same chain type, same stone shapes, same proportions. Do NOT approximate or substitute any element. `;
        }

        if (dimensions) {
            const anchors = buildDimensionAnchors(dimensions, category);
            if (anchors) prompt += `\n${anchors} `;
        }
```

This goes right BEFORE the existing line:
```typescript
        prompt += `SCENE: ${artisticDirection}. QUALITY: 8K hyper-realistic rendering, ultra-detailed.`;
```

**Step 3: After the image is generated (after the for loop that extracts inlineData, around line ~685), add the validation loop**

Replace the simple return with a validation-aware flow. The new logic wraps the generation in a loop:

```typescript
        // --- Fidelity validation loop ---
        const extractImage = (resp: any): string | null => {
            for (const part of resp.candidates?.[0]?.content?.parts || []) {
                if (part.inlineData) {
                    return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                }
            }
            return null;
        };

        let candidateImage = extractImage(response);
        if (!candidateImage) throw new Error("Aucune image générée.");

        // If blueprint provided, validate fidelity and retry if needed
        if (blueprint) {
            const productBase64ForValidation = await fetchImageAsBase64(productUrl);
            let bestImage = candidateImage;
            let bestScore = 0;

            for (let attempt = 0; attempt < 3; attempt++) {
                const fidelity = await validateJewelryFidelity(
                    bestImage,
                    `data:image/jpeg;base64,${productBase64ForValidation}`,
                    blueprint
                );
                console.log(`[FIDELITY] Attempt ${attempt + 1}/3 — score: ${fidelity.overallScore.toFixed(1)}, corrections: ${fidelity.corrections.length}`);

                if (fidelity.passed || attempt === 2) {
                    return bestImage;
                }

                // Re-generate with corrections
                const correctionPrompt = fidelity.corrections.join('. ');
                const correctedParts: any[] = [
                    { text: prompt + `\nMANDATORY CORRECTIONS FROM PREVIOUS ATTEMPT: ${correctionPrompt}. Fix these issues precisely.` }
                ];
                if (mannequinBase64) {
                    correctedParts.push({
                        inlineData: {
                            mimeType: "image/png",
                            data: mannequinBase64.includes('base64,') ? mannequinBase64.split(',')[1] : mannequinBase64
                        }
                    });
                }
                correctedParts.push({ inlineData: { mimeType: "image/jpeg", data: productBase64 } });

                const retryResponse = await callGeminiAPI('gemini-3-pro-image-preview', {
                    contents: [{ parts: correctedParts }],
                    generationConfig: {
                        responseModalities: ['IMAGE', 'TEXT'],
                        imageConfig: { imageSize: '4K' },
                    }
                });

                const retryImage = extractImage(retryResponse);
                if (retryImage) {
                    bestImage = retryImage;
                }
            }

            return bestImage;
        }

        return candidateImage;
```

This replaces the existing block (lines ~682-689):
```typescript
        for (const part of response.candidates?.[0]?.content?.parts || []) {
            if (part.inlineData) {
                return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            }
        }

        throw new Error("Aucune image générée.");
```

**Step 4: Commit**

```bash
git add services/geminiService.ts
git commit -m "feat: integrate fidelity pipeline (blueprint + dimensions + validation loop) into generateProductionPhoto"
```

---

### Task 6: Integrate fidelity pipeline into `generateStackedProductionPhoto()`

**Files:**
- Modify: `services/geminiService.ts`

**Step 1: Modify signature to accept blueprints and dimensions**

```typescript
export const generateStackedProductionPhoto = async (
    mannequinBase64: string | null,
    products: Array<{ imageUrl: string; category: string; name: string; blueprint?: JewelryBlueprint; dimensions?: ProductDimensions }>,
    artisticDirection: string
): Promise<string> => {
```

**Step 2: After the existing `productDescriptions` block (line ~718), inject blueprint details**

```typescript
        // Inject per-product blueprints if available
        const blueprintDescriptions = products
            .filter(p => p.blueprint)
            .map((p, i) => `Product ${i + 1} BLUEPRINT: ${p.blueprint!.rawDescription}`)
            .join('\n');
        if (blueprintDescriptions) {
            prompt += `\nPRODUCT BLUEPRINTS (REPRODUCE EACH PIECE EXACTLY):\n${blueprintDescriptions}\n`;
            prompt += `CRITICAL: Each jewelry piece MUST match its reference image exactly — same chain types, stone shapes, proportions. Do NOT substitute or approximate.\n`;
        }

        // Inject stacking dimension anchors
        const stackAnchors = buildStackingDimensionAnchors(
            products.map(p => ({ category: p.category, dimensions: p.dimensions }))
        );
        if (stackAnchors) prompt += `\n${stackAnchors}\n`;
```

**Step 3: Apply the same validation loop pattern as Task 5**

After the image extraction for-loop, add validation against the first product's image (as a representative check):

```typescript
        const extractImage = (resp: any): string | null => {
            for (const part of resp.candidates?.[0]?.content?.parts || []) {
                if (part.inlineData) {
                    return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                }
            }
            return null;
        };

        let candidateImage = extractImage(response);
        if (!candidateImage) throw new Error("Aucune image générée pour le stacking.");

        // Validate against first product with blueprint
        const productWithBlueprint = products.find(p => p.blueprint);
        if (productWithBlueprint?.blueprint) {
            const refBase64 = await fetchImageAsBase64(productWithBlueprint.imageUrl);
            let bestImage = candidateImage;

            for (let attempt = 0; attempt < 3; attempt++) {
                const fidelity = await validateJewelryFidelity(
                    bestImage,
                    `data:image/jpeg;base64,${refBase64}`,
                    productWithBlueprint.blueprint
                );
                console.log(`[FIDELITY-STACK] Attempt ${attempt + 1}/3 — score: ${fidelity.overallScore.toFixed(1)}`);

                if (fidelity.passed || attempt === 2) return bestImage;

                const correctionPrompt = fidelity.corrections.join('. ');
                const correctedParts: any[] = [
                    { text: prompt + `\nMANDATORY CORRECTIONS: ${correctionPrompt}` }
                ];
                if (mannequinBase64) {
                    correctedParts.push({
                        inlineData: {
                            mimeType: 'image/png',
                            data: mannequinBase64.includes('base64,') ? mannequinBase64.split(',')[1] : mannequinBase64
                        }
                    });
                }
                for (const product of products) {
                    const pBase64 = await fetchImageAsBase64(product.imageUrl);
                    correctedParts.push({ inlineData: { mimeType: 'image/jpeg', data: pBase64 } });
                }

                const retryResp = await callGeminiAPI('gemini-3-pro-image-preview', {
                    contents: [{ parts: correctedParts }],
                    generationConfig: {
                        responseModalities: ['IMAGE', 'TEXT'],
                        imageConfig: { imageSize: '4K' },
                    }
                });
                const retryImg = extractImage(retryResp);
                if (retryImg) bestImage = retryImg;
            }
            return bestImage;
        }

        return candidateImage;
```

**Step 4: Commit**

```bash
git add services/geminiService.ts
git commit -m "feat: integrate fidelity pipeline into generateStackedProductionPhoto"
```

---

### Task 7: Add dimension inputs to ProductionItem UI

**Files:**
- Modify: `components/ProductionEngine.tsx`

**Step 1: Add dimension input fields in the per-item category selector overlay**

In the queue grid item (around line 364), extend the bottom overlay to include dimension inputs. Replace the existing category `<select>` overlay with an expanded version:

```typescript
<div className="absolute bottom-0 left-0 right-0 z-20" onClick={(e) => e.stopPropagation()}>
    <div className="bg-black/60 backdrop-blur-sm px-1 py-0.5 space-y-0.5">
        <select
            className="w-full bg-transparent text-white text-[8px] font-bold uppercase outline-none cursor-pointer appearance-none text-center"
            value={item.category || ''}
            onChange={(e) => updateItemCategory(item.id, e.target.value)}
        >
            <option value="">Auto</option>
            <option value="necklace">Collier</option>
            <option value="sautoir-court">Sautoir Court</option>
            <option value="sautoir-long">Sautoir Long</option>
            <option value="ring">Bague</option>
            <option value="earrings">Boucles</option>
            <option value="bracelet">Bracelet</option>
        </select>
        {item.category && !item.category.includes('ring') && !item.category.includes('bague') && (
            <div className="flex gap-0.5">
                <input
                    type="number"
                    placeholder="Ch cm"
                    className="w-1/2 bg-white/20 text-white text-[7px] px-1 py-0 rounded outline-none placeholder-white/50 text-center"
                    value={item.chainLength || ''}
                    onChange={(e) => updateItemDimensions(item.id, { chainLength: e.target.value ? Number(e.target.value) : undefined })}
                />
                <input
                    type="number"
                    placeholder="Pd cm"
                    className="w-1/2 bg-white/20 text-white text-[7px] px-1 py-0 rounded outline-none placeholder-white/50 text-center"
                    value={item.pendantSize || ''}
                    onChange={(e) => updateItemDimensions(item.id, { pendantSize: e.target.value ? Number(e.target.value) : undefined })}
                />
            </div>
        )}
    </div>
</div>
```

**Step 2: Add the `updateItemDimensions` handler next to `updateItemCategory`**

```typescript
const updateItemDimensions = (id: string, dims: { chainLength?: number; pendantSize?: number }) => {
    setQueue(prev => prev.map(p => p.id === id ? { ...p, ...dims } : p));
};
```

**Step 3: Commit**

```bash
git add components/ProductionEngine.tsx
git commit -m "feat: add dimension inputs (chain cm, pendant cm) per production item"
```

---

### Task 8: Wire fidelity pipeline into production flow

**Files:**
- Modify: `components/ProductionEngine.tsx`

**Step 1: Import the new functions at the top**

Update the import from geminiService (line 5):

```typescript
import { generateProductionPhoto, generateStackedProductionPhoto, analyzeProductionReference, analyzeJewelryProduct, buildDimensionAnchors } from '../services/geminiService';
```

**Step 2: Add fidelity status state**

Add state near the other useState declarations:

```typescript
const [fidelityStatus, setFidelityStatus] = useState<Record<string, string>>({});
```

**Step 3: Modify the `processItem` function inside `startProduction` (line ~198)**

Replace the current `processItem` with a version that runs the fidelity pipeline:

```typescript
    const processItem = async (item: ProductionItem): Promise<void> => {
        updateItemStatus(item.id, { status: 'PROCESSING', error: undefined });
        setSelectedItemId(item.id);

        try {
            console.log('[PRODUCTION] Starting generation for item:', item.id);

            let itemPrompt = effectivePrompt;
            const jewelryDesc = item.category || item.name || 'jewelry';
            const backgroundCtx = 'neutral elegant background';

            itemPrompt = itemPrompt
                .replace('{jewelry_description}', jewelryDesc)
                .replace('{background_context}', backgroundCtx);

            // Fidelity Engine: pre-analyze jewelry
            let blueprint: JewelryBlueprint | undefined;
            try {
                setFidelityStatus(prev => ({ ...prev, [item.id]: 'Analyzing jewelry...' }));
                blueprint = await analyzeJewelryProduct(item.imageUrl);
                console.log('[FIDELITY] Blueprint:', blueprint.rawDescription.substring(0, 100));
            } catch (err) {
                console.warn('[FIDELITY] Pre-analysis failed, proceeding without blueprint:', err);
            }

            // Build dimensions if provided
            const dimensions: ProductDimensions | undefined =
                (item.chainLength || item.pendantSize)
                    ? { chainLength: item.chainLength, pendantSize: item.pendantSize }
                    : undefined;

            setFidelityStatus(prev => ({ ...prev, [item.id]: blueprint ? 'Generating with fidelity...' : 'Generating...' }));

            const resultImage = await generateProductionPhoto(
                mannequinImage,
                item.imageUrl,
                itemPrompt,
                item.category,
                blueprint,
                dimensions
            );

            console.log('[PRODUCTION] Generation successful for item:', item.id);
            updateItemStatus(item.id, { status: 'COMPLETED', resultImage });
            setFidelityStatus(prev => { const next = { ...prev }; delete next[item.id]; return next; });
        } catch (err: any) {
            console.error('[PRODUCTION] Error for item:', item.id, err);
            const errorMsg = err.message || String(err);
            updateItemStatus(item.id, { status: 'ERROR', error: errorMsg });
            setFidelityStatus(prev => { const next = { ...prev }; delete next[item.id]; return next; });
        }
    };
```

**Step 4: Add the import for types at the top**

```typescript
import { ProductionItem, ExtractionLevel, CustomPreset, JewelryBlueprint, ProductDimensions } from '../types';
```

**Step 5: Show fidelity status in the processing overlay**

In the item's processing overlay (around line 379), replace the existing processing indicator:

```typescript
{item.status === 'PROCESSING' && <div className="absolute inset-0 bg-white/70 flex flex-col items-center justify-center z-10 p-2 text-center">
    <div className="w-4 h-4 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-1"></div>
    <span className="text-[7px] text-indigo-600 animate-pulse font-bold uppercase">{fidelityStatus[item.id] || 'Processing...'}</span>
</div>}
```

**Step 6: Wire stacking with blueprints too**

Update `handleGenerateStacked` to analyze each product before stacking:

```typescript
  const handleGenerateStacked = async () => {
    const selectedItems = queue.filter(i => stackSelection.has(i.id));
    if (selectedItems.length < 2) return;
    setIsStacking(true);
    try {
      // Pre-analyze each product for fidelity
      const products = await Promise.all(selectedItems.map(async (item) => {
        let blueprint: JewelryBlueprint | undefined;
        try {
          blueprint = await analyzeJewelryProduct(item.imageUrl);
        } catch { /* proceed without */ }
        return {
          imageUrl: item.imageUrl,
          category: item.category || '',
          name: item.name,
          blueprint,
          dimensions: (item.chainLength || item.pendantSize)
            ? { chainLength: item.chainLength, pendantSize: item.pendantSize }
            : undefined,
        };
      }));

      let effectivePrompt = artisticDirection;
      if (!effectivePrompt.trim()) effectivePrompt = PROMPT_PRESETS.default;
      const resultImage = await generateStackedProductionPhoto(mannequinImage, products, effectivePrompt);
      const stackedItem: ProductionItem = {
        id: crypto.randomUUID(),
        sku: `STACK-${selectedItems.map(i => i.sku).join('+')}`,
        name: `Stacked: ${selectedItems.map(i => i.name).join(' + ')}`,
        imageUrl: selectedItems[0].imageUrl,
        category: 'stacked',
        status: 'COMPLETED',
        resultImage,
      };
      setQueue(prev => [...prev, stackedItem]);
      setSelectedItemId(stackedItem.id);
      setStackSelection(new Set());
      setStackingMode(false);
    } catch (err: any) {
      alert(`Stacking failed: ${err.message}`);
    } finally {
      setIsStacking(false);
    }
  };
```

**Step 7: Commit**

```bash
git add components/ProductionEngine.tsx
git commit -m "feat: wire fidelity pipeline into production + stacking flows with status indicators"
```

---

### Task 9: Smoke test the full flow

**Step 1: Run dev server**

```bash
npm run dev
```

**Step 2: Manual test checklist**

1. Open http://localhost:3000
2. Enter API key
3. Go to Production Engine
4. Add a jewelry product (with image URL)
5. Set category to "Collier" or "Sautoir Court"
6. Enter chain length (e.g., 45) and pendant size (e.g., 2)
7. Click Execute Batch
8. Verify: console logs show `[FIDELITY] Blueprint:` and `[FIDELITY] Attempt 1/3`
9. Verify: processing overlay shows "Analyzing jewelry..." then "Generating with fidelity..."
10. Verify: result image looks closer to the original product
11. Test stacking: select 2+ items, Stack Mode, generate
12. Verify: stacking also shows fidelity logs

**Step 3: Build check**

```bash
npm run build
```

Expected: No TypeScript errors, clean build.

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: jewelry fidelity engine — complete pipeline with pre-analysis, dimension anchoring, and validation loop"
```

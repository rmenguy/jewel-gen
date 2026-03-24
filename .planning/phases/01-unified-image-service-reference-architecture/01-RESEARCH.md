# Phase 1: Unified Image Service & Reference Architecture - Research

**Researched:** 2026-03-24
**Domain:** Gemini API image generation/editing, service abstraction, multi-reference architecture
**Confidence:** HIGH

## Summary

This phase replaces the current multi-model service layer (~2200 lines in `geminiService.ts`) with a single-model abstraction targeting `gemini-3.1-flash-image-preview`. The current code uses 3 models: `imagen-4.0-ultra-generate-001` (text-to-image via `:predict`), `gemini-3-pro-image-preview` (image editing via `:generateContent`), and `gemini-3-flash-preview` (text extraction). The target model unifies text-to-image and image editing under the single `:generateContent` endpoint.

The critical technical challenge is implementing multi-turn conversational editing via raw REST `fetch()` (no SDK). The Gemini 3.x models return `thought_signature` fields on `inlineData` parts that MUST be echoed back in subsequent turns to avoid 400 errors. The current codebase has no multi-turn state management -- every call is single-shot. Building the `createImageChatSession` / `continueImageChatSession` functions requires accumulating conversation history including these signatures.

**Primary recommendation:** Build a layered service: (1) low-level `callUnifiedAPI` replacing both `callGeminiAPI` and `callImagenAPI`, (2) response parser extracting images + thought signatures, (3) high-level named functions (generate, edit, editWithRefs, chat), (4) ReferenceBundle type system with deterministic budget enforcement. Wire existing callers to the new functions, then delete old model code paths.

## Project Constraints (from CLAUDE.md)

- All API calls are direct browser `fetch()` to `generativelanguage.googleapis.com` -- no backend proxy, no SDK
- `@google/genai` SDK is NOT used -- all calls are raw REST
- API key stored in module-level variable via `setApiKey()`, never persisted
- File uploads use `FileReader.readAsDataURL()` -- never `URL.createObjectURL()`
- Image fetching (`fetchImageAsBase64`): direct fetch first, falls back to `corsproxy.io`
- Zustand for state management (3 stores: app, mannequin, production)
- React 19 + Vite + TailwindCSS + TypeScript
- `gemini-3-flash-preview` stays for text-only analytical tasks (catalog extraction) -- MODEL-06

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MODEL-01 | All image generation uses `gemini-3.1-flash-image-preview` exclusively | Model supports both text-to-image and image editing via `:generateContent` endpoint -- replaces both Imagen `:predict` and gemini-3-pro |
| MODEL-02 | Model ID is a single configurable constant | Replace 25 hardcoded `callGeminiAPI('gemini-3-pro-image-preview', ...)` and `callImagenAPI('imagen-4.0-ultra-generate-001', ...)` calls with constant |
| MODEL-03 | Unified service with named functions | 5 functions map to distinct API interaction patterns: single-shot generate, single-shot edit, multi-ref edit, chat create, chat continue |
| MODEL-04 | Standardized response parsing | Currently duplicated ~20 times: `response.candidates?.[0]?.content?.parts` loop looking for `inlineData` -- centralize into one parser |
| MODEL-05 | Support generationConfig (responseModalities, imageConfig) | Model supports: responseModalities `['TEXT', 'IMAGE']`, imageConfig with aspectRatio (14 options) and imageSize (512/1K/2K/4K) |
| MODEL-06 | Text-only tasks on separate model | `gemini-3-flash-preview` remains for `extractShopifyCatalog` and text analysis -- no change needed |
| MODEL-07 | Stateful multi-step editing sessions | Requires thought_signature management: model returns signatures on inlineData parts, must echo in subsequent turns |
| REF-01 | ReferenceImage type | New type with id, kind, role, imageUrl/base64, priority fields |
| REF-02 | ReferenceBundle type | Groups references by kind with typed arrays: characterReferences, objectReferences, compositionReferences, styleReferences |
| REF-03 | Budget enforcement: 4 character + 10 object, 14 total | Confirmed by official docs for gemini-3.1-flash-image-preview |
| REF-04 | Deterministic priority-based downselection | Implement as pure function: sort by priority, fill character slots (max 4), fill object slots (max 10), drop overflow |
| REF-05 | Deterministic reference ordering in API request | Text prompt first in parts array, then ordered inlineData parts by priority/role |
| REF-06 | Prompts state role of each reference set | Model infers roles through textual descriptions -- no special API syntax for role designation |
| REF-07 | Composition references as distinct kind | New reference kind alongside character/object/style; counts against object budget |
| CLEAN-01 | Remove imagen-4.0-ultra code paths | 2 callImagenAPI calls (lines 332, 491) using `:predict` endpoint |
| CLEAN-02 | Remove gemini-3-pro-image-preview code paths | ~20 callGeminiAPI calls using this model across editing/generation functions |
| CLEAN-03 | Banner engine tab hidden/removed | BannerEngine.tsx tab entry in App.tsx navigation array |
</phase_requirements>

## Standard Stack

### Core

No new libraries needed. This is a refactor of existing code using the same tech stack.

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | (existing) | Type definitions for ReferenceImage, ReferenceBundle | Already in project |
| Zustand | (existing) | No new stores needed for Phase 1 | Already in project |

### API Endpoint Migration

| Current | Endpoint | Target | Endpoint |
|---------|----------|--------|----------|
| `imagen-4.0-ultra-generate-001` | `:predict` | `gemini-3.1-flash-image-preview` | `:generateContent` |
| `gemini-3-pro-image-preview` | `:generateContent` | `gemini-3.1-flash-image-preview` | `:generateContent` |
| `gemini-3-flash-preview` | `:generateContent` | `gemini-3-flash-preview` (unchanged) | `:generateContent` |

**Key difference:** Imagen used `:predict` with `{instances: [{prompt}], parameters: {sampleCount, aspectRatio, personGeneration}}`. The new model uses `:generateContent` with `{contents: [{parts}], generationConfig: {responseModalities, imageConfig}}`. The request/response format changes completely for mannequin generation.

## Architecture Patterns

### Recommended Service Structure

```
services/
  geminiService.ts          # Refactored: unified image service + existing text functions
  geminiService.types.ts    # NEW: ReferenceImage, ReferenceBundle, ImageGenerationConfig, ChatSession types
  downloadService.ts        # Unchanged
  supabaseClient.ts         # Unchanged
  pixelCompare.ts           # Unchanged
```

Alternatively, the types can go in the existing `types.ts` file at root (consistent with current convention). Both approaches work; keeping them in `types.ts` follows existing pattern.

### Pattern 1: Single Model Constant

**What:** One constant controls all image model calls.
**When to use:** Every image generation/editing function.

```typescript
// In geminiService.ts (top of file)
const IMAGE_MODEL = 'gemini-3.1-flash-image-preview';
const TEXT_MODEL = 'gemini-3-flash-preview'; // unchanged, for catalog extraction

// All image calls use IMAGE_MODEL:
const response = await callUnifiedAPI(IMAGE_MODEL, requestBody);
```

### Pattern 2: Unified API Caller (replacing callGeminiAPI + callImagenAPI)

**What:** Single low-level function for all generateContent calls.
**When to use:** Replaces both `callGeminiAPI` and `callImagenAPI`.

```typescript
async function callUnifiedAPI(
  model: string,
  requestBody: Record<string, unknown>
): Promise<any> {
  const url = `${GEMINI_BASE}/models/${model}:generateContent?key=${API_KEY}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error ${response.status}: ${errorText}`);
  }
  return response.json();
}
```

**Critical:** `callImagenAPI` used `:predict` endpoint. The new model uses `:generateContent` only. The `callImagenAPI` function can be deleted entirely.

### Pattern 3: Standardized Response Parser

**What:** One function to extract image(s) and thought signatures from API response.
**When to use:** Every image generation/editing response.

```typescript
interface ParsedImageResponse {
  images: Array<{ mimeType: string; data: string; dataUri: string }>;
  text: string | null;
  thoughtSignatures: Array<{ partIndex: number; signature: string }>;
  rawParts: any[]; // For echoing back in multi-turn
}

function parseImageResponse(response: any): ParsedImageResponse {
  const parts = response.candidates?.[0]?.content?.parts || [];
  const images: ParsedImageResponse['images'] = [];
  const signatures: ParsedImageResponse['thoughtSignatures'] = [];
  let text: string | null = null;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part.inlineData) {
      images.push({
        mimeType: part.inlineData.mimeType,
        data: part.inlineData.data,
        dataUri: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`,
      });
    }
    if (part.text) {
      text = part.text;
    }
    if (part.thoughtSignature) {
      signatures.push({ partIndex: i, signature: part.thoughtSignature });
    }
  }
  return { images, text, thoughtSignatures: signatures, rawParts: parts };
}
```

This replaces the ~20 duplicated response-parsing loops currently scattered across functions.

### Pattern 4: ReferenceBundle with Budget Enforcement

**What:** Type-safe reference grouping with deterministic prioritization.

```typescript
// types.ts
type ReferenceKind = 'character' | 'object' | 'composition' | 'style';

interface ReferenceImage {
  id: string;
  kind: ReferenceKind;
  role: string;          // Human-readable: "locked base scene", "jewelry fidelity", etc.
  base64: string;        // Raw base64 (no data: prefix)
  mimeType: string;
  priority: number;      // Lower = higher priority (0 = must include)
}

interface ReferenceBundle {
  characterReferences: ReferenceImage[];  // Max 4
  objectReferences: ReferenceImage[];     // Max 10
  compositionReferences: ReferenceImage[]; // Counts toward object budget
  styleReferences: ReferenceImage[];       // Counts toward object budget
}

interface EffectiveBundle {
  included: ReferenceImage[];   // Ordered for API request
  excluded: ReferenceImage[];   // Dropped due to budget
  budget: { character: { used: number; max: number }; object: { used: number; max: number } };
}
```

### Pattern 5: Multi-Turn Chat Session (for MODEL-07)

**What:** Stateful conversation for iterative editing via raw REST.

```typescript
interface ImageChatSession {
  history: Array<{ role: 'user' | 'model'; parts: any[] }>;
  model: string;
  generationConfig: Record<string, unknown>;
}

function createImageChatSession(config?: {
  aspectRatio?: string;
  imageSize?: string;
}): ImageChatSession {
  return {
    history: [],
    model: IMAGE_MODEL,
    generationConfig: {
      responseModalities: ['IMAGE', 'TEXT'],
      ...(config?.aspectRatio || config?.imageSize ? {
        imageConfig: {
          ...(config.aspectRatio && { aspectRatio: config.aspectRatio }),
          ...(config.imageSize && { imageSize: config.imageSize }),
        }
      } : {}),
    },
  };
}

async function continueImageChatSession(
  session: ImageChatSession,
  userParts: any[]
): Promise<ParsedImageResponse> {
  // Add user message to history
  session.history.push({ role: 'user', parts: userParts });

  const response = await callUnifiedAPI(session.model, {
    contents: session.history,
    generationConfig: session.generationConfig,
  });

  const parsed = parseImageResponse(response);

  // Add model response to history -- MUST include thought_signatures
  session.history.push({
    role: 'model',
    parts: parsed.rawParts, // Preserves thought_signature fields
  });

  return parsed;
}
```

**Critical:** The `rawParts` from the response MUST be echoed back verbatim. Stripping `thought_signature` fields causes 400 errors on Gemini 3.x models.

### Pattern 6: Priority-Based Downselection (pure function)

```typescript
const BUDGET = { character: 4, object: 10, total: 14 } as const;

// Priority order (lowest number = highest priority, included first):
// 0: locked base image
// 1: primary jewelry references (object fidelity)
// 2: character consistency references
// 3: detail crop references
// 4: composition references
// 5: style references (dropped first)

function enforceReferenceBudget(bundle: ReferenceBundle): EffectiveBundle {
  // 1. Collect all refs, sort by priority
  const allRefs = [
    ...bundle.characterReferences,
    ...bundle.objectReferences,
    ...bundle.compositionReferences.map(r => ({ ...r, kind: 'object' as const })),
    ...bundle.styleReferences.map(r => ({ ...r, kind: 'object' as const })),
  ].sort((a, b) => a.priority - b.priority);

  const included: ReferenceImage[] = [];
  const excluded: ReferenceImage[] = [];
  let charCount = 0;
  let objCount = 0;

  for (const ref of allRefs) {
    if (ref.kind === 'character' && charCount < BUDGET.character) {
      included.push(ref);
      charCount++;
    } else if (ref.kind !== 'character' && objCount < BUDGET.object) {
      included.push(ref);
      objCount++;
    } else {
      excluded.push(ref);
    }
  }

  return {
    included,
    excluded,
    budget: {
      character: { used: charCount, max: BUDGET.character },
      object: { used: objCount, max: BUDGET.object },
    },
  };
}
```

### Anti-Patterns to Avoid

- **Duplicating response parsing:** Currently done ~20 times. Centralize in `parseImageResponse`.
- **Hardcoding model names in function bodies:** Currently `'gemini-3-pro-image-preview'` appears 20+ times. Use `IMAGE_MODEL` constant.
- **Stripping thought_signature from response parts:** The raw parts must be stored and echoed back for multi-turn to work. Never filter these out.
- **Mixing composition/style refs into character budget:** Composition and style refs count against the object budget (max 10), not character (max 4).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Multi-turn state | Custom conversation tracker | Simple array of `{role, parts}` echoing raw API responses | Thought signatures must be preserved verbatim; any transformation risks 400 errors |
| Reference ordering | Ad-hoc per-function ordering | Pure `enforceReferenceBudget` function | Deterministic, testable, consistent across all callers |
| Base64 data URI parsing | Repeated `.includes('base64,') ? .split(',')[1]` | Small `extractBase64(input: string): string` helper | Currently duplicated ~15 times across the file |

## Common Pitfalls

### Pitfall 1: Imagen-to-Gemini Request Format Mismatch
**What goes wrong:** Mannequin generation currently uses `:predict` endpoint with `{instances: [{prompt}], parameters: {sampleCount, aspectRatio, personGeneration}}`. Switching to `:generateContent` requires completely different request body.
**Why it happens:** Imagen and Gemini have incompatible API contracts.
**How to avoid:** The `generateMannequin` function must be rewritten to use `{contents: [{parts: [{text: prompt}]}], generationConfig: {responseModalities: ['IMAGE', 'TEXT'], imageConfig: {aspectRatio: '3:4'}}}`. Response parsing also changes: from `response.predictions[0].bytesBase64Encoded` to `response.candidates[0].content.parts[].inlineData.data`.
**Warning signs:** "Cannot read property 'bytesBase64Encoded' of undefined" errors.

### Pitfall 2: Thought Signature Loss in Multi-Turn
**What goes wrong:** 400 error: "Image part is missing a thought_signature in content position N, part position M."
**Why it happens:** When building multi-turn conversation history, storing only the image base64 data (not the full part object with `thought_signature`) causes validation failures.
**How to avoid:** Store the complete `parts` array from each model response verbatim. Never reconstruct parts from extracted data.
**Warning signs:** Multi-turn editing works on first turn, fails on second.

### Pitfall 3: personGeneration Parameter Missing
**What goes wrong:** Gemini 3.1 Flash may refuse to generate human images if `personGeneration` is not set. Current Imagen calls use `personGeneration: "allow_adult"`.
**Why it happens:** Default safety settings for person generation are restrictive.
**How to avoid:** Verify whether `gemini-3.1-flash-image-preview` requires or supports a `personGeneration` parameter in `generationConfig` or `safetySettings`. This may differ from Imagen's parameter format.
**Warning signs:** "Content generation blocked" or empty responses when generating mannequins.

### Pitfall 4: Aspect Ratio Discrepancy
**What goes wrong:** The model page shows limited aspect ratios (1:4, 1:1, 4:1, 1:8, 8:1) while the image generation docs show 14 options. Requirements list 10 different ratios.
**Why it happens:** Model-specific pages may list a subset; the general image generation docs list all supported ratios. Documentation may also be stale for preview models.
**How to avoid:** Test actual ratio support empirically. The image generation docs (more authoritative, more recently updated) list: 1:1, 1:4, 1:8, 2:3, 3:2, 3:4, 4:1, 4:3, 4:5, 5:4, 8:1, 9:16, 16:9, 21:9. Use these. If a ratio fails at runtime, fall back gracefully.
**Warning signs:** API errors mentioning unsupported aspect ratio.

### Pitfall 5: Breaking Existing Callers During Refactor
**What goes wrong:** 5 engine components import from `geminiService.ts`. Changing function signatures or return types breaks the entire app.
**Why it happens:** Brownfield refactor with tight coupling.
**How to avoid:** Phase the work: (1) add new functions alongside old ones, (2) migrate callers one-by-one, (3) delete old functions only after all callers are migrated. Or: keep the same exported function signatures and names, change only the internal implementation (model used, request format, response parsing).
**Warning signs:** TypeScript compilation errors across multiple component files.

### Pitfall 6: Text Extraction Functions Accidentally Migrated
**What goes wrong:** `extractShopifyCatalog`, `analyzeJewelryProduct`, and `analyzeProductionReference` are moved to the image model, which is slower and more expensive for text-only tasks.
**Why it happens:** Overzealous "everything through one model" approach.
**How to avoid:** MODEL-06 explicitly states text-only tasks stay on `gemini-3-flash-preview`. Keep the `TEXT_MODEL` constant separate. Only functions that produce images use `IMAGE_MODEL`.
**Warning signs:** Catalog extraction becoming slower or more expensive.

## Code Examples

### Mannequin Generation Migration (Imagen -> Gemini)

```typescript
// BEFORE (Imagen :predict endpoint):
const response = await callImagenAPI('imagen-4.0-ultra-generate-001', {
  instances: [{ prompt }],
  parameters: { sampleCount: 1, aspectRatio: "3:4", personGeneration: "allow_adult" }
});
const prediction = response.predictions?.[0];
if (prediction?.bytesBase64Encoded) {
  return `data:${prediction.mimeType || 'image/png'};base64,${prediction.bytesBase64Encoded}`;
}

// AFTER (Gemini :generateContent endpoint):
const response = await callUnifiedAPI(IMAGE_MODEL, {
  contents: [{ parts: [{ text: prompt }] }],
  generationConfig: {
    responseModalities: ['IMAGE', 'TEXT'],
    imageConfig: { aspectRatio: '3:4' }
  }
});
const parsed = parseImageResponse(response);
if (parsed.images.length > 0) {
  return parsed.images[0].dataUri;
}
throw new Error("No image returned");
```

### Multi-Reference Edit Request

```typescript
// Building a reference-aware edit request:
function buildEditRequest(
  prompt: string,
  effectiveBundle: EffectiveBundle,
  config?: { aspectRatio?: string; imageSize?: string }
): Record<string, unknown> {
  const parts: any[] = [{ text: prompt }];

  // Add references in deterministic priority order
  for (const ref of effectiveBundle.included) {
    parts.push({
      inlineData: { mimeType: ref.mimeType, data: ref.base64 }
    });
  }

  return {
    contents: [{ parts }],
    generationConfig: {
      responseModalities: ['IMAGE', 'TEXT'],
      ...(config?.aspectRatio || config?.imageSize ? {
        imageConfig: {
          ...(config.aspectRatio && { aspectRatio: config.aspectRatio }),
          ...(config.imageSize && { imageSize: config.imageSize }),
        }
      } : {}),
    },
  };
}
```

### Prompt Role Annotation (REF-06)

```typescript
// Prompts must describe what each reference image is:
function buildReferenceRolePrompt(effective: EffectiveBundle): string {
  const lines: string[] = [];
  let imgIndex = 1; // Image numbering in prompt (after text)

  for (const ref of effective.included) {
    lines.push(`Image ${imgIndex}: ${ref.role}`);
    imgIndex++;
  }

  return lines.join('\n');
}

// Usage in prompt:
// "IMAGE EDITING TASK.\n\n" + buildReferenceRolePrompt(effective) + "\n\n" + editInstructions
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `imagen-4.0-ultra` for text-to-image | `gemini-3.1-flash-image-preview` for all image tasks | Feb 2026 | Single model, single endpoint, simpler architecture |
| `gemini-3-pro-image-preview` for editing | `gemini-3.1-flash-image-preview` | Feb 2026 | gemini-3-pro deprecated March 9, 2026 -- migration is urgent |
| Stateless single-shot edits | Multi-turn chat with thought signatures | Gemini 3.x (2026) | Enables iterative editing with visual context preservation |
| No reference budget concept | 14-ref budget (4 char + 10 obj) | Gemini 3.1 Flash (2026) | Enables structured multi-reference workflows |

**Deprecated/outdated:**
- `gemini-3-pro-image-preview`: Shut down March 9, 2026. Code using this model is actively broken or at risk.
- `imagen-4.0-ultra-generate-001`: Still operational but redundant; target model covers all its use cases.
- `:predict` endpoint: Not used by Gemini models. Only Imagen models use this endpoint.

## Current Codebase Inventory

### Model References (25 total API calls)
- `gemini-3-pro-image-preview`: ~20 calls (image editing/generation)
- `imagen-4.0-ultra-generate-001`: 2 calls (mannequin generation)
- `gemini-3-flash-preview`: ~5 calls (text extraction -- keep)

### Exported Functions (30 total)
**Image functions to migrate (24):**
- `generateMannequin` -- Imagen, text-to-image
- `generateMannequinFromReference` -- Imagen + Gemini hybrid
- `generateBookShot` -- gemini-3-pro, image-to-image
- `generateProductionPhoto` -- gemini-3-pro, image editing
- `_generateProductionPhotoFull` -- gemini-3-pro, image editing
- `addJewelryToExisting` -- gemini-3-pro, image editing
- `generateStackedIterative` -- orchestrator (calls addJewelryToExisting)
- `generateStackedProductionPhoto` -- gemini-3-pro, multi-image editing
- `generateBareMannequin` -- gemini-3-pro, image editing
- `dressWithJewelry` -- gemini-3-pro, image editing
- `harmonizeJewelryComposite` -- gemini-3-pro, image editing
- `refineMannequinImage` -- gemini-3-pro (with gemini-3-flash fallback)
- `freeformEditImage` -- gemini-3-pro, image editing
- `applyBatchRefinements` -- gemini-3-flash + gemini-3-pro
- `generateBannerMannequin` -- gemini-3-pro, multi-ref generation
- `addSingleJewelryToBanner` -- gemini-3-pro, image editing
- `refuseBannerIdentity` -- gemini-3-pro, image editing

**Text functions to keep unchanged (4):**
- `extractShopifyCatalog` -- gemini-3-flash-preview
- `analyzeJewelryProduct` -- gemini-3-flash-preview
- `analyzeProductionReference` -- gemini-3-flash-preview (text analysis part)
- `segmentJewelry` -- gemini-3-flash-preview

**Utility functions unchanged (6):**
- `setApiKey`, `getApiKey`, `fetchImageAsBase64`, `buildDimensionAnchors`, `buildStackingDimensionAnchors`, `BOOK_ANGLES`

### Callers (5 engine components)
- `MannequinEngine.tsx`: imports `generateMannequin`, `generateMannequinFromReference`, `applyBatchRefinements`, `generateBookShot`, `BOOK_ANGLES`
- `ProductionEngine.tsx`: imports `generateProductionPhoto`, `generateStackedProductionPhoto`, `generateStackedIterative`, `analyzeProductionReference`, `analyzeJewelryProduct`, `generateBareMannequin`, `dressWithJewelry`, `segmentJewelry`, `addJewelryToExisting`, `freeformEditImage`
- `BatchEngine.tsx`: imports `generateProductionPhoto`
- `BannerEngine.tsx`: imports `generateBannerMannequin`, `addSingleJewelryToBanner`, `refuseBannerIdentity`, `freeformEditImage`, `analyzeJewelryProduct`
- `CatalogEngine.tsx`: imports `extractShopifyCatalog`
- `useAppStore.ts`: imports `setApiKey`

## Open Questions

1. **personGeneration parameter on gemini-3.1-flash-image-preview**
   - What we know: Imagen used `personGeneration: "allow_adult"` in the `:predict` body. Gemini models use `safetySettings` for content filtering.
   - What's unclear: Whether `gemini-3.1-flash-image-preview` needs an equivalent setting to allow human image generation, and where it goes in the request body.
   - Recommendation: Test empirically. If mannequin generation gets blocked, add appropriate `safetySettings` to the request.

2. **Exact aspect ratio support for gemini-3.1-flash-image-preview**
   - What we know: Image generation docs list 14 ratios. Model-specific page lists only 5. Requirements need 10 ratios.
   - What's unclear: Which ratios actually work at the API level for this specific preview model.
   - Recommendation: Implement all 14 from the general docs. Add runtime validation -- if API rejects, log and fall back to nearest supported ratio.

3. **512 resolution behavior**
   - What we know: Docs mention "0.5K" (512) is only available for 3.1 Flash, not other models.
   - What's unclear: Whether "512" or "0.5K" is the correct string value for imageSize.
   - Recommendation: Use "1K" as default minimum. Test "512" separately if needed.

## Sources

### Primary (HIGH confidence)
- [Gemini Image Generation Docs](https://ai.google.dev/gemini-api/docs/image-generation) - Multi-reference limits, generationConfig, aspect ratios, image sizes
- [Gemini 3.1 Flash Image Preview Model Page](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-image-preview) - Token limits, supported capabilities, resolution options
- [Gemini 3 Developer Guide](https://ai.google.dev/gemini-api/docs/gemini-3) - Thought signatures, multi-turn editing, REST API format
- [Thought Signatures Docs](https://ai.google.dev/gemini-api/docs/thought-signatures) - How to echo signatures back in multi-turn requests

### Secondary (MEDIUM confidence)
- [Apiyi Multi-Reference Guide](https://help.apiyi.com/en/gemini-14-reference-images-object-fidelity-character-consistency-guide-en.html) - Practical usage patterns for 14-ref system
- [Apiyi Thought Signature Error Guide](https://help.apiyi.com/en/nano-banana-2-thought-signature-error-400-fix-guide-en.html) - Common 400 error patterns and fixes

### Tertiary (LOW confidence)
- Aspect ratio support for preview model specifically (docs contradict between pages)
- personGeneration parameter behavior on new model (no documentation found)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new dependencies, straightforward API migration
- Architecture: HIGH - Clear patterns from official docs, well-understood REST API
- Pitfalls: HIGH - Documented gotchas (thought signatures, format mismatch, deprecated model)
- Reference budget: HIGH - Official docs confirm 4 char + 10 obj limits
- Multi-turn chat: MEDIUM - Official docs confirm approach but REST-specific examples (without SDK) are sparse
- Aspect ratios: LOW - Documentation contradicts itself between pages

**Research date:** 2026-03-24
**Valid until:** 2026-04-07 (preview model -- Google may change behavior)

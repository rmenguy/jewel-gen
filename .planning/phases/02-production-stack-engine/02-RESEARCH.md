# Phase 2: Production Stack Engine - Research

**Researched:** 2026-03-24
**Domain:** Progressive jewelry stacking workflow engine, Gemini multi-turn image editing, session state management
**Confidence:** HIGH

## Summary

Phase 2 builds the production stack engine -- the core workflow layer that takes a locked base image, an ordered plan of jewelry pieces with target zones, and executes progressive sequential edits one piece at a time with per-step validation, retry, and follow-up editing. This is purely a service + state layer (no UI changes -- those are Phase 3).

The existing codebase already has a working iterative stacking pipeline (`generateStackedIterative` -> `addJewelryToExisting` per piece) with dress -> segment -> composite -> harmonize -> pixel validation. Phase 2 formalizes this into a structured session with typed state, explicit layer ordering, target zone assignment, per-step snapshots, and follow-up editing via chat sessions. The Phase 1 unified service infrastructure (`editImageWithReferences`, `createImageChatSession`, `continueImageChatSession`, `enforceReferenceBudget`) provides the foundation.

**Primary recommendation:** Build a `ProductionStackSession` type and `executeStackPlan` orchestrator that wraps the existing `addJewelryToExisting` pipeline per step, records full generation snapshots, and uses `ImageChatSession` for follow-up edits after the stack is complete. Use independent edits (not chat sessions) for the progressive placement steps -- chat sessions introduce state drift risk across many steps. Reserve chat sessions exclusively for post-completion follow-up edits where the user needs conversational refinement.

## Project Constraints (from CLAUDE.md)

- All Gemini API calls are direct browser `fetch()` -- no backend proxy
- `@google/genai` SDK is NOT used -- raw REST via `fetch()`
- File uploads use `FileReader.readAsDataURL()` -- never `URL.createObjectURL()`
- State management via Zustand (3 stores: app, mannequin, production)
- IMAGE_MODEL = `gemini-3.1-flash-image-preview` for all image operations
- API key in memory only (Zustand), never persisted
- Sequential stacking (not parallel) for rate limiting
- Tech stack: React 19 + Vite + TailwindCSS + TypeScript

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| STACK-01 | User can select a locked base mannequin image to start a production stack session | Session state type with `baseImage` field; session creation function |
| STACK-02 | User can choose output format: aspect ratio and resolution | `ImageGenerationConfig` already supports `aspectRatio` and `imageSize`; session stores these |
| STACK-03 | User can assemble jewelry pieces into an ordered stack plan with named layers | `StackLayer` type with ordinal, name, product reference, target zone |
| STACK-04 | Each stack layer has a target zone | `TargetZone` enum with 9 body zones; layer type includes zone field |
| STACK-05 | System auto-assigns target zones based on jewelry category | Zone mapping function from category string to TargetZone |
| STACK-06 | System organizes references into explicit roles per step | `buildStepBundle` function creating ReferenceBundle with base/character/jewelry roles per step |
| STACK-07 | Engine performs progressive sequential edits -- one piece per step | `executeStackPlan` orchestrator calling `addJewelryToExisting` per layer in order |
| STACK-08 | Per-step validation checks local product fidelity | Existing `pixelCompare` pipeline (pHash + histogram) runs after each placement step |
| STACK-09 | User can retry a specific step without re-running entire stack | Step snapshots enable rollback to previous step's output then re-execute one step |
| STACK-10 | User can request targeted follow-up edits in plain language | `ImageChatSession` + `continueImageChatSession` for conversational post-completion edits |
| STACK-11 | Follow-up edits preserve all existing approved jewelry | Chat session history preserves context; prompt engineering enforces preservation |
| STACK-12 | Enforce physical plausibility constraints | Prompt engineering: scale, drape, no fusion rules embedded in step prompts |
| STACK-13 | Enforce placement locking -- approved jewelry stays stable | Independent edit approach + prompt "do NOT modify existing jewelry" per step |
| STATE-01 | ProductionStackSession state type | Full TypeScript interface with all required fields |
| STATE-02 | Stack session state persisted in Zustand store | New `useStackStore` or extension of `useProductionStore` |
| STATE-03 | History entries track each step's input/output for undo | `StepSnapshot` type with before/after images in session history array |
| STATE-04 | Full generation snapshot per step: prompt, refs, config, result | `GenerationSnapshot` type capturing all inputs and outputs per step |
</phase_requirements>

## Architecture Patterns

### Recommended Project Structure

```
services/
  geminiService.ts          # Existing -- add buildStepPrompt, buildStepBundle helpers
  stackEngine.ts            # NEW -- ProductionStackSession orchestration logic
  pixelCompare.ts           # Existing -- unchanged, used by per-step validation
stores/
  useProductionStore.ts     # EXTEND -- add stack session state
types.ts                    # EXTEND -- add all new types
```

### Pattern 1: Session-Oriented Orchestration

**What:** A `ProductionStackSession` object holds all state for a single stacking run. The `executeStackPlan` function takes this session and mutates it step-by-step, recording snapshots. The session is stored in Zustand and survives component re-renders.

**When to use:** Always -- this is the core pattern for the engine.

**Example:**
```typescript
// types.ts additions
export type TargetZone =
  | 'neck-base' | 'collarbone' | 'upper-chest' | 'mid-chest' | 'navel'
  | 'ear-lobe' | 'ear-upper' | 'wrist' | 'finger';

export interface StackLayer {
  id: string;
  ordinal: number;
  name: string;
  productImage: string;        // base64 data URI
  productCategory: string;
  targetZone: TargetZone;
  blueprint?: JewelryBlueprint;
  dimensions?: ProductDimensions;
}

export interface GenerationSnapshot {
  stepIndex: number;
  layerId: string;
  prompt: string;
  referencesUsed: ReferenceImage[];    // after budget enforcement
  referencesExcluded: ReferenceImage[];
  generationConfig: ImageGenerationConfig;
  inputImage: string;                  // base64 -- image BEFORE this step
  outputImage: string;                 // base64 -- image AFTER this step
  validation: PixelFidelityResult | null;
  timestamp: number;
  attemptNumber: number;
}

export type StepStatus = 'pending' | 'executing' | 'validating' | 'completed' | 'failed' | 'retrying';

export interface StepState {
  layerId: string;
  status: StepStatus;
  currentAttempt: number;
  maxAttempts: number;
  snapshots: GenerationSnapshot[];     // all attempts for this step
  approvedSnapshotIndex: number | null; // which snapshot the user approved
  error?: string;
}

export interface ProductionStackSession {
  id: string;
  baseImage: string;                   // locked base mannequin
  aspectRatio: string;                 // e.g., '3:4'
  imageSize: string;                   // e.g., '4K'
  layers: StackLayer[];                // ordered jewelry plan
  stepStates: StepState[];             // per-step execution state
  currentImage: string | null;         // latest approved image
  chatSession: ImageChatSession | null; // for follow-up edits after completion
  followUpHistory: GenerationSnapshot[]; // follow-up edit snapshots
  status: 'planning' | 'executing' | 'completed' | 'follow-up';
  createdAt: number;
}
```

### Pattern 2: Independent Edits for Progressive Steps (NOT Chat Sessions)

**What:** Each progressive placement step is an independent `addJewelryToExisting` call (or `editImageWithReferences` call), NOT a continuation of a chat session. The input is always the latest approved image + the new jewelry product reference.

**Why independent edits, not chat sessions for stacking:**
1. Chat session history grows linearly -- by step N, you're sending N previous turn pairs as context, each containing large base64 images. At 4K resolution, each image is ~5-15MB base64. A 5-piece stack would send ~50-150MB of history per request.
2. The Gemini API has no documented limit on `contents` array size, but massive payloads cause latency spikes and 500 errors from experience.
3. Independent edits give cleaner retry semantics -- retry step 3 without polluting the conversation history.
4. The existing `addJewelryToExisting` pipeline (dress -> segment -> composite -> harmonize -> validate) already works well as independent calls.

**When to use chat sessions:** ONLY for follow-up edits after the full stack is complete. At that point, create a chat session with the final image as context, and use `continueImageChatSession` for conversational refinements.

### Pattern 3: Target Zone to Prompt Mapping

**What:** A pure function that maps `TargetZone` + product metadata to placement prompt fragments. This replaces the scattered `categoryLower.includes()` logic currently duplicated across `dressWithJewelry`, `generateProductionPhoto`, and `generateStackedProductionPhoto`.

**Example:**
```typescript
const ZONE_PROMPTS: Record<TargetZone, string> = {
  'neck-base': 'Necklace sitting at the base of the neck, above the collarbone. Chain follows neck curve naturally.',
  'collarbone': 'Necklace worn close to the neck, on or just below the collarbone. Short to medium length.',
  'upper-chest': 'Short sautoir -- pendant reaches UPPER CHEST, between collarbone and breasts. Natural gravity drape.',
  'mid-chest': 'Sautoir -- pendant reaches BREAST LEVEL (mid-chest). Chain hangs from neck to mid-chest. NOT collarbone, NOT stomach.',
  'navel': 'Extra-long sautoir -- pendant reaches NAVEL. Chain falls past breasts and stomach to belly button height.',
  'ear-lobe': 'Earring attached to earlobe, clearly visible. Head angled to showcase.',
  'ear-upper': 'Earring on upper ear (helix/tragus). Distinct from any lobe jewelry.',
  'wrist': 'Bracelet worn on wrist, naturally positioned. Wrist and forearm visible.',
  'finger': 'Ring worn on finger, naturally positioned. Fingers relaxed and visible.',
};

const CATEGORY_TO_ZONE: Record<string, TargetZone> = {
  'sautoir-long': 'navel',
  'sautoir-court': 'mid-chest',
  'sautoir': 'mid-chest',
  'collier': 'collarbone',
  'necklace': 'collarbone',
  'boucles': 'ear-lobe',
  'earrings': 'ear-lobe',
  'bracelet': 'wrist',
  'bague': 'finger',
  'ring': 'finger',
};

export function autoAssignZone(category: string): TargetZone {
  const lower = category.toLowerCase();
  for (const [key, zone] of Object.entries(CATEGORY_TO_ZONE)) {
    if (lower.includes(key)) return zone;
  }
  return 'collarbone'; // safe default for unrecognized categories
}
```

### Pattern 4: Step Retry via Snapshot Rollback

**What:** To retry step N, roll back `currentImage` to step N-1's approved output (stored in the snapshot), then re-execute step N. No need to replay steps 1 through N-1.

**Example:**
```typescript
async function retryStep(session: ProductionStackSession, stepIndex: number): Promise<void> {
  const previousImage = stepIndex === 0
    ? session.baseImage
    : session.stepStates[stepIndex - 1].snapshots[
        session.stepStates[stepIndex - 1].approvedSnapshotIndex!
      ].outputImage;

  session.stepStates[stepIndex].status = 'retrying';
  session.stepStates[stepIndex].currentAttempt++;

  const snapshot = await executeStep(session, stepIndex, previousImage);
  session.stepStates[stepIndex].snapshots.push(snapshot);
  session.currentImage = snapshot.outputImage;
}
```

### Anti-Patterns to Avoid

- **Chat session for progressive stacking:** Accumulating multi-MB image history across 5+ turns causes payload bloat and API instability. Use independent edits.
- **Parallel step execution:** Rate limiting on preview models. Always sequential.
- **Storing snapshots as Zustand state directly:** Base64 images are huge. Store them in session but be aware of memory -- consider clearing old attempt snapshots after approval.
- **Re-running entire stack on single step failure:** Wasteful and slow. Use snapshot rollback.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Pixel fidelity validation | Custom image comparison | Existing `pixelCompare.ts` (pHash + histogram) | Already working, DCT-based, zero dependencies |
| Reference budget enforcement | Manual ref counting | `enforceReferenceBudget()` from Phase 1 | Handles priority sorting, budget limits, deterministic |
| API retry with backoff | Simple try/catch | Existing `withRetry()` in geminiService.ts | Handles 429, 500, 503 with exponential backoff + jitter |
| Image segmentation | Manual crop coordinates | Existing `segmentJewelry()` -> `cropFromSegmentation()` | AI-powered bounding box detection |
| Multi-turn editing | Manual history management | `createImageChatSession` + `continueImageChatSession` | Handles thought_signature preservation |

## Common Pitfalls

### Pitfall 1: Chat Session Payload Bloat
**What goes wrong:** Using multi-turn chat for the progressive stacking steps causes each subsequent API call to include all previous turns' images in the `contents` array. A 5-piece stack at 4K sends enormous payloads.
**Why it happens:** The chat session pattern appends every user+model turn pair to history, including raw image parts.
**How to avoid:** Use independent edits (single-turn `editImageWithReferences` or `addJewelryToExisting`) for progressive steps. Reserve chat sessions only for follow-up edits after completion.
**Warning signs:** 500 errors, timeouts, or multi-minute response times on step 3+.

### Pitfall 2: Thought Signature Loss in Follow-Up Chat
**What goes wrong:** Follow-up edits via chat session fail with cryptic errors because `thought_signature` fields from model responses were not echoed back.
**Why it happens:** The Phase 1 `continueImageChatSession` already handles this by storing `parsed.rawParts` in history. But if anyone builds a custom chat flow, they might strip these fields.
**How to avoid:** Always use `continueImageChatSession` for follow-up edits -- never manually build chat history.
**Warning signs:** API errors on the second+ turn of a chat session.

### Pitfall 3: Memory Pressure from Snapshot Accumulation
**What goes wrong:** Storing full base64 images for every attempt of every step fills browser memory. A 5-step stack with 3 attempts each at 4K could be 15 images x 10-15MB = 150-225MB.
**Why it happens:** Snapshots include `inputImage` and `outputImage` as full base64 strings.
**How to avoid:** Only keep the approved snapshot's images in full fidelity. For non-approved attempts, store a thumbnail or null the full image after the user approves a different attempt. Implement `compactSnapshots()` that runs after each step approval.
**Warning signs:** Browser tab slowdown, Zustand state serialization lag.

### Pitfall 4: Jewelry Drift Across Steps
**What goes wrong:** Jewelry placed in step 1 shifts position, changes color, or disappears by step 5.
**Why it happens:** Each step generates a new image -- the model may not perfectly preserve previous jewelry, especially with complex prompts.
**How to avoid:** The existing composite pipeline (segment -> paste real product pixels -> harmonize) helps. Additionally, the prompt must explicitly state "Do NOT modify existing jewelry on the model." The `STACK-13` placement locking requirement addresses this directly.
**Warning signs:** User reports jewelry from earlier steps looking different in later results.

### Pitfall 5: Stale Zustand References in Async Operations
**What goes wrong:** Long-running async stack execution reads stale state from Zustand closures.
**Why it happens:** Zustand `get()` captures state at subscription time, not at read time, when used inside React component closures.
**How to avoid:** Use `useProductionStore.getState()` directly in async service code (not the hook). Or pass the session object explicitly to the execution function.
**Warning signs:** State updates during execution don't reflect in subsequent steps.

## Code Examples

### Example 1: Stack Plan Execution Loop

```typescript
// services/stackEngine.ts
export async function executeStackPlan(
  session: ProductionStackSession,
  onStepUpdate: (stepIndex: number, state: StepState) => void,
): Promise<void> {
  session.status = 'executing';
  let currentImage = session.baseImage;

  for (let i = 0; i < session.layers.length; i++) {
    const layer = session.layers[i];
    const stepState = session.stepStates[i];
    stepState.status = 'executing';
    onStepUpdate(i, stepState);

    try {
      // Resolve product image to base64
      let productBase64 = layer.productImage;
      if (productBase64.startsWith('http')) {
        const raw = await fetchImageAsBase64(productBase64);
        productBase64 = `data:image/jpeg;base64,${raw}`;
      }

      // Execute placement using existing pipeline
      const outputImage = await addJewelryToExisting(
        currentImage,
        productBase64,
        layer.productCategory,
        layer.blueprint,
        layer.dimensions,
      );

      // Record snapshot
      const snapshot: GenerationSnapshot = {
        stepIndex: i,
        layerId: layer.id,
        prompt: `[addJewelryToExisting] category=${layer.productCategory} zone=${layer.targetZone}`,
        referencesUsed: [], // addJewelryToExisting handles refs internally
        referencesExcluded: [],
        generationConfig: { imageConfig: { imageSize: session.imageSize, aspectRatio: session.aspectRatio } },
        inputImage: currentImage,
        outputImage: outputImage,
        validation: null, // addJewelryToExisting already validates internally
        timestamp: Date.now(),
        attemptNumber: stepState.currentAttempt,
      };

      stepState.snapshots.push(snapshot);
      stepState.approvedSnapshotIndex = stepState.snapshots.length - 1;
      stepState.status = 'completed';
      currentImage = outputImage;
      session.currentImage = currentImage;
    } catch (error: any) {
      stepState.status = 'failed';
      stepState.error = error.message || String(error);
    }

    onStepUpdate(i, stepState);
  }

  session.status = session.stepStates.every(s => s.status === 'completed') ? 'completed' : 'executing';
}
```

### Example 2: Follow-Up Edit via Chat Session

```typescript
// After stack completion, create chat session for follow-up edits
export function initFollowUpSession(session: ProductionStackSession): void {
  if (!session.currentImage) throw new Error('No completed image for follow-up');

  session.chatSession = createImageChatSession({
    aspectRatio: session.aspectRatio,
    imageSize: session.imageSize,
  });

  session.status = 'follow-up';
}

export async function sendFollowUpEdit(
  session: ProductionStackSession,
  userPrompt: string,
): Promise<string> {
  if (!session.chatSession || !session.currentImage) {
    throw new Error('Follow-up session not initialized');
  }

  const imageData = extractBase64(session.currentImage);
  const isFirstTurn = session.chatSession.history.length === 0;

  const userParts: any[] = [
    { text: `You are editing a production jewelry photo. ALL existing jewelry on the model must be PRESERVED exactly as-is unless explicitly told otherwise.\n\nINSTRUCTION: ${userPrompt}` },
  ];

  // Include image on first turn only (subsequent turns inherit from history)
  if (isFirstTurn) {
    userParts.push({
      inlineData: { mimeType: 'image/png', data: imageData },
    });
  }

  const result = await continueImageChatSession(session.chatSession, userParts);

  if (result.images.length > 0) {
    const newImage = result.images[0].dataUri;
    session.currentImage = newImage;

    session.followUpHistory.push({
      stepIndex: -1,
      layerId: 'follow-up',
      prompt: userPrompt,
      referencesUsed: [],
      referencesExcluded: [],
      generationConfig: session.chatSession.generationConfig,
      inputImage: session.currentImage,
      outputImage: newImage,
      validation: null,
      timestamp: Date.now(),
      attemptNumber: session.followUpHistory.length + 1,
    });

    return newImage;
  }

  throw new Error('No image returned from follow-up edit');
}
```

### Example 3: Output Format Configuration

```typescript
// Supported aspect ratios for gemini-3.1-flash-image-preview
export const ASPECT_RATIOS = [
  { value: '1:1', label: 'Square 1:1' },
  { value: '2:3', label: 'Portrait 2:3' },
  { value: '3:2', label: 'Landscape 3:2' },
  { value: '3:4', label: 'Portrait 3:4' },
  { value: '4:3', label: 'Landscape 4:3' },
  { value: '4:5', label: 'Portrait 4:5' },
  { value: '5:4', label: 'Landscape 5:4' },
  { value: '9:16', label: 'Vertical 9:16' },
  { value: '16:9', label: 'Wide 16:9' },
  { value: '21:9', label: 'Ultra-Wide 21:9' },
] as const;

export const IMAGE_SIZES = [
  { value: '512', label: '512px (Draft)' },
  { value: '1K', label: '1K (Preview)' },
  { value: '2K', label: '2K (Production)' },
  { value: '4K', label: '4K (Final)' },
] as const;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `generateStackedProductionPhoto` single-pass all jewelry at once | `generateStackedIterative` one piece at a time with composite | Already in codebase | Progressive stacking is the proven pattern |
| Stateless stacking (ephemeral React state) | Session-based with typed state and snapshots | Phase 2 (this phase) | Enables retry, undo, follow-up, reproducibility |
| Scattered category-to-placement mapping | Centralized `TargetZone` enum + `ZONE_PROMPTS` | Phase 2 (this phase) | Single source of truth for placement logic |

## Key Technical Decisions

### Chat Session vs Independent Edits for Progressive Steps

**Decision: Use independent edits for progressive stacking, chat sessions only for follow-up.**

Evidence:
- The REST API multi-turn format sends ALL previous turns in `contents` array (confirmed in gemini-image-doc.md lines 680-700)
- Each turn includes full base64 image data in `inlineData`
- At 4K, a single PNG image is ~10-15MB base64
- 5-step stack = 10 turns = 100-150MB payload on step 5
- Independent edits: always 2 images max (current state + product reference) = ~20-30MB

**Confidence: HIGH** -- verified from API documentation and existing code behavior.

### Aspect Ratio and Resolution in Stack Session

The `gemini-3.1-flash-image-preview` model supports 14 aspect ratios and 4 resolutions (confirmed from gemini-image-doc.md lines 4811-4826):
- Aspect ratios: 1:1, 1:4, 1:8, 2:3, 3:2, 3:4, 4:1, 4:3, 4:5, 5:4, 8:1, 9:16, 16:9, 21:9
- Resolutions: 512, 1K, 2K, 4K
- Resolution is specified as string with uppercase K (not lowercase)

These values are passed via `generationConfig.imageConfig.aspectRatio` and `generationConfig.imageConfig.imageSize`.

**Confidence: HIGH** -- verified from official documentation.

### Thinking Level for Complex Compositions

The model supports `thinkingConfig.thinkingLevel` with values `minimal` (default) and `High`. For complex multi-jewelry compositions, setting `thinkingLevel: "High"` may improve placement quality at the cost of latency.

**Recommendation:** Default to `minimal` for speed. Consider adding a "High Quality" toggle that sets `thinkingLevel: "High"` for final production runs.

**Confidence: MEDIUM** -- feature documented, but quality impact on jewelry placement specifically is unverified.

## Open Questions

1. **Memory management for snapshots**
   - What we know: Each 4K image is ~10-15MB base64. A full session with retries could consume 100MB+ of browser memory.
   - What's unclear: At what point does browser performance degrade? Should we use IndexedDB for snapshot storage instead of Zustand?
   - Recommendation: Start with Zustand in-memory. Implement `compactSnapshots()` to null non-approved attempt images. If memory becomes an issue in Phase 3 integration, add IndexedDB offloading.

2. **Validation integration with existing pipeline**
   - What we know: `addJewelryToExisting` already runs pixel validation internally and does up to 3 correction attempts.
   - What's unclear: Should the stack engine's per-step validation be separate from or rely on the internal validation in `addJewelryToExisting`?
   - Recommendation: Rely on `addJewelryToExisting`'s internal validation. The stack engine's `validation` field in the snapshot records the result but doesn't add a second validation pass. This avoids doubling API calls.

3. **Follow-up edit scope**
   - What we know: `STACK-10` says plain-language edits. `STACK-11` says preserve existing jewelry.
   - What's unclear: Should follow-up edits be possible mid-stack (after step 2 of 5) or only after full completion?
   - Recommendation: Phase 2 supports follow-up only after stack completion. Mid-stack editing is effectively "retry step N with different instructions" which is already covered by STACK-09 retry.

## Sources

### Primary (HIGH confidence)
- `gemini-image-doc.md` (local) -- Multi-turn editing REST format (lines 379-700), aspect ratios (lines 4658-4856), reference limits (lines 723-731), thinking mode (lines 1501-1695), thought signatures (lines 1682-1695), best practices (lines 4565-4577), limitations (lines 4578-4586)
- `services/geminiService.ts` (local) -- Existing unified service infrastructure (lines 87-309), `addJewelryToExisting` pipeline (lines 1025-1129), `generateStackedIterative` (lines 1136-1167), `dressWithJewelry` (lines 1547-1625)
- `types.ts` (local) -- Phase 1 reference architecture types (lines 206-253)
- `services/pixelCompare.ts` (local) -- pHash + histogram comparison pipeline

### Secondary (MEDIUM confidence)
- `stores/useProductionStore.ts` (local) -- Current store structure for production state
- `.planning/REQUIREMENTS.md` (local) -- Full requirement specifications for STACK-* and STATE-*

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all tools already exist in codebase (Phase 1 service layer + existing pipeline)
- Architecture: HIGH -- patterns derived from working code and documented API behavior
- Pitfalls: HIGH -- derived from API documentation constraints and direct codebase analysis

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (stable -- building on verified Phase 1 infrastructure)

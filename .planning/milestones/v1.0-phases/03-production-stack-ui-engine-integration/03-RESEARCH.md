# Phase 3: Production Stack UI & Engine Integration - Research

**Researched:** 2026-03-24
**Domain:** React UI architecture, component decomposition, drag-and-drop, Zustand state wiring, engine integration
**Confidence:** HIGH

## Summary

Phase 3 wires the Phase 2 stack engine (`stackEngine.ts`) into a purpose-built Production Stack UI, refactors the Mannequin engine to feed base images into it, aligns the Batch engine to use the stack pipeline, and adds operator efficiency features (session duplication, presets, visual history comparison). The approved UI-SPEC.md provides a detailed design contract covering layout, colors, typography, interaction states, copy, and all 13 new components.

The primary technical challenge is decomposing `ProductionEngine.tsx` (1,227 lines) into the new component tree. This is a **full rewrite** -- the existing component handles the old production workflow (single-item queue processing, stacking mode toggle, manual variant management) which is incompatible with the new session-based stack plan paradigm. The new `ProductionStack.tsx` will be a fresh component using the existing `useProductionStore` stack session state.

**Primary recommendation:** Build the new `ProductionStack.tsx` and its `components/stack/` children as entirely new files. Wire `stackEngine.ts` into the UI through a thin React hook layer. Keep the old `ProductionEngine.tsx` intact until the new component is fully functional, then swap the routing in `App.tsx`. For Mannequin, change the transfer target from PRODUCTION to STACK (one-line change). For Batch, replace `generateProductionPhoto` calls with `executeStackPlan`.

## Project Constraints (from CLAUDE.md)

### Critical Architecture Rules
- **All API calls via browser `fetch()`** -- no backend proxy, CORS supported by Google API
- **File uploads use `FileReader.readAsDataURL()`** -- never `URL.createObjectURL()` for API-bound files
- **Downloads via `downloadService.ts`** -- browser blob downloads
- **Zustand for state** -- 3 active stores (app, mannequin, production)
- **Flexbox Viewport Rule** -- `min-h-0` on `flex-1` elements, `flex-shrink-0` on footer bars
- **No hardcoded API key** -- user enters at launch, stored in Zustand memory only
- **Single image model** -- `gemini-3.1-flash-image-preview` via `IMAGE_MODEL` constant
- **Light theme with indigo/purple accents**

### Tech Stack (Locked)
- React 19 + Vite + TailwindCSS + TypeScript
- Zustand (state), Supabase (storage), Gemini API (AI)
- No shadcn, no external component library, no icon library dependency
- Inline SVG for icons (heroicons-style paths)

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| UI-01 | Base photo panel shows locked base image prominently | New `BasePhotoPanel` component; 2px indigo-600 border when locked; min-height 320px |
| UI-02 | Output format selector with business-friendly labels | New `OutputFormatSelector`; uses existing `ASPECT_RATIOS`/`IMAGE_SIZES` from geminiService + labels from UI-SPEC |
| UI-03 | Stack plan with drag-reorder | New `StackPlanPanel` + `StackLayerRow`; HTML5 native drag-and-drop; calls `reorderStackLayers` from store |
| UI-04 | Reference bundle grouped by role | New `ReferenceBundlePanel`; reads from `session.referenceBundle` populated by engine |
| UI-05 | Generation progress per-step status | New `GenerationProgressBar`; driven by `onStepUpdate` callback from `executeStackPlan` |
| UI-06 | Follow-up edit panel | New `FollowUpInput`; calls `initFollowUpSession` + `sendFollowUpEdit` from stackEngine |
| UI-07 | Production Stack is default tab | Change `activeEngine` default from `'CATALOG'` to `'PRODUCTION'`; reorder tab array; rename label to `STACK` |
| UI-08 | Debug view showing refs and config | New `DebugInspector`; reads from `GenerationSnapshot.referencesUsed/Excluded/generationConfig` |
| OPS-01 | One-click session duplication | New action in store: `duplicateStackSession()`; clones session with new ID, resets stepStates |
| OPS-02 | Save/load stack presets | `localStorage` pattern (same as existing `customPresets`); new `stackPresets` field in store |
| OPS-03 | Visual history comparison | New `StepHistoryStrip`; reads `stepStates[].snapshots[approvedIndex].outputImage` as 64x64 thumbnails |
| MANN-01 | Mannequin generation uses unified model | Already satisfied -- `generateMannequin` calls `callUnifiedAPI(IMAGE_MODEL, ...)` since Phase 1 |
| MANN-02 | Mannequin refinement uses unified model | Already satisfied -- `applyBatchRefinements` calls `callUnifiedAPI(IMAGE_MODEL, ...)` since Phase 1 |
| MANN-03 | Mannequin positioned as base image studio | UI copy/framing change; "Send to Stack" button replaces "Send to Production" |
| MANN-04 | Mannequin flows directly into Production Stack | Change transfer handler: call `createStackSession(currentImage, '1:1', '1K')` then `setActiveEngine('PRODUCTION')` |
| BATCH-01 | Batch uses production stack pipeline | Replace `generateProductionPhoto` with stack session creation + `executeStackPlan` per batch item |
| BATCH-02 | Batch uses unified service and reference architecture | Follows from BATCH-01; `executeStackPlan` internally uses the unified service |
</phase_requirements>

## Architecture Patterns

### Recommended Project Structure for New Components

```
components/
  ProductionStack.tsx          # Top-level 3-panel layout (replaces ProductionEngine for stack)
  stack/
    BasePhotoPanel.tsx         # Left: base image display + lock + upload
    OutputFormatSelector.tsx   # Left: aspect ratio pills + resolution dropdown
    ReferenceBundlePanel.tsx   # Left: grouped reference display
    StackPlanPanel.tsx         # Right: drag-reorder layer list
    StackLayerRow.tsx          # Single layer row with drag handle + status
    AddLayerForm.tsx           # Inline form: upload product + set category/zone
    GenerationProgressBar.tsx  # Center: step status segments overlay
    FollowUpInput.tsx          # Center: text input + send
    StepHistoryStrip.tsx       # Center: thumbnail strip
    DebugInspector.tsx         # Right: collapsible ref debug view
    SessionToolbar.tsx         # Header: name, duplicate, save preset, load preset
    PresetModal.tsx            # Modal for naming/loading presets
  ui/
    SectionLabel.tsx           # Extract from MannequinEngine (shared pattern)
```

### Pattern 1: Stack Engine <-> UI Bridge via Callback + Store Sync

The `stackEngine.ts` operates on plain objects, not Zustand state. The UI must bridge this gap.

**How it works:**
1. UI reads `stackSession` from `useProductionStore` to render
2. When executing, UI creates a mutable copy of the session and passes it to `executeStackPlan`
3. The `onStepUpdate` callback syncs progress back to the store after each step
4. On completion, the full session result is written back to the store

```typescript
// In ProductionStack.tsx
const handleExecute = async () => {
  const session = useProductionStore.getState().stackSession;
  if (!session) return;

  // Work on a mutable copy (engine mutates the session object)
  const mutableSession = structuredClone(session);
  // chatSession is not cloneable -- null it and re-init if needed
  mutableSession.chatSession = null;

  await executeStackPlan(mutableSession, (stepIndex, stepState) => {
    // Sync step progress back to store for UI reactivity
    useProductionStore.getState().updateStepState(stepIndex, stepState);
    useProductionStore.getState().updateStackSession({
      currentImage: mutableSession.currentImage,
      status: mutableSession.status,
    });
  });

  // Write final state
  useProductionStore.getState().updateStackSession({
    ...mutableSession,
    chatSession: null, // Not serializable to store
  });
};
```

**Why this pattern:** The engine is a pure service module (no React, no Zustand). Cloning avoids direct mutation of Zustand state (which would not trigger re-renders). The callback provides real-time progress.

**Key caveat:** `structuredClone` cannot clone functions or non-serializable objects. The `chatSession` field contains a history array which IS cloneable, but the pattern of mutating the clone means the chatSession used by `sendFollowUpEdit` must be the live one from the engine result, not the store.

### Pattern 2: HTML5 Native Drag-and-Drop for Stack Layers

Per UI-SPEC: no external library. Use native HTML5 DnD API.

```typescript
// StackLayerRow.tsx
const StackLayerRow: React.FC<{
  layer: StackLayer;
  stepState?: StepState;
  onReorder: (dragId: string, dropId: string) => void;
  onRemove: (id: string) => void;
}> = ({ layer, stepState, onReorder, onRemove }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isDropTarget, setIsDropTarget] = useState(false);

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', layer.id);
        setIsDragging(true);
      }}
      onDragEnd={() => setIsDragging(false)}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDropTarget(true);
      }}
      onDragLeave={() => setIsDropTarget(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDropTarget(false);
        const dragId = e.dataTransfer.getData('text/plain');
        if (dragId !== layer.id) {
          onReorder(dragId, layer.id);
        }
      }}
      className={/* state-dependent classes per UI-SPEC interaction states */}
    >
      {/* drag handle | thumbnail | name | zone badge | remove */}
    </div>
  );
};
```

**The reorder logic** in the parent (`StackPlanPanel`) takes `dragId` and `dropId`, computes the new order, and calls `reorderStackLayers(newOrderedIds)` from the store.

### Pattern 3: Session Duplication (OPS-01)

```typescript
// In useProductionStore
duplicateStackSession: () => {
  const current = get().stackSession;
  if (!current) return;
  const clone: ProductionStackSession = {
    ...current,
    id: crypto.randomUUID(),
    stepStates: current.layers.map((layer) => ({
      layerId: layer.id,
      status: 'pending' as const,
      currentAttempt: 0,
      maxAttempts: 3,
      snapshots: [],
      approvedSnapshotIndex: null,
    })),
    currentImage: null,
    chatSession: null,
    followUpHistory: [],
    status: 'planning',
    createdAt: Date.now(),
    referenceBundle: null,
    effectiveReferenceBundle: null,
    excludedReferences: [],
    validationResults: [],
  };
  set({ stackSession: clone });
},
```

### Pattern 4: Stack Presets via localStorage (OPS-02)

Follow the existing `customPresets` pattern already in `useProductionStore`:

```typescript
// New type
interface StackPreset {
  id: string;
  name: string;
  layers: Omit<StackLayer, 'id'>[]; // Template layers (IDs regenerated on load)
  aspectRatio: string;
  imageSize: string;
  createdAt: number;
}

// In store
stackPresets: JSON.parse(localStorage.getItem('stack-presets') || '[]') as StackPreset[],
saveStackPreset: (name: string) => { /* serialize current session config */ },
loadStackPreset: (presetId: string) => { /* apply to current session */ },
deleteStackPreset: (presetId: string) => { /* remove from localStorage */ },
```

**Important:** Presets store layer templates (category, zone, name) but NOT product images (too large for localStorage). When loading a preset, the user must re-upload product images.

### Anti-Patterns to Avoid

- **Mutating Zustand state directly from stackEngine:** The engine mutates the session object it receives. Never pass the Zustand state reference directly -- always clone first.
- **Parallel API calls in batch:** The engine enforces sequential execution. Batch must respect this rate limiting constraint.
- **Storing base64 images in localStorage:** Each image is 100KB-2MB. Presets must store configuration only, not image data.
- **Over-rendering during execution:** The `onStepUpdate` callback fires for each step. Use `React.memo` on layer rows and progress segments to prevent full re-renders.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Drag-and-drop | Complex gesture library | HTML5 native DnD API | UI-SPEC explicitly mandates native DnD; no library dependency |
| State management | Custom pub/sub | Zustand (already in use) | Consistent with codebase; 3 stores pattern established |
| Image downloads | Custom fetch+blob | `downloadService.ts` (existing) | Already handles base64-to-blob conversion |
| API retry logic | Custom exponential backoff | `withRetry` in geminiService (existing) | Already handles 429, 500, 503 with jitter |
| Reference budget | Manual counting | `enforceReferenceBudget()` (existing) | Handles priority-based downselection per REF-03/04 |
| UUID generation | Custom IDs | `crypto.randomUUID()` | Already used throughout codebase |

**Key insight:** The entire stack execution pipeline already exists in `stackEngine.ts`. Phase 3 is primarily a UI construction phase -- the service layer is complete.

## Common Pitfalls

### Pitfall 1: ProductionEngine.tsx Rewrite Scope Creep
**What goes wrong:** Attempting to incrementally refactor the 1,227-line `ProductionEngine.tsx` leads to tangled state between old queue-based workflow and new session-based workflow.
**Why it happens:** The old component's state management (28+ useState hooks, stacking mode toggles, variant grids) is fundamentally incompatible with the new stack session paradigm.
**How to avoid:** Build `ProductionStack.tsx` as a brand-new component. Route to it from `App.tsx`. Keep `ProductionEngine.tsx` intact as fallback until the new component is verified working.
**Warning signs:** Trying to reuse ProductionEngine's state variables or its JSX structure.

### Pitfall 2: Zustand State Sync During Async Engine Execution
**What goes wrong:** Engine execution takes 10-60 seconds (one API call per step). If the user modifies the session (add/remove layers) during execution, the store and engine state diverge.
**Why it happens:** The engine operates on a snapshot of the session, not a live reference.
**How to avoid:** Disable all session mutation controls (add layer, remove layer, reorder, clear) while `session.status === 'executing'`. Show a clear "Executing..." state with a progress indicator.
**Warning signs:** UI allows clicking "Add Layer" or "Remove Layer" while generation is in progress.

### Pitfall 3: Base64 Image Memory Pressure
**What goes wrong:** Each step stores full base64 images in `inputImage` and `outputImage` (500KB-2MB each). A 5-layer stack with 3 attempts each = 30 images = 15-60MB in memory.
**Why it happens:** `GenerationSnapshot` records full image data for undo/debugging.
**How to avoid:** Call `compactSnapshots(session)` after execution completes to clear non-approved attempt images. Document this in the execution handler.
**Warning signs:** Browser tab memory climbing above 500MB during multi-layer stacks.

### Pitfall 4: Navigation State Change on Tab Switch
**What goes wrong:** The app uses `hidden` class to persist all engine tabs simultaneously. Switching tabs doesn't unmount components. If `ProductionStack.tsx` has an active execution, switching to Mannequin and back must preserve the execution state.
**Why it happens:** All engines are always mounted (line 132-155 in App.tsx).
**How to avoid:** Store all execution state in Zustand (not in component-local useState). The stack session in the store persists across tab switches since the component is never unmounted, just hidden.
**Warning signs:** Execution progress disappearing after tab switch.

### Pitfall 5: EngineType Enum Change
**What goes wrong:** Renaming PRODUCTION to STACK in the nav affects the `EngineType` union, `activeEngine` default, and all `setActiveEngine('PRODUCTION')` calls throughout the codebase.
**Why it happens:** The string literal 'PRODUCTION' is used in App.tsx routing, MannequinEngine transfer, CatalogEngine transfer.
**How to avoid:** Keep the internal `EngineType` value as `'PRODUCTION'` and only change the display label in the nav to "STACK". This avoids a multi-file refactor that touches Catalog and Mannequin engines. The nav button just shows "STACK" text while the internal routing key stays `'PRODUCTION'`.
**Warning signs:** TypeScript errors in CatalogEngine.tsx or MannequinEngine.tsx after renaming.

### Pitfall 6: chatSession Not Serializable
**What goes wrong:** `ProductionStackSession.chatSession` contains a `history` array with raw API parts (potentially including binary data). `structuredClone` works on the history array but the session must be treated carefully.
**Why it happens:** The chat session is created by `createImageChatSession` and accumulates turns.
**How to avoid:** When duplicating sessions or saving presets, always set `chatSession: null`. It gets re-created when follow-up editing begins via `initFollowUpSession`.

## Code Examples

### Engine Execution Wiring (Core UI-Engine Bridge)

```typescript
// ProductionStack.tsx — Execute button handler
import { executeStackPlan, initializeStepStates, compactSnapshots } from '../services/stackEngine';

const handleExecuteStack = async () => {
  const store = useProductionStore.getState();
  const session = store.stackSession;
  if (!session || session.layers.length === 0) return;

  // Initialize step states from layers
  const mutableSession = {
    ...session,
    chatSession: null, // Not needed during execution
    stepStates: [], // Will be populated by initializeStepStates
  };
  initializeStepStates(mutableSession);

  // Update store to show executing
  store.updateStackSession({ status: 'executing', stepStates: mutableSession.stepStates });

  try {
    await executeStackPlan(mutableSession, (stepIndex, stepState) => {
      // Real-time progress sync
      useProductionStore.getState().updateStepState(stepIndex, {
        status: stepState.status,
        currentAttempt: stepState.currentAttempt,
        snapshots: stepState.snapshots,
        approvedSnapshotIndex: stepState.approvedSnapshotIndex,
        error: stepState.error,
      });
      useProductionStore.getState().updateStackSession({
        currentImage: mutableSession.currentImage,
      });
    });

    // Compact memory after completion
    compactSnapshots(mutableSession);

    // Final store update
    store.updateStackSession({
      status: mutableSession.status,
      currentImage: mutableSession.currentImage,
      stepStates: mutableSession.stepStates,
      referenceBundle: mutableSession.referenceBundle,
      excludedReferences: mutableSession.excludedReferences,
    });
  } catch (error: any) {
    store.updateStackSession({ status: 'planning' }); // Reset to allow retry
  }
};
```

### Follow-Up Edit Wiring

```typescript
import { initFollowUpSession, sendFollowUpEdit } from '../services/stackEngine';

const handleFollowUp = async (prompt: string) => {
  const store = useProductionStore.getState();
  const session = store.stackSession;
  if (!session || !session.currentImage) return;

  // Create mutable session for follow-up
  const mutableSession = { ...session };

  // Initialize chat session if not already done
  if (!mutableSession.chatSession) {
    initFollowUpSession(mutableSession);
    store.updateStackSession({ status: 'follow-up', chatSession: mutableSession.chatSession });
  }

  const newImage = await sendFollowUpEdit(mutableSession, prompt);
  store.updateStackSession({
    currentImage: newImage,
    followUpHistory: mutableSession.followUpHistory,
  });
};
```

### Tab Routing Change (UI-07)

```typescript
// App.tsx — Change default engine and tab order
// In useAppStore.ts:
activeEngine: 'PRODUCTION',  // Changed from 'CATALOG'

// In App.tsx nav — reorder tabs and rename label:
const TAB_CONFIG: { key: EngineType; label: string }[] = [
  { key: 'PRODUCTION', label: 'STACK' },
  { key: 'MANNEQUIN', label: 'MANNEQUIN' },
  { key: 'CATALOG', label: 'CATALOG' },
  { key: 'BATCH', label: 'BATCH' },
];
```

### Mannequin Transfer Change (MANN-04)

```typescript
// MannequinEngine.tsx — Change transfer handler
const handleTransfer = useCallback(() => {
  if (!currentImage) return;
  // Create a new stack session with this image as base
  const { createStackSession } = useProductionStore.getState();
  createStackSession(currentImage, '1:1', '1K');
  setActiveEngine('PRODUCTION');
}, [currentImage, setActiveEngine]);
```

### Batch Engine Alignment (BATCH-01)

```typescript
// BatchEngine.tsx — Replace processItem to use stack pipeline
const processItem = async (item: BatchItem): Promise<void> => {
  if (!mannequinImage) return;

  const session = useProductionStore.getState().createStackSession(
    mannequinImage,
    '1:1', // Default format for batch
    '1K',
  );

  // Add single layer for the product
  const layer: StackLayer = {
    id: crypto.randomUUID(),
    ordinal: 0,
    name: item.sku,
    productImage: item.productImageUrl || '',
    productCategory: item.category,
    targetZone: autoAssignZone(item.category),
  };
  session.layers = [layer];

  await executeStackPlan(session, () => {});

  if (session.currentImage) {
    // Update batch item with result
    setBatchItems(prev =>
      prev.map(i => i.id === item.id
        ? { ...i, status: 'COMPLETED', resultImage: session.currentImage!, progress: 100 }
        : i
      )
    );
  }
};
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Queue-based single item processing (ProductionEngine) | Session-based stack plan execution (stackEngine) | Phase 2 | UI must render sessions, not queues |
| Multiple API models (imagen, gemini-3-pro) | Single model via IMAGE_MODEL constant | Phase 1 | MANN-01/02 already satisfied |
| Stacking via toggle mode + selection set | Ordered stack layers with drag-reorder | Phase 2 types | Complete UI paradigm shift |
| `generateProductionPhoto` per item | `executeStackPlan` with progressive steps | Phase 2 engine | Batch must adopt new pipeline |

**Already completed (no Phase 3 work needed):**
- MANN-01 and MANN-02: All mannequin functions already use `IMAGE_MODEL` (`gemini-3.1-flash-image-preview`) since Phase 1 cleanup. No model migration work remains.

## Open Questions

1. **ProductionEngine.tsx preservation vs. deletion**
   - What we know: The old component has a completely different paradigm (queue, stacking mode, variant grid). The new ProductionStack replaces it entirely.
   - What's unclear: Should the old component be deleted or kept for backwards compatibility during Phase 3?
   - Recommendation: Keep it in the codebase but remove its routing from App.tsx. The new ProductionStack takes the PRODUCTION slot. Delete the old file in a cleanup task at the end.

2. **Batch engine: parallel vs. sequential per-item execution**
   - What we know: Current batch uses `Promise.all` for parallel processing. Stack engine enforces sequential per-step execution within a session. Between batch items could still be parallel.
   - What's unclear: Should batch items run one-at-a-time or in parallel (each item creating its own sequential stack)?
   - Recommendation: Sequential (one item at a time) for safety. Preview model rate limits are restrictive. Parallel batch items each making sequential API calls could hit rate limits fast.

3. **Stack preset image data**
   - What we know: localStorage has a ~5-10MB limit. Base64 product images are 100KB-2MB each.
   - What's unclear: Can presets store product image references (Supabase URLs) instead of base64?
   - Recommendation: Store only configuration (layer names, categories, zones, format). User must re-attach product images when loading a preset. Show "N layers -- re-upload product images" on preset load.

4. **Validation result surfacing gap (from Phase 2 verification)**
   - What we know: `snapshot.validation` is always null because `addJewelryToExisting` returns `Promise<string>`, not a tuple.
   - What's unclear: Should Phase 3 fix this in the engine or accept the limitation?
   - Recommendation: Accept for now. The debug view (UI-08) can show "validation: internal (auto-corrected)" as informational text. A separate enhancement could surface validation scores later.

## Sources

### Primary (HIGH confidence)
- `stackEngine.ts` (380 lines) -- complete engine API surface, read in full
- `useProductionStore.ts` (192 lines) -- all store actions, read in full
- `types.ts` (316 lines) -- all type definitions, read in full
- `App.tsx` (170 lines) -- routing and tab navigation, read in full
- `03-UI-SPEC.md` -- complete design contract with layout, components, interaction states
- `02-VERIFICATION.md` -- Phase 2 verification confirming all engine functions operational
- `geminiService.ts` -- unified API surface, model constant, zone logic, format constants
- `ProductionEngine.tsx` (1,227 lines) -- current implementation structure
- `MannequinEngine.tsx` (1,195 lines) -- current transfer mechanism
- `BatchEngine.tsx` (355 lines) -- current batch processing approach
- `Button.tsx`, `PillButton.tsx`, `DropZone.tsx` -- existing UI component patterns

### Secondary (MEDIUM confidence)
- HTML5 Drag and Drop API -- well-known browser standard, no version concerns
- `localStorage` -- browser standard, ~5-10MB limit (varies by browser)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all existing libraries
- Architecture: HIGH -- detailed UI-SPEC exists, engine API fully documented
- Pitfalls: HIGH -- derived from direct code analysis of existing patterns and known engine behavior
- Engine wiring: HIGH -- stackEngine.ts API surface is clean and all functions are exported and verified

**Research date:** 2026-03-24
**Valid until:** Indefinite (code-only analysis, no external API versioning concerns)

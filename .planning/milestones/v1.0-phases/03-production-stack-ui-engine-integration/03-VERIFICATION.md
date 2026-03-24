---
phase: 03-production-stack-ui-engine-integration
verified: 2026-03-24T21:00:00Z
status: gaps_found
score: 17/18 must-haves verified
re_verification: null
gaps:
  - truth: "User can retry a specific step without re-running the entire stack"
    status: failed
    reason: "retryStep is imported in ProductionStack.tsx but never called — no UI button, no handler, no user-facing retry affordance exists"
    artifacts:
      - path: "components/ProductionStack.tsx"
        issue: "retryStep imported at line 8 but zero call sites anywhere in the file — dead import"
      - path: "components/stack/StackLayerRow.tsx"
        issue: "No retry button or onRetry prop in the layer row component"
    missing:
      - "Per-step retry button in StackLayerRow (visible when step status === 'failed')"
      - "handleRetryStep handler in ProductionStack.tsx that calls retryStep(mutableSession, stepIndex, ...)"
      - "onRetry prop wired through StackPlanPanel -> StackLayerRow"
human_verification:
  - test: "Verify Production Stack tab is visually prominent and loads as the landing screen"
    expected: "App opens directly on the STACK tab with 3-column layout visible (left=BasePhotoPanel+OutputFormat, center=generation area, right=StackPlanPanel)"
    why_human: "Default tab wiring is verified in code but visual render and layout quality require browser inspection"
  - test: "Execute a full stack with 2 jewelry layers on a real mannequin image"
    expected: "Progressive placement runs, GenerationProgressBar updates per step, step thumbnails appear in StepHistoryStrip"
    why_human: "End-to-end AI generation pipeline requires a live API key and real image inputs"
  - test: "Send mannequin to Stack from MannequinEngine and verify transfer"
    expected: "Clicking 'Send to Stack' creates a locked session in ProductionStack with the mannequin as base image"
    why_human: "Cross-component navigation requires browser interaction to verify state transfer"
---

# Phase 3: Production Stack UI & Engine Integration Verification Report

**Phase Goal:** The Production Stack is the primary app experience with a purpose-built interface, Mannequin engine feeds base images into it, Batch engine uses its pipeline, and operators can duplicate/save/compare sessions
**Verified:** 2026-03-24T21:00:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | Production Stack tab is the default experience with panels for base photo, output format, stack plan (drag-reorder), reference bundle, generation progress, and follow-up edits | VERIFIED | `useAppStore.ts:16` sets `activeEngine: 'PRODUCTION'`; App.tsx maps PRODUCTION to `<ProductionStack />`; all 7 panel components exist and are wired |
| 2  | Mannequin engine uses unified image service and output flows into Production Stack as locked base image | VERIFIED | `generateMannequin` calls `callUnifiedAPI(IMAGE_MODEL, ...)` at line 578; `applyBatchRefinements` calls `callUnifiedAPI(IMAGE_MODEL, ...)` at line 2118; `handleTransferToStack` calls `createStackSession` + `setActiveEngine('PRODUCTION')` |
| 3  | Batch engine executes the production stack pipeline using same unified service | VERIFIED | BatchEngine imports `executeStackPlan, initializeStepStates` from `services/stackEngine`, creates temporary `ProductionStackSession`, calls `executeStackPlan(session, () => {})` sequentially |
| 4  | User can duplicate a stack session, save/load named stack presets, and compare previous steps | VERIFIED | `duplicateStackSession`, `saveStackPreset`, `loadStackPreset`, `deleteStackPreset` all implemented in store; `SessionToolbar` + `PresetModal` components wired in `ProductionStack.tsx`; `StepHistoryStrip` enables click-to-compare |
| 5  | Internal debug view shows references included vs excluded, final ordered reference list, and generationConfig for any generation step | VERIFIED | `DebugInspector.tsx` renders references included (thumbnail grid), references excluded (role/kind/priority list), and generationConfig as formatted JSON; collapsed by default; only renders after a completed step |

**Score:** 5/5 truths verified (with one sub-requirement gap — see STACK-09 below)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `components/ProductionStack.tsx` | Top-level 3-panel layout shell | VERIFIED | 440 lines; imports 10 child components; wired to store and engine functions |
| `components/stack/BasePhotoPanel.tsx` | Base image upload/lock/locked states | VERIFIED | 3 states: empty (DropZone), preview (Lock button), locked (indigo border + lock icon) |
| `components/stack/OutputFormatSelector.tsx` | Aspect ratio pills + resolution dropdown | VERIFIED | 10 aspect ratio PillButtons with business-friendly labels (Square, Portrait 3:4, Story / Vertical, etc.); 4 resolution options |
| `components/stack/StackPlanPanel.tsx` | Drag-reorder layer management | VERIFIED | HTML5 drag-and-drop; empty state copy; layer count badge; AddLayerForm integrated |
| `components/stack/ReferenceBundlePanel.tsx` | References grouped by role with collapsible sections | VERIFIED | 4 collapsible sections (Character, Object, Composition, Style); count badges; 40x40 thumbnails |
| `components/stack/DebugInspector.tsx` | Debug view for references and generationConfig | VERIFIED | References included thumbnail grid; excluded list with role/kind/priority; generationConfig JSON |
| `components/stack/SessionToolbar.tsx` | Session ID, duplicate, presets, clear | VERIFIED | Session ID (8 chars), Duplicate button with `aria-label="Duplicate session"`, Save Preset, Load Preset, Clear with confirm |
| `components/stack/PresetModal.tsx` | Save/load preset modal | VERIFIED | Save mode (name input); Load mode (list with name, layer count, date, load/delete); empty state text |
| `components/stack/GenerationProgressBar.tsx` | Per-step color-coded progress | VERIFIED | 6 color-coded status segments (pending/executing/validating/completed/failed/retrying); dynamic status text |
| `components/stack/FollowUpInput.tsx` | Follow-up edit panel | VERIFIED | Text input, Enter key submit, Apply Edit button, loading spinner |
| `components/stack/StepHistoryStrip.tsx` | Step history thumbnails for comparison | VERIFIED | 64x64 thumbnails; selection ring; click-to-toggle view; React.memo optimization |
| `components/stack/StackLayerRow.tsx` | Draggable layer row with 7 visual states | VERIFIED | HTML5 drag events; 7 states via class combinators; thumbnail; zone badge; remove button |
| `components/stack/AddLayerForm.tsx` | Add layer with auto-zone assignment | VERIFIED | DropZone upload; category select; autoAssignZone; target zone override pills |
| `components/MannequinEngine.tsx` | Send to Stack button and transfer handler | VERIFIED | `handleTransferToStack` at line 416; calls `createStackSession` + `setActiveEngine('PRODUCTION')`; button rendered at line 1181 |
| `components/BatchEngine.tsx` | Stack pipeline alignment | VERIFIED | Imports `executeStackPlan, initializeStepStates`; creates `ProductionStackSession` per item; sequential for-of loop |
| `stores/useProductionStore.ts` | All stack session actions + OPS actions | VERIFIED | `createStackSession`, `updateStackSession`, `addLayerToStack`, `removeLayerFromStack`, `reorderStackLayers`, `updateStepState`, `resetStackSession`, `duplicateStackSession`, `saveStackPreset`, `loadStackPreset`, `deleteStackPreset` all implemented |
| `services/stackEngine.ts` | Production stack execution engine | VERIFIED | `executeStackPlan`, `initializeStepStates`, `retryStep`, `initFollowUpSession`, `sendFollowUpEdit`, `compactSnapshots` all exported and substantive |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `App.tsx` | `ProductionStack` | `activeEngine === 'PRODUCTION'` | WIRED | Line 141-143: renders `<ProductionStack />` when PRODUCTION active |
| `useAppStore.ts` | default PRODUCTION tab | `activeEngine: 'PRODUCTION'` | WIRED | Line 16: initial state is PRODUCTION |
| `ProductionStack.tsx` | `executeStackPlan` | `import from services/stackEngine` + `handleExecuteStack` | WIRED | structuredClone bridge pattern; real-time `onStepUpdate` callback syncs to store |
| `ProductionStack.tsx` | `sendFollowUpEdit` | `import from services/stackEngine` + `handleFollowUp` | WIRED | Follow-up only shown when `status === 'completed' || 'follow-up'`; calls `initFollowUpSession` then `sendFollowUpEdit` |
| `ProductionStack.tsx` | `retryStep` | `import from services/stackEngine` | ORPHANED | Imported at line 8; zero call sites in file — no retry handler, no retry button in UI |
| `MannequinEngine.tsx` | `ProductionStore.createStackSession` | `handleTransferToStack` via `useProductionStore.getState()` | WIRED | Line 418-420 creates session and navigates to PRODUCTION |
| `BatchEngine.tsx` | `executeStackPlan` | `import from services/stackEngine` + `processItem` | WIRED | Line 113: `await executeStackPlan(session, () => {})` |
| `useProductionStore` | `localStorage` | `stack-presets` key | WIRED | Line 220: initializes from localStorage; `saveStackPreset`/`deleteStackPreset` sync localStorage |
| `geminiService.generateMannequin` | `IMAGE_MODEL` | `callUnifiedAPI(IMAGE_MODEL, ...)` | WIRED | Line 578 confirms unified model call |
| `geminiService.applyBatchRefinements` | `IMAGE_MODEL` | `callUnifiedAPI(IMAGE_MODEL, ...)` | WIRED | Line 2118 confirms unified model call |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| `GenerationProgressBar` | `stepStates` | `stackSession.stepStates` in Zustand | Yes — `updateStepState` mutates real-time from `onStepUpdate` callback | FLOWING |
| `StepHistoryStrip` | `stepStates[i].snapshots[approvedSnapshotIndex].outputImage` | `executeStep()` in stackEngine writes real base64 images | Yes — written after each AI generation call | FLOWING |
| `DebugInspector` | `latestSnapshot.referencesUsed` + `excludedReferences` | `buildStepBundle` in stackEngine + session update | Yes — populated from real step execution | FLOWING |
| `ReferenceBundlePanel` | `referenceBundle` | `session.referenceBundle` set in `executeStep()` | Yes — set from `buildStepBundle` after each step | FLOWING — only populates after first step executes |
| `OutputFormatSelector` | `ASPECT_RATIOS`, `IMAGE_SIZES` | `services/geminiService.ts` exports | Yes — constants with real values | FLOWING |
| `PresetModal` (load mode) | `stackPresets` | `localStorage.getItem('stack-presets')` initialized in store | Yes — real localStorage persistence | FLOWING |

---

### Behavioral Spot-Checks

Step 7b: SKIPPED — App requires a live Gemini API key and browser environment; no runnable entry points for CLI-style spot checks. Key wiring verified via static analysis.

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|------------|------------|-------------|--------|----------|
| UI-01 | 03-01 | Base photo panel shows locked base image prominently | SATISFIED | `BasePhotoPanel.tsx` with 3 states, wired in `ProductionStack.tsx` |
| UI-02 | 03-01 | Output format selector with business-friendly labels | SATISFIED | `OutputFormatSelector.tsx` with 10 aspect ratios + 4 resolutions, all with friendly labels |
| UI-03 | 03-02 | Stack plan panel with drag-reorder capability | SATISFIED | `StackPlanPanel.tsx` + `StackLayerRow.tsx` with HTML5 DnD |
| UI-04 | 03-03 | Reference bundle panel grouped by role | SATISFIED | `ReferenceBundlePanel.tsx` with 4 collapsible role sections |
| UI-05 | 03-02 | Generation progress panel with per-step status | SATISFIED | `GenerationProgressBar.tsx` with 6 color-coded status states |
| UI-06 | 03-02 | Follow-up edit panel accepts plain-language edits | SATISFIED | `FollowUpInput.tsx` wired to `handleFollowUp` which calls `sendFollowUpEdit` |
| UI-07 | 03-01 | Production Stack is the primary/default tab | SATISFIED | `useAppStore.ts:16` `activeEngine: 'PRODUCTION'`; navigation shows STACK first |
| UI-08 | 03-03 | Debug view: references included/excluded, generationConfig | SATISFIED | `DebugInspector.tsx` renders all three sections |
| OPS-01 | 03-03 | One-click session duplication | SATISFIED | `duplicateStackSession` in store; `SessionToolbar` duplicate button wired |
| OPS-02 | 03-03 | Save and reuse named stack presets | SATISFIED | `saveStackPreset`/`loadStackPreset`/`deleteStackPreset` in store; `PresetModal` wired |
| OPS-03 | 03-02 | Generation history for visual comparison and rollback | SATISFIED | `StepHistoryStrip` + `viewingStepIndex` logic in `ProductionStack.tsx` |
| MANN-01 | 03-04 | Mannequin generation uses `gemini-3.1-flash-image-preview` | SATISFIED | `generateMannequin` calls `callUnifiedAPI(IMAGE_MODEL, ...)` at `geminiService.ts:578` |
| MANN-02 | 03-04 | Mannequin refinement uses `gemini-3.1-flash-image-preview` | SATISFIED | `applyBatchRefinements` calls `callUnifiedAPI(IMAGE_MODEL, ...)` at `geminiService.ts:2118` |
| MANN-03 | 03-04 | Mannequin positioned as base image preparation studio | SATISFIED | "Send to Stack" button replaces old "Share" button; `handleTransferToStack` wires output to stack |
| MANN-04 | 03-04 | Mannequin output flows into Production Stack as locked base | SATISFIED | `handleTransferToStack` calls `createStackSession(currentImage, '1:1', '1K')` then `setActiveEngine('PRODUCTION')` |
| BATCH-01 | 03-04 | Batch executes production stack pipeline | SATISFIED | BatchEngine imports and calls `executeStackPlan` from `services/stackEngine` |
| BATCH-02 | 03-04 | Batch uses unified service and reference architecture | SATISFIED | Sequential for-of loop (no Promise.all); `generateProductionPhoto` not imported in BatchEngine |
| STACK-09 | Phase 2 (exposed via Phase 3 UI) | User can retry a specific step without re-running entire stack | BLOCKED | `retryStep` exported from `services/stackEngine.ts` and imported in `ProductionStack.tsx` but has zero call sites — no UI affordance exists |

**Note on STACK-09:** STACK-09 is listed as a Phase 2 requirement (stack engine), but Phase 3 is responsible for the UI that exposes it. The function is fully implemented in `stackEngine.ts` but disconnected from the interface — `retryStep` is a dead import in `ProductionStack.tsx`. This is a gap in Phase 3's integration work.

---

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `components/ProductionStack.tsx:8` | `retryStep` imported but never called (dead import) | Warning | STACK-09 per-step retry is unreachable by users — the feature is built but not exposed |

No other stubs, TODO comments, empty implementations, or hardcoded empty data found across the 12 stack sub-components.

---

### Human Verification Required

#### 1. Production Stack Visual Layout

**Test:** Open the app in a browser with a valid Gemini API key. Verify the default landing screen.
**Expected:** App opens on the STACK tab; 3-column layout visible — left panel shows BasePhotoPanel (upload zone) and OutputFormatSelector; center panel shows "No Production Stack Session" prompt; right panel shows "No layers yet" prompt
**Why human:** Visual render and column proportions (300px left / flex-1 center / 300px right) require browser inspection

#### 2. Full Stack Execution End-to-End

**Test:** Upload a mannequin image, lock it, add 2 jewelry layers, click Execute Stack.
**Expected:** GenerationProgressBar segments animate through states; StepHistoryStrip populates with thumbnails after each step completes; final image displays in center panel
**Why human:** Requires live Gemini API key and production AI calls

#### 3. Mannequin to Stack Transfer

**Test:** Generate or import a mannequin in the MANNEQUIN tab; click "Send to Stack".
**Expected:** App navigates to STACK tab; BasePhotoPanel shows the mannequin image in locked state; session is active
**Why human:** Cross-engine state transfer and navigation require browser interaction

---

### Gaps Summary

One gap was found blocking full goal achievement:

**STACK-09 — Per-step retry unreachable**: The `retryStep` function is fully implemented in `services/stackEngine.ts` and correctly imported in `components/ProductionStack.tsx`, but it is never called anywhere. No retry button or handler exists in `StackLayerRow.tsx`, `StackPlanPanel.tsx`, or `ProductionStack.tsx`. Users encountering a failed step have no way to retry it without restarting the entire stack. The fix requires: (1) adding an `onRetry` prop to `StackLayerRow`, (2) wiring it through `StackPlanPanel`, and (3) adding a `handleRetryStep` callback in `ProductionStack.tsx` that calls `retryStep`. This is a Phase 3 integration omission — the engine (Phase 2) delivered the function, but Phase 3 did not expose it in the UI.

All other 17 requirements are fully satisfied with substantive implementations and working wiring.

---

_Verified: 2026-03-24T21:00:00Z_
_Verifier: Claude (gsd-verifier)_

---
phase: 03-production-stack-ui-engine-integration
plan: 03
subsystem: production-stack-ui
tags: [ui, integration, engine-wiring, operator-efficiency]
dependency_graph:
  requires: [03-01, 03-02]
  provides: [fully-wired-production-stack, engine-execution, follow-up-editing, session-duplication, stack-presets]
  affects: [components/ProductionStack.tsx, stores/useProductionStore.ts]
tech_stack:
  added: []
  patterns: [structuredClone-engine-bridge, callback-store-sync, localStorage-presets]
key_files:
  created:
    - components/stack/ReferenceBundlePanel.tsx
    - components/stack/DebugInspector.tsx
    - components/stack/SessionToolbar.tsx
    - components/stack/PresetModal.tsx
  modified:
    - components/ProductionStack.tsx
    - stores/useProductionStore.ts
    - types.ts
    - services/geminiService.ts
decisions:
  - "structuredClone pattern for engine execution bridge -- engine mutates clone, callbacks sync to store"
  - "stack presets store config only (no images) to stay within localStorage limits"
metrics:
  duration: 5min
  completed: "2026-03-24T20:39:16Z"
---

# Phase 03 Plan 03: Engine Integration + Operator Efficiency Summary

Fully wired ProductionStack with stack engine execution, follow-up editing, reference bundle panel, debug inspector, session duplication, and preset save/load via localStorage.

## What Was Done

### Task 1: ReferenceBundlePanel, DebugInspector, Store Extensions
- **ReferenceBundlePanel**: 4 collapsible sections (Character, Object, Composition, Style) with count badges and 40x40 reference thumbnails. Null state shows informational text.
- **DebugInspector**: Collapsed by default, aria-label toggles between "Expand/Collapse debug inspector". Shows references included (thumbnail grid), references excluded (role + kind text), and generationConfig as formatted JSON. Only renders when at least one step is completed.
- **Store actions added**: `addLayerToStack`, `removeLayerFromStack`, `reorderStackLayers`, `updateStepState` (missing from Plan 01/02).
- **OPS-01 duplicateStackSession**: Clones session with new UUID, resets stepStates to pending, clears currentImage/chatSession/followUpHistory/referenceBundle.
- **OPS-02 stackPresets**: `saveStackPreset` serializes layer configs (name, category, zone only -- no images), `loadStackPreset` creates new session from template, `deleteStackPreset` removes. All backed by `localStorage` key `stack-presets`.

### Task 2: SessionToolbar, PresetModal, Full ProductionStack Wiring
- **SessionToolbar**: Displays truncated session ID (8 chars), duplicate button with copy icon + `aria-label="Duplicate session"`, Save Preset / Load Preset buttons, Clear Session with destructive confirm dialog.
- **PresetModal**: Fixed overlay modal with save mode (name input + save button) and load mode (preset list with name, layer count, date, load/delete actions). Empty state: "No saved presets yet."
- **ProductionStack fully wired**: All 10 child components imported and integrated. Engine execution via `executeStackPlan` with `structuredClone` bridge pattern. Real-time progress via `onStepUpdate` callback syncing to store. `compactSnapshots` called after completion. Follow-up editing via `initFollowUpSession` + `sendFollowUpEdit`. Step history viewer with click-to-preview. Controls disabled during execution. Download via `downloadBase64Image`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Removed duplicate type definitions in types.ts**
- **Found during:** Task 1
- **Issue:** Parallel merge of Plans 01 and 02 created duplicate definitions for TargetZone, StackLayer, StepStatus, StepState, GenerationSnapshot, ReferenceImage, ImageGenerationConfig. The simpler Plan 01 versions conflicted with the richer Plan 02 versions used by the engine.
- **Fix:** Removed the first duplicate block (lines 191-245) keeping the richer definitions from the unified service section.
- **Files modified:** types.ts
- **Commit:** 4f505f9

**2. [Rule 3 - Blocking] Added missing type imports in geminiService.ts**
- **Found during:** Task 1
- **Issue:** geminiService.ts referenced ReferenceBundle, EffectiveBundle, ReferenceImage, ImageGenerationConfig, ImageChatSession, ParsedImageResponse without importing them. Build failed with "Cannot find name" errors.
- **Fix:** Added all 6 types to the import statement from types.ts.
- **Files modified:** services/geminiService.ts
- **Commit:** 4f505f9

**3. [Rule 3 - Blocking] Added missing store actions**
- **Found during:** Task 1
- **Issue:** The plan's interface section listed `addLayerToStack`, `removeLayerFromStack`, `reorderStackLayers`, `updateStepState` as existing store actions, but they were not implemented in Plans 01 or 02.
- **Fix:** Implemented all 4 actions in the store with proper ordinal recomputation and immutable Zustand update patterns.
- **Files modified:** stores/useProductionStore.ts
- **Commit:** 4f505f9

## Known Stubs

None. All components are fully wired to real store state and engine functions.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 4f505f9 | ReferenceBundlePanel, DebugInspector, store extensions + type fixes |
| 2 | 4cb506f | SessionToolbar, PresetModal, full ProductionStack wiring |

## Verification Results

- `npm run build` succeeds (335KB JS, 43KB CSS)
- 8 engine function references in ProductionStack.tsx (executeStackPlan, compactSnapshots, initFollowUpSession, sendFollowUpEdit, retryStep, initializeStepStates -- plus imports)
- 10 child component imports in ProductionStack.tsx
- `duplicateStackSession` and `stackPresets` confirmed in store
- `localStorage.getItem('stack-presets')` confirmed in store initialization
- 12 components in components/stack/ directory

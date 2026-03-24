---
phase: 02-production-stack-engine
plan: 01
subsystem: production-stack-types-and-state
tags: [types, zustand, zone-logic, constants]
dependency_graph:
  requires: [01-01, 01-02]
  provides: [TargetZone, StackLayer, ProductionStackSession, ZONE_PROMPTS, autoAssignZone, ASPECT_RATIOS, IMAGE_SIZES, stackSession-store]
  affects: [02-02]
tech_stack:
  added: []
  patterns: [centralized-zone-mapping, zustand-get-for-async]
key_files:
  created: []
  modified:
    - types.ts
    - services/geminiService.ts
    - stores/useProductionStore.ts
decisions:
  - "9 target zones cover all jewelry placement positions including sautoir lengths"
  - "CATEGORY_TO_ZONE uses substring matching for flexible category name support"
  - "autoAssignZone defaults to collarbone for unrecognized categories"
  - "All stack session actions use get() instead of closure state to avoid stale references in async flows"
  - "STATE-01 contract fields initialized as null/empty and populated by engine during execution"
metrics:
  duration: 2min
  completed: "2026-03-24T19:37:08Z"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 3
---

# Phase 02 Plan 01: Production Stack Types, Zone Logic & Session State Summary

Production Stack type system with 7 new types (TargetZone through ProductionStackSession), centralized zone-to-prompt mapping replacing scattered if/else chains, output format constants (10 aspect ratios, 4 resolutions), and Zustand store with full stack session CRUD including STATE-01 contract fields.

## Task Results

### Task 1: Add Production Stack types and output format constants
**Commit:** 4cf89ac
**Files:** types.ts, services/geminiService.ts

Added 7 types to types.ts:
- `TargetZone` (9 zones: neck-base through finger)
- `StackLayer` (ordinal, name, productImage, productCategory, targetZone, blueprint, dimensions)
- `GenerationSnapshot` (full step recording with prompt, references, config, input/output images, validation)
- `StepStatus` (6 states: pending, executing, validating, completed, failed, retrying)
- `StepState` (per-layer execution state with attempts and snapshots)
- `ProductionStackSession` (complete session with STATE-01 fields: referenceBundle, effectiveReferenceBundle, excludedReferences, validationResults)

Added to geminiService.ts:
- `ZONE_PROMPTS` record mapping all 9 TargetZone values to placement prompt text
- `CATEGORY_TO_ZONE` mapping (11 category keywords to zones)
- `autoAssignZone()` function with substring matching and collarbone default
- `getZonePlacementPrompt()` helper
- `ASPECT_RATIOS` (10 values) and `IMAGE_SIZES` (4 values) as const arrays

### Task 2: Extend useProductionStore with stack session state management
**Commit:** 1381743
**Files:** stores/useProductionStore.ts

Added to existing Zustand store (all existing fields preserved):
- `stackSession: ProductionStackSession | null` state field
- `createStackSession()` - creates session with UUID, initializes all STATE-01 fields as null/empty
- `updateStackSession()` - partial merge with null guard
- `addLayerToStack()` - appends layer
- `removeLayerFromStack()` - removes and re-assigns ordinals
- `reorderStackLayers()` - rebuilds layer array from ID ordering with ordinal re-assignment
- `updateStepState()` - updates specific step by index with bounds checking
- `resetStackSession()` - sets session to null

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None - all types are fully defined, all functions are implemented, all store actions are wired.

## Verification Results

- TypeScript compiles with only pre-existing errors (BannerEngine React namespace, ProductionEngine type narrowing)
- All 7 new types exported from types.ts (12 grep matches)
- All 5 zone/format exports present in geminiService.ts (6 grep matches)
- All 8 store fields/actions present (27 grep matches, exceeding 16+ threshold)
- STATE-01 contract fields verified in both types.ts and store initialization

## Self-Check: PASSED

---
phase: 03-production-stack-ui-engine-integration
plan: 01
subsystem: ui
tags: [react, zustand, tailwind, production-stack, layout]

# Dependency graph
requires:
  - phase: 02-production-stack-engine
    provides: ProductionStackSession types and store actions
provides:
  - ProductionStack 3-panel layout shell component
  - BasePhotoPanel with upload/lock/locked states
  - OutputFormatSelector with business-friendly labels
  - SectionLabel shared UI component
  - ASPECT_RATIOS and IMAGE_SIZES constants in geminiService
  - stackSession and createStackSession in useProductionStore
  - STACK as default tab with reordered navigation
affects: [03-02-PLAN, 03-03-PLAN, 03-04-PLAN]

# Tech tracking
tech-stack:
  added: []
  patterns: [3-column layout shell with left/center/right panels, SectionLabel extraction pattern]

key-files:
  created:
    - components/ui/SectionLabel.tsx
    - components/stack/BasePhotoPanel.tsx
    - components/stack/OutputFormatSelector.tsx
    - components/ProductionStack.tsx
  modified:
    - App.tsx
    - stores/useAppStore.ts
    - stores/useProductionStore.ts
    - services/geminiService.ts
    - types.ts

key-decisions:
  - "Added ProductionStackSession types and store actions inline since Phase 2 plans not yet landed in worktree (parallel execution)"
  - "Added ASPECT_RATIOS and IMAGE_SIZES constants to geminiService as they were referenced by plan but not yet present"
  - "Removed Banner tab from navigation entirely (was already hidden per Phase 1 decision)"

patterns-established:
  - "SectionLabel: shared uppercase label component extracted from MannequinEngine for reuse across stack panels"
  - "Stack panel pattern: components/stack/*.tsx for Production Stack sub-components"

requirements-completed: [UI-01, UI-02, UI-07]

# Metrics
duration: 3min
completed: 2026-03-24
---

# Phase 3 Plan 01: Production Stack Layout Shell Summary

**3-panel ProductionStack layout with BasePhotoPanel (upload/lock/locked), OutputFormatSelector (10 aspect ratios + 4 resolutions), and STACK as default tab**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-24T20:25:12Z
- **Completed:** 2026-03-24T20:28:30Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Built ProductionStack 3-column layout shell (300px left/flex-1 center/300px right) following UI-SPEC
- BasePhotoPanel with three states: empty (DropZone), preview (image + Lock button), locked (indigo-600 border + lock icon)
- OutputFormatSelector with 10 aspect ratio PillButtons using business-friendly labels and resolution dropdown
- App defaults to STACK tab with reordered navigation (STACK | MANNEQUIN | CATALOG | BATCH)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create SectionLabel, BasePhotoPanel, OutputFormatSelector, and ProductionStack shell** - `359e694` (feat)
2. **Task 2: Wire ProductionStack into App.tsx, set as default tab, rename nav label to STACK** - `1486026` (feat)

## Files Created/Modified
- `components/ui/SectionLabel.tsx` - Shared uppercase section label component
- `components/stack/BasePhotoPanel.tsx` - Base image upload, preview, and lock states
- `components/stack/OutputFormatSelector.tsx` - Aspect ratio pills + resolution dropdown
- `components/ProductionStack.tsx` - Top-level 3-panel layout shell
- `App.tsx` - ProductionStack in PRODUCTION slot, STACK nav label, reordered tabs
- `stores/useAppStore.ts` - Default activeEngine changed to PRODUCTION
- `stores/useProductionStore.ts` - Added stackSession, createStackSession, updateStackSession, resetStackSession
- `services/geminiService.ts` - Added ASPECT_RATIOS and IMAGE_SIZES constants
- `types.ts` - Added ProductionStackSession and supporting types

## Decisions Made
- Added ProductionStackSession types and store actions inline because Phase 2 plans have not landed yet in this worktree (parallel execution). These are additive and will be compatible with Phase 2 output.
- Added ASPECT_RATIOS and IMAGE_SIZES constants to geminiService since the plan references them but they didn't exist yet.
- Removed Banner tab from navigation entirely (already hidden per Phase 1 decision, formalized in this commit).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added ProductionStackSession types to types.ts**
- **Found during:** Task 1 (component creation)
- **Issue:** Plan references ProductionStackSession, StackLayer, StepState etc. from types.ts but Phase 2 types haven't landed yet (parallel worktree execution)
- **Fix:** Added minimal type definitions for ProductionStackSession and all supporting interfaces (StackLayer, StepState, ImageChatSession, GenerationSnapshot, ReferenceBundle, EffectiveBundle, ReferenceImage)
- **Files modified:** types.ts
- **Verification:** TypeScript compiles without errors in new files
- **Committed in:** 359e694 (Task 1 commit)

**2. [Rule 3 - Blocking] Added ASPECT_RATIOS and IMAGE_SIZES to geminiService.ts**
- **Found during:** Task 1 (OutputFormatSelector creation)
- **Issue:** Plan specifies importing these constants from geminiService but they don't exist yet
- **Fix:** Added both constant arrays with 10 aspect ratios and 4 image sizes per UI-SPEC
- **Files modified:** services/geminiService.ts
- **Verification:** OutputFormatSelector imports and renders correctly
- **Committed in:** 359e694 (Task 1 commit)

**3. [Rule 3 - Blocking] Added stackSession and related store actions to useProductionStore**
- **Found during:** Task 1 (ProductionStack wiring)
- **Issue:** Plan references stackSession, createStackSession, updateStackSession, resetStackSession but they don't exist in the store yet
- **Fix:** Added all four store members with full implementation (createStackSession creates a new session with UUID)
- **Files modified:** stores/useProductionStore.ts
- **Verification:** ProductionStack compiles and wires to store correctly
- **Committed in:** 359e694 (Task 1 commit)

---

**Total deviations:** 3 auto-fixed (3 blocking)
**Impact on plan:** All auto-fixes were necessary to unblock component creation in a parallel execution context where Phase 2 outputs haven't landed. No scope creep -- all additions are exactly what Phase 2 would provide.

## Issues Encountered
None

## Known Stubs
None -- all components are fully functional for their defined scope. Center and right panel placeholders are intentional (populated by Plan 02).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Layout shell ready for Plan 02 to populate center panel (GenerationProgressBar, FollowUpInput, StepHistoryStrip) and right panel (StackPlanPanel with drag-reorder)
- BasePhotoPanel and OutputFormatSelector fully functional and wired to store
- All Phase 2 type dependencies are in place for Plan 02/03/04 to build upon

---
*Phase: 03-production-stack-ui-engine-integration*
*Completed: 2026-03-24*

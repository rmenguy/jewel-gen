---
phase: 02-production-stack-engine
plan: 02
subsystem: production-stack-engine
tags: [stack-engine, progressive-placement, sequential-edits, snapshot-history, follow-up-chat, memory-management]
dependency_graph:
  requires: [02-01]
  provides: [executeStackPlan, retryStep, initFollowUpSession, sendFollowUpEdit, compactSnapshots, buildStepBundle, initializeStepStates]
  affects: [02-03]
tech_stack:
  added: []
  patterns: [progressive-sequential-execution, snapshot-rollback-retry, chat-session-follow-up, reference-bundle-role-documentation]
key_files:
  created:
    - services/stackEngine.ts
  modified:
    - services/geminiService.ts
decisions:
  - "buildStepBundle documents reference roles in snapshots for debugging even though addJewelryToExisting handles the API call internally"
  - "executeStep is an internal helper (not exported) since it is only called by executeStackPlan and retryStep"
  - "Subsequent steps are invalidated on retry (set to pending) rather than auto-replayed, letting the user decide"
  - "Follow-up edits include image on first turn only, relying on chat history for subsequent turns"
  - "extractBase64 exported from geminiService to avoid duplicating base64 parsing logic"
metrics:
  duration: 2min
  completed: "2026-03-24T19:46:00Z"
  tasks_completed: 1
  tasks_total: 1
  files_modified: 2
requirements_completed: [STACK-06, STACK-07, STACK-08, STACK-09, STACK-10, STACK-11, STACK-12, STACK-13, STATE-03, STATE-04]
---

# Phase 02 Plan 02: Production Stack Execution Engine Summary

Progressive sequential jewelry placement engine with per-step reference bundles (STACK-06), snapshot-based retry (STACK-09), chat-based follow-up editing with jewelry preservation prompts (STACK-10/11), placement locking (STACK-13), physical plausibility constraints (STACK-12), and memory compaction for browser performance.

## Task Results

### Task 1: Create stackEngine.ts with progressive execution, buildStepBundle, and snapshot recording
**Commit:** f968d3c
**Files:** services/stackEngine.ts (created), services/geminiService.ts (modified -- exported extractBase64)

Created `services/stackEngine.ts` as a pure service module (no React hooks, no Zustand imports) with 7 exported functions:

1. **buildStepBundle** (STACK-06) -- Constructs a ReferenceBundle with explicit roles for each step: locked base scene (priority 0), jewelry fidelity (priority 1), character consistency for non-first steps (priority 2). Builds prompt with zone placement + PLACEMENT LOCK + PHYSICS constraints.

2. **initializeStepStates** -- Creates StepState objects from session layers with default pending status and max 3 attempts.

3. **executeStackPlan** -- Main orchestrator: sequential loop through layers, calls executeStep per layer, records snapshots, handles resume (skips completed steps), breaks on failure.

4. **executeStep** (internal) -- Single-step execution: resolves product image (URL or data URI), builds reference bundle, calls addJewelryToExisting, records GenerationSnapshot, populates STATE-01 session fields.

5. **retryStep** (STACK-09) -- Single-step retry via snapshot rollback: gets previous step's approved output, re-executes target step, invalidates subsequent completed steps.

6. **initFollowUpSession** (STACK-10) -- Creates ImageChatSession for post-completion conversational edits.

7. **sendFollowUpEdit** (STACK-10/11) -- Sends follow-up edit with preservation instruction ("ALL existing jewelry must be PRESERVED exactly as-is"), includes image on first turn, records follow-up snapshots.

8. **compactSnapshots** -- Nulls non-approved snapshot images (inputImage and outputImage set to empty string) for browser memory management.

Also exported `extractBase64` from `geminiService.ts` (was previously internal) to avoid duplicating the base64 parsing logic.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Exported extractBase64 from geminiService.ts**
- **Found during:** Task 1
- **Issue:** `extractBase64` was a module-private function in geminiService.ts but the plan specifies importing it in stackEngine.ts
- **Fix:** Changed `function extractBase64` to `export function extractBase64` in geminiService.ts
- **Files modified:** services/geminiService.ts
- **Commit:** f968d3c

**2. [Rule 3 - Blocking] Applied Plan 01 prerequisites**
- **Found during:** Task 1 setup
- **Issue:** This worktree did not contain Plan 01 changes (types, zone logic, store state). The plan depends on types like ProductionStackSession, StackLayer, etc.
- **Fix:** Applied git diff from Plan 01 commits (4cf89ac, 1381743) to bring in all prerequisite types, zone logic, and store state
- **Files modified:** types.ts, services/geminiService.ts, stores/useProductionStore.ts, App.tsx, CLAUDE.md
- **Commit:** 4f26409

## Known Stubs

None -- all 7 functions are fully implemented with complete logic, no placeholder data, no TODO markers.

## Verification Results

- TypeScript compiles with only pre-existing errors (BannerEngine React namespace, ProductionEngine type narrowing)
- `npm run build` succeeds (49 modules, 1.02s)
- 7 exported functions verified: buildStepBundle, initializeStepStates, executeStackPlan, retryStep, initFollowUpSession, sendFollowUpEdit, compactSnapshots
- STACK-06: Reference roles documented (locked base scene, jewelry fidelity, character consistency)
- STACK-09: Retry with 'retrying' status transition
- STACK-10/11: Follow-up via createImageChatSession/continueImageChatSession with preservation instruction
- STACK-12: Physical plausibility via "no object fusion" in PHYSICS prompt
- STACK-13: Placement locking via PLACEMENT LOCK prompt
- STATE-01: session.referenceBundle and session.validationResults populated during execution
- STATE-04: Full GenerationSnapshot recording with prompt, references, config, input/output images

## Self-Check: PASSED

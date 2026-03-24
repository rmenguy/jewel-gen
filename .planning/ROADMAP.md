# Roadmap: CATALOG.ENGINE Refactor

## Overview

This roadmap transforms CATALOG.ENGINE from a multi-model, ad-hoc jewelry placement app into a single-model production stack engine with structured multi-reference inputs. The refactor progresses bottom-up: first the unified service layer and types replace the existing multi-model code (while preserving the iterative stacking baseline), then the production stack workflow engine is built on that foundation, and finally the UI, operator workflows, and dependent engines are wired up.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Unified Image Service & Reference Architecture** - Replace multi-model service layer with single-model abstraction, reference types, and old model cleanup
- [ ] **Phase 2: Production Stack Engine** - Build the progressive stacking workflow with state management, validation, and follow-up editing
- [ ] **Phase 3: Production Stack UI & Engine Integration** - Wire up the Production Stack interface, refactor Mannequin/Batch engines, and add operator efficiency features

## Phase Details

### Phase 1: Unified Image Service & Reference Architecture
**Goal**: All image generation and editing flows through a single model via a clean service abstraction with structured multi-reference support, and all old model code is removed
**Depends on**: Nothing (first phase)
**Requirements**: MODEL-01, MODEL-02, MODEL-03, MODEL-04, MODEL-05, MODEL-06, MODEL-07, REF-01, REF-02, REF-03, REF-04, REF-05, REF-06, REF-07, CLEAN-01, CLEAN-02, CLEAN-03
**Success Criteria** (what must be TRUE):
  1. Every image generation and editing call in the app goes through `gemini-3.1-flash-image-preview` -- no Imagen or gemini-3-pro calls remain in the codebase
  2. Changing the model ID in one place updates all image operations across the entire app
  3. Service exposes named functions (generateImageFromPrompt, editImageFromPrompt, editImageWithReferences, createImageChatSession, continueImageChatSession) that any engine can call
  4. A caller can pass a ReferenceBundle with up to 14 images (4 character + 10 object) and the service deterministically orders, prioritizes, and enforces the budget -- dropping excess references by priority
  5. The existing iterative stacking workflow still produces results at least as good as before the refactor (baseline preserved)
**Plans**: 2 plans

Plans:
- [x] 01-01-PLAN.md -- Reference architecture types, model constant, unified API caller, response parser, budget enforcement, and 5 named service functions
- [x] 01-02-PLAN.md -- Migrate all 24 image functions to unified service, delete old model code, hide Banner tab

### Phase 2: Production Stack Engine
**Goal**: Users can run a complete production stack session -- lock a base image, build an ordered jewelry plan, execute progressive placement with per-step validation, retry individual steps, and make follow-up edits
**Depends on**: Phase 1
**Requirements**: STACK-01, STACK-02, STACK-03, STACK-04, STACK-05, STACK-06, STACK-07, STACK-08, STACK-09, STACK-10, STACK-11, STACK-12, STACK-13, STATE-01, STATE-02, STATE-03, STATE-04
**Success Criteria** (what must be TRUE):
  1. User can lock a base mannequin image and select output format (aspect ratio + resolution), then build an ordered stack plan of jewelry pieces with target zones
  2. Engine executes progressive sequential edits -- one piece per step on the same visual foundation -- with automatic reference organization per step (base, character, jewelry roles)
  3. After each placement step, the system validates product fidelity and the user can retry that specific step without restarting the whole stack
  4. User can type a plain-language follow-up edit after generation that preserves all previously approved jewelry
  5. Every step's full generation snapshot (prompt, references used, model config, output format, result) is recorded in session history for undo and debugging
**Plans**: 2 plans

Plans:
- [ ] 02-01-PLAN.md -- Production Stack types, target zone centralization, output format constants, Zustand session state
- [ ] 02-02-PLAN.md -- Progressive execution engine with snapshot recording, step retry, follow-up editing, memory compaction

### Phase 3: Production Stack UI & Engine Integration
**Goal**: The Production Stack is the primary app experience with a purpose-built interface, Mannequin engine feeds base images into it, Batch engine uses its pipeline, and operators can duplicate/save/compare sessions
**Depends on**: Phase 2
**Requirements**: UI-01, UI-02, UI-03, UI-04, UI-05, UI-06, UI-07, UI-08, OPS-01, OPS-02, OPS-03, MANN-01, MANN-02, MANN-03, MANN-04, BATCH-01, BATCH-02
**Success Criteria** (what must be TRUE):
  1. Production Stack tab is the default experience with panels for base photo, output format, stack plan (drag-reorder), reference bundle (grouped by role), generation progress (per-step status), and follow-up edits
  2. Mannequin engine uses the unified image service for generation and refinement, and its output flows directly into Production Stack as a locked base image
  3. Batch engine executes the production stack pipeline (not a separate code path) using the same unified service and reference architecture
  4. User can duplicate a stack session (clone everything, change one variable, re-run), save/load named stack presets, and visually compare any previous step in generation history
  5. Internal debug view shows references included vs excluded, final ordered reference list, and generationConfig for any generation step
**Plans**: TBD
**UI hint**: yes

Plans:
- [ ] 03-01: Production Stack UI panels and layout
- [ ] 03-02: Mannequin refactor, Batch alignment, and operator efficiency features

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Unified Image Service & Reference Architecture | 2/2 | Complete | - |
| 2. Production Stack Engine | 0/2 | Not started | - |
| 3. Production Stack UI & Engine Integration | 0/2 | Not started | - |

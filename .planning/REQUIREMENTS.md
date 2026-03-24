# Requirements: CATALOG.ENGINE Refactor

**Defined:** 2026-03-24
**Core Value:** Production-grade jewelry placement on locked base photos with product fidelity, controllability, and repeatability — powered by a single image model with structured multi-reference inputs.

## v1 Requirements

### Single Image Model (MODEL)

- [x] **MODEL-01**: All image generation uses `gemini-3.1-flash-image-preview` exclusively (no Imagen, no gemini-3-pro)
- [x] **MODEL-02**: Model ID is a single configurable constant, not hardcoded across files
- [x] **MODEL-03**: Unified image service abstraction with named functions: generateImageFromPrompt, editImageFromPrompt, editImageWithReferences, createImageChatSession, continueImageChatSession
- [x] **MODEL-04**: Standardized response parsing from `response.candidates[0].content.parts` — no duplicated parsing logic
- [x] **MODEL-05**: All image service functions support generationConfig (responseModalities, imageConfig.aspectRatio, imageConfig.imageSize)
- [x] **MODEL-06**: Text-only analytical tasks (catalog extraction) may remain on separate non-image model
- [x] **MODEL-07**: Support stateful multi-step image editing sessions to preserve continuity across sequential edits (lighting, geometry, previously placed objects)

### Multi-Reference Architecture (REF)

- [x] **REF-01**: ReferenceImage type with id, kind (character/object/composition/style), role, imageUrl, priority
- [x] **REF-02**: ReferenceBundle type grouping references by kind (characterReferences, objectReferences, compositionReferences, styleReferences)
- [x] **REF-03**: Reference budget enforcement: max 4 character + max 10 object, total max 14 per request
- [x] **REF-04**: Deterministic priority-based downselection when budget exceeded: locked base image first → primary jewelry references → character consistency references → detail crops → composition references → style references (style dropped first)
- [x] **REF-05**: Deterministic reference ordering in API request contents (text prompt first, then ordered inlineData parts)
- [x] **REF-06**: Prompts explicitly state role of each reference set (e.g., "image 1 is locked base scene", "images 2-3 are character consistency", "images 4-6 are jewelry fidelity")
- [x] **REF-07**: Support composition references (pose, framing, crop, layout guidance) as a distinct reference kind

### Production Stack Workflow (STACK)

- [x] **STACK-01**: User can select a locked base mannequin image to start a production stack session
- [x] **STACK-02**: User can choose output format: aspect ratio (1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9) and resolution (512, 1K, 2K, 4K)
- [x] **STACK-03**: User can assemble jewelry pieces into an ordered stack plan with named layers
- [x] **STACK-04**: Each stack layer has a target zone (neck-base, collarbone, upper-chest, mid-chest, navel, ear-lobe, ear-upper, wrist, finger)
- [x] **STACK-05**: System auto-assigns target zones based on jewelry category when not specified
- [ ] **STACK-06**: System organizes references into explicit roles (base, character, jewelry, composition, style) per step
- [ ] **STACK-07**: Engine performs progressive sequential edits — one jewelry piece per step on the same visual foundation
- [ ] **STACK-08**: Per-step validation checks local product fidelity after each placement
- [ ] **STACK-09**: User can retry a specific step without re-running the entire stack
- [ ] **STACK-10**: User can request targeted follow-up edits in plain language after generation completes
- [ ] **STACK-11**: Follow-up edits preserve all existing approved jewelry unless explicitly told otherwise
- [ ] **STACK-12**: Enforce physical plausibility constraints (correct scale relative to body, realistic drape/hang, no object fusion between jewelry pieces)
- [ ] **STACK-13**: Enforce placement locking — previously placed and approved jewelry must remain visually stable during subsequent placement steps

### Production Stack UI (UI)

- [ ] **UI-01**: Base photo panel shows locked base image prominently
- [ ] **UI-02**: Output format selector with business-friendly labels (e.g., "Portrait 3:4", "Social Vertical 9:16", "Editorial Square 1:1")
- [ ] **UI-03**: Stack plan panel shows ordered jewelry layers with drag-reorder capability
- [ ] **UI-04**: Reference bundle panel shows references grouped by role (base, character, jewelry, composition, style)
- [ ] **UI-05**: Generation progress panel shows per-step status (preparing refs → applying piece N → validating → next piece)
- [ ] **UI-06**: Follow-up edit panel accepts plain-language targeted edits
- [ ] **UI-07**: Production Stack is the primary/default tab experience
- [ ] **UI-08**: Internal debug view showing: references included vs excluded, final ordered reference list sent to model, generationConfig used

### Operator Efficiency (OPS)

- [ ] **OPS-01**: One-click duplication of a stack session (clone base image, stack plan, references, format — change one variable and re-run)
- [ ] **OPS-02**: Save and reuse stack presets / recipes (named configurations of stack plan + reference setup + output format)
- [ ] **OPS-03**: Generation history within a session for quick visual comparison and rollback to any previous step

### Mannequin Engine Refactor (MANN)

- [ ] **MANN-01**: Mannequin generation uses `gemini-3.1-flash-image-preview` (replacing imagen-4.0-ultra)
- [ ] **MANN-02**: Mannequin refinement uses `gemini-3.1-flash-image-preview` (replacing gemini-3-pro-image-preview)
- [ ] **MANN-03**: Mannequin engine positioned as base image preparation studio (not standalone magic generator)
- [ ] **MANN-04**: Generated/refined mannequin flows directly into Production Stack as locked base image

### Batch Engine Alignment (BATCH)

- [ ] **BATCH-01**: Batch engine executes the new production stack pipeline (not separate image logic path)
- [ ] **BATCH-02**: Batch processing uses the same unified image service and reference architecture

### State Management (STATE)

- [x] **STATE-01**: ProductionStackSession state type with baseImage, aspectRatio, imageSize, stackLayers, referenceBundle, effectiveReferenceBundle, excludedReferences, validationResults, history
- [x] **STATE-02**: Stack session state persisted in Zustand store
- [ ] **STATE-03**: History entries track each step's input/output for undo capability
- [ ] **STATE-04**: Persist full generation snapshot per step: prompt text, references used (after prioritization), model config, output format, and result — enabling reproducibility and debugging

### Cleanup (CLEAN)

- [x] **CLEAN-01**: Remove all imagen-4.0-ultra-generate-001 code paths
- [x] **CLEAN-02**: Remove all gemini-3-pro-image-preview image generation/editing code paths (keep gemini-3-flash-preview for text-only)
- [x] **CLEAN-03**: Banner engine tab hidden or removed from navigation (deferred feature)

## v2 Requirements

### Creative Exploration Mode

- **EXPLORE-01**: Creative Exploration mode with looser prompts and concept generation
- **EXPLORE-02**: Clear UI distinction between Production Stack and Creative Exploration
- **EXPLORE-03**: Style/mood reference presets for exploration workflows

### Advanced Model Features

- **ADV-01**: Native thinking mode for complex multi-jewelry compositions
- **ADV-02**: Reference budget feedback UI (show user which refs included/excluded and why — v1 has debug view, v2 adds polished user-facing version)

### Banner Engine

- **BANNER-01**: Banner creation workflow (reassess after Production Stack ships)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Multiple image model support | Deliberate single-model architecture — simpler debugging, unified behavior |
| Backend proxy / server-side rendering | Browser-only SPA by design, CORS supported by Google API |
| User accounts / multi-tenant auth | Single API key gate sufficient for v1 service |
| Real-time collaboration | Single-operator workflow |
| Mobile-native app | Web-first |
| Automated pricing / billing | Operational concern, not image engine scope |
| Image upscaling via separate model | Single model handles resolution natively |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| MODEL-01 | Phase 1 | Complete |
| MODEL-02 | Phase 1 | Complete |
| MODEL-03 | Phase 1 | Complete |
| MODEL-04 | Phase 1 | Complete |
| MODEL-05 | Phase 1 | Complete |
| MODEL-06 | Phase 1 | Complete |
| MODEL-07 | Phase 1 | Complete |
| REF-01 | Phase 1 | Complete |
| REF-02 | Phase 1 | Complete |
| REF-03 | Phase 1 | Complete |
| REF-04 | Phase 1 | Complete |
| REF-05 | Phase 1 | Complete |
| REF-06 | Phase 1 | Complete |
| REF-07 | Phase 1 | Complete |
| STACK-01 | Phase 2 | Complete |
| STACK-02 | Phase 2 | Complete |
| STACK-03 | Phase 2 | Complete |
| STACK-04 | Phase 2 | Complete |
| STACK-05 | Phase 2 | Complete |
| STACK-06 | Phase 2 | Pending |
| STACK-07 | Phase 2 | Pending |
| STACK-08 | Phase 2 | Pending |
| STACK-09 | Phase 2 | Pending |
| STACK-10 | Phase 2 | Pending |
| STACK-11 | Phase 2 | Pending |
| STACK-12 | Phase 2 | Pending |
| STACK-13 | Phase 2 | Pending |
| UI-01 | Phase 3 | Pending |
| UI-02 | Phase 3 | Pending |
| UI-03 | Phase 3 | Pending |
| UI-04 | Phase 3 | Pending |
| UI-05 | Phase 3 | Pending |
| UI-06 | Phase 3 | Pending |
| UI-07 | Phase 3 | Pending |
| UI-08 | Phase 3 | Pending |
| OPS-01 | Phase 3 | Pending |
| OPS-02 | Phase 3 | Pending |
| OPS-03 | Phase 3 | Pending |
| MANN-01 | Phase 3 | Pending |
| MANN-02 | Phase 3 | Pending |
| MANN-03 | Phase 3 | Pending |
| MANN-04 | Phase 3 | Pending |
| BATCH-01 | Phase 3 | Pending |
| BATCH-02 | Phase 3 | Pending |
| STATE-01 | Phase 2 | Complete |
| STATE-02 | Phase 2 | Complete |
| STATE-03 | Phase 2 | Pending |
| STATE-04 | Phase 2 | Pending |
| CLEAN-01 | Phase 1 | Complete |
| CLEAN-02 | Phase 1 | Complete |
| CLEAN-03 | Phase 1 | Complete |

**Coverage:**
- v1 requirements: 48 total
- Mapped to phases: 48
- Unmapped: 0

---
*Requirements defined: 2026-03-24*
*Last updated: 2026-03-24 -- phase mappings added after roadmap creation*

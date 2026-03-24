# CATALOG.ENGINE — Production Jewelry Visual Service

## What This Is

A browser-based application that creates production-grade visuals of models wearing real jewelry products for brands. It takes locked base mannequin photos, places jewelry progressively using AI image editing with multi-reference fidelity, and exports production-ready images. The app is the operational core of a jewelry visual service business.

## Core Value

Production-grade jewelry placement on locked base photos with product fidelity, controllability, and repeatability — powered by a single image model with structured multi-reference inputs.

## Requirements

### Validated

- ✓ Product catalog import via URL scraping, CSV, image upload — existing
- ✓ Supabase product library with image storage — existing
- ✓ Mannequin generation via AI (text-to-image) — existing
- ✓ Mannequin post-generation refinement (hair, makeup, accessories, lighting, style) — existing
- ✓ Production photo generation (mannequin + single jewelry) — existing
- ✓ Iterative stacking on locked base image (progressive jewelry placement) — existing
- ✓ Jewelry fidelity pipeline (pHash + histogram comparison) — existing
- ✓ Photo Book multi-angle generation — existing
- ✓ Batch CSV-driven production processing — existing
- ✓ Browser-only architecture (no backend proxy) — existing
- ✓ API key in memory only (user-provided, never persisted) — existing
- ✓ Cross-engine data transfer (Catalog→Production, Mannequin→Production) — existing

### Active

- [ ] Unify all image generation/editing onto single model: `gemini-3.1-flash-image-preview`
- [ ] Structured multi-reference input system (ReferenceBundle with character/object/composition/style roles)
- [ ] Reference budget enforcement (max 14 refs: up to 4 character + up to 10 object)
- [ ] Reference prioritization logic with user-visible feedback
- [ ] Production Stack as primary workflow (locked base → ordered stack plan → progressive edits → validation)
- [ ] Stack planning layer with ordered jewelry layers and target zones
- [ ] Output format control (aspect ratio + resolution selection per session)
- [ ] Per-step validation during progressive stacking
- [ ] Multi-turn conversational follow-up edits after generation
- [ ] Creative Exploration mode (separate from Production Stack)
- [ ] Unified image service abstraction (single model, many workflows)
- [ ] Production Stack UI: base photo panel, output format panel, stack plan panel, reference bundle panel, generation progress panel, follow-up edit panel
- [ ] Mannequin engine demoted to base image preparation studio (same single model)
- [ ] Batch engine executes new production stack pipeline (after stabilization)

### Out of Scope

- Banner engine — deferred, risk of scope creep; reassess after Production Stack ships
- Multiple image model support — deliberate single-model architecture decision
- Backend proxy or server-side rendering — browser-only SPA by design
- User accounts or multi-tenant auth — single API key gate sufficient for v1 service
- Real-time collaboration — single-operator workflow
- Mobile-native app — web-first, responsive later

## Context

### Existing Codebase

The app is a brownfield React 19 + Vite + TailwindCSS + TypeScript SPA. Key facts:

- **5 engine tabs**: Catalog, Mannequin, Production, Batch, Banner
- **Service layer**: `geminiService.ts` (~2200 lines) handles all AI API calls via direct browser `fetch()` to `generativelanguage.googleapis.com`
- **Current models**: `gemini-3-pro-image-preview` (editing), `imagen-4.0-ultra-generate-001` (generation), `gemini-3-flash-preview` (text extraction)
- **State**: 4 Zustand stores (app, mannequin, production, banner)
- **Storage**: Supabase for product images + metadata
- **Best baseline**: Iterative stacking on existing base image (progressive jewelry placement) — this is the strongest production behavior and must be preserved

### Model Migration

Moving from 3 models to 1:
- `imagen-4.0-ultra-generate-001` → `gemini-3.1-flash-image-preview` (text-to-image)
- `gemini-3-pro-image-preview` → `gemini-3.1-flash-image-preview` (image editing)
- `gemini-3-flash-preview` → stays for text-only analytical tasks (catalog extraction)

The target model (`gemini-3.1-flash-image-preview`) supports:
- Text-to-image and image-to-image editing
- Multi-turn conversational editing
- Up to 14 reference images (4 character + 10 object)
- Explicit aspect ratio and image size selection (512 / 1K / 2K / 4K)
- Native thinking for complex visual tasks

### Product Truth

The app behaves as: **a progressive jewelry placement engine for production-grade visuals on locked existing photos, powered by a single image model capable of multi-reference editing.**

NOT: "Ask AI to generate multiple stacked jewels in one go and hope for the best."

### Two Modes

- **Production Stack** (main): locked base → ordered plan → structured references → progressive edits → validation → export
- **Creative Exploration** (secondary): looser prompts, concept generation, mood/style testing, lower determinism expectations

## Constraints

- **Single Image Model**: All image outputs must come from `gemini-3.1-flash-image-preview` — deliberate product/engineering choice for simpler architecture, unified debugging, consistent behavior
- **Browser-Only**: No backend proxy. All API calls from browser via `fetch()`. CORS supported by Google's API.
- **API Key In Memory**: User provides their own key at launch. Never persisted. Stored in Zustand.
- **Model Name Configurable**: `gemini-3.1-flash-image-preview` is the current preview ID. Wrap in single config constant — Google may rename on stable promotion.
- **Reference Budget**: Max 14 references per request (4 character + 10 object). System must prioritize and downselect gracefully.
- **Rate Limiting**: Preview models may have restrictive rate limits. Sequential stacking (not parallel) for production workflows.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Single image model (`gemini-3.1-flash-image-preview`) | Simpler architecture, unified debugging, consistent behavior, better multi-reference exploitation | — Pending |
| Multi-reference as first-class architecture | Model supports up to 14 refs; jewelry fidelity depends on structured reference passing | — Pending |
| Production Stack as primary workflow | Strongest existing baseline is iterative stacking on locked base; this formalizes it | — Pending |
| Banner engine deferred | Scope creep risk; not driving revenue; fold useful pieces later | — Pending |
| Mannequin demoted to base image studio | Its value is feeding Production Stack, not standalone generation | — Pending |
| Model ID in single config constant | Google renames preview models; one-place change | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-24 after initialization*

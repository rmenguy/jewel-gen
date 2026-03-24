---
phase: 01-unified-image-service-reference-architecture
plan: 02
subsystem: api
tags: [gemini, migration, single-model, cleanup, typescript]

# Dependency graph
requires: [01-01]
provides:
  - "All image functions migrated to IMAGE_MODEL via callUnifiedAPI"
  - "All text functions migrated to TEXT_MODEL via callUnifiedAPI"
  - "callImagenAPI and callGeminiAPI deleted"
  - "Zero references to gemini-3-pro-image-preview or imagen-4.0-ultra-generate-001"
  - "Banner tab hidden from navigation"
affects: [production-engine, mannequin-engine, batch-engine, banner-engine]

# Tech tracking
tech-stack:
  added: []
  patterns: [single-model-architecture, centralized-response-parsing, unified-base64-extraction]

key-files:
  created: []
  modified:
    - services/geminiService.ts
    - App.tsx

key-decisions:
  - "Deleted callGeminiAPI entirely -- text functions also use callUnifiedAPI(TEXT_MODEL) since both share the same generateContent endpoint"
  - "Removed gemini-3-pro-image-preview from all fallback model lists, replaced with TEXT_MODEL or removed"
  - "Banner tab hidden but BannerEngine component preserved for future re-enablement"

patterns-established:
  - "callUnifiedAPI is the ONLY low-level API caller in the service layer"
  - "parseImageResponse replaces all inline response.candidates[0].content.parts parsing"
  - "extractBase64 replaces all inline input.includes('base64,') ? input.split(',')[1] : input patterns"
  - "IMAGE_MODEL constant controls all image generation/editing calls from one place"
  - "TEXT_MODEL constant controls all text-only analytical calls from one place"

requirements-completed: [MODEL-01, MODEL-06, CLEAN-01, CLEAN-02, CLEAN-03]

# Metrics
duration: 7min
completed: 2026-03-24
---

# Phase 01 Plan 02: Migrate All Image Functions to Unified Service Summary

**All 24 image functions migrated to callUnifiedAPI(IMAGE_MODEL) with parseImageResponse, 4 text functions migrated to callUnifiedAPI(TEXT_MODEL), legacy callers deleted, Banner tab hidden**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-24T15:36:40Z
- **Completed:** 2026-03-24T15:44:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Migrated all image functions from gemini-3-pro-image-preview and imagen-4.0-ultra-generate-001 to IMAGE_MODEL (gemini-3.1-flash-image-preview) via callUnifiedAPI
- Migrated 2 Imagen :predict endpoint calls (generateMannequin, generateMannequinFromReference) to :generateContent format
- Migrated 4 text-only functions (extractShopifyCatalog, segmentJewelry, analyzeJewelryProduct, analyzeProductionReference) from callGeminiAPI to callUnifiedAPI(TEXT_MODEL)
- Replaced all inline response parsing with parseImageResponse() (22 usages)
- Replaced all inline base64 extraction with extractBase64() (33 usages)
- Deleted callImagenAPI function entirely
- Deleted callGeminiAPI function entirely
- Removed gemini-3-pro-image-preview from fallback model lists in generateMannequinFromReference and analyzeProductionReference
- Hidden Banner tab from desktop nav and mobile select dropdown
- Net reduction: 110 lines removed (120 added, 230 deleted)
- Build passes with zero errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate all 24 image functions to unified service and delete old model code** - `767330b` (feat)
2. **Task 2: Hide Banner tab and verify all engine imports still resolve** - `cdc8341` (feat)

## Files Created/Modified

- `services/geminiService.ts` - All image functions migrated to callUnifiedAPI + IMAGE_MODEL, all text functions migrated to callUnifiedAPI + TEXT_MODEL, callImagenAPI and callGeminiAPI deleted
- `App.tsx` - Banner tab removed from desktop nav array and mobile select dropdown

## Decisions Made

- Deleted callGeminiAPI entirely rather than keeping it for text functions, since callUnifiedAPI uses the same :generateContent endpoint
- Changed callUnifiedAPI log prefix from [GEMINI-UNIFIED] to [GEMINI] for consistency
- Removed gemini-3-pro-image-preview from all fallback model arrays, leaving only TEXT_MODEL and gemini-2.0-flash as fallbacks for text analysis
- applyBatchRefinements simplified from multi-model fallback to single IMAGE_MODEL call (previously tried gemini-3-flash then gemini-3-pro)
- Banner tab hidden but BannerEngine.tsx file and component mount preserved for future re-enablement

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None - all functions are fully wired to the unified service.

## Self-Check: PASSED

---
*Phase: 01-unified-image-service-reference-architecture*
*Completed: 2026-03-24*

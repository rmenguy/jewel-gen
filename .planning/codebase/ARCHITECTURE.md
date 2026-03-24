# Architecture

**Analysis Date:** 2026-03-24

## Pattern Overview

**Overall:** Single-Page Application (SPA) with Engine-based feature modules

**Key Characteristics:**
- No backend server — all API calls are made directly from the browser via `fetch()`
- Feature isolation through named "engines" (CATALOG, MANNEQUIN, PRODUCTION, BATCH, BANNER), each rendered as a persistent hidden/visible React component
- Global state managed by Zustand stores; local UI state kept in component-level `useState`
- API key held in memory only (never persisted to localStorage or cookies)

## Layers

**Entry / Bootstrap:**
- Purpose: Mount React app and load global CSS
- Location: `index.tsx`, `index.html`, `src/index.css`
- Contains: ReactDOM.createRoot call, React.StrictMode wrapper
- Depends on: `App.tsx`
- Used by: Browser/Vite

**Application Shell:**
- Purpose: API key gate, top navigation bar, engine tab routing, footer
- Location: `App.tsx`
- Contains: Auth wall rendering, engine tab switcher, cross-engine data transfer handlers (`handleCatalogTransfer`, `handleMannequinTransfer`)
- Depends on: `stores/useAppStore.ts`, `stores/useProductionStore.ts`, all engine components
- Used by: `index.tsx`

**Engine Components (Feature Modules):**
- Purpose: Each engine is a self-contained feature screen
- Location: `components/`
- Contains:
  - `CatalogEngine.tsx` — URL scraping + CSV/image upload, product list, transfer to Production
  - `MannequinEngine.tsx` — 3-panel layout: criteria config → AI generation → post-generation refinement + Photo Book
  - `ProductionEngine.tsx` — Production queue management, per-item AI photo generation, stacking mode, refine mode
  - `BatchEngine.tsx` — CSV-driven batch production processing with parallelism control
  - `BannerEngine.tsx` — 2-step banner creation: mannequin generation → iterative jewelry placement
- Depends on: `services/`, `stores/`, `types.ts`, `components/ui/`
- Used by: `App.tsx`

**Reusable UI Components:**
- Purpose: Shared presentational primitives with no business logic
- Location: `components/ui/`
- Contains: `PillButton.tsx`, `ConfigSlider.tsx`, `DropZone.tsx`, `PoseSelector.tsx`, `ColorSwatch.tsx`, `RangeSlider.tsx`, `SceneCard.tsx`
- Depends on: React, TailwindCSS
- Used by: Engine components

**Service Layer:**
- Purpose: All external I/O — AI API calls, Supabase, file downloads, pixel analysis
- Location: `services/`
- Contains:
  - `geminiService.ts` — All Gemini/Imagen REST calls; exposes named async functions per operation
  - `downloadService.ts` — Browser blob download utilities
  - `supabaseClient.ts` — Supabase client initialization (nullable when env vars absent)
  - `pixelCompare.ts` — Client-side perceptual hash + color histogram comparison (Canvas API, zero dependencies)
- Depends on: Browser `fetch()`, Canvas API, `@supabase/supabase-js`
- Used by: Engine components

**State Stores:**
- Purpose: Cross-component reactive state via Zustand
- Location: `stores/`
- Contains:
  - `useAppStore.ts` — API key, active engine tab
  - `useMannequinStore.ts` — Mannequin criteria, current/history images, Photo Book state, override params
  - `useProductionStore.ts` — Production queue, mannequin reference image, custom presets, bare mannequin cache
  - `useBannerStore.ts` — Banner workflow state (2-step: mannequin → jewelry placement)
- Depends on: `types.ts`, `services/geminiService.ts` (useAppStore calls `setApiKey`)
- Used by: Engine components

**Type Definitions:**
- Purpose: Shared TypeScript interfaces and enums
- Location: `types.ts`
- Contains: `Product`, `ProductionItem`, `BatchItem`, `MannequinCriteria`, `BannerJewelry`, `JewelryBlueprint`, `EngineType`, etc.
- Depends on: Nothing
- Used by: All layers

## Data Flow

**Catalog → Production Transfer:**

1. User scrapes URL or uploads images in `CatalogEngine.tsx`
2. `CatalogEngine` calls `onTransfer(products)` prop callback
3. `App.tsx` handler calls `useProductionStore.addProductsToQueue(products)` then `setActiveEngine('PRODUCTION')`
4. `ProductionEngine.tsx` renders the updated queue from store

**Mannequin → Production Transfer:**

1. User generates or refines a mannequin in `MannequinEngine.tsx`
2. User clicks "Use as Production Reference" (or equivalent button)
3. `MannequinEngine` reads `useMannequinStore.currentImage`, passes it up via prop callback
4. `App.tsx` calls `useProductionStore.setMannequinImage(image)` then `setActiveEngine('PRODUCTION')`

**AI Generation (Production Photo):**

1. `ProductionEngine.tsx` collects mannequin base64 + product image URL + prompt config
2. Calls `generateProductionPhoto(...)` from `services/geminiService.ts`
3. `geminiService.ts` calls `fetchImageAsBase64(url)` to resolve product image, then POSTs to `gemini-3-pro-image-preview:generateContent`
4. Response base64 image stored in `useProductionStore` queue item via `setQueue` updater
5. Component re-renders showing result image

**Jewelry Fidelity Pipeline:**

1. `generateProductionPhoto` generates initial result
2. `pixelCompare.ts` `compareJewelryCrops` runs perceptual hash + histogram on cropped jewelry region
3. If fidelity check fails, pipeline retries with enhanced prompt or falls back to composite approach (`dressWithJewelry`)

**State Management:**
- Zustand stores are the single source of truth for cross-engine data (queue, mannequin image, API key)
- Engine-local UI state (modals, loading flags, form inputs) lives in component `useState`
- `useProductionStore.customPresets` persisted to `localStorage` (only exception to in-memory-only rule)
- Bare mannequin cache (`bareCache`) is in-memory only, cleared on page refresh

## Key Abstractions

**Engine:**
- Purpose: A self-contained feature mode, independently mounted/unmounted via CSS `hidden` class
- Examples: `components/CatalogEngine.tsx`, `components/MannequinEngine.tsx`, `components/ProductionEngine.tsx`
- Pattern: Functional React component receiving props from `App.tsx`; reads its Zustand store directly

**Service Function:**
- Purpose: A named async function wrapping a single AI operation with retry logic
- Examples: `generateMannequin`, `generateProductionPhoto`, `generateStackedProductionPhoto`, `generateBookShot`, `refineMannequinImage` in `services/geminiService.ts`
- Pattern: `export const fn = async (...): Promise<string> => withRetry(async () => { ... })`

**ProductionItem:**
- Purpose: A unit of work in the production queue
- Examples: Created in `useProductionStore.addProductsToQueue`, updated via `setQueue` updater
- Pattern: `{ id, sku, name, imageUrl, category, status, resultImage, resultImages, ... }`

**JewelryBlueprint:**
- Purpose: AI-analyzed structured description of a jewelry piece for precise prompt injection
- Examples: Used in `generateProductionPhoto`, `addJewelryToExisting`, `BannerEngine`
- Pattern: `{ material, chainType, stoneShape, stoneSetting, pendantShape, finish, colorDetails, rawDescription }`

## Entry Points

**Browser Entry:**
- Location: `index.html` → `index.tsx`
- Triggers: Browser navigation to `localhost:3000`
- Responsibilities: Mount React app into `#root`

**App Shell:**
- Location: `App.tsx`
- Triggers: React tree render
- Responsibilities: API key gate, engine tab routing, inter-engine data transfer

**API Service:**
- Location: `services/geminiService.ts`
- Triggers: Called by engine components
- Responsibilities: All Gemini/Imagen REST calls, retry logic, prompt construction, image fetch with CORS fallback

## Error Handling

**Strategy:** Try/catch at the component level; service layer throws, components catch and set local error state

**Patterns:**
- `withRetry` in `geminiService.ts` retries on HTTP 429, 500, 503 with exponential backoff (up to 5 attempts)
- Components display error strings in UI (e.g., `setError(err.message)`)
- Supabase client is nullable (`null` when env vars missing); callers check `isSupabaseConfigured()` before use
- Image fetching falls back to `corsproxy.io` on CORS failure

## Cross-Cutting Concerns

**Logging:** `console.log`/`console.warn` with `[CATALOG.ENGINE]` or `[GEMINI]`/`[IMAGEN]` prefixes in `geminiService.ts`; no structured logging framework

**Validation:** Input validation is ad-hoc inside components (e.g., `if (!url.trim()) return`)

**Authentication:** Single API key gate in `App.tsx`; key stored in memory via `useAppStore` and module-level `API_KEY` variable in `geminiService.ts`; no user accounts or sessions

---

*Architecture analysis: 2026-03-24*

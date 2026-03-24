# CATALOG.ENGINE — Project Instructions (Web Version)

## Run the App

```bash
cd "/Users/jean-erasmebonaldi/Desktop/Applications/catalogue-engine-1902" && npm run dev
```

Opens at http://localhost:3000

## Build & Deploy

```bash
npm run build
```

Deploy to Vercel: push to GitHub, connect repo in Vercel dashboard.

## Architecture (Critical — Do NOT Change)

### API Calls (Direct Browser Fetch)
- **All Gemini API calls are made directly from the browser** via `fetch()` to `generativelanguage.googleapis.com`. CORS is supported by Google's API.
- **No backend proxy** — the user provides their own API key, stored in session memory via Zustand.
- The `@google/genai` SDK is NOT used. All API calls are raw REST via `fetch()`.

### File Handling
- **File uploads use `FileReader.readAsDataURL()`** — never use `URL.createObjectURL()` for files that need to be sent to the API.
- **Image fetching** (`fetchImageAsBase64` in geminiService.ts): direct `fetch()` first, falls back to `corsproxy.io` for CORS-blocked URLs.

### Downloads
- **All downloads use browser blob downloads** via `downloadService.ts`:
  - `downloadBase64Image(base64Data, filename)` — decodes base64 and triggers browser download
  - `downloadTextFile(content, filename)` — saves text content as file download

### State Management
- **Zustand** for global state (3 stores):
  - `stores/useAppStore.ts` — API key, active engine tab
  - `stores/useMannequinStore.ts` — mannequin generation criteria, image, refinement history
  - `stores/useProductionStore.ts` — production queue, mannequin reference

### Flexbox Viewport Rule
- Image viewer containers must use `min-h-0` on the `flex-1` element and `flex-shrink-0` on footer bars.

## Tech Stack

- **Frontend**: React 19 + Vite + TailwindCSS + TypeScript
- **State**: Zustand
- **Storage**: Supabase (product images + metadata)
- **AI**: Gemini API (REST, direct browser fetch)
- **Deployment**: Vercel (static SPA)
- **Theme**: Light with indigo/purple accents

### AI Models
- `gemini-3-flash-preview` — catalog extraction (`:generateContent` endpoint)
- `imagen-4.0-ultra-generate-001` — mannequin generation (`:predict` endpoint, text-to-image)
- `gemini-3-pro-image-preview` — production photos AND post-generation refinements (`:generateContent`, supports image input+output)

### API Key
- **No hardcoded API key** — the user enters their Gemini API key at app launch (stored in memory via Zustand, never persisted).
- The key is set via `useAppStore.setApiKey()` which calls `setApiKey()` in `services/geminiService.ts`.

### API Endpoints & Formats
- **Gemini models** (generateContent): `POST /v1beta/models/{model}:generateContent?key={KEY}`
- **Imagen models** (predict): `POST /v1beta/models/{model}:predict?key={KEY}`
- Both called directly from the browser via `fetch()`.

### Supabase
- **Database**: `products` table (id, name, sku, category, image_url, thumbnail_url, created_at, metadata)
- **Storage**: `product-images` bucket (public read)
- **Auth**: None (single-user, no RLS)
- **Client**: `services/supabaseClient.ts`
- **Env vars**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` in `.env.local`

### Troubleshooting API Errors
- **500 Internal Error**: Preview models can be unstable. The retry logic (`withRetry`) handles 500, 503, 429 with exponential backoff (up to 5 retries).
- **Model name changes**: Google renames preview models often. Check https://ai.google.dev/gemini-api/docs/models for current model IDs.
- **CORS errors on image fetch**: Falls back to `corsproxy.io` proxy automatically.

## Key Files

- `services/geminiService.ts` — All Gemini API logic (catalog, mannequin, production, refinement)
- `services/downloadService.ts` — Browser blob downloads
- `services/supabaseClient.ts` — Supabase client initialization
- `stores/useAppStore.ts` — Global app state (API key, navigation)
- `stores/useMannequinStore.ts` — Mannequin generation state + refinement history
- `stores/useProductionStore.ts` — Production queue state
- `components/MannequinEngine.tsx` — 3-panel mannequin generation (config / preview / refinement)
- `components/CatalogEngine.tsx` — Product catalog import (upload + scrape + Supabase library)
- `components/ProductBrowser.tsx` — Supabase product browser with upload/select
- `components/ProductionEngine.tsx` — Production photo generation
- `components/BatchEngine.tsx` — Batch production processing
- `components/ui/` — Reusable UI components (PillButton, ConfigSlider, PoseSelector, ColorSwatch, DropZone, SceneCard, RangeSlider)
- `types.ts` — All TypeScript interfaces

## Mannequin Engine (3-Panel Layout)

### Left Panel — Pre-Generation Configuration
- Model Ethnicity (PillButtons)
- Body Composition (Slider: Petite → Curvy)
- Dynamic Pose (4 icon buttons)
- Lighting Environment (PillButtons: Soft / Studio / Dramatic)
- Reset All Parameters

### Center — Preview
- Generated image with crop marks
- "Generate New Look" button
- Undo button (when history exists)
- AI status indicator

### Right Panel — Post-Generation Refinement
All refinements use `refineMannequinImage()` which sends the current image + modification prompt to `gemini-3-pro-image-preview`:
- Outfit Swap (drop garment image)
- Hair Tone (6 color swatches)
- Skin Retouching (slider 0-100%)
- Makeup (Natural / Editorial / Glamour / Bold)
- Accessories (Sunglasses / Earrings / Hat)
- Style (Editorial / Vintage / Film / Minimalist)
- Lighting (Soft / Studio / Dramatic)
- Scene Background (Minimalist Studio / Urban Loft)

---

## Current Implementation Plan (4 Features)

### Execution Order
1. Sautoir + Placements manquants → 2. Import photo pour refinement → 3. Stacking bijoux → 4. Photo Book

### Feature 1 — Sautoir + Placements bijoux manquants
**Files:** `services/geminiService.ts` (expand placement logic in `generateProductionPhoto()`), `components/ProductionEngine.tsx` (add "Sautoir" in category dropdown)

Enrichir les prompts de placement :
- **Sautoir** : "Long necklace hanging freely, falling to chest or waist level"
- **Collier** : "Necklace worn close to neck, on or just below collarbone"
- **Boucles** : "Earrings on earlobes, head angled to showcase, hair pulled back"
- **Bracelet** : "Bracelet on wrist, forearm visible"
- **Bague** : améliorer le prompt existant

### Feature 2 — Import photo existante pour refinement
**Files:** `components/MannequinEngine.tsx`

Permettre d'uploader un mannequin existant directement dans `currentImage` → active automatiquement le panneau refinement.
- Zone d'import dans le placeholder vide du panneau central
- Bouton "Import" dans la barre du bas (entre Undo et Generate)
- Handler : `FileReader.readAsDataURL()` → `pushToHistory` si image existante → `setCurrentImage`
- Pas de changement de store nécessaire

### Feature 3 — Stacking bijoux en production
**Files:** `services/geminiService.ts` (nouvelle fonction `generateStackedProductionPhoto()`), `components/ProductionEngine.tsx` (UI stacking mode)

Nouvelle fonction API : envoie mannequin + N images produit en un seul appel à `gemini-3-pro-image-preview` avec prompt "MULTIPLE JEWELRY STACKING".
- Bouton "Stack Mode" (toggle, style purple)
- En mode stacking : clics togglent sélection des items de la queue
- Bouton "Stack N Items" quand >= 2 sélectionnés
- Résultat ajouté comme nouvel item `STACK-sku1+sku2` dans la queue

### Feature 4 — Photo Book (multi-angles studio)
**Files:** `stores/useMannequinStore.ts` (état book), `services/geminiService.ts` (nouvelle `generateBookShot()` + `BOOK_ANGLES`), `components/MannequinEngine.tsx` (bouton + overlay)

Store : `bookImages: string[]`, `isGeneratingBook`, `bookProgress`

4 angles via `gemini-3-pro-image-preview` (image-to-image, préserve identité) :
- Front (portrait face, regard caméra)
- Profil Gauche 3/4
- Profil Droit 3/4
- Plan Large plein pied

UI : bouton "Generate Book" (purple) dans barre du bas → overlay 2×2 avec progression temps réel → download individuel + "Download All"

Génération séquentielle (pas parallèle) pour éviter le rate limiting.

<!-- GSD:project-start source:PROJECT.md -->
## Project

**CATALOG.ENGINE — Production Jewelry Visual Service**

A browser-based application that creates production-grade visuals of models wearing real jewelry products for brands. It takes locked base mannequin photos, places jewelry progressively using AI image editing with multi-reference fidelity, and exports production-ready images. The app is the operational core of a jewelry visual service business.

**Core Value:** Production-grade jewelry placement on locked base photos with product fidelity, controllability, and repeatability — powered by a single image model with structured multi-reference inputs.

### Constraints

- **Single Image Model**: All image outputs must come from `gemini-3.1-flash-image-preview` — deliberate product/engineering choice for simpler architecture, unified debugging, consistent behavior
- **Browser-Only**: No backend proxy. All API calls from browser via `fetch()`. CORS supported by Google's API.
- **API Key In Memory**: User provides their own key at launch. Never persisted. Stored in Zustand.
- **Model Name Configurable**: `gemini-3.1-flash-image-preview` is the current preview ID. Wrap in single config constant — Google may rename on stable promotion.
- **Reference Budget**: Max 14 references per request (4 character + 10 object). System must prioritize and downselect gracefully.
- **Rate Limiting**: Preview models may have restrictive rate limits. Sequential stacking (not parallel) for production workflows.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages
- TypeScript ~5.8.2 - All application code (components, services, stores)
- TSX - React component files under `components/`
- JavaScript - Config files (`tailwind.config.js`, `postcss.config.js`)
- HTML - Single entry point `index.html`
- CSS - Global styles at `src/index.css`
## Runtime
- Node.js v24.11.1 (development tooling only — app runs entirely in the browser)
- Target: ES2022 / ESNext (no server-side runtime)
- npm 11.6.2
- Lockfile: `package-lock.json` present
## Frameworks
- React 19.2.3 - UI rendering (`react`, `react-dom`)
- Vite 6.2.0 - Dev server and build tool
- TailwindCSS 3.4.19 - Utility-first styling
- Zustand 5.0.3 - Three independent stores (app, mannequin, production)
- `@vitejs/plugin-react` 5.1.4 - React Fast Refresh + JSX transform
- `autoprefixer` 10.4.24 - PostCSS vendor prefix handling
- `postcss` 8.5.6 - CSS processing pipeline
- `typescript` ~5.8.2 - Type checking and compilation
## Key Dependencies
- `@supabase/supabase-js` ^2.49.1 - Database and file storage client for product catalog
- `zustand` ^5.0.3 - Global state shared across all engine components
- No backend runtime dependencies — all API calls are raw `fetch()` from the browser
- `@google/genai` SDK is explicitly NOT used; Gemini is called via direct REST
## Configuration
- No `.env` file committed. Runtime config via `.env.local` (not in repo)
- Required vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- Gemini API key: entered by user at runtime, stored in Zustand memory only (never persisted)
- Vite exposes only `VITE_`-prefixed vars to the browser (`envPrefix: ['VITE_']` in `vite.config.ts`)
- `vite.config.ts` — Vite config, port 3000, alias `@` → project root
- `tsconfig.json` — Target ES2022, `bundler` module resolution, path alias `@/*` → `./*`
- `tailwind.config.js` — Content paths cover `index.tsx`, `App.tsx`, `components/**`, `services/**`
- `postcss.config.js` — PostCSS config for TailwindCSS + Autoprefixer
- `vercel.json` — Minimal: `buildCommand: npm run build`, `outputDirectory: dist`, `framework: vite`
## Platform Requirements
- Node.js (any recent LTS — tested on v24.11.1)
- Browser with CORS support for `generativelanguage.googleapis.com` (all modern browsers)
- Canvas API required in browser (used by `services/pixelCompare.ts` for image hashing)
- Vercel (static SPA, no server functions)
- All API calls originate from the end user's browser
- No CDN config beyond Vercel defaults
## TypeScript Configuration Highlights
- JSX transform: `react-jsx` (no need to import React in every file)
- `allowImportingTsExtensions: true` — `.ts`/`.tsx` extensions allowed in imports
- `noEmit: true` — Vite handles transpilation; `tsc` is type-check only
- Fonts loaded from Google Fonts CDN: `Inter` (sans) and `JetBrains Mono` (mono) via `index.html` preconnect
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Naming Patterns
- React components: PascalCase `.tsx` — `MannequinEngine.tsx`, `ProductionEngine.tsx`, `BannerEngine.tsx`
- UI sub-components: PascalCase `.tsx` in `components/ui/` — `PillButton.tsx`, `ConfigSlider.tsx`, `DropZone.tsx`
- Services: camelCase `.ts` — `geminiService.ts`, `downloadService.ts`, `supabaseClient.ts`
- Stores: camelCase with `use` prefix `.ts` — `useAppStore.ts`, `useMannequinStore.ts`, `useProductionStore.ts`
- Types file: lowercase singular — `types.ts`
- Event handlers: `handle` prefix + subject + verb — `handleMannequinUpload`, `handleExtract`, `handleApiKeySubmit`, `handleFileUpload`
- Async service exports: verb + noun — `generateMannequin`, `extractShopifyCatalog`, `fetchImageAsBase64`, `analyzeJewelryProduct`
- Store actions: verb + noun — `setApiKey`, `pushToHistory`, `addToQueue`, `clearBareCache`
- Internal helpers: camelCase — `callGeminiAPI`, `callImagenAPI`, `withRetry`, `toGrayscaleMatrix`
- camelCase throughout — `apiKeyInput`, `stackMannequinImage`, `isProcessing`
- Boolean state: `is` prefix — `isGenerating`, `isRefining`, `isStacking`, `isAnalyzing`
- Ref elements: `Ref` suffix — `fileInputRef`, `stackFileRef`, `inputRef`
- Sets: descriptive plural — `stackSelection`, `selectedForDownload`
- Interfaces: PascalCase with `I`-prefix omitted — `ProductionItem`, `MannequinCriteria`, `BatchConfig`
- Store interfaces: PascalCase + `Store` suffix — `AppStore`, `MannequinStore`, `ProductionStore`
- Props interfaces: component name + `Props` — `PillButtonProps`, `ConfigSliderProps`, `DropZoneProps`, `ProductionEngineProps`
- Enums: PascalCase — `ExtractionStatus`, `EngineType`
- Type aliases: PascalCase — `RefinementType`, `PoseKey`, `ExtractionLevel`
- SCREAMING_SNAKE_CASE for module-level constants — `CATALOG_SYSTEM_INSTRUCTION`, `GEMINI_BASE`, `PHASH_SIZE`, `BOOK_ANGLES`, `MAX_HISTORY`, `PROMPT_PRESETS`
- Record maps: camelCase + `Map` suffix — `vibeMap`, `skinMap`, `poseMap`, `ethnicityMap`, `hairCutMap`
## Code Style
- No `.prettierrc` or `.eslintrc` present — no enforced formatter configuration
- Indentation: 2 spaces (observed consistently)
- Single quotes for imports, double quotes for JSX attribute strings
- Trailing commas in multi-line objects and arrays
- Semicolons present
- No ESLint config found — no enforced lint rules
- TypeScript strict mode not explicitly enabled in `tsconfig.json`
- `skipLibCheck: true` in tsconfig
## Import Organization
- `@/` maps to project root (configured in `vite.config.ts` and `tsconfig.json`)
- In practice, relative imports `../` are used exclusively throughout the codebase
- Components use named exports for engine components — `export const CatalogEngine`
- UI components use default exports — `export default PillButton`, `export default DropZone`
- `Button.tsx` uses named export — `export const Button`
- Services use named function exports — `export function setApiKey`, `export const generateMannequin`
- Stores export the store hook directly — `export const useAppStore = create<AppStore>(...)`
- Types are all named exports from `types.ts`
## Error Handling
- `try/catch` with `err: any` typing in component handlers — errors extracted via `err.message || 'fallback string'`
- Service functions throw `new Error(...)` with descriptive messages including HTTP status codes
- API errors: `throw new Error(\`API error ${response.status}: ${errorText}\`)`
- Retry logic via `withRetry<T>()` in `services/geminiService.ts` — retries on 429, 500, 503 with exponential backoff (3s base × 2^attempt + random jitter up to 2s, max 5 retries)
- Fallback chains: `analyzeModels` array tried sequentially, falls back to simpler function on full failure
- State pattern in components: `setError(err.message)` + `setStatus(ExtractionStatus.ERROR)`
## Logging
- API calls logged with tagged prefix: `[GEMINI]`, `[IMAGEN]`, `[CATALOG.ENGINE]`
- Example: `console.log(\`[GEMINI] Calling ${model}, body size: ${body.length}\`)`
- Retry warnings: `console.warn(\`[CATALOG.ENGINE] Retrying in ${delay}ms...\`)`
- No structured logging library
## Comments
- JSDoc `/** ... */` blocks on all exported service functions
- Multi-step algorithms use inline section dividers: `// ── STEP 1: ... ──`
- Section separators in large files: `// ---------------------------------------------------------------------------`
- Local inline sub-components annotated: `// Inline sub-components (kept local to this file)`
- TODO/FIXME comments: none found in codebase
## Function Design
- All API-calling functions are `async` and return explicit Promise types
- Service functions always wrapped in `withRetry()` for resilience
- Arrow function syntax for exported service functions: `export const generateMannequin = async (...): Promise<string> => { ... }`
- Regular function syntax for utilities: `export function setApiKey(key: string): void`
- Destructured props in React components
- Options objects for complex parameters (criteria objects rather than many positional args)
- Optional parameters use `?` suffix in type definition
- Service functions return specific typed Promises — `Promise<string>` for images (base64), `Promise<ExtractionResult>` for catalog
- Components return `React.FC<Props>` typed JSX
## Component Design
- Functional components only — no class components
- `React.FC<PropsInterface>` explicit typing
- Inline sub-components co-located in the same file when small and only used locally (see `SectionLabel`, `ParamSection`, `ColorSwatch` in `components/MannequinEngine.tsx`)
- State grouped at the top of component body
- Handler functions (`handle*`) defined inside component before JSX return
- Immutable updates via spread: `set((state) => ({ criteria: { ...state.criteria, ...updates } }))`
- Functional updaters for derived state: `set((state) => ({ queue: state.queue.map(...) }))`
- Direct `get()` access for reading state in actions that need current state
## Module Design
- `types.ts` is the single source of truth for all shared types — no type duplication across files
- Services are stateless modules with function exports (exception: `geminiService.ts` holds module-level `API_KEY` variable)
- Stores are singletons via Zustand `create()`
- Not used — direct imports from specific files throughout
- `components/ui/` components imported individually: `import PillButton from './ui/PillButton'`
## TailwindCSS Patterns
- Conditional classes via template literals with ternary: `` `${active ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'}` ``
- Multi-line class strings formatted with backtick template literals for readability
- `transition-all duration-200` used consistently for interactive elements
- Indigo/purple accent color palette: `indigo-600` primary, `indigo-500` hover, `indigo-100` background tints
- `min-h-0` on `flex-1` containers, `flex-shrink-0` on footer bars (Flexbox Viewport Rule from CLAUDE.md)
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## Pattern Overview
- No backend server — all API calls are made directly from the browser via `fetch()`
- Feature isolation through named "engines" (CATALOG, MANNEQUIN, PRODUCTION, BATCH, BANNER), each rendered as a persistent hidden/visible React component
- Global state managed by Zustand stores; local UI state kept in component-level `useState`
- API key held in memory only (never persisted to localStorage or cookies)
## Layers
- Purpose: Mount React app and load global CSS
- Location: `index.tsx`, `index.html`, `src/index.css`
- Contains: ReactDOM.createRoot call, React.StrictMode wrapper
- Depends on: `App.tsx`
- Used by: Browser/Vite
- Purpose: API key gate, top navigation bar, engine tab routing, footer
- Location: `App.tsx`
- Contains: Auth wall rendering, engine tab switcher, cross-engine data transfer handlers (`handleCatalogTransfer`, `handleMannequinTransfer`)
- Depends on: `stores/useAppStore.ts`, `stores/useProductionStore.ts`, all engine components
- Used by: `index.tsx`
- Purpose: Each engine is a self-contained feature screen
- Location: `components/`
- Contains:
- Depends on: `services/`, `stores/`, `types.ts`, `components/ui/`
- Used by: `App.tsx`
- Purpose: Shared presentational primitives with no business logic
- Location: `components/ui/`
- Contains: `PillButton.tsx`, `ConfigSlider.tsx`, `DropZone.tsx`, `PoseSelector.tsx`, `ColorSwatch.tsx`, `RangeSlider.tsx`, `SceneCard.tsx`
- Depends on: React, TailwindCSS
- Used by: Engine components
- Purpose: All external I/O — AI API calls, Supabase, file downloads, pixel analysis
- Location: `services/`
- Contains:
- Depends on: Browser `fetch()`, Canvas API, `@supabase/supabase-js`
- Used by: Engine components
- Purpose: Cross-component reactive state via Zustand
- Location: `stores/`
- Contains:
- Depends on: `types.ts`, `services/geminiService.ts` (useAppStore calls `setApiKey`)
- Used by: Engine components
- Purpose: Shared TypeScript interfaces and enums
- Location: `types.ts`
- Contains: `Product`, `ProductionItem`, `BatchItem`, `MannequinCriteria`, `BannerJewelry`, `JewelryBlueprint`, `EngineType`, etc.
- Depends on: Nothing
- Used by: All layers
## Data Flow
- Zustand stores are the single source of truth for cross-engine data (queue, mannequin image, API key)
- Engine-local UI state (modals, loading flags, form inputs) lives in component `useState`
- `useProductionStore.customPresets` persisted to `localStorage` (only exception to in-memory-only rule)
- Bare mannequin cache (`bareCache`) is in-memory only, cleared on page refresh
## Key Abstractions
- Purpose: A self-contained feature mode, independently mounted/unmounted via CSS `hidden` class
- Examples: `components/CatalogEngine.tsx`, `components/MannequinEngine.tsx`, `components/ProductionEngine.tsx`
- Pattern: Functional React component receiving props from `App.tsx`; reads its Zustand store directly
- Purpose: A named async function wrapping a single AI operation with retry logic
- Examples: `generateMannequin`, `generateProductionPhoto`, `generateStackedProductionPhoto`, `generateBookShot`, `refineMannequinImage` in `services/geminiService.ts`
- Pattern: `export const fn = async (...): Promise<string> => withRetry(async () => { ... })`
- Purpose: A unit of work in the production queue
- Examples: Created in `useProductionStore.addProductsToQueue`, updated via `setQueue` updater
- Pattern: `{ id, sku, name, imageUrl, category, status, resultImage, resultImages, ... }`
- Purpose: AI-analyzed structured description of a jewelry piece for precise prompt injection
- Examples: Used in `generateProductionPhoto`, `addJewelryToExisting`, `BannerEngine`
- Pattern: `{ material, chainType, stoneShape, stoneSetting, pendantShape, finish, colorDetails, rawDescription }`
## Entry Points
- Location: `index.html` → `index.tsx`
- Triggers: Browser navigation to `localhost:3000`
- Responsibilities: Mount React app into `#root`
- Location: `App.tsx`
- Triggers: React tree render
- Responsibilities: API key gate, engine tab routing, inter-engine data transfer
- Location: `services/geminiService.ts`
- Triggers: Called by engine components
- Responsibilities: All Gemini/Imagen REST calls, retry logic, prompt construction, image fetch with CORS fallback
## Error Handling
- `withRetry` in `geminiService.ts` retries on HTTP 429, 500, 503 with exponential backoff (up to 5 attempts)
- Components display error strings in UI (e.g., `setError(err.message)`)
- Supabase client is nullable (`null` when env vars missing); callers check `isSupabaseConfigured()` before use
- Image fetching falls back to `corsproxy.io` on CORS failure
## Cross-Cutting Concerns
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->

# Codebase Structure

**Analysis Date:** 2026-03-24

## Directory Layout

```
catalogue-engine-1902/       # Project root
├── index.html               # HTML shell — mounts #root div
├── index.tsx                # React entry point — ReactDOM.createRoot
├── App.tsx                  # Application shell — API key gate, engine routing
├── types.ts                 # All TypeScript interfaces and enums
├── vite.config.ts           # Vite config — port 3000, alias @/ → root
├── tailwind.config.js       # TailwindCSS config
├── postcss.config.js        # PostCSS config
├── tsconfig.json            # TypeScript config
├── package.json             # Dependencies and scripts
├── vercel.json              # Vercel SPA deployment config
├── example-batch.csv        # Example CSV for BatchEngine
├── metadata.json            # App metadata
├── components/              # Feature engines + reusable UI
│   ├── CatalogEngine.tsx    # Catalog import engine
│   ├── MannequinEngine.tsx  # Mannequin generation + refinement engine
│   ├── ProductionEngine.tsx # Production photo generation engine
│   ├── BatchEngine.tsx      # Batch CSV processing engine
│   ├── BannerEngine.tsx     # Banner creation engine (2-step workflow)
│   ├── Button.tsx           # Generic button component
│   └── ui/                  # Reusable primitive UI components
│       ├── PillButton.tsx   # Toggle pill button
│       ├── ConfigSlider.tsx # Labeled range slider with display
│       ├── DropZone.tsx     # File drag-and-drop zone
│       ├── PoseSelector.tsx # Pose icon button group
│       ├── ColorSwatch.tsx  # Circular color swatch selector
│       ├── RangeSlider.tsx  # Raw range slider
│       └── SceneCard.tsx    # Scene background selection card
├── services/                # External I/O and utilities
│   ├── geminiService.ts     # All Gemini/Imagen API calls (2200+ lines)
│   ├── downloadService.ts   # Browser blob download helpers
│   ├── supabaseClient.ts    # Supabase client (nullable)
│   └── pixelCompare.ts     # Client-side pHash + histogram fidelity
├── stores/                  # Zustand state stores
│   ├── useAppStore.ts       # API key, active engine tab
│   ├── useMannequinStore.ts # Mannequin generation state + Photo Book
│   ├── useProductionStore.ts# Production queue, mannequin ref, presets
│   └── useBannerStore.ts    # Banner 2-step workflow state
├── src/                     # Global styles only
│   ├── index.css            # TailwindCSS directives + custom base styles
│   └── vite-env.d.ts        # Vite env type declarations
├── dist/                    # Build output (generated, not committed)
├── docs/                    # Internal planning docs
│   ├── plans/               # Implementation plans
│   └── superpowers/         # AI assistant plans/specs
├── .planning/               # GSD planning documents (this directory)
│   └── codebase/            # Codebase analysis documents
└── node_modules/            # Dependencies (not committed)
```

## Directory Purposes

**`components/`:**
- Purpose: All React components — both engine screens and reusable primitives
- Contains: Engine components (one per feature), `Button.tsx`, `ui/` subdirectory
- Key files: `MannequinEngine.tsx` (55KB), `ProductionEngine.tsx` (79KB), `BannerEngine.tsx` (25KB)

**`components/ui/`:**
- Purpose: Stateless/lightly-stateful UI primitives used across multiple engines
- Contains: Form controls and selection widgets with no business logic
- Key files: `PillButton.tsx`, `ConfigSlider.tsx`, `DropZone.tsx`, `PoseSelector.tsx`

**`services/`:**
- Purpose: All external I/O — AI API calls, file downloads, pixel processing
- Contains: One file per service concern
- Key files: `geminiService.ts` is the largest file in the codebase (~2200 lines)

**`stores/`:**
- Purpose: Zustand reactive state stores — cross-component shared state
- Contains: One store per domain (app, mannequin, production, banner)
- Key files: `useBannerStore.ts` (most complex, 2-step workflow with undo stacks)

**`src/`:**
- Purpose: Global CSS and Vite environment type declarations only
- Contains: `index.css` (TailwindCSS setup), `vite-env.d.ts`
- Note: Source files live at the root level, not in `src/`; this directory is intentionally minimal

## Key File Locations

**Entry Points:**
- `index.html`: HTML shell
- `index.tsx`: React bootstrap (root-level, not in `src/`)
- `App.tsx`: Application shell, engine router

**Configuration:**
- `vite.config.ts`: Build config, path alias `@` maps to project root
- `tailwind.config.js`: TailwindCSS configuration
- `tsconfig.json`: TypeScript settings
- `vercel.json`: Deployment rewrite rules for SPA routing

**Core Logic:**
- `types.ts`: All shared TypeScript types — read this first when adding features
- `services/geminiService.ts`: All AI operations — entry point for any AI feature work
- `services/pixelCompare.ts`: Jewelry fidelity pipeline — pHash + histogram comparison

**State:**
- `stores/useProductionStore.ts`: Production queue state with `localStorage` persistence for custom presets
- `stores/useMannequinStore.ts`: Mannequin image history with 10-item undo stack

**Styling:**
- `src/index.css`: Global TailwindCSS directives
- All component styles are inline TailwindCSS utility classes

## Naming Conventions

**Files:**
- Engine components: PascalCase with `Engine` suffix — `CatalogEngine.tsx`, `ProductionEngine.tsx`
- UI primitives: PascalCase — `PillButton.tsx`, `ConfigSlider.tsx`
- Services: camelCase — `geminiService.ts`, `downloadService.ts`, `supabaseClient.ts`
- Stores: camelCase with `use` prefix — `useAppStore.ts`, `useMannequinStore.ts`
- Types file: flat `types.ts` at root

**Exports:**
- Engine components: Named exports — `export const CatalogEngine: React.FC`
- UI primitives: Default exports — `export default PillButton`
- Services: Named exports — `export const generateMannequin`, `export function setApiKey`
- Stores: Named exports — `export const useAppStore = create<...>(...)`

**Types:**
- Interfaces: PascalCase — `Product`, `ProductionItem`, `MannequinCriteria`
- Enums: PascalCase with UPPER_SNAKE values — `ExtractionStatus.IDLE`, `ExtractionStatus.SUCCESS`
- Type aliases: PascalCase — `EngineType`, `RefinementType`, `PoseKey`

**Variables/Functions:**
- Handlers in components: `handle` prefix — `handleExtract`, `handleFileUpload`, `handleCatalogTransfer`
- Boolean state flags: `is` prefix — `isProcessing`, `isGenerating`, `isRefining`
- Store hooks: `use` prefix matching filename — `useAppStore`, `useMannequinStore`

## Where to Add New Code

**New Engine (feature screen):**
- Primary component: `components/NewEngine.tsx`
- State: `stores/useNewEngineStore.ts` (if cross-component state needed)
- Register in `EngineType` union: `types.ts` line 61
- Add to nav array in `App.tsx` line 100
- Mount with hidden/block pattern in `App.tsx` main section

**New AI Operation:**
- Implementation: Add named `export const` async function to `services/geminiService.ts`
- Follow pattern: `export const myOp = async (params): Promise<string> => withRetry(async () => { ... })`
- Import and call from the relevant engine component

**New Reusable UI Component:**
- Implementation: `components/ui/NewComponent.tsx`
- Use default export
- Accept typed props interface

**New Type:**
- Add to `types.ts` at the root level
- Export inline (no barrel file needed — `types.ts` is the barrel)

**New Service Utility:**
- Create `services/newService.ts` with named exports
- Keep each file focused on one external concern

## Special Directories

**`dist/`:**
- Purpose: Vite production build output
- Generated: Yes
- Committed: No (in `.gitignore`)

**`.planning/codebase/`:**
- Purpose: GSD codebase analysis documents (ARCHITECTURE.md, STRUCTURE.md, etc.)
- Generated: Yes (by GSD map-codebase command)
- Committed: Yes

**`docs/`:**
- Purpose: Internal planning documents and AI assistant specs
- Generated: Partially (AI-generated plans)
- Committed: Yes

**`node_modules/`:**
- Purpose: npm dependencies
- Generated: Yes
- Committed: No

---

*Structure analysis: 2026-03-24*

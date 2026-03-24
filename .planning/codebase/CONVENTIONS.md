# Coding Conventions

**Analysis Date:** 2026-03-24

## Naming Patterns

**Files:**
- React components: PascalCase `.tsx` — `MannequinEngine.tsx`, `ProductionEngine.tsx`, `BannerEngine.tsx`
- UI sub-components: PascalCase `.tsx` in `components/ui/` — `PillButton.tsx`, `ConfigSlider.tsx`, `DropZone.tsx`
- Services: camelCase `.ts` — `geminiService.ts`, `downloadService.ts`, `supabaseClient.ts`
- Stores: camelCase with `use` prefix `.ts` — `useAppStore.ts`, `useMannequinStore.ts`, `useProductionStore.ts`
- Types file: lowercase singular — `types.ts`

**Functions:**
- Event handlers: `handle` prefix + subject + verb — `handleMannequinUpload`, `handleExtract`, `handleApiKeySubmit`, `handleFileUpload`
- Async service exports: verb + noun — `generateMannequin`, `extractShopifyCatalog`, `fetchImageAsBase64`, `analyzeJewelryProduct`
- Store actions: verb + noun — `setApiKey`, `pushToHistory`, `addToQueue`, `clearBareCache`
- Internal helpers: camelCase — `callGeminiAPI`, `callImagenAPI`, `withRetry`, `toGrayscaleMatrix`

**Variables:**
- camelCase throughout — `apiKeyInput`, `stackMannequinImage`, `isProcessing`
- Boolean state: `is` prefix — `isGenerating`, `isRefining`, `isStacking`, `isAnalyzing`
- Ref elements: `Ref` suffix — `fileInputRef`, `stackFileRef`, `inputRef`
- Sets: descriptive plural — `stackSelection`, `selectedForDownload`

**Types/Interfaces:**
- Interfaces: PascalCase with `I`-prefix omitted — `ProductionItem`, `MannequinCriteria`, `BatchConfig`
- Store interfaces: PascalCase + `Store` suffix — `AppStore`, `MannequinStore`, `ProductionStore`
- Props interfaces: component name + `Props` — `PillButtonProps`, `ConfigSliderProps`, `DropZoneProps`, `ProductionEngineProps`
- Enums: PascalCase — `ExtractionStatus`, `EngineType`
- Type aliases: PascalCase — `RefinementType`, `PoseKey`, `ExtractionLevel`

**Constants:**
- SCREAMING_SNAKE_CASE for module-level constants — `CATALOG_SYSTEM_INSTRUCTION`, `GEMINI_BASE`, `PHASH_SIZE`, `BOOK_ANGLES`, `MAX_HISTORY`, `PROMPT_PRESETS`
- Record maps: camelCase + `Map` suffix — `vibeMap`, `skinMap`, `poseMap`, `ethnicityMap`, `hairCutMap`

## Code Style

**Formatting:**
- No `.prettierrc` or `.eslintrc` present — no enforced formatter configuration
- Indentation: 2 spaces (observed consistently)
- Single quotes for imports, double quotes for JSX attribute strings
- Trailing commas in multi-line objects and arrays
- Semicolons present

**Linting:**
- No ESLint config found — no enforced lint rules
- TypeScript strict mode not explicitly enabled in `tsconfig.json`
- `skipLibCheck: true` in tsconfig

## Import Organization

**Order (observed pattern):**
1. React and React hooks — `import React, { useState, useCallback, useRef } from 'react'`
2. Zustand stores — `import { useMannequinStore } from '../stores/useMannequinStore'`
3. Service functions — `import { generateMannequin } from '../services/geminiService'`
4. Types — `import { RefinementSelections } from '../types'`
5. UI components — `import PillButton from './ui/PillButton'`

**Path Aliases:**
- `@/` maps to project root (configured in `vite.config.ts` and `tsconfig.json`)
- In practice, relative imports `../` are used exclusively throughout the codebase

**Export Patterns:**
- Components use named exports for engine components — `export const CatalogEngine`
- UI components use default exports — `export default PillButton`, `export default DropZone`
- `Button.tsx` uses named export — `export const Button`
- Services use named function exports — `export function setApiKey`, `export const generateMannequin`
- Stores export the store hook directly — `export const useAppStore = create<AppStore>(...)`
- Types are all named exports from `types.ts`

## Error Handling

**Patterns:**
- `try/catch` with `err: any` typing in component handlers — errors extracted via `err.message || 'fallback string'`
- Service functions throw `new Error(...)` with descriptive messages including HTTP status codes
- API errors: `throw new Error(\`API error ${response.status}: ${errorText}\`)`
- Retry logic via `withRetry<T>()` in `services/geminiService.ts` — retries on 429, 500, 503 with exponential backoff (3s base × 2^attempt + random jitter up to 2s, max 5 retries)
- Fallback chains: `analyzeModels` array tried sequentially, falls back to simpler function on full failure
- State pattern in components: `setError(err.message)` + `setStatus(ExtractionStatus.ERROR)`

**Error State Pattern:**
```typescript
try {
  const data = await extractShopifyCatalog(cleanUrl);
  setResult(data);
  setStatus(ExtractionStatus.SUCCESS);
} catch (err: any) {
  setError(err.message || 'Une erreur est survenue.');
  setStatus(ExtractionStatus.ERROR);
}
```

## Logging

**Framework:** `console.log` / `console.warn`

**Patterns:**
- API calls logged with tagged prefix: `[GEMINI]`, `[IMAGEN]`, `[CATALOG.ENGINE]`
- Example: `console.log(\`[GEMINI] Calling ${model}, body size: ${body.length}\`)`
- Retry warnings: `console.warn(\`[CATALOG.ENGINE] Retrying in ${delay}ms...\`)`
- No structured logging library

## Comments

**When to Comment:**
- JSDoc `/** ... */` blocks on all exported service functions
- Multi-step algorithms use inline section dividers: `// ── STEP 1: ... ──`
- Section separators in large files: `// ---------------------------------------------------------------------------`
- Local inline sub-components annotated: `// Inline sub-components (kept local to this file)`
- TODO/FIXME comments: none found in codebase

**JSDoc Pattern:**
```typescript
/**
 * Call the Gemini API directly from the browser (CORS supported by Google).
 */
async function callGeminiAPI(model: string, requestBody: Record<string, unknown>): Promise<any>
```

## Function Design

**Async Functions:**
- All API-calling functions are `async` and return explicit Promise types
- Service functions always wrapped in `withRetry()` for resilience
- Arrow function syntax for exported service functions: `export const generateMannequin = async (...): Promise<string> => { ... }`
- Regular function syntax for utilities: `export function setApiKey(key: string): void`

**Parameters:**
- Destructured props in React components
- Options objects for complex parameters (criteria objects rather than many positional args)
- Optional parameters use `?` suffix in type definition

**Return Values:**
- Service functions return specific typed Promises — `Promise<string>` for images (base64), `Promise<ExtractionResult>` for catalog
- Components return `React.FC<Props>` typed JSX

## Component Design

**Pattern:**
- Functional components only — no class components
- `React.FC<PropsInterface>` explicit typing
- Inline sub-components co-located in the same file when small and only used locally (see `SectionLabel`, `ParamSection`, `ColorSwatch` in `components/MannequinEngine.tsx`)
- State grouped at the top of component body
- Handler functions (`handle*`) defined inside component before JSX return

**Zustand Store Pattern:**
```typescript
// Interface defines both state and actions
interface AppStore {
  apiKey: string;
  setApiKey: (key: string) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  apiKey: '',
  setApiKey: (key) => { /* side effects + */ set({ apiKey: key }); },
}));
```

**State Update Pattern:**
- Immutable updates via spread: `set((state) => ({ criteria: { ...state.criteria, ...updates } }))`
- Functional updaters for derived state: `set((state) => ({ queue: state.queue.map(...) }))`
- Direct `get()` access for reading state in actions that need current state

## Module Design

**Exports:**
- `types.ts` is the single source of truth for all shared types — no type duplication across files
- Services are stateless modules with function exports (exception: `geminiService.ts` holds module-level `API_KEY` variable)
- Stores are singletons via Zustand `create()`

**Barrel Files:**
- Not used — direct imports from specific files throughout
- `components/ui/` components imported individually: `import PillButton from './ui/PillButton'`

## TailwindCSS Patterns

**Class Organization:**
- Conditional classes via template literals with ternary: `` `${active ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'}` ``
- Multi-line class strings formatted with backtick template literals for readability
- `transition-all duration-200` used consistently for interactive elements
- Indigo/purple accent color palette: `indigo-600` primary, `indigo-500` hover, `indigo-100` background tints
- `min-h-0` on `flex-1` containers, `flex-shrink-0` on footer bars (Flexbox Viewport Rule from CLAUDE.md)

---

*Convention analysis: 2026-03-24*

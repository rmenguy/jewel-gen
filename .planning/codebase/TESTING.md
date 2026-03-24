# Testing Patterns

**Analysis Date:** 2026-03-24

## Test Framework

**Runner:**
- None configured — no test framework installed
- No `jest.config.*`, `vitest.config.*`, or equivalent found
- No `test` script in `package.json` (scripts: `dev`, `build`, `preview` only)

**Assertion Library:**
- None

**Run Commands:**
```bash
# No test commands available
npm run dev     # Development server only
npm run build   # Production build only
```

## Test File Organization

**Location:**
- No test files exist in the project source (`*.test.*` and `*.spec.*` patterns yield no matches outside `node_modules`)

**Coverage:**
- Zero test coverage — no unit, integration, or E2E tests written

## What Exists Instead of Tests

The codebase relies on the following runtime validation mechanisms rather than automated tests:

**TypeScript Compilation:**
- TypeScript with `tsconfig.json` — `noEmit: true`, `isolatedModules: true`
- Types centralized in `types.ts` act as a contract between layers
- `npm run build` (Vite + esbuild) serves as the primary type-check gate

**Manual Verification Patterns:**
- `pixelCompare.ts` implements client-side image fidelity scoring (pHash + color histogram) — this is production logic, not test logic, but validates AI-generated output quality at runtime
- API retry logic (`withRetry` in `services/geminiService.ts`) handles transient failures at runtime

**Build Validation:**
```bash
npm run build  # Type errors and import resolution errors surface here
```

## If Tests Were Added

Based on the codebase structure, the recommended approach would be:

**Recommended Framework:**
- Vitest — matches the Vite build toolchain already in use
- Add to `devDependencies`: `vitest`, `@testing-library/react`, `@testing-library/user-event`, `jsdom`

**Suggested Config (`vitest.config.ts`):**
```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
```

**Suggested Test File Placement:**
- Co-located next to source files: `services/geminiService.test.ts`, `stores/useAppStore.test.ts`
- Or in a `__tests__/` directory at project root

## Priority Areas for Test Coverage

**High Priority — Pure Logic (easiest to test, highest value):**

1. `services/pixelCompare.ts` — pure algorithmic functions with no external dependencies
   - `compareJewelryCrops()` — jewelry image fidelity scoring
   - `toGrayscaleMatrix()`, `computePHash()`, `buildHistogram()` — utility functions
   - These are canvas-based but can be tested with jsdom

2. `stores/` — Zustand store logic
   - `useMannequinStore.ts` — `pushToHistory`, `undo`, `toggleOverrideParam`, `resetAll`
   - `useProductionStore.ts` — `addProductsToQueue`, `updateItem`, `removeFromQueue`
   - `useAppStore.ts` — `setApiKey`

3. `services/downloadService.ts` — `downloadBase64Image`, `downloadTextFile`
   - MIME type detection logic
   - Base64 stripping logic

**Medium Priority — Service Functions with Mocked Fetch:**

4. `services/geminiService.ts` — mock `fetch` globally
   - `withRetry()` — retry behavior on 429/500/503
   - `extractShopifyCatalog()` — JSON parsing and URL normalization
   - `setApiKey()` / `getApiKey()`

**Lower Priority — Component Behavior:**

5. `components/ui/` — UI components are small and largely presentational
   - `PillButton` — active/inactive class switching
   - `DropZone` — drag events and FileReader invocation
   - `ConfigSlider` — onChange propagation

## Mocking Approach (If Added)

**API Mocking:**
```typescript
// Mock fetch globally in test setup
vi.stubGlobal('fetch', vi.fn());

// Per-test mock
(fetch as vi.Mock).mockResolvedValueOnce({
  ok: true,
  json: async () => ({ candidates: [{ content: { parts: [{ text: '{}' }] } }] }),
});
```

**FileReader Mocking:**
```typescript
// FileReader is used extensively for image uploads
vi.stubGlobal('FileReader', class {
  onloadend: (() => void) | null = null;
  result = 'data:image/png;base64,abc123';
  readAsDataURL(_file: File) { this.onloadend?.(); }
});
```

**Zustand Store Reset Between Tests:**
```typescript
// Reset store state between tests
beforeEach(() => {
  useMannequinStore.setState(DEFAULT_CRITERIA);
});
```

## Coverage

**Requirements:** None enforced (no configuration)

**Current state:** 0% — no tests exist

---

*Testing analysis: 2026-03-24*

# Technology Stack

**Analysis Date:** 2026-03-24

## Languages

**Primary:**
- TypeScript ~5.8.2 - All application code (components, services, stores)
- TSX - React component files under `components/`

**Secondary:**
- JavaScript - Config files (`tailwind.config.js`, `postcss.config.js`)
- HTML - Single entry point `index.html`
- CSS - Global styles at `src/index.css`

## Runtime

**Environment:**
- Node.js v24.11.1 (development tooling only — app runs entirely in the browser)
- Target: ES2022 / ESNext (no server-side runtime)

**Package Manager:**
- npm 11.6.2
- Lockfile: `package-lock.json` present

## Frameworks

**Core:**
- React 19.2.3 - UI rendering (`react`, `react-dom`)
- Vite 6.2.0 - Dev server and build tool
- TailwindCSS 3.4.19 - Utility-first styling

**State Management:**
- Zustand 5.0.3 - Three independent stores (app, mannequin, production)

**Build/Dev:**
- `@vitejs/plugin-react` 5.1.4 - React Fast Refresh + JSX transform
- `autoprefixer` 10.4.24 - PostCSS vendor prefix handling
- `postcss` 8.5.6 - CSS processing pipeline
- `typescript` ~5.8.2 - Type checking and compilation

## Key Dependencies

**Critical:**
- `@supabase/supabase-js` ^2.49.1 - Database and file storage client for product catalog
- `zustand` ^5.0.3 - Global state shared across all engine components

**Infrastructure:**
- No backend runtime dependencies — all API calls are raw `fetch()` from the browser
- `@google/genai` SDK is explicitly NOT used; Gemini is called via direct REST

## Configuration

**Environment:**
- No `.env` file committed. Runtime config via `.env.local` (not in repo)
- Required vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- Gemini API key: entered by user at runtime, stored in Zustand memory only (never persisted)
- Vite exposes only `VITE_`-prefixed vars to the browser (`envPrefix: ['VITE_']` in `vite.config.ts`)

**Build:**
- `vite.config.ts` — Vite config, port 3000, alias `@` → project root
- `tsconfig.json` — Target ES2022, `bundler` module resolution, path alias `@/*` → `./*`
- `tailwind.config.js` — Content paths cover `index.tsx`, `App.tsx`, `components/**`, `services/**`
- `postcss.config.js` — PostCSS config for TailwindCSS + Autoprefixer
- `vercel.json` — Minimal: `buildCommand: npm run build`, `outputDirectory: dist`, `framework: vite`

## Platform Requirements

**Development:**
- Node.js (any recent LTS — tested on v24.11.1)
- Browser with CORS support for `generativelanguage.googleapis.com` (all modern browsers)
- Canvas API required in browser (used by `services/pixelCompare.ts` for image hashing)

**Production:**
- Vercel (static SPA, no server functions)
- All API calls originate from the end user's browser
- No CDN config beyond Vercel defaults

## TypeScript Configuration Highlights

- JSX transform: `react-jsx` (no need to import React in every file)
- `allowImportingTsExtensions: true` — `.ts`/`.tsx` extensions allowed in imports
- `noEmit: true` — Vite handles transpilation; `tsc` is type-check only
- Fonts loaded from Google Fonts CDN: `Inter` (sans) and `JetBrains Mono` (mono) via `index.html` preconnect

---

*Stack analysis: 2026-03-24*

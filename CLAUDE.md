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

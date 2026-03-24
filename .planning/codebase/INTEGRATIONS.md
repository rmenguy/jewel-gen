# External Integrations

**Analysis Date:** 2026-03-24

## APIs & External Services

**AI / Generative:**
- Google Gemini API (`gemini-3-flash-preview`) — catalog extraction from e-commerce URLs
  - Endpoint: `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key={KEY}`
  - Called from: `services/geminiService.ts` → `extractShopifyCatalog()`
  - Uses Google Search grounding tool (`tools: [{ googleSearch: {} }]`)
  - Auth: user-supplied API key passed as query param

- Google Gemini API (`gemini-3-pro-image-preview`) — production photo generation and mannequin refinement
  - Endpoint: `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key={KEY}`
  - Called from: `services/geminiService.ts` → `generateProductionPhoto()`, `refineMannequinImage()`, `generateStackedProductionPhoto()`, `generateBookShot()`
  - Accepts image input + output (multimodal)
  - Auth: same user-supplied key

- Google Imagen API (`imagen-4.0-ultra-generate-001`) — text-to-image mannequin generation
  - Endpoint: `POST https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-ultra-generate-001:predict?key={KEY}`
  - Called from: `services/geminiService.ts` → `generateMannequin()`
  - Auth: same user-supplied key

**CORS Proxy (fallback):**
- `corsproxy.io` — fallback for fetching product images blocked by CORS
  - Usage: `https://corsproxy.io/?{encodeURIComponent(url)}`
  - Called from: `services/geminiService.ts` → `fetchImageAsBase64()` fallback path
  - No auth required

**Fonts:**
- Google Fonts CDN — `Inter` and `JetBrains Mono`
  - Loaded via `<link>` in `index.html`
  - Preconnect to `fonts.googleapis.com` and `fonts.gstatic.com`

## Data Storage

**Databases:**
- Supabase PostgreSQL — product catalog storage
  - Table: `products` (columns: `id`, `name`, `sku`, `category`, `image_url`, `thumbnail_url`, `created_at`, `metadata`)
  - Connection: `VITE_SUPABASE_URL` env var
  - Client: `@supabase/supabase-js` v2, initialized in `services/supabaseClient.ts`
  - Conditionally initialized — returns `null` if env vars absent (graceful degradation)
  - No RLS, no auth (single-user application)

**File Storage:**
- Supabase Storage bucket: `product-images` (public read)
  - Used for product image hosting
  - Connection: same Supabase client as database

**Browser Storage:**
- `localStorage` — custom production presets only
  - Key: `production-custom-presets`
  - Written/read in `stores/useProductionStore.ts`
  - No other persistent client-side storage

**In-Memory (session only):**
- Gemini API key — stored in Zustand `useAppStore` + module-level variable in `services/geminiService.ts`
  - Never written to `localStorage`, `sessionStorage`, or cookies
  - Lost on page refresh (by design)

**Caching:**
- No server-side cache
- Bare mannequin image cache: in-memory `bareCache` in `stores/useProductionStore.ts` (keyed by generation param hash, lives only for session duration)

## Authentication & Identity

**Auth Provider:**
- None — no user accounts, no authentication system
- Single-user application; Supabase used without RLS or auth
- Gemini API key is the only credential; user enters it at runtime via app UI

## Monitoring & Observability

**Error Tracking:**
- None — no Sentry, Datadog, or equivalent

**Logs:**
- `console.log` / `console.warn` throughout `services/geminiService.ts`
  - Pattern: `[GEMINI] Calling {model}, body size: {N}`
  - Pattern: `[CATALOG.ENGINE] Retrying in {N}ms... (Attempt {i}/{max})`
  - Pattern: `[FETCH] Direct fetch failed for {url}, trying CORS proxy...`

**Retry Logic:**
- `withRetry()` in `services/geminiService.ts` — exponential backoff with jitter
  - Retries on: 429, 500, 503, "overloaded", "deadline exceeded"
  - Max retries: 5
  - Base delay: `2^i * 3000ms + random(0-2000ms)`

## CI/CD & Deployment

**Hosting:**
- Vercel — static SPA deployment
  - Config: `vercel.json` (build command, output dir, framework hint)
  - Deploy trigger: push to GitHub, manual connect in Vercel dashboard

**CI Pipeline:**
- None detected — no GitHub Actions, no test runner configuration

## Environment Configuration

**Required env vars:**
- `VITE_SUPABASE_URL` — Supabase project URL (e.g., `https://xxxx.supabase.co`)
- `VITE_SUPABASE_ANON_KEY` — Supabase anon/public key

**Optional / runtime:**
- Gemini API key — not an env var; entered by user in the app UI at session start

**Secrets location:**
- `.env.local` at project root (not committed, not present in repo)
- No secrets committed to repository

## Webhooks & Callbacks

**Incoming:**
- None — no webhook endpoints (static SPA with no server)

**Outgoing:**
- None — all external calls are request/response, no push notifications or webhooks

---

*Integration audit: 2026-03-24*

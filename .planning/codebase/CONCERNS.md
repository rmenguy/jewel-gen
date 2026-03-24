# Codebase Concerns

**Analysis Date:** 2026-03-24

---

## Tech Debt

**Dead code: `_generateProductionPhotoFull` kept as rollback backup:**
- Issue: Full 3-step pipeline (harmonize + 3x correction loop) exported but never called. Adds ~80 lines of dead code. JSDoc says "kept for rollback" but no mechanism to activate it without a code edit.
- Files: `services/geminiService.ts` (line 763)
- Impact: Confuses readers, increases cognitive load when editing the production pipeline. The internal correction loop logic is duplicated between this function and the active `generateProductionPhoto`.
- Fix approach: Remove or move to a git branch. If kept intentionally, use a feature flag or remove the `export` to signal it is not in-use.

**`bareCache` parameter accepted but never used in active pipelines:**
- Issue: `generateProductionPhoto` and `generateStackedProductionPhoto` accept a `bareCache` parameter, but the bare mannequin cache flow (`generateBareMannequin` → cache → `dressWithJewelry`) is wired in `ProductionEngine.tsx` but the cache is passed as `undefined` in several call sites.
- Files: `services/geminiService.ts` (lines 646, 770, 1008), `components/ProductionEngine.tsx`
- Impact: The bare cache optimization (avoid regenerating bare mannequin per product) may not be consistently applied, causing redundant expensive API calls.
- Fix approach: Audit all call sites of `generateProductionPhoto` and `generateStackedProductionPhoto` to confirm the cache adapter is always passed.

**Duplicated placement prompt logic across three functions:**
- Issue: Necklace/sautoir/ring/earring/bracelet placement strings are copy-pasted in `generateProductionPhoto`, `_generateProductionPhotoFull`, and `dressWithJewelry`. Any change to placement language must be replicated in three places.
- Files: `services/geminiService.ts` (lines 668–680, 784–789, 1397–1408)
- Impact: Placement improvements or bug fixes applied to one function silently miss the others.
- Fix approach: Extract placement descriptions into a shared `buildPlacementPrompt(category: string): string` helper and call it from all three functions.

**Inline `ethnicityMap` duplicated in two exported functions:**
- Issue: The `ethnicityMap` record is defined twice — once in `generateMannequin` (line 233) and again in `generateMannequinFromReference` (line 366). Identical contents.
- Files: `services/geminiService.ts` (lines 233–240, 366–373)
- Impact: Adding or renaming an ethnicity requires two edits.
- Fix approach: Hoist to a module-level constant.

**`geminiService.ts` is a 2197-line monolith:**
- Issue: All AI functionality — catalog extraction, mannequin generation, production photo pipeline, stacking, book shots, banner generation, refinements, segmentation, jewelry analysis — lives in a single file.
- Files: `services/geminiService.ts`
- Impact: High merge conflict risk, slow navigation, difficult onboarding. Related functions are spread throughout the file rather than grouped by domain.
- Fix approach: Split into domain-scoped modules: `services/ai/catalog.ts`, `services/ai/mannequin.ts`, `services/ai/production.ts`, `services/ai/banner.ts`, `services/ai/refinement.ts`, with a shared `services/ai/core.ts` for `callGeminiAPI`, `callImagenAPI`, `withRetry`, `fetchImageAsBase64`.

**`ProductionEngine.tsx` and `MannequinEngine.tsx` are oversized single components:**
- Issue: `ProductionEngine.tsx` is 1227 lines; `MannequinEngine.tsx` is 1195 lines. Both contain multiple logically separate sub-features (stacking mode, reference analysis modal, refinement panel, etc.) as inline code.
- Files: `components/ProductionEngine.tsx`, `components/MannequinEngine.tsx`
- Impact: Hard to navigate, reason about, or test individual sub-features.
- Fix approach: Extract stacking UI, refinement panels, reference analysis modal into separate child components.

**`localStorage` accessed directly inside Zustand store initializer:**
- Issue: `useProductionStore.ts` calls `localStorage.getItem(...)` at module parse time (line 72) to initialize `customPresets`. This runs during SSR/test environments without a DOM, and the store is not hydrated from localStorage on write (only synchronizes on `add`/`remove`).
- Files: `stores/useProductionStore.ts` (lines 72–86)
- Impact: Will throw in non-browser contexts. No hydration strategy means if the app is opened in a second tab, data can get out of sync between tabs.
- Fix approach: Use `zustand/middleware` `persist` middleware, or wrap the `localStorage` read in a `typeof window !== 'undefined'` guard.

---

## Known Bugs

**`BatchEngine` type mismatch — `generateProductionPhoto` returns `string[]`, stored as `string`:**
- Symptoms: `generateProductionPhoto` returns `Promise<string[]>` (dual-output variants). `BatchEngine` assigns the result to `resultImage` (typed `string`) without handling the array. The first array element is never extracted.
- Files: `components/BatchEngine.tsx` (lines 92–103), `services/geminiService.ts` (line 639)
- Trigger: Running any batch job. The `resultImage` field receives a `string[]` value cast to `string` at runtime.
- Workaround: None. Batch results currently display incorrectly or may silently fail if the component tries to render the value as an image src.

**`isPaused` closure bug in `BatchEngine.processBatch`:**
- Symptoms: Pressing "Pause" during batch processing has no effect on in-flight items. The `isPaused` state variable is captured by closure at the time `processBatch` starts; the `processItem` function reads the captured stale value, not the updated React state.
- Files: `components/BatchEngine.tsx` (lines 84, 135)
- Trigger: Click Pause while a batch is running.
- Workaround: None. Must wait for batch to finish or reload the page.

**`updateStats` reads stale `batchItems` state:**
- Symptoms: Stats (total, pending, completed, failed) may be incorrect after parallel batch runs. `updateStats` reads `batchItems` from component closure at invocation time, not the latest React state.
- Files: `components/BatchEngine.tsx` (lines 149–157)
- Trigger: Processing multiple items in parallel; stats counter does not reliably update mid-run.
- Workaround: Stats may show correct values after the batch fully completes due to a final re-render.

**`isModeLivre` detection always true when `overrideParams` is passed:**
- Symptoms: In `generateMannequin` and `generateMannequinFromReference`, `isModeLivre` is set to `overrideParams !== undefined`. Since the caller always passes the array (even as an empty array `[]`), this condition is always `true` when `overrideParams` is provided at all, meaning "normal mode" is never used from callers that always pass the parameter.
- Files: `services/geminiService.ts` (lines 261, 429)
- Trigger: Calling `generateMannequin(criteria, [])` intending normal mode but getting "mode libre with no overrides" instead.
- Workaround: The distinction between "mode libre with empty overrides" and "normal mode" only works if the caller passes `undefined`, not `[]`. The comment on line 260 documents this intent but it is fragile.

---

## Security Considerations

**API key stored in module-level mutable variable:**
- Risk: `API_KEY` is a module-level `let` in `geminiService.ts` (line 42). In non-CSP environments, any JS running on the page could call `getApiKey()` to retrieve it. Although no persistent storage is used, the key lives in module scope for the session.
- Files: `services/geminiService.ts` (lines 42–50)
- Current mitigation: Key is not persisted to localStorage/sessionStorage. Session-only via Zustand. `getApiKey()` export is the only concern.
- Recommendations: Consider removing the `getApiKey()` export if it is not strictly needed. The key only needs to flow into `callGeminiAPI` and `callImagenAPI`.

**API key visible in all network requests:**
- Risk: The Gemini API key is appended as a URL query parameter (`?key=${API_KEY}`) in every API call. It appears in plain text in browser DevTools Network tab and in any server-side request logs.
- Files: `services/geminiService.ts` (lines 57, 79)
- Current mitigation: This is Google's documented approach for browser-direct calls. No backend proxy is used by design.
- Recommendations: Document in README that this is intentional and the key should be a restricted API key (domain-restricted in Google Cloud Console).

**No validation on API key format before use:**
- Risk: Any string is accepted as an API key. Malformed keys fail at the first API call, leaking the bad key in the error message if `API error 400: ...` surfaces to the user.
- Files: `App.tsx` (line 27), `stores/useAppStore.ts` (line 17)
- Current mitigation: None.
- Recommendations: Add a regex check for `AIza[0-9A-Za-z-_]{35}` before calling `setApiKey`.

**External CORS proxy (`corsproxy.io`) used for image fetching:**
- Risk: Product images fetched via `https://corsproxy.io/?...` are routed through a third-party service. The proxy operator can log all fetched URLs and image content.
- Files: `services/geminiService.ts` (line 602)
- Current mitigation: Only triggered as a fallback when direct fetch fails. Most CDN images load directly.
- Recommendations: Self-host a CORS proxy or use a Cloudflare Worker as a controlled intermediary if the images contain proprietary product photography.

---

## Performance Bottlenecks

**Large base64 images held in React state and Zustand stores:**
- Problem: Generated images (mannequin, production variants, stacking results, book shots) are stored as full base64 data URIs in React state and Zustand stores. A single 4K image can be 3–8 MB as base64. Multiple variants accumulate in memory for the session.
- Files: `stores/useMannequinStore.ts` (imageHistory, bookImages), `stores/useProductionStore.ts` (queue items with resultImages), `components/ProductionEngine.tsx` (stackResults)
- Cause: No off-loading to Blob URLs or Supabase storage for generated outputs. History array capped at 10 entries for mannequin but not for production queue.
- Improvement path: Use `URL.createObjectURL(blob)` for display-only references (note: cannot be sent to API — must remain base64 for API calls), or upload generated images to Supabase and store only the URL in state.

**Dual-output pipeline makes 2 parallel API calls per production item:**
- Problem: `generateProductionPhoto` calls `callGeminiAPI` twice per item (two pose variants via `Promise.all`), each followed by `segmentJewelry` + `compositeJewelryOnModel` + `harmonizeJewelryComposite` — making up to 8 API calls per production item.
- Files: `services/geminiService.ts` (lines 654–755)
- Cause: Dual-output design for quality improvement via variant selection.
- Improvement path: Add a toggle in the UI to run single-pass mode for faster throughput when quality iteration is less critical.

**BatchEngine allows up to 5 parallel calls; no rate limit awareness:**
- Problem: `config.parallelCount` defaults to 5, meaning 5 × up to 8 API calls = 40 simultaneous requests. Gemini preview models have strict concurrency limits; this will trigger 429 errors reliably for any batch > 5 items.
- Files: `components/BatchEngine.tsx` (lines 14, 134–138)
- Cause: `withRetry` handles 429 with backoff at the individual call level, but 5 parallel requests can all hit rate limits simultaneously, causing cascading retries.
- Improvement path: Reduce default `parallelCount` to 1–2 for preview models, or implement a token bucket / semaphore pattern.

**DCT2D in `pixelCompare.ts` is O(n³) naive implementation:**
- Problem: The custom 2D DCT used for perceptual hashing is an O(n³) implementation (32×32 matrix, nested loops). Each call creates multiple canvas elements and performs a full matrix computation.
- Files: `services/pixelCompare.ts` (lines 88–128)
- Cause: Zero-dependency implementation avoids external libraries.
- Improvement path: This runs client-side on every production iteration (up to 4 times per item in correction loops), but the input is only 32×32 so the actual wall time is small. Acceptable for now; flag for review if profiling shows it contributing to jank.

---

## Fragile Areas

**Model name hardcoding throughout `geminiService.ts`:**
- Files: `services/geminiService.ts` (lines 131, 332, 395, 491, 561, 713, 803, 1108, 1364, 1602, 1800, 1831, 1905, 2035, 2121, 2181)
- Why fragile: Google frequently renames or deprecates preview models (e.g., `gemini-3-flash-preview`, `gemini-3-pro-image-preview`). When a model is renamed, each callsite must be updated individually. CLAUDE.md acknowledges this risk but there is no single constant to update.
- Safe modification: Define module-level constants at the top of `geminiService.ts`: `const MODEL_FLASH = 'gemini-3-flash-preview'` and `const MODEL_PRO_IMAGE = 'gemini-3-pro-image-preview'`, and replace all inline strings.
- Test coverage: None — no tests exist for this service.

**`segmentJewelry` fallback returns full-image bounding box:**
- Files: `services/geminiService.ts` (lines 1560–1567)
- Why fragile: When the Gemini JSON parse fails, `segmentJewelry` silently returns `box_2d: [0, 0, 1000, 1000]` (the entire image). Downstream `compositeJewelryOnModel` then treats the entire image as the jewelry region, erasing the full image with a sampled background color and compositing the product over the whole frame.
- Safe modification: Add a warning visible to the user when the fallback fires. Consider aborting the composite step and returning the un-composited dressed image instead.
- Test coverage: None.

**`compositeJewelryOnModel` erases the jewelry region using sampled surrounding pixels:**
- Files: `services/pixelCompare.ts` (lines 376–411)
- Why fragile: The erase step samples 8px border pixels and fills the bounding box with the average color. On complex backgrounds or at clothing borders, this creates a visible flat-color patch before the product image is overlaid. If the product image is fully transparent after background removal, the patch is visible.
- Safe modification: Expand the feathering fallback (currently `ctx.globalAlpha = 0.6` re-draw) or add inpainting as a Gemini call when background is complex.
- Test coverage: None.

**`withRetry` retries on string match against error messages:**
- Files: `services/geminiService.ts` (lines 107–115)
- Why fragile: Retry detection uses `.includes("500")` on the error message string. Any error message that happens to contain the string "500" (e.g., a product named "500 Gold Chain") would trigger a retry.
- Safe modification: Parse the HTTP status code numerically from the response before throwing, and include the numeric code in a structured error object rather than embedding it in a string.
- Test coverage: None.

**CSV parsing in `BatchEngine` uses naive `line.split(',')`:**
- Files: `components/BatchEngine.tsx` (line 43)
- Why fragile: Fields containing commas (e.g., product names like "Ring, Gold, 18K") will be split incorrectly. No quoted-field handling.
- Safe modification: Use a proper CSV parser library (e.g., `papaparse`) or at minimum support quoted fields.
- Test coverage: None.

---

## Scaling Limits

**In-memory image storage:**
- Current capacity: Depends on browser heap. A 10-item production queue with dual-output variants can hold ~100 MB of base64 images in-memory.
- Limit: Browser tab crashes with memory pressure beyond ~500 MB on most machines. A batch of 50+ items with saved result images will approach this.
- Scaling path: Persist generated images to Supabase Storage and store only URLs in state. Load images on-demand for display.

**Gemini preview model API quotas:**
- Current capacity: Unknown — depends on user's API key tier.
- Limit: Preview models have strict RPM and TPD limits. The dual-output pipeline's 8 calls/item × 5 parallel = 40 calls/minute minimum for a 5-item batch.
- Scaling path: Add per-user quota tracking and graceful degradation to single-pass mode when approaching limits.

---

## Dependencies at Risk

**Preview AI models (`gemini-3-flash-preview`, `gemini-3-pro-image-preview`, `imagen-4.0-ultra-generate-001`):**
- Risk: All three models are in "preview" status. Google regularly renames, graduates, or removes preview models. The app will silently break (500 errors) when a model is renamed or retired.
- Impact: Complete loss of all AI functionality.
- Migration plan: Monitor https://ai.google.dev/gemini-api/docs/models. Add a model health check endpoint at app startup that validates all three model names are reachable.

**`corsproxy.io` (third-party, free, uncontrolled):**
- Risk: Free public proxy service; no SLA. Can be rate-limited, go down, or start charging.
- Impact: Product images from CORS-blocking CDNs fail to load, breaking the production pipeline for those items.
- Migration plan: Replace with a Cloudflare Worker or Vercel Edge Function acting as a controlled CORS proxy.

---

## Missing Critical Features

**No error boundary in React tree:**
- Problem: Any unhandled render error in a component (e.g., invalid base64 string rendered as `<img src>`) will crash the entire app with a blank white screen.
- Blocks: User experience — a single bad API response destroys the session.
- Recommended fix: Wrap each engine tab in a `<React.ErrorBoundary>` with a "reset this panel" recovery UI.

**No API key validation feedback:**
- Problem: If the user enters a wrong or expired API key, no error is shown until the first API call fails. The error surface is generic (`API error 400: ...` or similar). No distinction between wrong key, expired key, or quota exceeded.
- Blocks: Onboarding — new users with a fresh key get no confirmation until they attempt their first generation.
- Recommended fix: Add a key validation call (e.g., a minimal `generateContent` request) immediately after key entry, with a clear "Key valid" / "Key invalid" status.

**No progress persistence across page reloads:**
- Problem: All in-progress and completed production queue items, mannequin state, and stacking results are lost on page reload (Zustand stores are not persisted). Users lose work on accidental refresh.
- Blocks: Production workflows longer than a browser session.
- Recommended fix: Use `zustand/middleware` `persist` for the production queue and mannequin current image. Store base64 images in IndexedDB (too large for localStorage).

---

## Test Coverage Gaps

**Zero test files exist:**
- What's not tested: Everything — API service functions, Zustand store reducers, pixel comparison algorithms, CSV parsing, image compositing, component rendering.
- Files: All of `services/`, `stores/`, `components/`
- Risk: Regressions in core pipeline logic (placement prompts, retry logic, pixel composite) are invisible until a user reports a problem.
- Priority: High — start with `services/pixelCompare.ts` (pure functions, no DOM dependencies) and store reducers.

**`pixelCompare.ts` DCT and histogram functions are untested:**
- What's not tested: Correctness of `computePHash`, `hammingDistance`, `computeHSVHistogram`, `histogramCorrelation`. The pass/fail thresholds (`PHASH_THRESHOLD = 8`, `HISTOGRAM_THRESHOLD = 0.75`) were set empirically but never validated against a regression suite.
- Files: `services/pixelCompare.ts`
- Risk: A subtle bug in the DCT implementation (e.g., the boundary condition at line 138 excluding DC coefficient [0,0]) could cause false pass/fail results silently, sending users correction loops that cycle incorrectly.
- Priority: High.

**Retry logic in `withRetry` is untested:**
- What's not tested: Exponential backoff timing, maximum retry count, which error strings trigger retries vs. immediate failure.
- Files: `services/geminiService.ts` (lines 100–127)
- Risk: The string-match retry detection (`.includes("500")`) has edge cases that could cause infinite loop scenarios or missed retries.
- Priority: Medium.

---

*Concerns audit: 2026-03-24*

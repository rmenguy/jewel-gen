# Enhanced Jewelry Stacking — Design Spec

## Summary

Enhance the existing Stack Mode in ProductionEngine to support:
1. **Importing a mannequin/pose photo** via file upload as the base for stacking
2. **Multiple attempts** (1-6 variants generated sequentially, displayed in a grid)
3. **Aspect ratio selection** before generation
4. **Per-variant retry** and individual/bulk download

## Affected Files

- `components/ProductionEngine.tsx` — UI changes (config bar, variant grid, new local state)
- `services/geminiService.ts` — add `aspectRatio` parameter to `generateStackedProductionPhoto`

## UI Design

### Config Bar (visible when Stack Mode is active)

Appears between the queue header and the product grid. Single row, 3 sections:

1. **Upload Pose**: Compact zone — thumbnail preview (48x48) + "Upload Pose" button + "x" to clear. Uses `FileReader.readAsDataURL()`. Stored in local state `stackMannequinImage`. If not set, falls back to store's `mannequinImage` (current behavior preserved).

2. **Attempts**: Pill buttons `1 | 2 | 3 | 4 | 6`. Default: `1`. State: `stackAttempts`.

3. **Ratio**: Pill buttons `1:1 | 3:4 | 4:3 | 9:16 | 16:9`. Default: `1:1`. State: `stackRatio`.

### Variant Grid (in the preview panel)

Replaces the single-image preview when stacking with N > 1:

| Attempts | Layout |
|----------|--------|
| 1        | Full panel (current behavior) |
| 2        | 2 columns, 1 row |
| 3-4      | 2 columns, 2 rows |
| 6        | 3 columns, 2 rows |

Each cell contains:
- Generated image (or spinner while generating)
- Badge `#1`, `#2`... top-left
- **Retry** button (refresh icon) — regenerates only this variant
- **Download** button (arrow icon)
- Click image → overlay zoom
- Purple border when selected as favorite

Footer below grid:
- "Download All" button (visible when N > 1)
- Clicking a variant as favorite → creates STACK ProductionItem in queue

## API Changes

### `generateStackedProductionPhoto` — new parameter

```ts
export const generateStackedProductionPhoto = async (
    mannequinBase64: string | null,
    products: Array<{ imageUrl: string; category: string; name: string; blueprint?: JewelryBlueprint; dimensions?: ProductDimensions }>,
    artisticDirection: string,
    bareCache?: { get: (key: string) => string | undefined; set: (key: string, img: string) => void },
    aspectRatio?: string  // NEW — "1:1", "3:4", "4:3", "9:16", "16:9"
): Promise<string>
```

The `aspectRatio` is injected into `generationConfig.imageConfig`:
```ts
imageConfig: {
    imageSize: '4K',
    ...(aspectRatio && { aspectRatio }),
}
```

No other API logic changes — the prompt, placement map, blueprints, pixel validation all remain identical.

### Multiple attempts

Handled in the caller (ProductionEngine), NOT in the service function. The component calls `generateStackedProductionPhoto` N times sequentially (to respect Gemini rate limits). Each result updates `stackResults[i]` so the grid fills progressively.

### Per-variant retry

Calls `generateStackedProductionPhoto` once with the same parameters, replaces `stackResults[i]`.

## State (all local to ProductionEngine)

| State | Type | Default | Purpose |
|-------|------|---------|---------|
| `stackMannequinImage` | `string \| null` | `null` | Uploaded pose photo (base64 data URI) |
| `stackAttempts` | `number` | `1` | Number of variants to generate |
| `stackRatio` | `string` | `"1:1"` | Aspect ratio for generation |
| `stackResults` | `(string \| null)[]` | `[]` | Array of N results (null = generating) |
| `stackGenerating` | `boolean` | `false` | Whether generation is in progress |

No store changes needed.

## User Flow

1. Activate "Stack Mode" toggle
2. (Optional) Upload a pose photo in the config bar
3. Select number of attempts and aspect ratio
4. Check 2+ jewelry items in the queue
5. Click "Stack N Items"
6. N variants generate sequentially, grid fills in real-time
7. Can retry any individual variant
8. Click a variant to select as favorite → added to queue as STACK item
9. Download individual or "Download All"

## Edge Cases

- **No mannequin uploaded + no store mannequin**: Generation proceeds without mannequin reference (existing behavior — Gemini generates a model)
- **Retry while other variants generating**: Disabled — retry buttons only active when `stackGenerating` is false
- **Rate limiting**: Sequential generation with existing `withRetry` exponential backoff handles 429s
- **Upload non-image file**: File picker restricted to `accept="image/*"`

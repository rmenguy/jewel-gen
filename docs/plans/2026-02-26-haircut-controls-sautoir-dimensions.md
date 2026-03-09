# Haircut Controls + Sautoir Dimensions — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add pre/post-generation hair controls (cut + length) to MannequinEngine, and fix sautoir placement dimensions in production/stacking with two length options.

**Architecture:** Two independent features touching shared files. Hair controls add `hairCut`/`hairLength` fields to the store + prompt maps in geminiService + UI in both panels. Sautoir fix splits the category dropdown and updates placement prompts in both production functions.

**Tech Stack:** React 19 + TypeScript + Zustand + TailwindCSS (existing stack, no new deps)

---

### Task 1: Update `MannequinCriteria` type + store defaults

**Files:**
- Modify: `types.ts:26-41`
- Modify: `stores/useMannequinStore.ts:6-20`

**Step 1: Add `hairCut` and `hairLength` to `MannequinCriteria`**

In `types.ts`, replace lines 31-32:

```typescript
// OLD
  hairColor: string;
  hairStyle: string;

// NEW
  hairColor: string;
  hairStyle: string;   // kept for backward compat (refinement panel uses it)
  hairCut: string;     // pre-generation cut style
  hairLength: string;  // pre-generation length
```

**Step 2: Update store defaults**

In `stores/useMannequinStore.ts`, add to `DEFAULT_CRITERIA`:

```typescript
  hairCut: 'laches',
  hairLength: 'mi-long',
```

**Step 3: Verify build**

Run: `npm run build`
Expected: No errors (new fields are optional in existing usage)

**Step 4: Commit**

```bash
git add types.ts stores/useMannequinStore.ts
git commit -m "feat: add hairCut and hairLength to MannequinCriteria"
```

---

### Task 2: Add hair prompt maps + update `generateMannequin()` prompt

**Files:**
- Modify: `services/geminiService.ts:167-267`

**Step 1: Add hair maps inside `generateMannequin()`**

After `lightingMap` (line 208), add:

```typescript
    const hairCutMap: Record<string, string> = {
        'laches': 'Hair worn loose and natural, flowing freely',
        'ondule': 'Natural undone waves with movement and texture',
        'lisse': 'Sleek straight hair, smooth and polished',
        'boucle': 'Defined curls with natural bounce and volume',
        'afro': 'Natural afro-textured hair with full volume',
        'chignon': 'Hair pulled back into an elegant chignon bun',
        'queue': 'Hair tied in a sleek ponytail',
        'tresse': 'Hair styled in braids',
        'pixie': 'Short pixie cut, cropped close to the head',
        'wavy-bob': 'Wavy textured bob, effortless undone waves with natural movement',
    };

    const hairLengthMap: Record<string, string> = {
        'tres-court': 'very short, pixie-length',
        'court': 'short, chin-length',
        'mi-long': 'medium, shoulder-length',
        'long': 'long, chest-length',
        'tres-long': 'very long, waist-length',
    };
```

**Step 2: Update HAIR line in basePrompt**

Replace line 240:
```typescript
// OLD
HAIR: ${criteria.hairColor}, ${criteria.hairStyle}.

// NEW
HAIR: ${criteria.hairColor}, ${hairCutMap[criteria.hairCut] || 'Hair worn loose and natural'}, ${hairLengthMap[criteria.hairLength] || 'medium, shoulder-length'}.
```

**Step 3: Verify build**

Run: `npm run build`

**Step 4: Commit**

```bash
git add services/geminiService.ts
git commit -m "feat: integrate hairCut/hairLength maps into mannequin generation prompt"
```

---

### Task 3: Add hair controls to left panel (pre-generation)

**Files:**
- Modify: `components/MannequinEngine.tsx:490-561` (between Age and Aesthetic sections)

**Step 1: Add Coupe section after Age (after line 490)**

```tsx
          {/* HAIR CUT */}
          <div>
            <SectionLabel>Coupe</SectionLabel>
            <div className="grid grid-cols-2 gap-2">
              {([
                { key: 'laches', label: 'Lâchés' },
                { key: 'ondule', label: 'Ondulé' },
                { key: 'lisse', label: 'Lisse' },
                { key: 'boucle', label: 'Bouclé' },
                { key: 'afro', label: 'Afro' },
                { key: 'chignon', label: 'Chignon' },
                { key: 'queue', label: 'Queue de cheval' },
                { key: 'tresse', label: 'Tressé' },
                { key: 'pixie', label: 'Pixie' },
                { key: 'wavy-bob', label: 'Wavy Bob' },
              ] as const).map(({ key, label }) => (
                <PillButton
                  key={key}
                  label={label}
                  active={criteria.hairCut === key}
                  onClick={() => setCriteria({ hairCut: key })}
                />
              ))}
            </div>
          </div>

          {/* HAIR LENGTH */}
          <div>
            <SectionLabel>Longueur</SectionLabel>
            <div className="grid grid-cols-3 gap-2">
              {([
                { key: 'tres-court', label: 'Très court' },
                { key: 'court', label: 'Court' },
                { key: 'mi-long', label: 'Mi-long' },
                { key: 'long', label: 'Long' },
                { key: 'tres-long', label: 'Très long' },
              ] as const).map(({ key, label }) => (
                <PillButton
                  key={key}
                  label={label}
                  active={criteria.hairLength === key}
                  onClick={() => setCriteria({ hairLength: key })}
                />
              ))}
            </div>
          </div>
```

**Step 2: Verify build + visual check**

Run: `npm run dev` and confirm controls appear between Age and Aesthetic.

**Step 3: Commit**

```bash
git add components/MannequinEngine.tsx
git commit -m "feat: add Coupe and Longueur controls to left panel"
```

---

### Task 4: Add hair cut/length to right panel refinement

**Files:**
- Modify: `components/MannequinEngine.tsx` (right panel, after existing Hairstyle section ~line 914)

**Step 1: Define HAIR_CUT_REFINEMENTS and HAIR_LENGTH_REFINEMENTS constants**

Add near existing `HAIR_STYLES` constant (after line 203):

```typescript
const HAIR_CUT_REFINEMENTS: { label: string; key: string; prompt: string }[] = [
  { label: 'Lâchés', key: 'laches', prompt: 'loose natural flowing hair' },
  { label: 'Ondulé', key: 'ondule', prompt: 'natural undone waves with movement' },
  { label: 'Lisse', key: 'lisse', prompt: 'sleek straight smooth hair' },
  { label: 'Bouclé', key: 'boucle', prompt: 'defined curls with natural bounce' },
  { label: 'Afro', key: 'afro', prompt: 'natural afro-textured hair with volume' },
  { label: 'Chignon', key: 'chignon', prompt: 'elegant chignon bun' },
  { label: 'Queue de cheval', key: 'queue', prompt: 'sleek ponytail' },
  { label: 'Tressé', key: 'tresse', prompt: 'elegantly braided hair' },
  { label: 'Pixie', key: 'pixie', prompt: 'short pixie cut cropped close' },
  { label: 'Wavy Bob', key: 'wavy-bob', prompt: 'wavy textured bob at chin length, effortless undone waves' },
];

const HAIR_LENGTH_REFINEMENTS: { label: string; key: string; prompt: string }[] = [
  { label: 'Très court', key: 'tres-court', prompt: 'very short pixie-length' },
  { label: 'Court', key: 'court', prompt: 'short chin-length' },
  { label: 'Mi-long', key: 'mi-long', prompt: 'medium shoulder-length' },
  { label: 'Long', key: 'long', prompt: 'long chest-length' },
  { label: 'Très long', key: 'tres-long', prompt: 'very long waist-length' },
];
```

**Step 2: Add state variables for refinement cut/length**

Add after `refHairStyle` state (line 255):

```typescript
  const [refHairCut, setRefHairCut] = useState<string | null>(null);
  const [refHairLength, setRefHairLength] = useState<string | null>(null);
```

**Step 3: Include in `pendingCount` calculation**

Update `pendingCount` (line 266-269) to include `refHairCut` and `refHairLength`:

```typescript
  const pendingCount = [
    refHairColor, refHairStyle, refHairCut, refHairLength,
    refMakeup, refAccessory, refStyle, refLighting, refScene, refOutfit,
  ].filter(v => v != null).length + (refSkinDirty ? 1 : 0);
```

**Step 4: Include in `clearRefinements`**

Add to `clearRefinements`:
```typescript
    setRefHairCut(null);
    setRefHairLength(null);
```

**Step 5: Include in `handleApplyRefinements` selections**

After the existing `if (refHairStyle)` block, add:
```typescript
    if (refHairCut) {
      const cut = HAIR_CUT_REFINEMENTS.find(c => c.key === refHairCut);
      selections.hairStyle = [
        cut?.prompt,
        refHairLength ? HAIR_LENGTH_REFINEMENTS.find(l => l.key === refHairLength)?.prompt : null,
        selections.hairStyle,
      ].filter(Boolean).join(', ');
    } else if (refHairLength) {
      const len = HAIR_LENGTH_REFINEMENTS.find(l => l.key === refHairLength);
      selections.hairStyle = [selections.hairStyle, len?.prompt].filter(Boolean).join(', ');
    }
```

**Step 6: Add UI sections in right panel**

Replace the existing HAIRSTYLE section (lines 901-914) with an expanded version that includes Coupe + Longueur + the original style options:

```tsx
          {/* HAIR CUT (refinement) */}
          <div>
            <SectionLabel>Coupe</SectionLabel>
            <div className="grid grid-cols-2 gap-2">
              {HAIR_CUT_REFINEMENTS.map((hc) => (
                <PillButton
                  key={hc.key}
                  label={hc.label}
                  active={refHairCut === hc.key}
                  onClick={() => setRefHairCut(refHairCut === hc.key ? null : hc.key)}
                />
              ))}
            </div>
          </div>

          {/* HAIR LENGTH (refinement) */}
          <div>
            <SectionLabel>Longueur</SectionLabel>
            <div className="grid grid-cols-3 gap-2">
              {HAIR_LENGTH_REFINEMENTS.map((hl) => (
                <PillButton
                  key={hl.key}
                  label={hl.label}
                  active={refHairLength === hl.key}
                  onClick={() => setRefHairLength(refHairLength === hl.key ? null : hl.key)}
                />
              ))}
            </div>
          </div>

          {/* HAIRSTYLE (keep existing for backward compat) */}
          <div>
            <SectionLabel>Hairstyle</SectionLabel>
            ...existing code...
          </div>
```

**Step 7: Update `handleApplyRefinements` dependencies array**

Add `refHairCut` and `refHairLength` to the dependency array.

**Step 8: Verify build + test**

Run: `npm run build`

**Step 9: Commit**

```bash
git add components/MannequinEngine.tsx
git commit -m "feat: add Coupe and Longueur refinement controls to right panel"
```

---

### Task 5: Split sautoir into two categories in ProductionEngine

**Files:**
- Modify: `components/ProductionEngine.tsx:392-399`

**Step 1: Update category dropdown**

Replace the sautoir option:

```tsx
// OLD
<option value="sautoir">Sautoir (Long Necklace)</option>

// NEW
<option value="sautoir-court">Sautoir Court (Mi-poitrine)</option>
<option value="sautoir-long">Sautoir Long (Nombril)</option>
```

**Step 2: Verify build**

Run: `npm run build`

**Step 3: Commit**

```bash
git add components/ProductionEngine.tsx
git commit -m "feat: split sautoir into court/long categories in production dropdown"
```

---

### Task 6: Update sautoir placement prompts in geminiService

**Files:**
- Modify: `services/geminiService.ts:508-519` (generateProductionPhoto)
- Modify: `services/geminiService.ts:569-578` (generateStackedProductionPhoto placementMap)

**Step 1: Update `generateProductionPhoto()` sautoir branch**

Replace lines 509-510:

```typescript
// OLD
        if (categoryLower.includes('sautoir')) {
            prompt += `PLACEMENT: Long necklace (sautoir) hanging freely from the neck, falling to the chest or waist level. The chain/pendant must drape naturally down the torso with visible length. NOT a short necklace — this is a long sautoir. `;

// NEW
        if (categoryLower.includes('sautoir-long')) {
            prompt += `PLACEMENT: Very long sautoir necklace hanging freely from the neck, falling to navel/belly level. The chain/pendant drapes well below the chest with maximum visible length. NOT a short necklace — this is an extra-long sautoir reaching the navel. `;
        } else if (categoryLower.includes('sautoir')) {
            prompt += `PLACEMENT: Long necklace (sautoir) hanging from the neck, falling to mid-chest/sternum level. The chain drapes to the middle of the chest — NOT to the waist, NOT to the collarbone. Medium-long sautoir proportions, sternum-level. `;
```

Note: `sautoir-long` must be checked BEFORE `sautoir` (which matches both `sautoir-court` and plain `sautoir`).

**Step 2: Update `generateStackedProductionPhoto()` placementMap**

Replace the sautoir entry in the placementMap:

```typescript
// OLD
            'sautoir': 'long sautoir necklace hanging to the chest or waist',

// NEW
            'sautoir-long': 'very long sautoir necklace hanging to navel/belly level, maximum drape length',
            'sautoir-court': 'sautoir necklace hanging to mid-chest/sternum level, medium-long drape',
            'sautoir': 'sautoir necklace hanging to mid-chest/sternum level',
```

The `Object.entries().find()` lookup will match `sautoir-long` first for that value, `sautoir-court` for that value, and `sautoir` as a legacy fallback.

**Step 3: Verify build**

Run: `npm run build`

**Step 4: Commit**

```bash
git add services/geminiService.ts
git commit -m "feat: precise sautoir placement dimensions (court=sternum, long=navel)"
```

---

### Task 7: Final verification

**Step 1: Full build**

Run: `npm run build`
Expected: Clean build, no errors.

**Step 2: Visual check**

Run: `npm run dev`
- Verify left panel shows Coupe (10 options) and Longueur (5 options) between Age and Aesthetic
- Verify right panel shows Coupe and Longueur refinement sections
- Verify Production dropdown has "Sautoir Court (Mi-poitrine)" and "Sautoir Long (Nombril)"

**Step 3: Final commit if needed**

```bash
git add -A
git commit -m "chore: final cleanup for haircut controls + sautoir dimensions"
```

# Banner Engine — Design Spec

## Purpose

Module de génération de bannières 4K (16:9) pour sites e-commerce de bijoux. Permet de créer des photos hero professionnelles en combinant un mannequin virtuel généré à partir de photos d'une personne réelle, avec placement précis de multiples bijoux (stacking).

## Workflow — Pipeline hybride en 4 étapes

### Étape 1 — Génération du mannequin

L'utilisateur fournit :
- **Photos d'identité** (1-3 max) : photos de la personne réelle à reproduire
- **Photo de pose** (optionnelle) : référence de composition/cadrage (ex: buste serré mains encadrantes)
- **Image de décor** (optionnelle) : arrière-plan souhaité
- **Prompt habits** : description des vêtements ("white crochet top, bohemian")
- **Prompt ambiance** : éclairage et atmosphère ("warm golden hour, sun-kissed skin")
- **Prompt pose/cadrage** : si pas de photo de pose ("tight bust crop, hands framing décolleté, direct gaze")

L'IA génère un mannequin en format 16:9 qui ressemble à la personne des photos d'identité, dans la pose/cadrage/décor voulu, **sans bijoux**. L'utilisateur peut regénérer ou accepter.

### Étape 2 — Détection des points de placement

L'IA analyse l'image générée et détecte automatiquement toutes les zones où un bijou peut être placé. Chaque point a :
- Un numéro (1, 2, 3...)
- Un label descriptif en français ("Oreille gauche lobe", "Collier mi-poitrine")
- Une zone (`ear`, `neck`, `chest`, `finger`, `wrist`, `ankle`)
- Des coordonnées x,y en pourcentage (0-100)

Les points s'affichent en overlay sur l'image. L'utilisateur importe ses bijoux (image + nom) et les assigne aux points en cliquant : sélection d'un bijou → clic sur un point. Les points libres sont indigo, les points assignés amber avec le nom du bijou.

L'utilisateur peut re-détecter les points si nécessaire.

### Étape 3 — Génération de la bannière

Un seul appel API avec :
- L'image mannequin
- Toutes les images des bijoux assignés
- Un prompt structuré décrivant chaque placement ("Collier Isis → point 6 = collier mi-poitrine, Bague Evil Eye → point 8 = index main gauche")

Résultat : la bannière finale avec tous les bijoux placés. L'utilisateur peut regénérer, passer au repositionnement, ou télécharger.

### Étape 4 — Repositionnement (optionnel)

L'utilisateur sélectionne un bijou à repositionner dans la liste. La zone du bijou est mise en surbrillance sur l'image. Il saisit une instruction en texte libre ("Monte le collier de 2cm, plus près du cou"). Un re-pass Gemini ciblé repositionne le bijou sans toucher au reste. Itérable jusqu'à satisfaction.

## Architecture UI

### Layout — 3 colonnes + stepper

Même pattern que les autres engines (MannequinEngine, ProductionEngine).

**Barre d'étapes (top)** : stepper horizontal 1→2→3→4 avec états (actif/complété/pending).

**Panneau gauche (280px)** :
- Étape 1 : zones d'upload (photos identité, pose, décor) + 3 champs prompts (habits, ambiance, pose) + bouton "Générer le mannequin"
- Étapes 2-4 : panneau masqué ou résumé des inputs

**Centre (flex)** :
- Preview 16:9 avec crop marks
- L'image change selon l'étape : mannequin nu (1), mannequin + points overlay (2), bannière finale (3), bannière + zone sélectionnée (4)
- Barre d'actions en bas : contextuelle selon l'étape

**Panneau droit (240px)** :
- Étape 1 : liste des bijoux à placer (import + preview)
- Étape 2 : bijoux avec statut d'assignation (non assigné / assigné au point N) + légende des points
- Étape 3 : récapitulatif des placements
- Étape 4 : sélection du bijou à repositionner + champ texte d'instruction

### Barre d'actions (bottom center) par étape

1. Mannequin : Undo | Regénérer | Accepter → Placement | Download
2. Placement : ← Retour | Re-détecter | Générer bannière → (N/M assignés)
3. Génération : ← Retour | Regénérer | Repositionner un bijou | Download
4. Refinement : champ texte + Repositionner | Terminé

## Types

```typescript
interface PlacementPoint {
  id: number              // 1, 2, 3...
  label: string           // "Oreille gauche lobe"
  zone: 'ear' | 'neck' | 'chest' | 'finger' | 'wrist' | 'ankle'
  x: number               // 0-100 (% from left)
  y: number               // 0-100 (% from top)
  assignedJewelryId: string | null
}

interface BannerJewelry {
  id: string              // UUID
  name: string            // "Collier Isis"
  imageBase64: string     // product photo
  assignedPointId: number | null
}
```

## Store — useBannerStore.ts

```typescript
interface BannerState {
  // Step tracking
  currentStep: 1 | 2 | 3 | 4

  // Step 1: Inputs
  identityPhotos: string[]       // base64 data URIs (max 3)
  poseReference: string | null
  backgroundImage: string | null
  outfitPrompt: string
  ambiancePrompt: string
  posePrompt: string

  // Step 1: Output
  mannequinImage: string | null
  isGeneratingMannequin: boolean

  // Step 2: Placement
  detectedPoints: PlacementPoint[]
  jewelryItems: BannerJewelry[]
  isDetectingPoints: boolean

  // Step 3: Generation
  bannerImage: string | null
  isGeneratingBanner: boolean

  // Step 4: Refinement
  selectedJewelryId: string | null
  isRepositioning: boolean

  // History (undo) — separate per phase
  mannequinHistory: string[]     // step 1 undo stack
  bannerHistory: string[]        // steps 3-4 undo stack

  // Error
  error: string | null
}
```

### Actions

- `setCurrentStep(step)` — navigation entre étapes
- `addIdentityPhoto(base64)` / `removeIdentityPhoto(index)` — gestion photos identité
- `setPoseReference(base64 | null)` — photo de pose
- `setBackgroundImage(base64 | null)` — image décor
- `setOutfitPrompt(text)` / `setAmbiancePrompt(text)` / `setPosePrompt(text)` — prompts
- `setMannequinImage(base64)` — résultat étape 1
- `setDetectedPoints(points[])` — résultat étape 2
- `addJewelry(item)` / `removeJewelry(id)` — gestion bijoux
- `assignJewelry(jewelryId, pointId)` / `unassignJewelry(jewelryId)` — assignation
- `setBannerImage(base64)` — résultat étape 3
- `setSelectedJewelryId(id | null)` — sélection pour repositionnement
- `pushToMannequinHistory(base64)` / `undoMannequin()` — historique mannequin (step 1)
- `pushToBannerHistory(base64)` / `undoBanner()` — historique bannière (steps 3-4)
- `setError(e: string | null)` — gestion erreurs
- `resetAll()` — reset complet

## Fonctions API — geminiService.ts

### generateBannerMannequin()

```typescript
export async function generateBannerMannequin(
  identityPhotos: string[],
  poseReference: string | null,
  backgroundImage: string | null,
  outfitPrompt: string,
  ambiancePrompt: string,
  posePrompt: string
): Promise<string>  // base64 image 16:9
```

- Modèle : `gemini-3-pro-image-preview`
- Envoie toutes les photos identité comme images de référence
- Si poseReference fournie : "Match this exact pose and framing" + image
- Si backgroundImage fournie : "Use this background environment" + image
- Prompt explicite : format 16:9 landscape, pas de bijoux, zones de placement propres
- Utilise `imageConfig: { imageSize: '4K' }` pour la meilleure résolution
- Le 16:9 est une instruction prompt uniquement (Gemini ne garantit pas le ratio exact) — si le résultat n'est pas 16:9, l'UI affiche l'image dans un container 16:9 avec letterboxing
- Wrappé dans `withRetry()`

### detectPlacementPoints()

```typescript
export async function detectPlacementPoints(
  mannequinImage: string
): Promise<PlacementPoint[]>
```

- Modèle : `gemini-3-pro-image-preview` avec `generationConfig: { responseModalities: ['TEXT'], responseMimeType: 'application/json' }`
- Prompt : analyse de l'image, détection de toutes les zones de placement possibles
- Retourne un JSON array parsé avec markdown fence stripping (pattern existant dans `segmentJewelry`)
- Validation : filtre les points hors range (x/y < 0 ou > 100)
- Fallback si JSON invalide : retourne tableau vide + affiche message "Re-détecter" dans l'UI
- Maximum 8 bijoux simultanés par bannière

### generateBannerWithJewelry()

```typescript
export async function generateBannerWithJewelry(
  mannequinImage: string,
  assignments: Array<{
    jewelry: BannerJewelry
    point: PlacementPoint
  }>
): Promise<string>  // base64 banner with jewelry
```

- Modèle : `gemini-3-pro-image-preview`
- Envoie l'image mannequin + toutes les images bijoux en `inlineData`
- Prompt structuré par bijou : "Place [name] at [point.label] ([point description])"
- Insiste sur la fidélité : chaque bijou doit correspondre exactement à son image de référence
- Wrappé dans `withRetry()`

### repositionJewelry()

Réutilise `freeformEditImage()` existant :

```typescript
// Pas de nouvelle fonction — appel direct :
freeformEditImage(
  bannerImage,
  `Reposition the ${jewelryName}: ${userInstruction}. Keep EVERYTHING else EXACTLY identical.`
)
```

## Fichiers impactés

### À créer
- `components/BannerEngine.tsx` — composant principal du module (3 colonnes + stepper + logique par étape)
- `stores/useBannerStore.ts` — store Zustand dédié

### À modifier
- `types.ts` — ajouter `PlacementPoint`, `BannerJewelry`
- `services/geminiService.ts` — ajouter `generateBannerMannequin()`, `detectPlacementPoints()`, `generateBannerWithJewelry()`
- `stores/useAppStore.ts` — ajouter `'BANNER'` au type `EngineType`
- `App.tsx` — ajouter onglet Banner + import du composant

## Résolution

Utilise `imageConfig: { imageSize: '4K' }` (pattern existant dans le codebase) pour la meilleure résolution native. Pas d'upscaling dans le MVP — à réévaluer si la qualité ne suffit pas.

## Contraintes techniques

- Toutes les images transitent en base64 (pattern existant)
- Upload via `FileReader.readAsDataURL()` (pattern existant)
- API calls directs browser → Google (pas de backend)
- `withRetry()` sur tous les appels Gemini
- Download via `downloadBase64Image()` existant
- Undo avec historique (max 10 images, pattern existant)

## Navigation entre étapes

- **Retour étape 3→2** : conserve les assignations bijoux, permet de re-détecter ou réassigner
- **Retour étape 2→1** : conserve les bijoux importés, reset les assignations et les points détectés
- **Retour étape 3→1** : conserve les bijoux, reset assignations + points + bannière
- L'historique undo est **par étape** : step 1 = historique mannequins, step 3-4 = historique bannières. Changer d'étape ne pollue pas l'historique de l'autre.
- Les bijoux peuvent être ajoutés/retirés à n'importe quelle étape (panneau droit toujours accessible)

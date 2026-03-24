
export interface Product {
  sku: string;
  title: string;
  image_url: string;
  price: string;
  type: string | null;
}

export interface ExtractionResult {
  store?: string;
  count?: number;
  products?: Product[];
  error?: string;
  solution?: string;
}

export enum ExtractionStatus {
  IDLE = 'IDLE',
  VALIDATING = 'VALIDATING',
  EXTRACTING = 'EXTRACTING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}

export interface MannequinCriteria {
  gender: string;
  age: string;
  ethnicity: string;
  morphology: string;
  hairColor: string;
  hairStyle: string;
  hairCut: string;
  hairLength: string;
  vibe: string;
  skinTexture: string;
  makeup: string;
  // New fields for redesigned UI
  pose?: string;
  lighting?: string;
  bodyComposition?: number; // 0-100 slider
  customPrompt?: string;    // Free-form prompt appended to generation
}

export interface ProductionItem {
  id: string;
  sku: string;
  name: string;
  imageUrl: string;
  category?: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'ERROR';
  resultImage?: string;
  resultImages?: string[];
  error?: string;
  chainLength?: number;    // cm — user-entered
  pendantSize?: number;    // cm — user-entered (legacy, kept for compat)
  pendantHeight?: number;  // cm — pendant/charm height (L)
  pendantWidth?: number;   // cm — pendant/charm width (l)
}

export type EngineType = 'CATALOG' | 'MANNEQUIN' | 'PRODUCTION' | 'BATCH' | 'BANNER';

// Batch Processing Types
export interface BatchItem {
  id: string;
  sku: string;
  category: string;
  productImageUrl?: string;
  description?: string;
  customPrompt?: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'ERROR';
  progress: number;
  resultImage?: string;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
  retryCount: number;
}

export interface BatchConfig {
  mannequinPreset?: string;
  mannequinImage?: string;
  artisticDirection: string;
  parallelCount: number;
  autoSave: boolean;
  exportPath?: string;
}

export interface BatchStats {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  progress: number;
  estimatedTimeRemaining?: number;
  startedAt?: Date;
}

// Refinement types for post-generation modifications
export type RefinementType =
  | 'hair_tone'
  | 'hair_style'
  | 'skin_retouching'
  | 'scene_background'
  | 'outfit_swap'
  | 'lighting_change'
  | 'add_accessory'
  | 'makeup_change'
  | 'style_transfer';

// Batch refinement selections for applying multiple changes at once
export interface RefinementSelections {
  hairColor?: string;
  hairStyle?: string;
  hairLengthAdjust?: string;
  hairReferenceBase64?: string;
  skinRetouching?: number;
  makeup?: string;
  accessory?: string;
  style?: string;
  lighting?: string;
  scene?: string;
  outfitBase64?: string;
}

// Production reference photo analysis
export type ExtractionLevel = 'scene-pose-style' | 'scene-pose-style-placement' | 'full';

export interface CustomPreset {
  id: string;
  name: string;
  prompt: string;
  createdAt: string;
}

// Jewelry Fidelity Engine types
export interface ProductDimensions {
  chainLength?: number;    // cm
  pendantSize?: number;    // cm (legacy)
  pendantHeight?: number;  // cm — pendant/charm height (L)
  pendantWidth?: number;   // cm — pendant/charm width (l)
}

export interface JewelryBlueprint {
  material: string;
  chainType: string;
  stoneShape: string;
  stoneSetting: string;
  pendantShape: string;
  finish: string;
  colorDetails: string;
  rawDescription: string;  // full text for prompt injection
}

export interface FidelityScore {
  pHashDistance: number;       // 0-64, lower is better
  histogramCorrelation: number; // 0-1, higher is better
}

export interface PixelFidelityResult {
  scores: FidelityScore;
  passed: boolean;
  diagnosis: 'shape' | 'color' | 'both' | 'none';
}

export type PoseKey = 'neck' | 'ear' | 'wrist' | 'hand';

export interface SegmentationResult {
  box_2d: [number, number, number, number]; // [y0, x0, y1, x1] normalized 0-1000
  mask: string;                              // base64 PNG
  label: string;
}

export interface BareCache {
  [key: string]: string;  // poseKey+mannequinHash+direction → base64 image
}

// Supabase product type
export interface SupabaseProduct {
  id: string;
  name: string;
  sku: string;
  category: string;
  image_url: string;
  thumbnail_url?: string;
  created_at: string;
  metadata: Record<string, any>;
}

// ─── Production Stack Types ─────────────────────────────────

export type TargetZone =
  | 'neck-base' | 'collarbone' | 'upper-chest' | 'mid-chest' | 'navel'
  | 'ear-lobe' | 'ear-upper' | 'wrist' | 'finger';

export interface StackLayer {
  id: string;
  ordinal: number;
  name: string;
  productImage: string;
  productCategory: string;
  targetZone: TargetZone;
  blueprint?: JewelryBlueprint;
  dimensions?: ProductDimensions;
}

export type StepStatus = 'pending' | 'executing' | 'validating' | 'completed' | 'failed' | 'retrying';

export interface ReferenceImage {
  role: 'character' | 'object' | 'composition' | 'style';
  base64: string;
  label: string;
}

export interface ImageGenerationConfig {
  aspectRatio: string;
  resolution: string;
  temperature?: number;
  numberOfImages?: number;
}

export interface GenerationSnapshot {
  stepIndex: number;
  layerId: string;
  prompt: string;
  referencesUsed: ReferenceImage[];
  referencesExcluded: ReferenceImage[];
  generationConfig: ImageGenerationConfig;
  inputImage: string;
  outputImage: string;
  validation: PixelFidelityResult | null;
  timestamp: number;
  attemptNumber: number;
}

export interface StepState {
  layerId: string;
  status: StepStatus;
  currentAttempt: number;
  maxAttempts: number;
  snapshots: GenerationSnapshot[];
  approvedSnapshotIndex: number | null;
  error?: string;
}

// ─── Banner Engine ───────────────────────────────────────────

export interface BannerJewelry {
  id: string;
  name: string;
  imageBase64: string;
  placed: boolean;
  chainLength?: number;     // cm
  pendantHeight?: number;   // cm
  pendantWidth?: number;    // cm
  blueprint?: JewelryBlueprint;
  isAnalyzing?: boolean;
}

// ─── Unified Image Service & Reference Architecture ───────────

export type ReferenceKind = 'character' | 'object' | 'composition' | 'style';

export interface ReferenceImage {
  id: string;
  kind: ReferenceKind;
  role: string;          // Human-readable: "locked base scene", "jewelry fidelity", etc.
  base64: string;        // Raw base64 (no data: prefix)
  mimeType: string;
  priority: number;      // Lower = higher priority (0 = must include)
}

export interface ReferenceBundle {
  characterReferences: ReferenceImage[];  // Max 4
  objectReferences: ReferenceImage[];     // Max 10
  compositionReferences: ReferenceImage[]; // Counts toward object budget
  styleReferences: ReferenceImage[];       // Counts toward object budget
}

export interface EffectiveBundle {
  included: ReferenceImage[];   // Ordered for API request
  excluded: ReferenceImage[];   // Dropped due to budget
  budget: {
    character: { used: number; max: number };
    object: { used: number; max: number };
  };
}

export interface ParsedImageResponse {
  images: Array<{ mimeType: string; data: string; dataUri: string }>;
  text: string | null;
  thoughtSignatures: Array<{ partIndex: number; signature: string }>;
  rawParts: any[]; // For echoing back in multi-turn
}

export interface ImageGenerationConfig {
  responseModalities?: string[];
  imageConfig?: {
    aspectRatio?: string;
    imageSize?: string;
  };
}

export interface ImageChatSession {
  history: Array<{ role: 'user' | 'model'; parts: any[] }>;
  model: string;
  generationConfig: ImageGenerationConfig;
}

// ─── Production Stack Engine Types ──────────────────────────────

export type TargetZone =
  | 'neck-base' | 'collarbone' | 'upper-chest' | 'mid-chest' | 'navel'
  | 'ear-lobe' | 'ear-upper' | 'wrist' | 'finger';

export interface StackLayer {
  id: string;
  ordinal: number;
  name: string;
  productImage: string;        // base64 data URI
  productCategory: string;
  targetZone: TargetZone;
  blueprint?: JewelryBlueprint;
  dimensions?: ProductDimensions;
}

export interface GenerationSnapshot {
  stepIndex: number;
  layerId: string;
  prompt: string;
  referencesUsed: ReferenceImage[];
  referencesExcluded: ReferenceImage[];
  generationConfig: ImageGenerationConfig;
  inputImage: string;
  outputImage: string;
  validation: PixelFidelityResult | null;
  timestamp: number;
  attemptNumber: number;
}

export type StepStatus = 'pending' | 'executing' | 'validating' | 'completed' | 'failed' | 'retrying';

export interface StepState {
  layerId: string;
  status: StepStatus;
  currentAttempt: number;
  maxAttempts: number;
  snapshots: GenerationSnapshot[];
  approvedSnapshotIndex: number | null;
  error?: string;
}

export interface ProductionStackSession {
  id: string;
  baseImage: string;
  aspectRatio: string;
  imageSize: string;
  layers: StackLayer[];
  stepStates: StepState[];
  currentImage: string | null;
  chatSession: ImageChatSession | null;
  followUpHistory: GenerationSnapshot[];
  status: 'planning' | 'executing' | 'completed' | 'follow-up';
  createdAt: number;
  // STATE-01 contract fields — nullable, populated by engine during execution
  referenceBundle: ReferenceBundle | null;
  effectiveReferenceBundle: EffectiveBundle | null;
  excludedReferences: ReferenceImage[];
  validationResults: PixelFidelityResult[];
}

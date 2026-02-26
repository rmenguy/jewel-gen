
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
  error?: string;
}

export type EngineType = 'CATALOG' | 'MANNEQUIN' | 'PRODUCTION' | 'BATCH';

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

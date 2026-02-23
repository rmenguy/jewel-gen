import { create } from 'zustand';
import { MannequinCriteria } from '../types';

const MAX_HISTORY = 10;

const DEFAULT_CRITERIA: MannequinCriteria = {
  gender: 'Femme',
  age: '25',
  ethnicity: 'european',
  morphology: 'Athlétique',
  hairColor: 'Brun',
  hairStyle: 'Lachés',
  vibe: 'Minimalist',
  skinTexture: 'Natural',
  makeup: 'Natural',
  pose: 'standing',
  lighting: 'soft',
  bodyComposition: 50,
  customPrompt: '',
};

interface MannequinStore {
  criteria: MannequinCriteria;
  currentImage: string | null;
  referenceImage: string | null;
  isGenerating: boolean;
  isRefining: boolean;
  imageHistory: string[];
  error: string | null;

  // Photo Book state
  bookImages: string[];
  isGeneratingBook: boolean;
  bookProgress: number;

  setCriteria: (updates: Partial<MannequinCriteria>) => void;
  setCurrentImage: (img: string | null) => void;
  setReferenceImage: (img: string | null) => void;
  setIsGenerating: (v: boolean) => void;
  setIsRefining: (v: boolean) => void;
  setError: (e: string | null) => void;
  pushToHistory: (img: string) => void;
  undo: () => void;
  resetAll: () => void;

  // Photo Book actions
  addBookImage: (img: string) => void;
  setIsGeneratingBook: (v: boolean) => void;
  setBookProgress: (p: number) => void;
  clearBook: () => void;
}

export const useMannequinStore = create<MannequinStore>((set, get) => ({
  criteria: { ...DEFAULT_CRITERIA },
  currentImage: null,
  referenceImage: null,
  isGenerating: false,
  isRefining: false,
  imageHistory: [],
  error: null,

  bookImages: [],
  isGeneratingBook: false,
  bookProgress: 0,

  setCriteria: (updates) =>
    set((state) => ({ criteria: { ...state.criteria, ...updates } })),

  setCurrentImage: (img) => set({ currentImage: img }),
  setReferenceImage: (img) => set({ referenceImage: img }),
  setIsGenerating: (v) => set({ isGenerating: v }),
  setIsRefining: (v) => set({ isRefining: v }),
  setError: (e) => set({ error: e }),

  pushToHistory: (img) =>
    set((state) => ({
      imageHistory: [img, ...state.imageHistory].slice(0, MAX_HISTORY),
    })),

  undo: () => {
    const { imageHistory } = get();
    if (imageHistory.length === 0) return;
    const [previous, ...rest] = imageHistory;
    set({ currentImage: previous, imageHistory: rest });
  },

  addBookImage: (img) =>
    set((state) => ({ bookImages: [...state.bookImages, img] })),
  setIsGeneratingBook: (v) => set({ isGeneratingBook: v }),
  setBookProgress: (p) => set({ bookProgress: p }),
  clearBook: () => set({ bookImages: [], bookProgress: 0 }),

  resetAll: () =>
    set({
      criteria: { ...DEFAULT_CRITERIA },
      currentImage: null,
      referenceImage: null,
      imageHistory: [],
      error: null,
      bookImages: [],
      bookProgress: 0,
    }),
}));

import { create } from 'zustand';
import { BannerJewelry } from '../types';

const MAX_HISTORY = 10;

interface BannerStore {
  // Step: 1 = mannequin, 2 = jewelry placement, 3 = refinement
  currentStep: 1 | 2 | 3;

  // Step 1: Inputs
  identityPhotos: string[];
  poseReference: string | null;
  backgroundImage: string | null;
  outfitPrompt: string;
  ambiancePrompt: string;
  posePrompt: string;

  // Step 1: Output
  mannequinImage: string | null;
  isGeneratingMannequin: boolean;

  // Step 2: Jewelry + placement prompt
  jewelryItems: BannerJewelry[];
  placementPrompt: string;
  bannerImage: string | null;
  isGeneratingBanner: boolean;

  // Step 3: Refinement
  isRepositioning: boolean;

  // History
  mannequinHistory: string[];
  bannerHistory: string[];

  // Error
  error: string | null;

  // Actions
  setCurrentStep: (step: 1 | 2 | 3) => void;
  addIdentityPhoto: (base64: string) => void;
  removeIdentityPhoto: (index: number) => void;
  setPoseReference: (base64: string | null) => void;
  setBackgroundImage: (base64: string | null) => void;
  setOutfitPrompt: (text: string) => void;
  setAmbiancePrompt: (text: string) => void;
  setPosePrompt: (text: string) => void;
  setMannequinImage: (base64: string | null) => void;
  setIsGeneratingMannequin: (v: boolean) => void;
  addJewelry: (item: BannerJewelry) => void;
  removeJewelry: (id: string) => void;
  updateJewelryName: (id: string, name: string) => void;
  setPlacementPrompt: (text: string) => void;
  setBannerImage: (base64: string | null) => void;
  setIsGeneratingBanner: (v: boolean) => void;
  setIsRepositioning: (v: boolean) => void;
  pushToMannequinHistory: (base64: string) => void;
  undoMannequin: () => void;
  pushToBannerHistory: (base64: string) => void;
  undoBanner: () => void;
  setError: (e: string | null) => void;
  resetAll: () => void;
  goBackToStep: (step: 1 | 2) => void;
}

export const useBannerStore = create<BannerStore>((set) => ({
  currentStep: 1,
  identityPhotos: [],
  poseReference: null,
  backgroundImage: null,
  outfitPrompt: '',
  ambiancePrompt: '',
  posePrompt: '',
  mannequinImage: null,
  isGeneratingMannequin: false,
  jewelryItems: [],
  placementPrompt: '',
  bannerImage: null,
  isGeneratingBanner: false,
  isRepositioning: false,
  mannequinHistory: [],
  bannerHistory: [],
  error: null,

  setCurrentStep: (step) => set({ currentStep: step, error: null }),

  addIdentityPhoto: (base64) => set((s) => {
    if (s.identityPhotos.length >= 3) return s;
    return { identityPhotos: [...s.identityPhotos, base64] };
  }),
  removeIdentityPhoto: (index) => set((s) => ({
    identityPhotos: s.identityPhotos.filter((_, i) => i !== index),
  })),
  setPoseReference: (base64) => set({ poseReference: base64 }),
  setBackgroundImage: (base64) => set({ backgroundImage: base64 }),
  setOutfitPrompt: (text) => set({ outfitPrompt: text }),
  setAmbiancePrompt: (text) => set({ ambiancePrompt: text }),
  setPosePrompt: (text) => set({ posePrompt: text }),

  setMannequinImage: (base64) => set({ mannequinImage: base64 }),
  setIsGeneratingMannequin: (v) => set({ isGeneratingMannequin: v }),

  addJewelry: (item) => set((s) => {
    if (s.jewelryItems.length >= 8) return s;
    return { jewelryItems: [...s.jewelryItems, item] };
  }),
  removeJewelry: (id) => set((s) => ({
    jewelryItems: s.jewelryItems.filter((j) => j.id !== id),
  })),
  updateJewelryName: (id, name) => set((s) => ({
    jewelryItems: s.jewelryItems.map((j) => j.id === id ? { ...j, name } : j),
  })),
  setPlacementPrompt: (text) => set({ placementPrompt: text }),

  setBannerImage: (base64) => set({ bannerImage: base64 }),
  setIsGeneratingBanner: (v) => set({ isGeneratingBanner: v }),

  setIsRepositioning: (v) => set({ isRepositioning: v }),

  pushToMannequinHistory: (base64) => set((s) => ({
    mannequinHistory: [base64, ...s.mannequinHistory].slice(0, MAX_HISTORY),
  })),
  undoMannequin: () => set((s) => {
    if (s.mannequinHistory.length === 0) return s;
    const [restored, ...rest] = s.mannequinHistory;
    return { mannequinImage: restored, mannequinHistory: rest };
  }),

  pushToBannerHistory: (base64) => set((s) => ({
    bannerHistory: [base64, ...s.bannerHistory].slice(0, MAX_HISTORY),
  })),
  undoBanner: () => set((s) => {
    if (s.bannerHistory.length === 0) return s;
    const [restored, ...rest] = s.bannerHistory;
    return { bannerImage: restored, bannerHistory: rest };
  }),

  setError: (e) => set({ error: e }),
  resetAll: () => set({
    currentStep: 1,
    identityPhotos: [],
    poseReference: null,
    backgroundImage: null,
    outfitPrompt: '',
    ambiancePrompt: '',
    posePrompt: '',
    mannequinImage: null,
    isGeneratingMannequin: false,
    jewelryItems: [],
    placementPrompt: '',
    bannerImage: null,
    isGeneratingBanner: false,
    isRepositioning: false,
    mannequinHistory: [],
    bannerHistory: [],
    error: null,
  }),

  goBackToStep: (step) => set(() => {
    if (step === 1) {
      return {
        currentStep: 1 as const,
        bannerImage: null,
        bannerHistory: [],
        error: null,
      };
    }
    return {
      currentStep: 2 as const,
      bannerImage: null,
      bannerHistory: [],
      error: null,
    };
  }),
}));

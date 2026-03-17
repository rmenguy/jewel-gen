import { create } from 'zustand';
import { BannerJewelry } from '../types';

const MAX_HISTORY = 10;

interface BannerStore {
  // Step: 1 = mannequin, 2 = iterative jewelry
  currentStep: 1 | 2;

  // Step 1: Inputs
  identityPhotos: string[];
  poseReference: string | null;
  backgroundImage: string | null;
  outfitPrompt: string;
  ambiancePrompt: string;
  posePrompt: string;
  mannequinImage: string | null;
  isGeneratingMannequin: boolean;

  // Step 2: Iterative jewelry
  jewelryItems: BannerJewelry[];
  selectedJewelryId: string | null;
  currentPlacementPrompt: string;
  workingImage: string | null;       // evolves as jewelry is added
  isAddingJewelry: boolean;
  isRefusing: boolean;               // refusionner loading
  isRepositioning: boolean;          // freeform edit loading

  // History
  mannequinHistory: string[];
  workingHistory: string[];          // undo stack for working image

  // Error
  error: string | null;

  // Actions — Step
  setCurrentStep: (step: 1 | 2) => void;

  // Actions — Step 1
  addIdentityPhoto: (base64: string) => void;
  removeIdentityPhoto: (index: number) => void;
  setPoseReference: (base64: string | null) => void;
  setBackgroundImage: (base64: string | null) => void;
  setOutfitPrompt: (text: string) => void;
  setAmbiancePrompt: (text: string) => void;
  setPosePrompt: (text: string) => void;
  setMannequinImage: (base64: string | null) => void;
  setIsGeneratingMannequin: (v: boolean) => void;
  pushToMannequinHistory: (base64: string) => void;
  undoMannequin: () => void;

  // Actions — Step 2
  addJewelry: (item: BannerJewelry) => void;
  removeJewelry: (id: string) => void;
  updateJewelryName: (id: string, name: string) => void;
  updateJewelryDimensions: (id: string, dims: { chainLength?: number; pendantHeight?: number; pendantWidth?: number }) => void;
  setJewelryBlueprint: (id: string, blueprint: any) => void;
  setJewelryAnalyzing: (id: string, v: boolean) => void;
  setSelectedJewelryId: (id: string | null) => void;
  setCurrentPlacementPrompt: (text: string) => void;
  markJewelryPlaced: (id: string) => void;
  markJewelryPending: (id: string) => void;
  setWorkingImage: (base64: string | null) => void;
  setIsAddingJewelry: (v: boolean) => void;
  setIsRefusing: (v: boolean) => void;
  setIsRepositioning: (v: boolean) => void;
  pushToWorkingHistory: (base64: string) => void;
  undoWorking: () => void;

  // Actions — General
  setError: (e: string | null) => void;
  resetAll: () => void;
  acceptMannequin: () => void;       // transition step 1 → 2
  goBackToMannequin: () => void;     // back to step 1
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
  selectedJewelryId: null,
  currentPlacementPrompt: '',
  workingImage: null,
  isAddingJewelry: false,
  isRefusing: false,
  isRepositioning: false,
  mannequinHistory: [],
  workingHistory: [],
  error: null,

  setCurrentStep: (step) => set({ currentStep: step, error: null }),

  // Step 1
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
  pushToMannequinHistory: (base64) => set((s) => ({
    mannequinHistory: [base64, ...s.mannequinHistory].slice(0, MAX_HISTORY),
  })),
  undoMannequin: () => set((s) => {
    if (s.mannequinHistory.length === 0) return s;
    const [restored, ...rest] = s.mannequinHistory;
    return { mannequinImage: restored, mannequinHistory: rest };
  }),

  // Step 2
  addJewelry: (item) => set((s) => {
    if (s.jewelryItems.length >= 8) return s;
    return { jewelryItems: [...s.jewelryItems, item] };
  }),
  removeJewelry: (id) => set((s) => ({
    jewelryItems: s.jewelryItems.filter((j) => j.id !== id),
    selectedJewelryId: s.selectedJewelryId === id ? null : s.selectedJewelryId,
  })),
  updateJewelryName: (id, name) => set((s) => ({
    jewelryItems: s.jewelryItems.map((j) => j.id === id ? { ...j, name } : j),
  })),
  updateJewelryDimensions: (id, dims) => set((s) => ({
    jewelryItems: s.jewelryItems.map((j) => j.id === id ? { ...j, ...dims } : j),
  })),
  setJewelryBlueprint: (id, blueprint) => set((s) => ({
    jewelryItems: s.jewelryItems.map((j) => j.id === id ? { ...j, blueprint, isAnalyzing: false } : j),
  })),
  setJewelryAnalyzing: (id, v) => set((s) => ({
    jewelryItems: s.jewelryItems.map((j) => j.id === id ? { ...j, isAnalyzing: v } : j),
  })),
  setSelectedJewelryId: (id) => set({ selectedJewelryId: id, currentPlacementPrompt: '' }),
  setCurrentPlacementPrompt: (text) => set({ currentPlacementPrompt: text }),
  markJewelryPlaced: (id) => set((s) => ({
    jewelryItems: s.jewelryItems.map((j) => j.id === id ? { ...j, placed: true } : j),
    selectedJewelryId: null,
    currentPlacementPrompt: '',
  })),
  markJewelryPending: (id) => set((s) => ({
    jewelryItems: s.jewelryItems.map((j) => j.id === id ? { ...j, placed: false } : j),
  })),
  setWorkingImage: (base64) => set({ workingImage: base64 }),
  setIsAddingJewelry: (v) => set({ isAddingJewelry: v }),
  setIsRefusing: (v) => set({ isRefusing: v }),
  setIsRepositioning: (v) => set({ isRepositioning: v }),
  pushToWorkingHistory: (base64) => set((s) => ({
    workingHistory: [base64, ...s.workingHistory].slice(0, MAX_HISTORY),
  })),
  undoWorking: () => set((s) => {
    if (s.workingHistory.length === 0) return s;
    const [restored, ...rest] = s.workingHistory;
    return { workingImage: restored, workingHistory: rest };
  }),

  // General
  setError: (e) => set({ error: e }),
  acceptMannequin: () => set((s) => ({
    currentStep: 2 as const,
    workingImage: s.mannequinImage,
    workingHistory: [],
    error: null,
  })),
  goBackToMannequin: () => set({
    currentStep: 1 as const,
    workingImage: null,
    workingHistory: [],
    selectedJewelryId: null,
    currentPlacementPrompt: '',
    error: null,
  }),
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
    selectedJewelryId: null,
    currentPlacementPrompt: '',
    workingImage: null,
    isAddingJewelry: false,
    isRefusing: false,
    isRepositioning: false,
    mannequinHistory: [],
    workingHistory: [],
    error: null,
  }),
}));

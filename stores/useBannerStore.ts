import { create } from 'zustand';
import { PlacementPoint, BannerJewelry } from '../types';

const MAX_HISTORY = 10;

interface BannerStore {
  currentStep: 1 | 2 | 3 | 4;
  identityPhotos: string[];
  poseReference: string | null;
  backgroundImage: string | null;
  outfitPrompt: string;
  ambiancePrompt: string;
  posePrompt: string;
  mannequinImage: string | null;
  isGeneratingMannequin: boolean;
  detectedPoints: PlacementPoint[];
  jewelryItems: BannerJewelry[];
  isDetectingPoints: boolean;
  bannerImage: string | null;
  isGeneratingBanner: boolean;
  selectedJewelryId: string | null;
  isRepositioning: boolean;
  mannequinHistory: string[];
  bannerHistory: string[];
  error: string | null;

  setCurrentStep: (step: 1 | 2 | 3 | 4) => void;
  addIdentityPhoto: (base64: string) => void;
  removeIdentityPhoto: (index: number) => void;
  setPoseReference: (base64: string | null) => void;
  setBackgroundImage: (base64: string | null) => void;
  setOutfitPrompt: (text: string) => void;
  setAmbiancePrompt: (text: string) => void;
  setPosePrompt: (text: string) => void;
  setMannequinImage: (base64: string | null) => void;
  setIsGeneratingMannequin: (v: boolean) => void;
  setDetectedPoints: (points: PlacementPoint[]) => void;
  setIsDetectingPoints: (v: boolean) => void;
  addJewelry: (item: BannerJewelry) => void;
  removeJewelry: (id: string) => void;
  assignJewelry: (jewelryId: string, pointId: number) => void;
  unassignJewelry: (jewelryId: string) => void;
  setBannerImage: (base64: string | null) => void;
  setIsGeneratingBanner: (v: boolean) => void;
  setSelectedJewelryId: (id: string | null) => void;
  setIsRepositioning: (v: boolean) => void;
  pushToMannequinHistory: (base64: string) => void;
  undoMannequin: () => void;
  pushToBannerHistory: (base64: string) => void;
  undoBanner: () => void;
  setError: (e: string | null) => void;
  resetAll: () => void;
  goBackToStep: (step: 1 | 2 | 3) => void;
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
  detectedPoints: [],
  jewelryItems: [],
  isDetectingPoints: false,
  bannerImage: null,
  isGeneratingBanner: false,
  selectedJewelryId: null,
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

  setDetectedPoints: (points) => set({ detectedPoints: points }),
  setIsDetectingPoints: (v) => set({ isDetectingPoints: v }),
  addJewelry: (item) => set((s) => {
    if (s.jewelryItems.length >= 8) return s;
    return { jewelryItems: [...s.jewelryItems, item] };
  }),
  removeJewelry: (id) => set((s) => ({
    jewelryItems: s.jewelryItems.filter((j) => j.id !== id),
    detectedPoints: s.detectedPoints.map((p) =>
      p.assignedJewelryId === id ? { ...p, assignedJewelryId: null } : p
    ),
  })),
  assignJewelry: (jewelryId, pointId) => set((s) => ({
    jewelryItems: s.jewelryItems.map((j) =>
      j.id === jewelryId ? { ...j, assignedPointId: pointId } : j
    ),
    detectedPoints: s.detectedPoints.map((p) => {
      if (p.id === pointId) return { ...p, assignedJewelryId: jewelryId };
      if (p.assignedJewelryId === jewelryId) return { ...p, assignedJewelryId: null };
      return p;
    }),
  })),
  unassignJewelry: (jewelryId) => set((s) => ({
    jewelryItems: s.jewelryItems.map((j) =>
      j.id === jewelryId ? { ...j, assignedPointId: null } : j
    ),
    detectedPoints: s.detectedPoints.map((p) =>
      p.assignedJewelryId === jewelryId ? { ...p, assignedJewelryId: null } : p
    ),
  })),

  setBannerImage: (base64) => set({ bannerImage: base64 }),
  setIsGeneratingBanner: (v) => set({ isGeneratingBanner: v }),

  setSelectedJewelryId: (id) => set({ selectedJewelryId: id }),
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
    detectedPoints: [],
    jewelryItems: [],
    isDetectingPoints: false,
    bannerImage: null,
    isGeneratingBanner: false,
    selectedJewelryId: null,
    isRepositioning: false,
    mannequinHistory: [],
    bannerHistory: [],
    error: null,
  }),

  goBackToStep: (step) => set((s) => {
    if (step === 1) {
      return {
        currentStep: 1,
        detectedPoints: [],
        bannerImage: null,
        bannerHistory: [],
        selectedJewelryId: null,
        error: null,
        jewelryItems: s.jewelryItems.map((j) => ({ ...j, assignedPointId: null })),
      };
    }
    if (step === 2) {
      return {
        currentStep: 2,
        bannerImage: null,
        bannerHistory: [],
        selectedJewelryId: null,
        error: null,
      };
    }
    return { currentStep: step as 1 | 2 | 3 | 4, error: null };
  }),
}));

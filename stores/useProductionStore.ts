import { create } from 'zustand';
import { ProductionItem, Product, CustomPreset, ProductionStackSession, StackLayer, StepState, TargetZone } from '../types';

interface StackPreset {
  id: string;
  name: string;
  layers: Array<{ name: string; productCategory: string; targetZone: TargetZone }>;
  aspectRatio: string;
  imageSize: string;
  createdAt: number;
}

interface ProductionStore {
  queue: ProductionItem[];
  mannequinImage: string | null;

  addToQueue: (items: ProductionItem[]) => void;
  setQueue: (queue: ProductionItem[] | ((prev: ProductionItem[]) => ProductionItem[])) => void;
  updateItem: (id: string, updates: Partial<ProductionItem>) => void;
  removeFromQueue: (id: string) => void;
  clearQueue: () => void;
  setMannequinImage: (img: string | null) => void;

  // Convert catalog products to production items and add
  addProductsToQueue: (products: Product[]) => void;

  // Custom presets from reference photo analysis
  customPresets: CustomPreset[];
  addCustomPreset: (preset: CustomPreset) => void;
  removeCustomPreset: (id: string) => void;

  // Bare mannequin cache (keyed by generation params hash)
  bareCache: Record<string, string>;
  setBareCache: (key: string, image: string) => void;
  getBareCache: (key: string) => string | undefined;
  clearBareCache: () => void;

  // Production Stack session
  stackSession: ProductionStackSession | null;
  createStackSession: (baseImage: string, aspectRatio: string, imageSize: string) => ProductionStackSession;
  updateStackSession: (updates: Partial<ProductionStackSession>) => void;
  addLayerToStack: (layer: StackLayer) => void;
  removeLayerFromStack: (layerId: string) => void;
  reorderStackLayers: (layerIds: string[]) => void;
  updateStepState: (stepIndex: number, updates: Partial<StepState>) => void;
  resetStackSession: () => void;

  // Session duplication (OPS-01)
  duplicateStackSession: () => void;

  // Stack presets (OPS-02)
  stackPresets: StackPreset[];
  saveStackPreset: (name: string) => void;
  loadStackPreset: (presetId: string) => void;
  deleteStackPreset: (presetId: string) => void;
}

export const useProductionStore = create<ProductionStore>((set, get) => ({
  queue: [],
  mannequinImage: null,

  addToQueue: (items) =>
    set((state) => ({ queue: [...state.queue, ...items] })),

  setQueue: (queueOrUpdater) =>
    set((state) => ({
      queue: typeof queueOrUpdater === 'function'
        ? (queueOrUpdater as (prev: ProductionItem[]) => ProductionItem[])(state.queue)
        : queueOrUpdater,
    })),

  updateItem: (id, updates) =>
    set((state) => ({
      queue: state.queue.map((item) =>
        item.id === id ? { ...item, ...updates } : item
      ),
    })),

  removeFromQueue: (id) =>
    set((state) => ({ queue: state.queue.filter((item) => item.id !== id) })),

  clearQueue: () => set({ queue: [] }),

  setMannequinImage: (img) => set({ mannequinImage: img }),

  addProductsToQueue: (products) =>
    set((state) => ({
      queue: [
        ...state.queue,
        ...products.map((p) => ({
          id: crypto.randomUUID(),
          sku: p.sku || 'UNKNOWN',
          name: p.title || 'Untitled',
          imageUrl: p.image_url,
          status: 'PENDING' as const,
        })),
      ],
    })),

  customPresets: JSON.parse(localStorage.getItem('production-custom-presets') || '[]'),

  addCustomPreset: (preset) =>
    set((state) => {
      const updated = [...state.customPresets, preset];
      localStorage.setItem('production-custom-presets', JSON.stringify(updated));
      return { customPresets: updated };
    }),

  removeCustomPreset: (id) =>
    set((state) => {
      const updated = state.customPresets.filter(p => p.id !== id);
      localStorage.setItem('production-custom-presets', JSON.stringify(updated));
      return { customPresets: updated };
    }),

  bareCache: {},
  setBareCache: (key, image) => set((state) => ({ bareCache: { ...state.bareCache, [key]: image } })),
  getBareCache: (key) => get().bareCache[key],
  clearBareCache: () => set({ bareCache: {} }),

  // Production Stack session
  stackSession: null,

  createStackSession: (baseImage, aspectRatio, imageSize) => {
    const session: ProductionStackSession = {
      id: crypto.randomUUID(),
      baseImage,
      aspectRatio,
      imageSize,
      layers: [],
      stepStates: [],
      currentImage: null,
      chatSession: null,
      followUpHistory: [],
      status: 'planning',
      createdAt: Date.now(),
      referenceBundle: null,
      effectiveReferenceBundle: null,
      excludedReferences: [],
      validationResults: [],
    };
    set({ stackSession: session });
    return session;
  },

  updateStackSession: (updates) =>
    set((state) => ({
      stackSession: state.stackSession
        ? { ...state.stackSession, ...updates }
        : null,
    })),

  addLayerToStack: (layer) =>
    set((state) => {
      if (!state.stackSession) return {};
      const layers = [...state.stackSession.layers, { ...layer, ordinal: state.stackSession.layers.length }];
      return { stackSession: { ...state.stackSession, layers } };
    }),

  removeLayerFromStack: (layerId) =>
    set((state) => {
      if (!state.stackSession) return {};
      const layers = state.stackSession.layers
        .filter((l) => l.id !== layerId)
        .map((l, i) => ({ ...l, ordinal: i }));
      return { stackSession: { ...state.stackSession, layers } };
    }),

  reorderStackLayers: (layerIds) =>
    set((state) => {
      if (!state.stackSession) return {};
      const layerMap = new Map(state.stackSession.layers.map((l) => [l.id, l]));
      const layers = layerIds
        .map((id) => layerMap.get(id))
        .filter((l): l is StackLayer => l !== undefined)
        .map((l, i) => ({ ...l, ordinal: i }));
      return { stackSession: { ...state.stackSession, layers } };
    }),

  updateStepState: (stepIndex, updates) =>
    set((state) => {
      if (!state.stackSession) return {};
      const stepStates = state.stackSession.stepStates.map((ss, i) =>
        i === stepIndex ? { ...ss, ...updates } : ss
      );
      return { stackSession: { ...state.stackSession, stepStates } };
    }),

  resetStackSession: () => set({ stackSession: null }),

  // OPS-01: Session duplication
  duplicateStackSession: () => {
    const current = get().stackSession;
    if (!current) return;
    const clone: ProductionStackSession = {
      ...current,
      id: crypto.randomUUID(),
      stepStates: current.layers.map((layer) => ({
        layerId: layer.id,
        status: 'pending' as const,
        currentAttempt: 0,
        maxAttempts: 3,
        snapshots: [],
        approvedSnapshotIndex: null,
      })),
      currentImage: null,
      chatSession: null,
      followUpHistory: [],
      status: 'planning',
      createdAt: Date.now(),
      referenceBundle: null,
      effectiveReferenceBundle: null,
      excludedReferences: [],
      validationResults: [],
    };
    set({ stackSession: clone });
  },

  // OPS-02: Stack presets
  stackPresets: JSON.parse(localStorage.getItem('stack-presets') || '[]') as StackPreset[],

  saveStackPreset: (name) => {
    const session = get().stackSession;
    if (!session) return;
    const preset: StackPreset = {
      id: crypto.randomUUID(),
      name,
      layers: session.layers.map((l) => ({
        name: l.name,
        productCategory: l.productCategory,
        targetZone: l.targetZone,
      })),
      aspectRatio: session.aspectRatio,
      imageSize: session.imageSize,
      createdAt: Date.now(),
    };
    const updated = [...get().stackPresets, preset];
    localStorage.setItem('stack-presets', JSON.stringify(updated));
    set({ stackPresets: updated });
  },

  loadStackPreset: (presetId) => {
    const preset = get().stackPresets.find((p) => p.id === presetId);
    if (!preset) return;
    const session: ProductionStackSession = {
      id: crypto.randomUUID(),
      baseImage: '',
      aspectRatio: preset.aspectRatio,
      imageSize: preset.imageSize,
      layers: preset.layers.map((l, i) => ({
        id: crypto.randomUUID(),
        ordinal: i,
        name: l.name,
        productImage: '',
        productCategory: l.productCategory,
        targetZone: l.targetZone,
      })),
      stepStates: [],
      currentImage: null,
      chatSession: null,
      followUpHistory: [],
      status: 'planning',
      createdAt: Date.now(),
      referenceBundle: null,
      effectiveReferenceBundle: null,
      excludedReferences: [],
      validationResults: [],
    };
    set({ stackSession: session });
  },

  deleteStackPreset: (presetId) => {
    const updated = get().stackPresets.filter((p) => p.id !== presetId);
    localStorage.setItem('stack-presets', JSON.stringify(updated));
    set({ stackPresets: updated });
  },
}));

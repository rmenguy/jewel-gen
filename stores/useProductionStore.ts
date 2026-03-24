import { create } from 'zustand';
import { ProductionItem, Product, CustomPreset, ProductionStackSession, StackLayer, StepState } from '../types';

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

  // Stack session state (STATE-01, STATE-02)
  stackSession: ProductionStackSession | null;

  // Stack session actions
  createStackSession: (baseImage: string, aspectRatio: string, imageSize: string) => ProductionStackSession;
  updateStackSession: (updates: Partial<ProductionStackSession>) => void;
  addLayerToStack: (layer: StackLayer) => void;
  removeLayerFromStack: (layerId: string) => void;
  reorderStackLayers: (layerIds: string[]) => void;
  updateStepState: (stepIndex: number, updates: Partial<StepState>) => void;
  resetStackSession: () => void;
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

  // ─── Stack Session State ──────────────────────────────────────

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

  updateStackSession: (updates) => {
    const current = get().stackSession;
    if (!current) return;
    set({ stackSession: { ...current, ...updates } });
  },

  addLayerToStack: (layer) => {
    const current = get().stackSession;
    if (!current) return;
    set({
      stackSession: {
        ...current,
        layers: [...current.layers, layer],
      },
    });
  },

  removeLayerFromStack: (layerId) => {
    const current = get().stackSession;
    if (!current) return;
    const filtered = current.layers
      .filter((l) => l.id !== layerId)
      .map((l, i) => ({ ...l, ordinal: i }));
    set({
      stackSession: {
        ...current,
        layers: filtered,
      },
    });
  },

  reorderStackLayers: (layerIds) => {
    const current = get().stackSession;
    if (!current) return;
    const layerMap = new Map(current.layers.map((l) => [l.id, l]));
    const reordered = layerIds
      .map((id) => layerMap.get(id))
      .filter((l): l is StackLayer => l !== undefined)
      .map((l, i) => ({ ...l, ordinal: i }));
    set({
      stackSession: {
        ...current,
        layers: reordered,
      },
    });
  },

  updateStepState: (stepIndex, updates) => {
    const current = get().stackSession;
    if (!current || stepIndex < 0 || stepIndex >= current.stepStates.length) return;
    const updatedStepStates = [...current.stepStates];
    updatedStepStates[stepIndex] = { ...updatedStepStates[stepIndex], ...updates };
    set({
      stackSession: {
        ...current,
        stepStates: updatedStepStates,
      },
    });
  },

  resetStackSession: () => set({ stackSession: null }),
}));

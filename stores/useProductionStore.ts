import { create } from 'zustand';
import { ProductionItem, Product } from '../types';

interface ProductionStore {
  queue: ProductionItem[];
  mannequinImage: string | null;

  addToQueue: (items: ProductionItem[]) => void;
  setQueue: (queue: ProductionItem[] | ((prev: ProductionItem[]) => ProductionItem[])) => void;
  updateItem: (id: string, updates: Partial<ProductionItem>) => void;
  clearQueue: () => void;
  setMannequinImage: (img: string | null) => void;

  // Convert catalog products to production items and add
  addProductsToQueue: (products: Product[]) => void;
}

export const useProductionStore = create<ProductionStore>((set) => ({
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
}));

import { create } from 'zustand';
import { EngineType } from '../types';
import { setApiKey as setGeminiApiKey } from '../services/geminiService';

interface AppStore {
  apiKey: string;
  apiKeySet: boolean;
  activeEngine: EngineType;
  setApiKey: (key: string) => void;
  setActiveEngine: (engine: EngineType) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  apiKey: '',
  apiKeySet: false,
  activeEngine: 'CATALOG',
  setApiKey: (key) => {
    setGeminiApiKey(key);
    set({ apiKey: key, apiKeySet: true });
  },
  setActiveEngine: (engine) => set({ activeEngine: engine }),
}));

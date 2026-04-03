import { create } from 'zustand';
import { EngineType } from '../types';
import { setApiKey as setGeminiApiKey } from '../services/geminiService';

interface AppStore {
  apiKey: string;
  apiKeySet: boolean;
  authenticated: boolean;
  activeEngine: EngineType;
  setApiKey: (key: string) => void;
  setAuthenticated: (value: boolean) => void;
  setActiveEngine: (engine: EngineType) => void;
}

const envApiKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
const hasEnvKey = !!envApiKey?.trim();

if (hasEnvKey) {
  setGeminiApiKey(envApiKey!.trim());
}

export const useAppStore = create<AppStore>((set) => ({
  apiKey: hasEnvKey ? envApiKey!.trim() : '',
  apiKeySet: hasEnvKey,
  authenticated: false,
  activeEngine: 'PRODUCTION',
  setApiKey: (key) => {
    setGeminiApiKey(key);
    set({ apiKey: key, apiKeySet: true });
  },
  setAuthenticated: (value) => set({ authenticated: value }),
  setActiveEngine: (engine) => set({ activeEngine: engine }),
}));

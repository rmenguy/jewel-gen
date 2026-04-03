
import React, { useState } from 'react';
import { useAppStore } from './stores/useAppStore';
import { useProductionStore } from './stores/useProductionStore';
import { CatalogEngine } from './components/CatalogEngine';
import { MannequinEngine } from './components/MannequinEngine';
import { ProductionEngine } from './components/ProductionEngine';
import { ProductionStack } from './components/ProductionStack';
import { BatchEngine } from './components/BatchEngine';
import BannerEngine from './components/BannerEngine';
import { EngineType, Product } from './types';

const VALID_USERNAME = 'virginieberman';
const VALID_PASSWORD = 'bermanpremiereclasse';

const App: React.FC = () => {
  const { apiKeySet, authenticated, activeEngine, setApiKey, setAuthenticated, setActiveEngine } = useAppStore();
  const { mannequinImage, addProductsToQueue } = useProductionStore();
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState(false);

  const handleCatalogTransfer = (products: Product[]) => {
      addProductsToQueue(products);
      setActiveEngine('PRODUCTION');
  };

  const handleApiKeySubmit = () => {
    const trimmed = apiKeyInput.trim();
    if (!trimmed) return;
    setApiKey(trimmed);
  };

  const handleLogin = () => {
    if (username === VALID_USERNAME && password === VALID_PASSWORD) {
      setLoginError(false);
      setAuthenticated(true);
    } else {
      setLoginError(true);
    }
  };

  if (!authenticated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 text-gray-900 selection:bg-indigo-500/20">
        <div className="w-full max-w-md px-6">
          <div className="flex items-center gap-3 mb-8 justify-center">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-200">
              <span className="font-bold text-white text-xl">A</span>
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tighter text-gray-900 leading-none">
                <span className="text-indigo-600">AirmindCreation</span> x VB
              </h1>
              <p className="text-[9px] text-gray-500 font-medium uppercase tracking-[0.3em] mt-1">
                Jewel Brand Content
              </p>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
            <label className="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">
              Identifiant
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => { setUsername(e.target.value); setLoginError(false); }}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              placeholder="Pseudo"
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-indigo-500 transition-colors"
              autoFocus
            />
            <label className="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-3 mt-4">
              Mot de passe
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setLoginError(false); }}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              placeholder="Mot de passe"
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-indigo-500 transition-colors"
            />
            {loginError && (
              <p className="text-xs text-red-500 mt-2">Identifiant ou mot de passe incorrect.</p>
            )}
            <button
              onClick={handleLogin}
              disabled={!username.trim() || !password.trim()}
              className="w-full mt-4 py-3 rounded-lg text-sm font-bold uppercase tracking-wider transition-all duration-300 text-white bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Connexion
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!apiKeySet) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 text-gray-900 selection:bg-indigo-500/20">
        <div className="w-full max-w-md px-6">
          <div className="flex items-center gap-3 mb-8 justify-center">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-200">
              <span className="font-bold text-white text-xl">A</span>
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tighter text-gray-900 leading-none">
                <span className="text-indigo-600">AirmindCreation</span> x VB
              </h1>
              <p className="text-[9px] text-gray-500 font-medium uppercase tracking-[0.3em] mt-1">
                Jewel Brand Content
              </p>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
            <label className="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">
              Gemini API Key
            </label>
            <input
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleApiKeySubmit()}
              placeholder="AIza..."
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-indigo-500 transition-colors"
              autoFocus
            />
            <p className="text-[10px] text-gray-400 mt-2">
              La cle est utilisee uniquement pour cette session.
            </p>
            <button
              onClick={handleApiKeySubmit}
              disabled={!apiKeyInput.trim()}
              className="w-full mt-4 py-3 rounded-lg text-sm font-bold uppercase tracking-wider transition-all duration-300 text-white bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Connexion
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 text-gray-900 selection:bg-indigo-500/20">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-50 w-full bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
            <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-200">
                    <span className="font-bold text-white text-lg">A</span>
                </div>
                <div className="flex flex-col">
                    <h1 className="text-lg font-black tracking-tighter text-gray-900 leading-none">
                        <span className="text-indigo-600">AC x VB</span> — {activeEngine === 'PRODUCTION' ? 'COMPOSITION' : activeEngine === 'CATALOG' ? 'CATALOGUE' : activeEngine === 'BATCH' ? 'LOT' : activeEngine}
                    </h1>
                    <p className="text-[9px] text-gray-500 font-medium uppercase tracking-[0.3em] leading-none mt-1">
                        Jewel Brand Content
                    </p>
                </div>
            </div>

            <nav className="hidden md:flex items-center gap-1 bg-gray-100 p-1 rounded-xl border border-gray-200">
                {([
                    { key: 'PRODUCTION' as EngineType, label: 'COMPOSITION' },
                    { key: 'MANNEQUIN' as EngineType, label: 'MANNEQUIN' },
                    { key: 'CATALOG' as EngineType, label: 'CATALOGUE' },
                    { key: 'BATCH' as EngineType, label: 'LOT' },
                ]).map(({ key, label }) => (
                    <button
                        key={key}
                        onClick={() => setActiveEngine(key)}
                        className={`px-4 py-1.5 rounded-lg text-xs font-bold tracking-wider transition-all duration-300 ${
                            activeEngine === key
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'
                        }`}
                    >
                        {label}
                    </button>
                ))}
            </nav>
             {/* Mobile Nav */}
            <div className="md:hidden">
                 <select
                    value={activeEngine}
                    onChange={(e) => setActiveEngine(e.target.value as EngineType)}
                    className="bg-white border border-gray-200 text-xs font-bold rounded-lg px-2 py-1 outline-none text-gray-900"
                 >
                    <option value="PRODUCTION">COMPOSITION</option>
                    <option value="MANNEQUIN">MANNEQUIN</option>
                    <option value="CATALOG">CATALOGUE</option>
                    <option value="BATCH">LOT</option>
                 </select>
            </div>
        </div>
      </header>

      {/* Main Content - persisted using hidden class */}
      <main className="flex-1 w-full max-w-7xl mx-auto p-4 md:p-6 lg:p-8 relative">
        <div className={activeEngine === 'CATALOG' ? 'block h-full' : 'hidden h-full'}>
            <CatalogEngine onTransfer={handleCatalogTransfer} />
        </div>

        <div className={activeEngine === 'MANNEQUIN' ? 'block h-full' : 'hidden h-full'}>
            <MannequinEngine />
        </div>

        <div className={activeEngine === 'PRODUCTION' ? 'block h-full' : 'hidden h-full'}>
            <ProductionStack />
        </div>

        <div className={activeEngine === 'BATCH' ? 'block h-full' : 'hidden h-full'}>
            <BatchEngine mannequinImage={mannequinImage} />
        </div>

        {/* Banner engine hidden per Phase 1 decision — preserved for future re-enablement */}
      </main>

      {/* Footer */}
      <footer className="py-6 border-t border-gray-200 mt-auto bg-white">
        <div className="max-w-7xl mx-auto px-6 flex justify-between items-center text-[10px] uppercase tracking-widest text-gray-400">
            <span>System Status: <span className="text-emerald-500">Operational</span></span>
            <span>V 3.2.1 // INTERNAL USE ONLY</span>
        </div>
      </footer>
    </div>
  );
};

export default App;

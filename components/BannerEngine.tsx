import { useState } from 'react';
import { useBannerStore } from '../stores/useBannerStore';
import { generateBannerMannequin, generateBannerWithJewelry, freeformEditImage } from '../services/geminiService';
import { downloadBase64Image } from '../services/downloadService';
import { BannerJewelry } from '../types';

const STEPS = [
  { num: 1, label: 'Mannequin' },
  { num: 2, label: 'Bijoux' },
  { num: 3, label: 'Refinement' },
] as const;

function Stepper({ current }: { current: 1 | 2 | 3 }) {
  return (
    <div className="flex items-center justify-center gap-2 py-3 bg-gray-50 border-b border-gray-200">
      {STEPS.map((step, i) => (
        <div key={step.num} className="flex items-center gap-2">
          {i > 0 && (
            <div className={`w-8 h-0.5 ${current >= step.num ? 'bg-green-500' : 'bg-gray-300'}`} />
          )}
          <div className="flex items-center gap-1.5">
            <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
              current > step.num ? 'bg-green-500 text-white' :
              current === step.num ? 'bg-indigo-500 text-white' :
              'bg-gray-300 text-gray-500'
            }`}>
              {current > step.num ? '✓' : step.num}
            </span>
            <span className={`text-xs font-semibold ${
              current > step.num ? 'text-green-500' :
              current === step.num ? 'text-indigo-500' :
              'text-gray-400'
            }`}>{step.label}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function BannerEngine() {
  const store = useBannerStore();
  const [repositionPrompt, setRepositionPrompt] = useState('');
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editingNameValue, setEditingNameValue] = useState('');

  const handleAddIdentityPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    store.addIdentityPhoto(await readFileAsBase64(file));
    e.target.value = '';
  };

  const handleSetPoseReference = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    store.setPoseReference(await readFileAsBase64(file));
    e.target.value = '';
  };

  const handleSetBackground = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    store.setBackgroundImage(await readFileAsBase64(file));
    e.target.value = '';
  };

  const handleAddJewelry = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const base64 = await readFileAsBase64(file);
    const name = file.name.replace(/\.[^.]+$/, '');
    const item: BannerJewelry = {
      id: crypto.randomUUID(),
      name,
      imageBase64: base64,
    };
    store.addJewelry(item);
    setEditingNameId(item.id);
    setEditingNameValue(name);
    e.target.value = '';
  };

  const handleSaveName = (id: string) => {
    if (editingNameValue.trim()) {
      store.updateJewelryName(id, editingNameValue.trim());
    }
    setEditingNameId(null);
  };

  const handleGenerateMannequin = async () => {
    if (store.identityPhotos.length === 0) {
      store.setError("Ajoute au moins une photo d'identité");
      return;
    }
    store.setError(null);
    store.setIsGeneratingMannequin(true);
    try {
      if (store.mannequinImage) {
        store.pushToMannequinHistory(store.mannequinImage);
      }
      const result = await generateBannerMannequin(
        store.identityPhotos, store.poseReference, store.backgroundImage,
        store.outfitPrompt, store.ambiancePrompt, store.posePrompt,
      );
      store.setMannequinImage(result);
    } catch (err: any) {
      store.setError(err.message || 'Erreur de génération');
    } finally {
      store.setIsGeneratingMannequin(false);
    }
  };

  const handleGenerateBanner = async () => {
    if (store.jewelryItems.length === 0) {
      store.setError('Ajoute au moins un bijou');
      return;
    }
    if (!store.placementPrompt.trim()) {
      store.setError('Décris le placement des bijoux');
      return;
    }
    store.setError(null);
    store.setIsGeneratingBanner(true);
    try {
      if (store.bannerImage) {
        store.pushToBannerHistory(store.bannerImage);
      }
      const result = await generateBannerWithJewelry(
        store.mannequinImage!, store.jewelryItems, store.placementPrompt,
      );
      store.setBannerImage(result);
    } catch (err: any) {
      store.setError(err.message || 'Erreur de génération');
    } finally {
      store.setIsGeneratingBanner(false);
    }
  };

  const handleReposition = async () => {
    if (!repositionPrompt.trim()) return;
    store.setIsRepositioning(true);
    store.setError(null);
    try {
      store.pushToBannerHistory(store.bannerImage!);
      const result = await freeformEditImage(
        store.bannerImage!,
        `${repositionPrompt}. Keep EVERYTHING else EXACTLY identical — same model, same pose, same lighting, same other jewelry.`,
      );
      store.setBannerImage(result);
      setRepositionPrompt('');
    } catch (err: any) {
      store.setError(err.message || 'Erreur de repositionnement');
    } finally {
      store.setIsRepositioning(false);
    }
  };

  const isLoading = store.isGeneratingMannequin || store.isGeneratingBanner || store.isRepositioning;

  return (
    <div className="flex flex-col h-full">
      <Stepper current={store.currentStep} />

      {store.error && (
        <div className="px-4 py-2 bg-red-50 border-b border-red-200 text-red-700 text-sm flex items-center justify-between">
          <span>{store.error}</span>
          <button onClick={() => store.setError(null)} className="text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* LEFT PANEL */}
        <div className="w-72 border-r border-gray-200 p-4 overflow-y-auto bg-white flex-shrink-0">
          {store.currentStep === 1 ? (
            <>
              <h3 className="text-sm font-bold text-gray-700 mb-3">Références</h3>

              <div className="mb-4">
                <div className="text-xs font-semibold text-gray-500 mb-1.5">Photos identité ({store.identityPhotos.length}/3)</div>
                <div className="flex gap-1.5 flex-wrap">
                  {store.identityPhotos.map((photo, i) => (
                    <div key={i} className="relative w-14 h-14 rounded-lg overflow-hidden border border-gray-200">
                      <img src={photo} alt="" className="w-full h-full object-cover" />
                      <button onClick={() => store.removeIdentityPhoto(i)} className="absolute top-0 right-0 w-4 h-4 bg-red-500 text-white text-[10px] rounded-bl">✕</button>
                    </div>
                  ))}
                  {store.identityPhotos.length < 3 && (
                    <label className="w-14 h-14 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center text-gray-400 text-xl cursor-pointer hover:border-indigo-400 hover:text-indigo-400">
                      +
                      <input type="file" accept="image/*" className="hidden" onChange={handleAddIdentityPhoto} />
                    </label>
                  )}
                </div>
              </div>

              <div className="mb-4">
                <div className="text-xs font-semibold text-gray-500 mb-1.5">Photo de pose (opt.)</div>
                {store.poseReference ? (
                  <div className="relative w-full h-12 rounded-lg overflow-hidden border border-gray-200">
                    <img src={store.poseReference} alt="" className="w-full h-full object-cover" />
                    <button onClick={() => store.setPoseReference(null)} className="absolute top-0 right-0 w-4 h-4 bg-red-500 text-white text-[10px] rounded-bl">✕</button>
                  </div>
                ) : (
                  <label className="w-full h-12 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center text-gray-400 text-xs cursor-pointer hover:border-indigo-400">
                    Drop pose reference
                    <input type="file" accept="image/*" className="hidden" onChange={handleSetPoseReference} />
                  </label>
                )}
              </div>

              <div className="mb-4">
                <div className="text-xs font-semibold text-gray-500 mb-1.5">Image décor (opt.)</div>
                {store.backgroundImage ? (
                  <div className="relative w-full h-12 rounded-lg overflow-hidden border border-gray-200">
                    <img src={store.backgroundImage} alt="" className="w-full h-full object-cover" />
                    <button onClick={() => store.setBackgroundImage(null)} className="absolute top-0 right-0 w-4 h-4 bg-red-500 text-white text-[10px] rounded-bl">✕</button>
                  </div>
                ) : (
                  <label className="w-full h-12 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center text-gray-400 text-xs cursor-pointer hover:border-indigo-400">
                    Drop background image
                    <input type="file" accept="image/*" className="hidden" onChange={handleSetBackground} />
                  </label>
                )}
              </div>

              <hr className="my-4 border-gray-200" />
              <h3 className="text-sm font-bold text-gray-700 mb-3">Prompts</h3>

              <div className="mb-3">
                <div className="text-xs font-semibold text-gray-500 mb-1">Habits</div>
                <textarea value={store.outfitPrompt} onChange={(e) => store.setOutfitPrompt(e.target.value)}
                  placeholder="White crochet top, bohemian..."
                  className="w-full h-16 border border-gray-300 rounded-lg p-2 text-xs resize-none focus:border-indigo-400 focus:outline-none" />
              </div>
              <div className="mb-3">
                <div className="text-xs font-semibold text-gray-500 mb-1">Ambiance / Éclairage</div>
                <textarea value={store.ambiancePrompt} onChange={(e) => store.setAmbiancePrompt(e.target.value)}
                  placeholder="Warm golden hour, sun-kissed..."
                  className="w-full h-16 border border-gray-300 rounded-lg p-2 text-xs resize-none focus:border-indigo-400 focus:outline-none" />
              </div>
              <div className="mb-3">
                <div className="text-xs font-semibold text-gray-500 mb-1">Pose / Cadrage</div>
                <textarea value={store.posePrompt} onChange={(e) => store.setPosePrompt(e.target.value)}
                  placeholder="Tight bust crop, hands framing..."
                  className="w-full h-16 border border-gray-300 rounded-lg p-2 text-xs resize-none focus:border-indigo-400 focus:outline-none" />
              </div>

              <button onClick={handleGenerateMannequin} disabled={isLoading || store.identityPhotos.length === 0}
                className="w-full py-2.5 bg-indigo-500 text-white rounded-lg font-bold text-sm disabled:opacity-50 hover:bg-indigo-600 transition-colors">
                {store.isGeneratingMannequin ? 'Génération...' : 'Générer le mannequin →'}
              </button>
            </>
          ) : (
            <>
              <h3 className="text-sm font-bold text-gray-700 mb-2">Placement des bijoux</h3>
              <p className="text-[11px] text-gray-400 mb-3">
                Décris où placer chaque bijou en utilisant son nom.
              </p>
              <textarea
                value={store.placementPrompt}
                onChange={(e) => store.setPlacementPrompt(e.target.value)}
                placeholder={store.jewelryItems.length > 0
                  ? `Ex:\n${store.jewelryItems.map(j => `"${j.name}" → ras du cou / poitrine / oreille gauche...`).join('\n')}`
                  : 'Ajoute des bijoux puis décris leur placement...'}
                className="w-full h-40 border border-gray-300 rounded-lg p-2 text-xs resize-none focus:border-indigo-400 focus:outline-none mb-3"
              />
              <button onClick={handleGenerateBanner}
                disabled={isLoading || store.jewelryItems.length === 0 || !store.placementPrompt.trim()}
                className="w-full py-2.5 bg-indigo-500 text-white rounded-lg font-bold text-sm disabled:opacity-50 hover:bg-indigo-600 transition-colors">
                {store.isGeneratingBanner ? 'Génération...' : `Générer avec ${store.jewelryItems.length} bijou(x) →`}
              </button>

              {store.currentStep === 3 && (
                <>
                  <hr className="my-4 border-gray-200" />
                  <h3 className="text-sm font-bold text-gray-700 mb-2">Refinement</h3>
                  <p className="text-[11px] text-gray-400 mb-2">Ajuste le placement ou tout autre détail.</p>
                  <textarea value={repositionPrompt} onChange={(e) => setRepositionPrompt(e.target.value)}
                    placeholder='Ex: Monte le collier de 2cm, tourne la bague...'
                    className="w-full h-20 border-2 border-purple-400 rounded-lg p-2 text-xs resize-none focus:border-purple-500 focus:outline-none mb-2" />
                  <button onClick={handleReposition} disabled={!repositionPrompt.trim() || isLoading}
                    className="w-full py-2 bg-purple-600 text-white rounded-lg font-bold text-sm disabled:opacity-50 hover:bg-purple-700 transition-colors">
                    {store.isRepositioning ? 'Repositionnement...' : 'Appliquer'}
                  </button>
                </>
              )}
            </>
          )}
        </div>

        {/* CENTER PANEL */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 flex items-center justify-center p-4 min-h-0">
            <div className="relative w-full max-w-[640px] aspect-video bg-gradient-to-br from-amber-50 to-orange-100 rounded-xl border-2 border-gray-200 overflow-hidden">
              {store.bannerImage ? (
                <img src={store.bannerImage} alt="Banner" className="w-full h-full object-contain" />
              ) : store.mannequinImage ? (
                <img src={store.mannequinImage} alt="Mannequin" className="w-full h-full object-contain" />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-gray-400">
                  <div className="text-3xl mb-2">16:9</div>
                  <div className="text-xs">Bannière preview</div>
                </div>
              )}

              {isLoading && (
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                  <div className="bg-white rounded-lg px-4 py-2 text-sm font-semibold text-indigo-600">
                    {store.isGeneratingMannequin ? 'Génération du mannequin...' :
                     store.isGeneratingBanner ? 'Génération de la bannière...' :
                     'Repositionnement...'}
                  </div>
                </div>
              )}

              <div className="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-indigo-500" />
              <div className="absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-indigo-500" />
              <div className="absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-indigo-500" />
              <div className="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-indigo-500" />
            </div>
          </div>

          {/* BOTTOM ACTION BAR */}
          <div className="px-4 py-2.5 border-t border-gray-200 flex items-center justify-center gap-2 bg-white flex-shrink-0">
            {store.currentStep === 1 && (
              <>
                <button onClick={() => store.undoMannequin()} disabled={store.mannequinHistory.length === 0 || isLoading}
                  className="px-3 py-1.5 bg-gray-100 border border-gray-300 rounded-md text-xs text-gray-600 disabled:opacity-30">← Undo</button>
                <button onClick={handleGenerateMannequin} disabled={isLoading || store.identityPhotos.length === 0}
                  className="px-3 py-1.5 bg-gray-100 border border-gray-300 rounded-md text-xs text-gray-600 disabled:opacity-30">Regénérer</button>
                <button onClick={() => store.setCurrentStep(2)} disabled={!store.mannequinImage || isLoading}
                  className="px-3 py-1.5 bg-indigo-500 text-white rounded-md text-xs font-semibold disabled:opacity-30">Accepter → Bijoux</button>
                {store.mannequinImage && (
                  <button onClick={() => downloadBase64Image(store.mannequinImage!, 'banner-mannequin.png')}
                    className="px-3 py-1.5 bg-gray-100 border border-gray-300 rounded-md text-xs text-gray-600">Download</button>
                )}
              </>
            )}
            {store.currentStep === 2 && (
              <>
                <button onClick={() => store.goBackToStep(1)} disabled={isLoading}
                  className="px-3 py-1.5 bg-gray-100 border border-gray-300 rounded-md text-xs text-gray-600 disabled:opacity-30">← Mannequin</button>
                {store.bannerImage && (
                  <>
                    <button onClick={() => store.undoBanner()} disabled={store.bannerHistory.length === 0 || isLoading}
                      className="px-3 py-1.5 bg-gray-100 border border-gray-300 rounded-md text-xs text-gray-600 disabled:opacity-30">← Undo</button>
                    <button onClick={() => store.setCurrentStep(3)} disabled={isLoading}
                      className="px-3 py-1.5 bg-purple-600 text-white rounded-md text-xs font-semibold disabled:opacity-30">Repositionner</button>
                    <button onClick={() => downloadBase64Image(store.bannerImage!, 'banner-final.png')}
                      className="px-3 py-1.5 bg-green-500 text-white rounded-md text-xs font-semibold">Download ↓</button>
                  </>
                )}
              </>
            )}
            {store.currentStep === 3 && (
              <>
                <button onClick={() => store.goBackToStep(2)} disabled={isLoading}
                  className="px-3 py-1.5 bg-gray-100 border border-gray-300 rounded-md text-xs text-gray-600 disabled:opacity-30">← Bijoux</button>
                <button onClick={() => store.undoBanner()} disabled={store.bannerHistory.length === 0 || isLoading}
                  className="px-3 py-1.5 bg-gray-100 border border-gray-300 rounded-md text-xs text-gray-600 disabled:opacity-30">← Undo</button>
                <button onClick={() => downloadBase64Image(store.bannerImage!, 'banner-final.png')}
                  className="px-3 py-1.5 bg-green-500 text-white rounded-md text-xs font-semibold">Download ↓</button>
              </>
            )}
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div className="w-60 border-l border-gray-200 p-4 overflow-y-auto bg-white flex-shrink-0">
          <h3 className="text-sm font-bold text-gray-700 mb-1">Bijoux ({store.jewelryItems.length}/8)</h3>
          <p className="text-[11px] text-gray-400 mb-3">Uploade et nomme chaque bijou</p>

          <label className="w-full h-10 mb-3 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center text-gray-400 text-xs cursor-pointer hover:border-indigo-400 hover:text-indigo-400">
            + Ajouter bijou
            <input type="file" accept="image/*" className="hidden" onChange={handleAddJewelry} disabled={store.jewelryItems.length >= 8} />
          </label>

          <div className="flex flex-col gap-2">
            {store.jewelryItems.map((jewelry) => (
              <div key={jewelry.id} className="flex gap-2 items-center p-2 rounded-lg border border-gray-200 bg-gray-50">
                <img src={jewelry.imageBase64} alt="" className="w-10 h-10 rounded-md object-cover flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  {editingNameId === jewelry.id ? (
                    <input type="text" value={editingNameValue}
                      onChange={(e) => setEditingNameValue(e.target.value)}
                      onBlur={() => handleSaveName(jewelry.id)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSaveName(jewelry.id)}
                      className="w-full text-xs font-semibold border border-indigo-400 rounded px-1 py-0.5 focus:outline-none"
                      autoFocus />
                  ) : (
                    <div className="text-xs font-semibold text-gray-700 truncate cursor-pointer hover:text-indigo-500"
                      onClick={() => { setEditingNameId(jewelry.id); setEditingNameValue(jewelry.name); }}
                      title="Cliquer pour renommer">
                      {jewelry.name}
                    </div>
                  )}
                </div>
                <button onClick={() => store.removeJewelry(jewelry.id)}
                  className="w-5 h-5 rounded-full bg-red-100 text-red-500 text-[10px] flex items-center justify-center hover:bg-red-200 flex-shrink-0">✕</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

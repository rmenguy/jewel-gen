import { useState } from 'react';
import { useBannerStore } from '../stores/useBannerStore';
import { generateBannerMannequin, addSingleJewelryToBanner, refuseBannerIdentity, freeformEditImage } from '../services/geminiService';
import { downloadBase64Image } from '../services/downloadService';
import { BannerJewelry } from '../types';

function Stepper({ current }: { current: 1 | 2 }) {
  const steps = [{ num: 1, label: 'Mannequin' }, { num: 2, label: 'Bijoux' }] as const;
  return (
    <div className="flex items-center justify-center gap-2 py-3 bg-gray-50 border-b border-gray-200">
      {steps.map((step, i) => (
        <div key={step.num} className="flex items-center gap-2">
          {i > 0 && <div className={`w-8 h-0.5 ${current >= step.num ? 'bg-green-500' : 'bg-gray-300'}`} />}
          <div className="flex items-center gap-1.5">
            <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
              current > step.num ? 'bg-green-500 text-white' : current === step.num ? 'bg-indigo-500 text-white' : 'bg-gray-300 text-gray-500'
            }`}>{current > step.num ? '✓' : step.num}</span>
            <span className={`text-xs font-semibold ${
              current > step.num ? 'text-green-500' : current === step.num ? 'text-indigo-500' : 'text-gray-400'
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
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editingNameValue, setEditingNameValue] = useState('');
  const [freeformPrompt, setFreeformPrompt] = useState('');

  // ── Handlers ──

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
    const item: BannerJewelry = { id: crypto.randomUUID(), name, imageBase64: base64, placed: false };
    store.addJewelry(item);
    setEditingNameId(item.id);
    setEditingNameValue(name);
    e.target.value = '';
  };

  const handleSaveName = (id: string) => {
    if (editingNameValue.trim()) store.updateJewelryName(id, editingNameValue.trim());
    setEditingNameId(null);
  };

  const handleGenerateMannequin = async () => {
    if (store.identityPhotos.length === 0) { store.setError("Ajoute au moins une photo d'identité"); return; }
    store.setError(null);
    store.setIsGeneratingMannequin(true);
    try {
      if (store.mannequinImage) store.pushToMannequinHistory(store.mannequinImage);
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

  const handleAddJewelryToImage = async () => {
    const jewelry = store.jewelryItems.find(j => j.id === store.selectedJewelryId);
    if (!jewelry || !store.currentPlacementPrompt.trim() || !store.workingImage) return;
    store.setError(null);
    store.setIsAddingJewelry(true);
    try {
      store.pushToWorkingHistory(store.workingImage);
      const result = await addSingleJewelryToBanner(
        store.workingImage, jewelry, store.currentPlacementPrompt, store.identityPhotos,
      );
      store.setWorkingImage(result);
      store.markJewelryPlaced(jewelry.id);
    } catch (err: any) {
      store.setError(err.message || "Erreur d'ajout");
    } finally {
      store.setIsAddingJewelry(false);
    }
  };

  const handleRefuse = async () => {
    if (!store.workingImage || store.identityPhotos.length === 0) return;
    store.setError(null);
    store.setIsRefusing(true);
    try {
      store.pushToWorkingHistory(store.workingImage);
      const result = await refuseBannerIdentity(store.workingImage, store.identityPhotos);
      store.setWorkingImage(result);
    } catch (err: any) {
      store.setError(err.message || 'Erreur de refusion');
    } finally {
      store.setIsRefusing(false);
    }
  };

  const handleFreeformEdit = async () => {
    if (!freeformPrompt.trim() || !store.workingImage) return;
    store.setIsRepositioning(true);
    store.setError(null);
    try {
      store.pushToWorkingHistory(store.workingImage);
      const result = await freeformEditImage(
        store.workingImage,
        `${freeformPrompt}. Keep EVERYTHING else EXACTLY identical.`,
      );
      store.setWorkingImage(result);
      setFreeformPrompt('');
    } catch (err: any) {
      store.setError(err.message || 'Erreur');
    } finally {
      store.setIsRepositioning(false);
    }
  };

  const isLoading = store.isGeneratingMannequin || store.isAddingJewelry || store.isRefusing || store.isRepositioning;
  const selectedJewelry = store.jewelryItems.find(j => j.id === store.selectedJewelryId);
  const placedCount = store.jewelryItems.filter(j => j.placed).length;
  const pendingCount = store.jewelryItems.filter(j => !j.placed).length;
  const displayImage = store.currentStep === 2 ? store.workingImage : store.mannequinImage;

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
                      +<input type="file" accept="image/*" className="hidden" onChange={handleAddIdentityPhoto} />
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
                    Drop pose reference<input type="file" accept="image/*" className="hidden" onChange={handleSetPoseReference} />
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
                    Drop background image<input type="file" accept="image/*" className="hidden" onChange={handleSetBackground} />
                  </label>
                )}
              </div>
              <hr className="my-4 border-gray-200" />
              <h3 className="text-sm font-bold text-gray-700 mb-3">Prompts</h3>
              <div className="mb-3">
                <div className="text-xs font-semibold text-gray-500 mb-1">Habits</div>
                <textarea value={store.outfitPrompt} onChange={(e) => store.setOutfitPrompt(e.target.value)}
                  placeholder="White crochet top, bohemian..." className="w-full h-16 border border-gray-300 rounded-lg p-2 text-xs resize-none focus:border-indigo-400 focus:outline-none" />
              </div>
              <div className="mb-3">
                <div className="text-xs font-semibold text-gray-500 mb-1">Ambiance / Éclairage</div>
                <textarea value={store.ambiancePrompt} onChange={(e) => store.setAmbiancePrompt(e.target.value)}
                  placeholder="Warm golden hour, sun-kissed..." className="w-full h-16 border border-gray-300 rounded-lg p-2 text-xs resize-none focus:border-indigo-400 focus:outline-none" />
              </div>
              <div className="mb-3">
                <div className="text-xs font-semibold text-gray-500 mb-1">Pose / Cadrage</div>
                <textarea value={store.posePrompt} onChange={(e) => store.setPosePrompt(e.target.value)}
                  placeholder="Tight bust crop, hands framing..." className="w-full h-16 border border-gray-300 rounded-lg p-2 text-xs resize-none focus:border-indigo-400 focus:outline-none" />
              </div>
              <button onClick={handleGenerateMannequin} disabled={isLoading || store.identityPhotos.length === 0}
                className="w-full py-2.5 bg-indigo-500 text-white rounded-lg font-bold text-sm disabled:opacity-50 hover:bg-indigo-600 transition-colors">
                {store.isGeneratingMannequin ? 'Génération...' : 'Générer le mannequin →'}
              </button>
            </>
          ) : (
            /* Step 2: Iterative jewelry placement */
            <>
              {/* Selected jewelry placement */}
              {selectedJewelry ? (
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <img src={selectedJewelry.imageBase64} alt="" className="w-8 h-8 rounded object-cover" />
                    <h3 className="text-sm font-bold text-indigo-600 truncate">{selectedJewelry.name}</h3>
                  </div>
                  <div className="text-xs font-semibold text-gray-500 mb-1">Où placer ce bijou ?</div>
                  <textarea
                    value={store.currentPlacementPrompt}
                    onChange={(e) => store.setCurrentPlacementPrompt(e.target.value)}
                    placeholder="Ex: ras du cou, oreille gauche lobe, index main droite..."
                    className="w-full h-20 border border-gray-300 rounded-lg p-2 text-xs resize-none focus:border-indigo-400 focus:outline-none mb-2"
                  />
                  <button onClick={handleAddJewelryToImage}
                    disabled={isLoading || !store.currentPlacementPrompt.trim()}
                    className="w-full py-2 bg-indigo-500 text-white rounded-lg font-bold text-sm disabled:opacity-50 hover:bg-indigo-600 transition-colors">
                    {store.isAddingJewelry ? 'Ajout en cours...' : `Ajouter "${selectedJewelry.name}" →`}
                  </button>
                </div>
              ) : (
                <div className="mb-4 p-3 bg-gray-50 rounded-lg text-center">
                  <p className="text-xs text-gray-400">
                    {pendingCount > 0
                      ? '← Sélectionne un bijou à placer'
                      : placedCount > 0
                      ? 'Tous les bijoux sont placés !'
                      : 'Ajoute des bijoux →'}
                  </p>
                </div>
              )}

              <hr className="my-3 border-gray-200" />

              {/* Refusionner */}
              <button onClick={handleRefuse}
                disabled={isLoading || !store.workingImage || store.identityPhotos.length === 0}
                className="w-full py-2 bg-amber-500 text-white rounded-lg font-bold text-sm disabled:opacity-50 hover:bg-amber-600 transition-colors mb-3">
                {store.isRefusing ? 'Refusion...' : 'Refusionner le mannequin'}
              </button>
              <p className="text-[10px] text-gray-400 mb-4 -mt-1">Recale le visage sans toucher aux bijoux</p>

              {/* Freeform edit */}
              <div className="text-xs font-semibold text-gray-500 mb-1">Retouche libre</div>
              <textarea value={freeformPrompt} onChange={(e) => setFreeformPrompt(e.target.value)}
                placeholder="Ex: Monte le collier, change l'éclairage..."
                className="w-full h-16 border border-gray-300 rounded-lg p-2 text-xs resize-none focus:border-indigo-400 focus:outline-none mb-2" />
              <button onClick={handleFreeformEdit} disabled={!freeformPrompt.trim() || isLoading}
                className="w-full py-2 bg-purple-600 text-white rounded-lg font-bold text-sm disabled:opacity-50 hover:bg-purple-700 transition-colors">
                {store.isRepositioning ? 'Application...' : 'Appliquer'}
              </button>

              {/* Stats */}
              <div className="mt-4 text-[11px] text-gray-400">
                <div>{placedCount} bijou(x) placé(s) · {pendingCount} en attente</div>
              </div>
            </>
          )}
        </div>

        {/* CENTER PANEL */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 flex items-center justify-center p-4 min-h-0">
            <div className="relative w-full max-w-[640px] aspect-video bg-gradient-to-br from-amber-50 to-orange-100 rounded-xl border-2 border-gray-200 overflow-hidden">
              {displayImage ? (
                <img src={displayImage} alt="Banner" className="w-full h-full object-contain" />
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
                     store.isAddingJewelry ? `Ajout de "${selectedJewelry?.name}"...` :
                     store.isRefusing ? 'Refusion du mannequin...' :
                     'Retouche en cours...'}
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
                <button onClick={() => store.acceptMannequin()} disabled={!store.mannequinImage || isLoading}
                  className="px-3 py-1.5 bg-indigo-500 text-white rounded-md text-xs font-semibold disabled:opacity-30">Accepter → Bijoux</button>
                {store.mannequinImage && (
                  <button onClick={() => downloadBase64Image(store.mannequinImage!, 'banner-mannequin.png')}
                    className="px-3 py-1.5 bg-gray-100 border border-gray-300 rounded-md text-xs text-gray-600">Download</button>
                )}
              </>
            )}
            {store.currentStep === 2 && (
              <>
                <button onClick={() => store.goBackToMannequin()} disabled={isLoading}
                  className="px-3 py-1.5 bg-gray-100 border border-gray-300 rounded-md text-xs text-gray-600 disabled:opacity-30">← Mannequin</button>
                <button onClick={() => store.undoWorking()} disabled={store.workingHistory.length === 0 || isLoading}
                  className="px-3 py-1.5 bg-gray-100 border border-gray-300 rounded-md text-xs text-gray-600 disabled:opacity-30">← Undo</button>
                {store.workingImage && (
                  <button onClick={() => downloadBase64Image(store.workingImage!, 'banner-final.png')}
                    className="px-3 py-1.5 bg-green-500 text-white rounded-md text-xs font-semibold">Download ↓</button>
                )}
              </>
            )}
          </div>
        </div>

        {/* RIGHT PANEL — Jewelry list */}
        <div className="w-60 border-l border-gray-200 p-4 overflow-y-auto bg-white flex-shrink-0">
          <h3 className="text-sm font-bold text-gray-700 mb-1">Bijoux ({store.jewelryItems.length}/8)</h3>
          <p className="text-[11px] text-gray-400 mb-3">Uploade, nomme, puis sélectionne</p>

          <label className="w-full h-10 mb-3 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center text-gray-400 text-xs cursor-pointer hover:border-indigo-400 hover:text-indigo-400">
            + Ajouter bijou
            <input type="file" accept="image/*" className="hidden" onChange={handleAddJewelry} disabled={store.jewelryItems.length >= 8} />
          </label>

          <div className="flex flex-col gap-2">
            {store.jewelryItems.map((jewelry) => {
              const isSelected = store.selectedJewelryId === jewelry.id;
              return (
                <div key={jewelry.id}
                  className={`p-2 rounded-lg border cursor-pointer transition-colors ${
                    isSelected ? 'border-indigo-500 bg-indigo-50' :
                    jewelry.placed ? 'border-green-400 bg-green-50' :
                    'border-gray-200 bg-gray-50'
                  }`}
                  onClick={() => {
                    if (store.currentStep === 2 && !jewelry.placed) {
                      store.setSelectedJewelryId(isSelected ? null : jewelry.id);
                    }
                  }}
                >
                  <div className="flex gap-2 items-center">
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
                          onClick={(e) => { e.stopPropagation(); setEditingNameId(jewelry.id); setEditingNameValue(jewelry.name); }}
                          title="Cliquer pour renommer">
                          {jewelry.name}
                        </div>
                      )}
                      <div className={`text-[10px] ${jewelry.placed ? 'text-green-600 font-semibold' : 'text-gray-400'}`}>
                        {jewelry.placed ? '✓ Placé' : 'En attente'}
                      </div>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); store.removeJewelry(jewelry.id); }}
                      className="w-5 h-5 rounded-full bg-red-100 text-red-500 text-[10px] flex items-center justify-center hover:bg-red-200 flex-shrink-0">✕</button>
                  </div>
                  {/* Dimensions */}
                  <div className="flex gap-1 mt-1.5">
                    <input type="number" placeholder="Chaîne cm" value={jewelry.chainLength || ''}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => store.updateJewelryDimensions(jewelry.id, { chainLength: e.target.value ? Number(e.target.value) : undefined })}
                      className="w-1/3 text-[10px] border border-gray-300 rounded px-1 py-0.5 focus:border-indigo-400 focus:outline-none" />
                    <input type="number" placeholder="Pend. H" value={jewelry.pendantHeight || ''}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => store.updateJewelryDimensions(jewelry.id, { pendantHeight: e.target.value ? Number(e.target.value) : undefined })}
                      className="w-1/3 text-[10px] border border-gray-300 rounded px-1 py-0.5 focus:border-indigo-400 focus:outline-none" />
                    <input type="number" placeholder="Pend. L" value={jewelry.pendantWidth || ''}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => store.updateJewelryDimensions(jewelry.id, { pendantWidth: e.target.value ? Number(e.target.value) : undefined })}
                      className="w-1/3 text-[10px] border border-gray-300 rounded px-1 py-0.5 focus:border-indigo-400 focus:outline-none" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

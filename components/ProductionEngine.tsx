
import React, { useState, useRef, useMemo } from 'react';
import { downloadBase64Image } from '../services/downloadService';
import { ProductionItem, ExtractionLevel, CustomPreset } from '../types';
import { generateProductionPhoto, generateStackedProductionPhoto, analyzeProductionReference } from '../services/geminiService';
import { useProductionStore } from '../stores/useProductionStore';
import { Button } from './Button';

interface ProductionEngineProps {
  queue: ProductionItem[];
  setQueue: (q: ProductionItem[] | ((prev: ProductionItem[]) => ProductionItem[])) => void;
  mannequinImage: string | null;
  setMannequinImage: (img: string | null) => void;
}

const PROMPT_PRESETS = {
  default: "Professional luxury e-commerce photography, soft studio lighting, ultra-high resolution, 4K detail, neutral minimalist background",
  closeup: "[TECHNICAL RECONSTRUCTION] Scene Theme: High-end jewelry editorial. Lighting: Professional Hard direct sunlight setup, positioned at Side lighting from left, with undefined quality and undefined intensity. Camera Optics: Shot with a Macro lens at Eye-level angle. Materiality: The product interacts with a Detailed skin pores, smooth metallic gold, glossy enamel surface. Composition: Optimized Extreme close-up framing, undefined subject scaling, utilizing undefined negative space for visual balance. Render Style: Photorealistic, 8k resolution, global illumination, raytraced reflections, high-end commercial finish.",
  closeup2: "[TECHNICAL RECONSTRUCTION] Scene Theme: jewelry editorial. Lighting: Professional hard warm sunlight setup, positioned at top-left, with undefined quality and undefined intensity. Camera Optics: Shot with a macro lens lens at straight-on angle. Materiality: The product interacts with a high definition skin pores, glossy lips, polished gold metal, smooth enamel surface. Composition: Optimized extreme close-up framing, undefined subject scaling, utilizing undefined negative space for visual balance. Render Style: Photorealistic, 8k resolution, global illumination, raytraced reflections, high-end commercial finish.",
  sunkissed: "High-end jewelry lifestyle photography, candid shot, outdoor setting with {background_context}. The model is wearing {jewelry_description}. Natural hard sunlight hitting the face, creating dappled light and artistic distinct shadows. Golden hour atmosphere. Shot on 35mm Kodak Portra film, slight film grain, highly detailed skin texture, pores visible, peach fuzz, realistic imperfections. The jewelry is catching the sunlight sparkles. Soft focus background, depth of field. Warm, summer breeze vibe.",
  ethereal: "Editorial fashion photography, artistic motion blur, slow shutter speed effect. The model is in motion, turning head slightly, hair flowing dynamically, wearing {jewelry_description}. The jewelry remains sharp and is the main focal point. Dreamy and ethereal atmosphere, soft cinematic lighting. Background is {background_context}, abstract and blurry. Added monochrome noise, subtle chromatic aberration. High-fashion magazine aesthetic, expressive and emotive.",
  flash: "Flash photography style, direct on-camera flash, hard lighting, high contrast. Night out aesthetic or darkened studio. The model looks chic and confident wearing {jewelry_description}. Visuals reminiscent of 90s vogue editorials. Sharp details on the jewelry metal and stones. Background is {background_context} with a vignette effect. Raw aesthetic, authentic skin texture, slight overexposure on highlights, urban luxury vibe.",
  soft: "Soft luxury minimalist photography, window light illumination from the side. Soft transitions between light and shadow. Ultra-realistic skin tones. Close-up shot of the model wearing {jewelry_description}. The image has a subtle matte finish, low contrast, pastel tones. Background is {background_context}, composed of organic textures. Serene, elegant, quiet luxury aesthetic. 8k resolution but with a film-like softness.",
  custom: ""
};

export const ProductionEngine: React.FC<ProductionEngineProps> = ({
  queue,
  setQueue,
  mannequinImage,
  setMannequinImage
}) => {
  const [artisticDirection, setArtisticDirection] = useState('');
  const [selectedPreset, setSelectedPreset] = useState<keyof typeof PROMPT_PRESETS>('default');
  const [productListInput, setProductListInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedForDownload, setSelectedForDownload] = useState<Set<string>>(new Set());
  const [stackingMode, setStackingMode] = useState(false);
  const [stackSelection, setStackSelection] = useState<Set<string>>(new Set());
  const [isStacking, setIsStacking] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showRefModal, setShowRefModal] = useState(false);
  const [refImage, setRefImage] = useState<string | null>(null);
  const [extractionLevel, setExtractionLevel] = useState<ExtractionLevel>('scene-pose-style');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [extractedPrompt, setExtractedPrompt] = useState('');
  const [presetName, setPresetName] = useState('');

  const { customPresets, addCustomPreset, removeCustomPreset } = useProductionStore();

  const stats = useMemo(() => {
      return {
          total: queue.length,
          done: queue.filter(i => i.status === 'COMPLETED').length,
          active: queue.filter(i => i.status === 'PROCESSING').length,
          fail: queue.filter(i => i.status === 'ERROR').length
      };
  }, [queue]);

  const handleMannequinUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setMannequinImage(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleRefUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setRefImage(reader.result as string);
        setExtractedPrompt('');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAnalyze = async () => {
    if (!refImage) return;
    setIsAnalyzing(true);
    try {
      const result = await analyzeProductionReference(refImage, extractionLevel);
      setExtractedPrompt(result);
    } catch (err: any) {
      alert(err.message || 'Analysis failed');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleApplyExtracted = () => {
    setArtisticDirection(extractedPrompt);
    setSelectedPreset('custom');
    setShowRefModal(false);
  };

  const handleSaveAsPreset = () => {
    if (!presetName.trim() || !extractedPrompt.trim()) return;
    const preset: CustomPreset = {
      id: crypto.randomUUID(),
      name: presetName.trim(),
      prompt: extractedPrompt,
      createdAt: new Date().toISOString(),
    };
    addCustomPreset(preset);
    setPresetName('');
  };

  const handlePresetChange = (preset: string) => {
    if (preset.startsWith('custom-')) {
      const customId = preset.replace('custom-', '');
      const found = customPresets.find(p => p.id === customId);
      if (found) {
        setArtisticDirection(found.prompt);
        setSelectedPreset('custom');
        return;
      }
    }
    setSelectedPreset(preset as keyof typeof PROMPT_PRESETS);
    if (preset === 'custom') return;
    setArtisticDirection(PROMPT_PRESETS[preset as keyof typeof PROMPT_PRESETS] || '');
  };

  const parseProductList = () => {
    const lines = productListInput.trim().split('\n');
    const items: ProductionItem[] = lines
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => {
        const parts = line.split('|').map(p => p.trim());
        if (parts.length >= 3) {
          return {
            id: crypto.randomUUID(),
            sku: parts[0],
            name: parts[1],
            imageUrl: parts[2],
            category: parts[3] || '',
            status: 'PENDING' as const
          };
        }
        if (parts.length === 1 && (parts[0].startsWith('http') || parts[0].startsWith('data:'))) {
             return {
                id: crypto.randomUUID(),
                sku: `IMP-${Math.floor(Math.random() * 10000)}`,
                name: 'Quick Import',
                imageUrl: parts[0],
                status: 'PENDING' as const
            };
        }
        return null;
      })
      .filter((item): item is ProductionItem => item !== null);

    const newQueue = [...queue, ...items];
    setQueue(newQueue);
    return newQueue;
  };

  const startProduction = async () => {
    let effectivePrompt = artisticDirection;
    if (!effectivePrompt.trim()) {
        effectivePrompt = "Professional luxury e-commerce photography, soft studio lighting, ultra-high resolution, 4K detail, neutral minimalist background";
        setArtisticDirection(effectivePrompt);
    }

    let currentQueue = queue;
    if (productListInput.trim()) {
        const newItems = parseProductList();
        setProductListInput('');
        currentQueue = newItems;
    }

    const pendingItems = currentQueue.filter(i => i.status === 'PENDING' || i.status === 'ERROR');

    if (pendingItems.length === 0) {
        alert("Queue empty or all items completed.");
        return;
    }

    setIsProcessing(true);

    try {
        if ((window as any).aistudio) {
            const hasKey = await (window as any).aistudio.hasSelectedApiKey();
            if (!hasKey) await (window as any).aistudio.openSelectKey();
        }
    } catch (e) { console.warn("API check warning", e); }

    const updateItemStatus = (id: string, updates: Partial<ProductionItem>) => {
        setQueue(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
    };

    // Process items in parallel (5 at a time)
    const processItem = async (item: ProductionItem): Promise<void> => {
        updateItemStatus(item.id, { status: 'PROCESSING', error: undefined });
        setSelectedItemId(item.id);

        try {
            console.log('[PRODUCTION] Starting generation for item:', item.id);

            let itemPrompt = effectivePrompt;
            const jewelryDesc = item.category || item.name || 'jewelry';
            const backgroundCtx = 'neutral elegant background';

            itemPrompt = itemPrompt
                .replace('{jewelry_description}', jewelryDesc)
                .replace('{background_context}', backgroundCtx);

            const resultImage = await generateProductionPhoto(
                mannequinImage,
                item.imageUrl,
                itemPrompt,
                item.category
            );
            console.log('[PRODUCTION] Generation successful for item:', item.id);
            updateItemStatus(item.id, { status: 'COMPLETED', resultImage });
        } catch (err: any) {
            console.error('[PRODUCTION] Error for item:', item.id, err);
            const errorMsg = err.message || String(err);
            updateItemStatus(item.id, { status: 'ERROR', error: errorMsg });
        }
    };

    // Process in batches of 5
    const batchSize = 5;
    for (let i = 0; i < pendingItems.length; i += batchSize) {
        const batch = pendingItems.slice(i, i + batchSize);
        await Promise.all(batch.map(processItem));

        if (i + batchSize < pendingItems.length) {
            await new Promise(r => setTimeout(r, 2000));
        }
    }

    setIsProcessing(false);
  };

  const toggleSelection = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSet = new Set(selectedForDownload);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedForDownload(newSet);
  };

  const handleSelectAll = () => {
    if (selectedForDownload.size === queue.length && queue.length > 0) setSelectedForDownload(new Set());
    else setSelectedForDownload(new Set(queue.map(i => i.id)));
  };

  const handleDownloadSelected = () => {
    const targets = queue.filter(q => selectedForDownload.has(q.id) && q.status === 'COMPLETED' && q.resultImage);
    for (const item of targets) {
        const base64 = item.resultImage!.includes('base64,') ? item.resultImage! : `data:image/png;base64,${item.resultImage!}`;
        downloadBase64Image(base64, `production_4K_${item.sku}_${Date.now()}.png`);
    }
  };

  const updateItemCategory = (id: string, category: string) => {
      setQueue(prev => prev.map(p => p.id === id ? { ...p, category } : p));
  };

  const handleToggleStack = (id: string) => {
    const newSet = new Set(stackSelection);
    if (newSet.has(id)) newSet.delete(id); else newSet.add(id);
    setStackSelection(newSet);
  };

  const handleGenerateStacked = async () => {
    const selectedItems = queue.filter(i => stackSelection.has(i.id));
    if (selectedItems.length < 2) return;
    setIsStacking(true);
    try {
      const products = selectedItems.map(item => ({
        imageUrl: item.imageUrl,
        category: item.category || '',
        name: item.name,
      }));
      let effectivePrompt = artisticDirection;
      if (!effectivePrompt.trim()) effectivePrompt = PROMPT_PRESETS.default;
      const resultImage = await generateStackedProductionPhoto(mannequinImage, products, effectivePrompt);
      const stackedItem: ProductionItem = {
        id: crypto.randomUUID(),
        sku: `STACK-${selectedItems.map(i => i.sku).join('+')}`,
        name: `Stacked: ${selectedItems.map(i => i.name).join(' + ')}`,
        imageUrl: selectedItems[0].imageUrl,
        category: 'stacked',
        status: 'COMPLETED',
        resultImage,
      };
      setQueue(prev => [...prev, stackedItem]);
      setSelectedItemId(stackedItem.id);
      setStackSelection(new Set());
      setStackingMode(false);
    } catch (err: any) {
      alert(`Stacking failed: ${err.message}`);
    } finally {
      setIsStacking(false);
    }
  };

  const selectedItem = queue.find(i => i.id === selectedItemId) || queue[0];
  const runnableCount = queue.filter(i => i.status === 'PENDING' || i.status === 'ERROR').length;

  return (
    <div className="w-full h-[calc(100vh-140px)] flex gap-4 animate-fadeIn">
      <div className="w-1/2 flex flex-col gap-4">
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 border-l-4 border-l-indigo-500">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                Production Batch // <span className="text-indigo-600">Nano Banana Pro 4K</span>
            </h2>
            <div className="grid grid-cols-4 gap-4">
                <StatCard label="TOTAL" value={stats.total} />
                <StatCard label="DONE" value={stats.done} color="text-emerald-500" />
                <StatCard label="ACTIVE" value={stats.active} color="text-indigo-500" />
                <StatCard label="FAIL" value={stats.fail} color="text-red-500" />
            </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm flex-1 flex flex-col overflow-hidden relative">
            <div className="p-3 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                <div className="flex gap-2">
                    <button onClick={handleSelectAll} className={`text-[10px] px-2 py-1 rounded border transition-colors ${selectedForDownload.size > 0 && selectedForDownload.size === queue.length ? 'bg-indigo-50 border-indigo-400 text-indigo-600' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                        {selectedForDownload.size > 0 && selectedForDownload.size === queue.length ? 'Deselect All' : 'Select All'}
                    </button>
                    {selectedForDownload.size > 0 && (
                        <button onClick={handleDownloadSelected} className="text-[10px] bg-emerald-50 hover:bg-emerald-100 px-2 py-1 rounded text-emerald-600 border border-emerald-200 transition-colors font-bold flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                            DOWNLOAD 4K ({selectedForDownload.size})
                        </button>
                    )}
                    <button onClick={() => { setStackingMode(!stackingMode); setStackSelection(new Set()); }} className={`text-[10px] px-3 py-1 rounded border transition-colors font-bold ${stackingMode ? 'bg-purple-50 border-purple-400 text-purple-600' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                        {stackingMode ? 'Exit Stack' : 'Stack Mode'}
                    </button>
                </div>
            </div>

            <div className="p-4 overflow-y-auto custom-scrollbar flex-1 bg-gray-50">
                 {queue.length === 0 && !productListInput ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-400 border-2 border-dashed border-gray-200 rounded-xl m-4">
                        <p className="text-xs uppercase tracking-widest mb-2">Queue Empty</p>
                    </div>
                 ) : (
                    <div className="grid grid-cols-4 lg:grid-cols-5 gap-2">
                        <div className="aspect-square bg-white border border-gray-200 rounded-md p-2 flex flex-col relative group hover:border-gray-300 transition-colors shadow-sm">
                            <span className="text-[8px] text-gray-400 uppercase font-bold mb-1">QUICK ADD</span>
                            <textarea className="w-full h-full bg-transparent text-[9px] font-mono text-gray-500 outline-none resize-none placeholder-gray-300" placeholder="SKU|Name|URL|Cat" value={productListInput} onChange={(e) => setProductListInput(e.target.value)} />
                        </div>
                        {queue.map((item) => (
                            <div key={item.id} onClick={() => stackingMode ? handleToggleStack(item.id) : setSelectedItemId(item.id)} className={`aspect-square relative rounded-md overflow-hidden cursor-pointer border transition-all group ${stackingMode && stackSelection.has(item.id) ? 'border-purple-500 ring-2 ring-purple-400/50' : selectedItemId === item.id ? 'border-indigo-500 ring-1 ring-indigo-500/50' : 'border-gray-200 hover:border-gray-300'} ${item.status === 'ERROR' ? 'border-red-300' : ''}`}>
                                <div className="absolute top-1 left-1 z-20" onClick={(e) => { e.stopPropagation(); stackingMode ? handleToggleStack(item.id) : toggleSelection(item.id, e); }}>
                                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${stackingMode ? (stackSelection.has(item.id) ? 'bg-purple-600 border-purple-600' : 'bg-white/80 border-gray-300 hover:border-purple-400') : (selectedForDownload.has(item.id) ? 'bg-indigo-600 border-indigo-600' : 'bg-white/80 border-gray-300 hover:border-indigo-400')}`}>
                                        {(stackingMode ? stackSelection.has(item.id) : selectedForDownload.has(item.id)) && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>}
                                    </div>
                                </div>
                                {item.status === 'COMPLETED' && item.resultImage ? <img src={item.resultImage} className="w-full h-full object-cover" loading="lazy" /> : <div className="w-full h-full bg-gray-100 flex items-center justify-center"><span className="text-[8px] font-mono text-gray-400 break-all px-1 text-center">{item.sku}</span></div>}
                                <div className="absolute top-1 right-1 z-10"><StatusDot status={item.status} /></div>
                                {/* Per-item category selector */}
                                <div className="absolute bottom-0 left-0 right-0 z-20" onClick={(e) => e.stopPropagation()}>
                                    <select
                                        className="w-full bg-black/60 text-white text-[8px] font-bold uppercase px-1 py-0.5 outline-none cursor-pointer appearance-none text-center backdrop-blur-sm"
                                        value={item.category || ''}
                                        onChange={(e) => updateItemCategory(item.id, e.target.value)}
                                    >
                                        <option value="">Auto</option>
                                        <option value="necklace">Collier</option>
                                        <option value="sautoir-court">Sautoir Court</option>
                                        <option value="sautoir-long">Sautoir Long</option>
                                        <option value="ring">Bague</option>
                                        <option value="earrings">Boucles</option>
                                        <option value="bracelet">Bracelet</option>
                                    </select>
                                </div>
                                {item.status === 'PROCESSING' && <div className="absolute inset-0 bg-white/70 flex flex-col items-center justify-center z-10 p-2 text-center">
                                    <div className="w-4 h-4 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-1"></div>
                                    <span className="text-[7px] text-indigo-600 animate-pulse font-bold uppercase">Processing...</span>
                                </div>}
                            </div>
                        ))}
                    </div>
                )}
            </div>
             <div className="p-3 bg-white border-t border-gray-200 space-y-2">
                {stackingMode && stackSelection.size >= 2 && (
                    <button
                        onClick={handleGenerateStacked}
                        disabled={isStacking}
                        className="w-full h-10 text-sm tracking-widest uppercase font-bold bg-purple-600 hover:bg-purple-500 text-white rounded-lg disabled:opacity-60 flex items-center justify-center gap-2 transition-colors"
                    >
                        {isStacking ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                Stacking...
                            </>
                        ) : (
                            <>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                                Stack {stackSelection.size} Items
                            </>
                        )}
                    </button>
                )}
                <Button className="w-full h-10 text-sm tracking-widest uppercase font-bold bg-indigo-600 hover:bg-indigo-500 border-none shadow-sm" onClick={startProduction} isLoading={isProcessing}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                    EXECUTE BATCH {String(runnableCount).padStart(3, '0')}
                </Button>
             </div>
        </div>
      </div>

      <div className="w-1/2 flex flex-col gap-4">
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm flex-1 flex flex-col relative overflow-hidden">
             <div className="absolute top-4 left-4 z-10 flex gap-2">
                <div className="bg-white/90 backdrop-blur border border-gray-200 px-2 py-1 rounded text-[10px] font-bold text-gray-900 flex items-center gap-2 shadow-sm">
                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div> STUDIO <span className="text-indigo-600">4K PRO</span>
                </div>
             </div>
             <div className="flex-1 bg-gray-50 flex items-center justify-center relative overflow-hidden">
                {selectedItem ? (
                    selectedItem.status === 'COMPLETED' && selectedItem.resultImage ? <img src={selectedItem.resultImage} className="w-full h-full object-contain shadow-2xl" /> : (
                        <div className="flex flex-col items-center justify-center opacity-60 p-4">
                             <div className="w-32 h-32 border border-gray-200 flex items-center justify-center mb-4 bg-white overflow-hidden rounded-lg shadow-sm">
                                {selectedItem.imageUrl ? <img src={selectedItem.imageUrl.split('|')[0]} className="w-full h-full object-contain opacity-50 grayscale" /> : <span className="text-xs text-gray-400">NO PREVIEW</span>}
                             </div>
                             <p className="text-xs font-mono text-gray-500 uppercase tracking-widest">{selectedItem.sku}</p>
                             <p className="text-[10px] text-gray-400 mt-1 uppercase">{selectedItem.status}</p>
                             {selectedItem.error && <p className="text-[9px] text-red-500 mt-2 px-6 text-center border border-red-200 bg-red-50 py-1 rounded font-mono">{selectedItem.error}</p>}
                        </div>
                    )
                ) : <p className="text-xs text-gray-400 uppercase tracking-widest">No Selection</p>}
             </div>
             {selectedItem && selectedItem.status === 'COMPLETED' && selectedItem.resultImage && (
                <div className="h-14 border-t border-gray-200 bg-white flex items-center justify-between px-4">
                    <span className="text-[9px] font-mono text-gray-400">RES: 4096 x 5461 // UHD_4K</span>
                    <Button variant="secondary" className="text-[10px] h-8" onClick={() => {
                            const base64 = selectedItem.resultImage!.includes('base64,') ? selectedItem.resultImage! : `data:image/png;base64,${selectedItem.resultImage!}`;
                            downloadBase64Image(base64, `4K_studio_${selectedItem.sku}.png`);
                        }}>
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                        DOWNLOAD 4K
                    </Button>
                </div>
             )}
        </div>

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
            <div className="mb-4">
                <div>
                    <div className="flex justify-between items-center mb-2">
                        <label className="text-[9px] uppercase font-bold text-gray-400">Model Reference</label>
                        <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleMannequinUpload} />
                        <button onClick={() => fileInputRef.current?.click()} className="text-[9px] text-indigo-600 hover:text-indigo-500 font-bold uppercase">{mannequinImage ? 'Switch' : 'Upload'}</button>
                    </div>
                    <div className={`h-12 bg-gray-50 border rounded flex items-center px-2 gap-3 transition-colors ${mannequinImage ? 'border-indigo-400' : 'border-gray-200'}`}>
                        <div className="w-8 h-8 bg-gray-100 rounded overflow-hidden">{mannequinImage ? <img src={mannequinImage} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-400 text-[8px]">NONE</div>}</div>
                        <span className="text-[9px] font-mono truncate text-gray-500">{mannequinImage ? 'Active_Portrait_4K.png' : 'Pending...'}</span>
                    </div>
                </div>
            </div>
            <div>
                <label className="text-[9px] uppercase font-bold text-gray-400 mb-2 block">Prompt Preset</label>
                <div className="h-12 bg-gray-50 border border-gray-200 rounded flex items-center px-2 mb-3">
                    <select
                        className="w-full bg-transparent text-[10px] text-gray-900 outline-none font-mono uppercase cursor-pointer"
                        value={selectedPreset}
                        onChange={(e) => handlePresetChange(e.target.value)}
                    >
                        <option value="default">Default (Natif)</option>
                        <option value="closeup">Close Up</option>
                        <option value="closeup2">Close Up 2</option>
                        <option value="sunkissed">Sunkissed & Natural (Golden Hour)</option>
                        <option value="ethereal">Ethereal Motion (Flou Artistique)</option>
                        <option value="flash">Flash Editorial (Vogue/Paparazzi)</option>
                        <option value="soft">Soft & Organic (Lumiere du Matin)</option>
                        <option value="custom">Custom (Personnalise)</option>
                        {customPresets.length > 0 && <option disabled>──────────</option>}
                        {customPresets.map(p => (
                          <option key={p.id} value={`custom-${p.id}`}>{p.name}</option>
                        ))}
                    </select>
                </div>
                <button
                  onClick={() => setShowRefModal(true)}
                  className="w-full h-8 mb-3 text-[9px] font-bold uppercase text-indigo-600 hover:text-indigo-500 border border-indigo-300 rounded transition-colors flex items-center justify-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Import Reference Photo
                </button>
                <label className="text-[9px] uppercase font-bold text-gray-400 mb-2 block">Atmosphere Prompt</label>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 relative focus-within:border-indigo-500 transition-colors">
                    <textarea
                        className="w-full h-20 bg-transparent text-sm text-gray-700 outline-none resize-none placeholder-gray-400 leading-relaxed"
                        placeholder="e.g. Minimalist concrete loft, soft directional morning light..."
                        value={artisticDirection}
                        onChange={(e) => {
                            setArtisticDirection(e.target.value);
                            setSelectedPreset('custom');
                        }}
                        disabled={selectedPreset !== 'custom'}
                    />
                </div>
            </div>
        </div>
      </div>

      {showRefModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowRefModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-bold uppercase tracking-widest text-gray-900">Import Reference Photo</h3>
                <button onClick={() => setShowRefModal(false)} className="w-6 h-6 rounded-full bg-gray-100 text-gray-500 text-xs flex items-center justify-center hover:bg-gray-200">&times;</button>
              </div>
            </div>

            <div className="p-5 space-y-4">
              {refImage ? (
                <div className="relative rounded-lg border border-indigo-300 overflow-hidden">
                  <img src={refImage} className="w-full h-48 object-cover" />
                  <button onClick={() => { setRefImage(null); setExtractedPrompt(''); }} className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/50 text-white text-xs flex items-center justify-center hover:bg-black/70">&times;</button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 hover:border-indigo-400 hover:bg-indigo-50/50 py-8 cursor-pointer transition-colors">
                  <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  <span className="text-xs font-semibold text-gray-500">Upload a production reference photo</span>
                  <span className="text-[10px] text-gray-400">The AI will extract the scene, pose, and style</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handleRefUpload} />
                </label>
              )}

              {refImage && !extractedPrompt && (
                <>
                  <div>
                    <label className="text-[9px] font-bold uppercase text-gray-400 block mb-2">Extraction Level</label>
                    <div className="space-y-2">
                      {([
                        { key: 'scene-pose-style' as ExtractionLevel, label: 'Scene + Pose + Style', desc: 'Decor, lighting, pose, photo style. Ignores jewelry and identity.' },
                        { key: 'scene-pose-style-placement' as ExtractionLevel, label: '+ Jewelry Placement', desc: 'Same + how jewelry is showcased (without describing the pieces).' },
                        { key: 'full' as ExtractionLevel, label: 'Full Extraction', desc: 'Scene, pose, style, clothing, makeup, ambiance. Everything except identity and jewelry.' },
                      ]).map(({ key, label, desc }) => (
                        <button
                          key={key}
                          onClick={() => setExtractionLevel(key)}
                          className={`w-full text-left p-3 rounded-lg border transition-colors ${
                            extractionLevel === key
                              ? 'border-indigo-400 bg-indigo-50'
                              : 'border-gray-200 hover:border-gray-300 bg-white'
                          }`}
                        >
                          <span className="text-xs font-bold text-gray-900">{label}</span>
                          <span className="block text-[10px] text-gray-500 mt-0.5">{desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={handleAnalyze}
                    disabled={isAnalyzing}
                    className="w-full h-10 text-sm tracking-widest uppercase font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg disabled:opacity-60 flex items-center justify-center gap-2 transition-colors"
                  >
                    {isAnalyzing ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Analyzing...
                      </>
                    ) : 'Analyze Photo'}
                  </button>
                </>
              )}

              {extractedPrompt && (
                <>
                  <div>
                    <label className="text-[9px] font-bold uppercase text-gray-400 block mb-2">Extracted Prompt (editable)</label>
                    <textarea
                      className="w-full h-40 bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-700 outline-none resize-none focus:border-indigo-400 transition-colors"
                      value={extractedPrompt}
                      onChange={(e) => setExtractedPrompt(e.target.value)}
                    />
                  </div>

                  <button
                    onClick={handleApplyExtracted}
                    className="w-full h-10 text-xs tracking-widest uppercase font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
                  >
                    Apply to Batch
                  </button>

                  <div className="border-t border-gray-200 pt-3">
                    <label className="text-[9px] font-bold uppercase text-gray-400 block mb-2">Save as Custom Preset</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Preset name..."
                        value={presetName}
                        onChange={(e) => setPresetName(e.target.value)}
                        className="flex-1 h-9 bg-gray-50 border border-gray-200 rounded-lg px-3 text-xs outline-none focus:border-indigo-400 transition-colors"
                      />
                      <button
                        onClick={handleSaveAsPreset}
                        disabled={!presetName.trim()}
                        className="h-9 px-4 text-[10px] font-bold uppercase bg-purple-600 hover:bg-purple-500 text-white rounded-lg disabled:opacity-40 transition-colors"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const StatCard: React.FC<{ label: string, value: number, color?: string }> = ({ label, value, color = "text-gray-900" }) => (
    <div className="bg-gray-50 border border-gray-200 rounded p-2">
        <p className="text-[8px] font-bold text-gray-400 uppercase mb-0.5">{label}</p>
        <p className={`text-xl font-mono font-bold leading-none ${color}`}>{value}</p>
    </div>
);

const StatusDot: React.FC<{ status: string }> = ({ status }) => {
    let colorClass = "bg-gray-300";
    if (status === 'COMPLETED') colorClass = "bg-emerald-500 shadow-[0_0_5px_#10b981]";
    if (status === 'PROCESSING') colorClass = "bg-yellow-500 animate-pulse";
    if (status === 'ERROR') colorClass = "bg-red-500";
    return <div className={`w-2 h-2 rounded-full border border-white ${colorClass}`}></div>
};

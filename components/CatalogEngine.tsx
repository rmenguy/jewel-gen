
import React, { useState, useRef } from 'react';
import { ExtractionResult, ExtractionStatus, Product } from '../types';
import { extractShopifyCatalog } from '../services/geminiService';
import { Button } from './Button';

interface CatalogEngineProps {
  onTransfer?: (products: Product[]) => void;
}

export const CatalogEngine: React.FC<CatalogEngineProps> = ({ onTransfer }) => {
  const [mode, setMode] = useState<'SCRAPE' | 'UPLOAD'>('UPLOAD');
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<ExtractionStatus>(ExtractionStatus.IDLE);
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- SCRAPING LOGIC ---
  const handleExtract = async () => {
    if (!url.trim()) return;

    let cleanUrl = url.trim();
    if (!cleanUrl.startsWith('http')) {
      cleanUrl = `https://${cleanUrl}`;
    }

    setStatus(ExtractionStatus.EXTRACTING);
    setError(null);
    setResult(null);

    try {
      const data = await extractShopifyCatalog(cleanUrl);
      setResult(data);
      setStatus(ExtractionStatus.SUCCESS);
    } catch (err: any) {
      setError(err.message || 'Une erreur est survenue.');
      setStatus(ExtractionStatus.ERROR);
    }
  };

  // --- UPLOAD LOGIC ---
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setStatus(ExtractionStatus.EXTRACTING);

    const readPromises = Array.from(files).map((file: File) =>
        new Promise<Product>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve({
                sku: file.name.split('.')[0].toUpperCase().replace(/[^A-Z0-9]/g, '-'),
                title: file.name.split('.')[0].replace(/[-_]/g, ' '),
                image_url: reader.result as string,
                price: 'N/A',
                type: 'LOCAL_ASSET'
            });
            reader.readAsDataURL(file);
        })
    );

    Promise.all(readPromises).then(newProducts => {
        setResult(prev => ({
            store: 'LOCAL_BATCH_IMPORT',
            count: (prev?.count || 0) + newProducts.length,
            products: [...(prev?.products || []), ...newProducts]
        }));
        setStatus(ExtractionStatus.SUCCESS);
    });
  };

  const copyToClipboard = () => {
    if (result) {
      navigator.clipboard.writeText(JSON.stringify(result, null, 2));
      alert('JSON copie dans le presse-papier !');
    }
  };

  return (
    <div className="w-full h-[calc(100vh-140px)] flex gap-4 animate-fadeIn">

      {/* LEFT PANEL: INPUT METHOD */}
      <div className="w-1/3 flex flex-col gap-4">

        {/* Mode Switcher */}
        <div className="flex bg-gray-100 p-1 rounded-lg border border-gray-200">
            <button
                onClick={() => setMode('UPLOAD')}
                className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-widest rounded transition-all ${mode === 'UPLOAD' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
                Local Batch
            </button>
            <button
                onClick={() => setMode('SCRAPE')}
                className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-widest rounded transition-all ${mode === 'SCRAPE' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
                Web Scraper
            </button>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 border-l-4 border-l-indigo-500 flex-1 flex flex-col">

             {mode === 'SCRAPE' ? (
                 <>
                    <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                        Target URL
                    </h2>
                    <div className="relative mb-4">
                        <input
                        type="text"
                        placeholder="https://brand-store.com"
                        className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-900 focus:border-indigo-500 outline-none font-mono"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleExtract()}
                        />
                    </div>
                    <Button
                        className="w-full font-bold tracking-widest text-xs h-10"
                        onClick={handleExtract}
                        isLoading={status === ExtractionStatus.EXTRACTING}
                    >
                        START SCRAPING
                    </Button>
                 </>
             ) : (
                 <>
                    <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                        Local Assets
                    </h2>

                    <div
                        className="flex-1 border-2 border-dashed border-gray-300 hover:border-indigo-400 rounded-xl bg-gray-50 flex flex-col items-center justify-center p-6 text-center cursor-pointer transition-colors group"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <input
                            type="file"
                            multiple
                            accept="image/*"
                            className="hidden"
                            ref={fileInputRef}
                            onChange={handleFileUpload}
                        />
                        <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                             <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                        </div>
                        <p className="text-xs font-bold text-gray-900 mb-1">Click to Upload Folder</p>
                        <p className="text-[9px] text-gray-500 uppercase tracking-wider">Supports JPG, PNG, WEBP</p>
                    </div>

                    <div className="mt-4 text-[9px] text-gray-500 font-mono">
                        <p>INFO: Filenames will be used as Product Titles.</p>
                        <p>Batch Limit: Browser memory dependent.</p>
                    </div>
                 </>
             )}
        </div>

        {/* Status Log */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-3 h-32 overflow-hidden flex flex-col">
             <h3 className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2">System Log</h3>
             <div className="flex-1 bg-gray-50 rounded border border-gray-200 p-2 font-mono text-[9px] text-gray-500 overflow-y-auto custom-scrollbar">
                {status === ExtractionStatus.IDLE && <span>Waiting for input source...</span>}
                {status === ExtractionStatus.EXTRACTING && <span className="text-indigo-600 animate-pulse"> {'>'} Processing assets...</span>}
                {status === ExtractionStatus.ERROR && <span className="text-red-500">{error}</span>}
                {status === ExtractionStatus.SUCCESS && <span className="text-emerald-500"> {'>'} Assets loaded successfully.</span>}
             </div>
        </div>
      </div>

      {/* RIGHT PANEL: GRID RESULTS */}
      <div className="w-2/3 bg-white border border-gray-200 rounded-xl shadow-sm flex flex-col relative overflow-hidden">
        <div className="p-3 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
             <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-bold text-gray-900">Asset Grid</span>
                {result && <span className="bg-gray-200 text-gray-600 text-[9px] px-1.5 py-0.5 rounded font-mono">{result.products?.length || 0} ITEMS</span>}
             </div>

             {result && result.products && result.products.length > 0 && (
                <button
                    onClick={() => setResult(null)}
                    className="text-[9px] text-red-500 hover:text-red-400 uppercase font-bold"
                >
                    Clear Grid
                </button>
             )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 bg-gray-50 custom-scrollbar">
             {result?.products && result.products.length > 0 ? (
                <div className="grid grid-cols-3 lg:grid-cols-4 gap-3">
                    {result.products.map((product, idx) => (
                        <div key={idx} className="bg-white border border-gray-200 rounded-lg overflow-hidden group hover:border-indigo-400 transition-colors shadow-sm">
                            <div className="aspect-square bg-gray-100 relative flex items-center justify-center">
                                <img
                                    src={product.image_url}
                                    alt={product.title}
                                    className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity"
                                    loading="lazy"
                                />
                                <div className="absolute top-1 left-1 bg-white/80 backdrop-blur px-1 rounded z-10">
                                    <span className="text-[8px] font-mono text-indigo-600">{idx + 1}</span>
                                </div>
                            </div>
                            <div className="p-2">
                                <p className="text-[10px] text-gray-900 font-medium truncate" title={product.title}>{product.title}</p>
                                <p className="text-[9px] text-gray-500 font-mono">{product.sku}</p>
                            </div>
                        </div>
                    ))}
                </div>
             ) : (
                <div className="h-full flex flex-col items-center justify-center text-gray-300">
                    <svg className="w-12 h-12 mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                    <p className="text-[10px] uppercase tracking-widest opacity-50 text-gray-400">Grid Empty</p>
                </div>
             )}
        </div>

        {/* Footer Transfer Action */}
        <div className="p-4 bg-white border-t border-gray-200 flex justify-end">
             <Button
                className="bg-indigo-600 hover:bg-indigo-500 border-none text-xs font-bold tracking-widest h-10 px-8 disabled:opacity-30 disabled:grayscale"
                disabled={!result || !result.products || result.products.length === 0}
                onClick={() => {
                    if (onTransfer && result?.products) {
                        onTransfer(result.products);
                    }
                }}
             >
                TRANSFER TO PRODUCTION
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
             </Button>
        </div>
      </div>
    </div>
  );
};

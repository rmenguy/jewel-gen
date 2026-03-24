import React, { useState, useRef } from 'react';
import { downloadBase64Image, downloadTextFile } from '../services/downloadService';
import { BatchItem, BatchConfig, BatchStats, ProductionStackSession } from '../types';
import { executeStackPlan, initializeStepStates } from '../services/stackEngine';
import { autoAssignZone } from '../services/geminiService';

interface BatchEngineProps {
  mannequinImage: string | null;
}

export const BatchEngine: React.FC<BatchEngineProps> = ({ mannequinImage }) => {
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [config, setConfig] = useState<BatchConfig>({
    artisticDirection: 'Minimalist studio, soft natural lighting, neutral background',
    parallelCount: 5,
    autoSave: true,
  });
  const [stats, setStats] = useState<BatchStats>({
    total: 0,
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    progress: 0,
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Parse CSV file
  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n').filter(line => line.trim());

      // Skip header line
      const dataLines = lines.slice(1);

      const items: BatchItem[] = dataLines.map((line, index) => {
        const [sku, category, imageUrl, description, customPrompt] = line.split(',').map(s => s.trim());
        return {
          id: `batch-${Date.now()}-${index}`,
          sku: sku || `ITEM-${index + 1}`,
          category: category || 'bijoux',
          productImageUrl: imageUrl,
          description,
          customPrompt,
          status: 'PENDING' as const,
          progress: 0,
          retryCount: 0,
        };
      });

      setBatchItems(items);
      setStats({
        total: items.length,
        pending: items.length,
        processing: 0,
        completed: 0,
        failed: 0,
        progress: 0,
      });
    };

    reader.readAsText(file);
  };

  // Process batch sequentially using the production stack pipeline (BATCH-01/02)
  const processBatch = async () => {
    if (!mannequinImage) {
      alert('Veuillez d\'abord creer un mannequin !');
      return;
    }

    setIsProcessing(true);
    setIsPaused(false);

    // Process a single item through the stack pipeline
    const processItem = async (item: BatchItem): Promise<void> => {
      if (!mannequinImage) return;

      // Create a temporary session (not stored in Zustand — batch manages its own state)
      const session: ProductionStackSession = {
        id: crypto.randomUUID(),
        baseImage: mannequinImage,
        aspectRatio: '1:1',
        imageSize: '1K',
        layers: [{
          id: crypto.randomUUID(),
          ordinal: 0,
          name: item.sku,
          productImage: item.productImageUrl || '',
          productCategory: item.category,
          targetZone: autoAssignZone(item.category),
        }],
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

      initializeStepStates(session);
      await executeStackPlan(session, () => {});

      if (session.currentImage) {
        setBatchItems(prev =>
          prev.map(i => i.id === item.id
            ? { ...i, status: 'COMPLETED' as const, resultImage: session.currentImage!, progress: 100, completedAt: new Date() }
            : i
          )
        );
      } else {
        throw new Error('Stack execution produced no output image');
      }
    };

    // Sequential processing — one item at a time to respect rate limits (BATCH-02)
    const pendingItems = batchItems.filter(i => i.status === 'PENDING');

    for (const item of pendingItems) {
      if (isPaused) break;

      // Update status to processing
      setBatchItems(prev =>
        prev.map(i => i.id === item.id ? { ...i, status: 'PROCESSING' as const, startedAt: new Date() } : i)
      );

      try {
        await processItem(item);
      } catch (error: any) {
        setBatchItems(prev =>
          prev.map(i => i.id === item.id
            ? { ...i, status: 'ERROR' as const, error: error.message, completedAt: new Date() }
            : i
          )
        );
      }

      // Update stats after each item
      updateStats();
    }

    setIsProcessing(false);
  };

  const updateStats = () => {
    const total = batchItems.length;
    const pending = batchItems.filter(i => i.status === 'PENDING').length;
    const processing = batchItems.filter(i => i.status === 'PROCESSING').length;
    const completed = batchItems.filter(i => i.status === 'COMPLETED').length;
    const failed = batchItems.filter(i => i.status === 'ERROR').length;
    const progress = total > 0 ? Math.round((completed + failed) / total * 100) : 0;

    setStats({ total, pending, processing, completed, failed, progress });
  };

  const saveProgress = () => {
    const data = JSON.stringify({ items: batchItems, config, stats }, null, 2);
    const filename = `batch-progress-${Date.now()}.json`;
    downloadTextFile(data, filename);
  };

  const exportResults = () => {
    const completed = batchItems.filter(i => i.status === 'COMPLETED');

    const csvContent = [
      ['SKU', 'Category', 'Status', 'Timestamp'].join(','),
      ...completed.map(item =>
        [item.sku, item.category, item.status, item.completedAt?.toISOString()].join(',')
      )
    ].join('\n');

    const filename = `batch-export-${Date.now()}.csv`;
    downloadTextFile(csvContent, filename);
  };

  return (
    <div className="w-full h-full flex flex-col gap-4">
      {/* Header */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
        <h2 className="text-lg font-bold text-gray-900 mb-2">BATCH.ENGINE</h2>
        <p className="text-xs text-gray-500">Production en masse - Jusqu'a 300 visuels automatiquement</p>
      </div>

      {/* Stats Dashboard */}
      {stats.total > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs font-bold text-gray-400 uppercase">Production</span>
            <span className="text-sm font-mono text-indigo-600">{stats.completed} / {stats.total}</span>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-gray-100 rounded-full h-3 mb-3">
            <div
              className="bg-gradient-to-r from-indigo-600 to-indigo-500 h-3 rounded-full transition-all duration-500"
              style={{ width: `${stats.progress}%` }}
            />
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-5 gap-2 text-center">
            <div className="bg-gray-50 border border-gray-200 p-2 rounded">
              <div className="text-xs text-gray-500">En attente</div>
              <div className="text-lg font-bold text-gray-900">{stats.pending}</div>
            </div>
            <div className="bg-gray-50 border border-gray-200 p-2 rounded">
              <div className="text-xs text-gray-500">En cours</div>
              <div className="text-lg font-bold text-indigo-600">{stats.processing}</div>
            </div>
            <div className="bg-gray-50 border border-gray-200 p-2 rounded">
              <div className="text-xs text-gray-500">Termine</div>
              <div className="text-lg font-bold text-emerald-500">{stats.completed}</div>
            </div>
            <div className="bg-gray-50 border border-gray-200 p-2 rounded">
              <div className="text-xs text-gray-500">Echoue</div>
              <div className="text-lg font-bold text-red-500">{stats.failed}</div>
            </div>
            <div className="bg-gray-50 border border-gray-200 p-2 rounded">
              <div className="text-xs text-gray-500">Progres</div>
              <div className="text-lg font-bold text-gray-900">{stats.progress}%</div>
            </div>
          </div>
        </div>
      )}

      {/* Configuration */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
        <h3 className="text-sm font-bold text-gray-900 mb-3">Configuration</h3>

        {/* CSV Upload */}
        <div className="mb-4">
          <label className="text-xs text-gray-500 block mb-2">Importer CSV (SKU, Categorie, Image URL, Description, Prompt)</label>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleCSVUpload}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 py-2 px-4 rounded text-sm transition"
          >
            Charger CSV ({batchItems.length} items charges)
          </button>
        </div>

        {/* Artistic Direction */}
        <div className="mb-4">
          <label className="text-xs text-gray-500 block mb-2">Direction artistique (prompt par defaut)</label>
          <textarea
            value={config.artisticDirection}
            onChange={(e) => setConfig({ ...config, artisticDirection: e.target.value })}
            className="w-full bg-gray-50 border border-gray-200 text-gray-900 p-2 rounded text-sm h-20 resize-none focus:border-indigo-500 outline-none"
            placeholder="Minimalist studio, soft natural lighting..."
          />
        </div>

        {/* Parallel Count */}
        <div className="mb-4">
          <label className="text-xs text-gray-500 block mb-2">
            Generations simultanees: {config.parallelCount}
          </label>
          <input
            type="range"
            min="1"
            max="8"
            value={config.parallelCount}
            onChange={(e) => setConfig({ ...config, parallelCount: parseInt(e.target.value) })}
            className="w-full accent-indigo-600"
          />
          <div className="text-xs text-gray-400 mt-1">
            Plus rapide = Plus de consommation API
          </div>
        </div>

        {/* Controls */}
        <div className="flex gap-2">
          <button
            onClick={processBatch}
            disabled={isProcessing || !mannequinImage || batchItems.length === 0}
            className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-100 disabled:text-gray-400 text-white py-3 px-4 rounded font-bold transition"
          >
            {isProcessing ? 'En cours...' : 'Demarrer la production'}
          </button>

          {isProcessing && (
            <button
              onClick={() => setIsPaused(!isPaused)}
              className="bg-yellow-500 hover:bg-yellow-400 text-white py-3 px-4 rounded font-bold"
            >
              {isPaused ? 'Reprendre' : 'Pause'}
            </button>
          )}
        </div>
      </div>

      {/* Actions */}
      {stats.completed > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 flex gap-2">
          <button
            onClick={saveProgress}
            className="flex-1 bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 py-2 px-4 rounded text-sm"
          >
            Sauvegarder progression
          </button>
          <button
            onClick={exportResults}
            className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-2 px-4 rounded text-sm font-bold"
          >
            Exporter {stats.completed} resultats
          </button>
        </div>
      )}

      {/* Items List (scrollable) */}
      {batchItems.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 flex-1 overflow-hidden flex flex-col">
          <h3 className="text-sm font-bold text-gray-900 mb-3">Items ({batchItems.length})</h3>
          <div className="flex-1 overflow-y-auto space-y-2">
            {batchItems.map(item => (
              <div
                key={item.id}
                className={`p-3 rounded text-sm ${
                  item.status === 'COMPLETED' ? 'bg-emerald-50 border border-emerald-200' :
                  item.status === 'PROCESSING' ? 'bg-indigo-50 border border-indigo-200 animate-pulse' :
                  item.status === 'ERROR' ? 'bg-red-50 border border-red-200' :
                  'bg-gray-50 border border-gray-200'
                }`}
              >
                <div className="flex justify-between items-center">
                  <span className="font-mono text-gray-900">{item.sku}</span>
                  <span className={`text-xs px-2 py-1 rounded ${
                    item.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700' :
                    item.status === 'PROCESSING' ? 'bg-indigo-100 text-indigo-700' :
                    item.status === 'ERROR' ? 'bg-red-100 text-red-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {item.status}
                  </span>
                </div>
                <div className="text-xs text-gray-500 mt-1">{item.category}</div>
                {item.error && <div className="text-xs text-red-500 mt-1">{item.error}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

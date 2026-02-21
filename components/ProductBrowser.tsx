import React, { useState, useEffect, useRef } from 'react';
import { supabase, isSupabaseConfigured } from '../services/supabaseClient';
import { SupabaseProduct } from '../types';

interface ProductBrowserProps {
  onSelect?: (products: SupabaseProduct[]) => void;
}

const CATEGORIES = [
  { value: '', label: 'All' },
  { value: 'necklace', label: 'Necklaces' },
  { value: 'ring', label: 'Rings' },
  { value: 'bracelet', label: 'Bracelets' },
  { value: 'earring', label: 'Earrings' },
  { value: 'pendant', label: 'Pendants' },
  { value: 'brooch', label: 'Brooches' },
  { value: 'other', label: 'Other' },
];

export const ProductBrowser: React.FC<ProductBrowserProps> = ({ onSelect }) => {
  const [products, setProducts] = useState<SupabaseProduct[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeCategory, setActiveCategory] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [uploadMode, setUploadMode] = useState(false);
  const [uploadName, setUploadName] = useState('');
  const [uploadSku, setUploadSku] = useState('');
  const [uploadCategory, setUploadCategory] = useState('necklace');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isSupabaseConfigured()) {
      fetchProducts();
    }
  }, [activeCategory]);

  const fetchProducts = async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      let query = supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false });

      if (activeCategory) {
        query = query.eq('category', activeCategory);
      }

      const { data, error } = await query;
      if (error) throw error;
      setProducts(data || []);
    } catch (err) {
      console.error('Failed to fetch products:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async () => {
    if (!supabase || !uploadFile || !uploadName || !uploadSku) return;
    setUploading(true);

    try {
      // Upload image to Supabase Storage
      const fileExt = uploadFile.name.split('.').pop();
      const filePath = `${uploadSku}-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(filePath, uploadFile);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('product-images')
        .getPublicUrl(filePath);

      // Insert product record
      const { error: insertError } = await supabase
        .from('products')
        .insert({
          name: uploadName,
          sku: uploadSku,
          category: uploadCategory,
          image_url: urlData.publicUrl,
        });

      if (insertError) throw insertError;

      // Reset form and refresh
      setUploadName('');
      setUploadSku('');
      setUploadFile(null);
      setUploadMode(false);
      fetchProducts();
    } catch (err: any) {
      console.error('Upload failed:', err);
      alert(`Upload failed: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!supabase) return;
    if (!confirm('Delete this product?')) return;

    try {
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) throw error;
      setProducts((prev) => prev.filter((p) => p.id !== id));
      selectedIds.delete(id);
      setSelectedIds(new Set(selectedIds));
    } catch (err: any) {
      console.error('Delete failed:', err);
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleSendToProduction = () => {
    const selected = products.filter((p) => selectedIds.has(p.id));
    if (onSelect && selected.length > 0) {
      onSelect(selected);
    }
  };

  const filtered = products.filter((p) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
  });

  if (!isSupabaseConfigured()) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400 p-8">
        <svg className="w-12 h-12 mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
        </svg>
        <p className="text-sm font-medium text-gray-500 mb-1">Supabase Not Configured</p>
        <p className="text-xs text-gray-400 text-center">
          Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header Bar */}
      <div className="p-3 border-b border-gray-200 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Search products..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 outline-none focus:border-indigo-500 w-48"
          />
          <span className="text-xs text-gray-400 font-mono">{filtered.length} items</span>
        </div>
        <button
          onClick={() => setUploadMode(!uploadMode)}
          className="text-xs font-bold text-indigo-600 hover:text-indigo-500 uppercase tracking-wider"
        >
          {uploadMode ? 'Cancel' : '+ Add Product'}
        </button>
      </div>

      {/* Upload Form */}
      {uploadMode && (
        <div className="p-4 bg-indigo-50 border-b border-indigo-100">
          <div className="grid grid-cols-2 gap-3 mb-3">
            <input
              type="text"
              placeholder="Product Name"
              value={uploadName}
              onChange={(e) => setUploadName(e.target.value)}
              className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500"
            />
            <input
              type="text"
              placeholder="SKU"
              value={uploadSku}
              onChange={(e) => setUploadSku(e.target.value)}
              className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500"
            />
          </div>
          <div className="flex gap-3 items-center">
            <select
              value={uploadCategory}
              onChange={(e) => setUploadCategory(e.target.value)}
              className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500"
            >
              {CATEGORIES.filter((c) => c.value).map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
            >
              {uploadFile ? uploadFile.name : 'Choose Image'}
            </button>
            <button
              onClick={handleUpload}
              disabled={uploading || !uploadFile || !uploadName || !uploadSku}
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
          </div>
        </div>
      )}

      {/* Category Tabs */}
      <div className="flex gap-1 p-3 border-b border-gray-200 overflow-x-auto">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.value}
            onClick={() => setActiveCategory(cat.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
              activeCategory === cat.value
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Product Grid */}
      <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <svg className="w-12 h-12 mb-2 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            <p className="text-sm">No products found</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 lg:grid-cols-4 gap-3">
            {filtered.map((product) => (
              <div
                key={product.id}
                onClick={() => toggleSelect(product.id)}
                className={`bg-white border rounded-xl overflow-hidden cursor-pointer transition-all group ${
                  selectedIds.has(product.id)
                    ? 'border-indigo-500 ring-2 ring-indigo-500/20 shadow-md'
                    : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                }`}
              >
                <div className="aspect-square bg-gray-100 relative">
                  <img
                    src={product.image_url}
                    alt={product.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  {selectedIds.has(product.id) && (
                    <div className="absolute top-2 right-2 w-6 h-6 bg-indigo-600 rounded-full flex items-center justify-center">
                      <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(product.id); }}
                    className="absolute top-2 left-2 w-6 h-6 bg-white/80 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50"
                  >
                    <svg className="w-3.5 h-3.5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="p-2.5">
                  <p className="text-xs font-medium text-gray-900 truncate">{product.name}</p>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[10px] font-mono text-gray-400">{product.sku}</span>
                    <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full capitalize">{product.category}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {selectedIds.size > 0 && (
        <div className="p-3 border-t border-gray-200 bg-white flex items-center justify-between">
          <span className="text-xs text-gray-500">{selectedIds.size} selected</span>
          <button
            onClick={handleSendToProduction}
            className="bg-indigo-600 text-white px-6 py-2 rounded-lg text-sm font-bold hover:bg-indigo-500 flex items-center gap-2"
          >
            Send to Production
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
};

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Search, Package, Boxes, ChevronLeft, ChevronRight,
  Copy, Check, ArrowRight, Plus, Pencil, Trash2, X, MapPin,
  ArrowUp, ArrowDown, Settings2, GripVertical, Save
} from 'lucide-react';
import { ProductIcon, BundleIcon, PowderIcon, SemiProductIcon, LabelIcon, SuppliesIcon, MixIcon, PackagingMaterialIcon, JarLidIcon, PetJarIcon, VacuumFlaskIcon, MembraneIcon, CapsuleEmptyIcon } from '../../components/ui/WarehouseIcons';
import api from '../../api/client';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import Modal from '../../components/ui/Modal';
import CopyBadge from '../../components/ui/CopyBadge';
import { useToast } from '../../components/ui/Toast';
import { useAppSettings } from '../../context/AppSettingsContext';
import { cn } from '../../utils/cn';

function fmtQty(val) {
  const n = parseFloat(val);
  if (isNaN(n)) return '—';
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
}

function StockBadge({ stock }) {
  if (stock <= 0) return <Badge variant="danger">Нет</Badge>;
  if (stock < 10) return <Badge variant="warning">{stock}</Badge>;
  return <Badge variant="success">{stock}</Badge>;
}

// ─── Barcode parsing ──────────────────────────────────────────────────────────
const MARKETPLACE_COLORS = {
  system:  { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  wb:      { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-100' },
  ozon:    { bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-100'   },
  yandex:  { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-100' },
  sber:    { bg: 'bg-green-50',  text: 'text-green-700',  border: 'border-green-100'  },
  prod:    { bg: 'bg-gray-50',   text: 'text-gray-600',   border: 'border-gray-100'   },
  unknown: { bg: 'bg-gray-50',   text: 'text-gray-400',   border: 'border-gray-100'   },
};

function parseBarcodes(product) {
  const result = [];
  const added = new Set();
  // Collect ALL barcodes from all sources — all are equal
  const allBarcodes = [];
  if (product.production_barcode) allBarcodes.push(product.production_barcode);
  (product.barcode_list || '').split(';').map(s => s.trim()).filter(Boolean).forEach(bc => allBarcodes.push(bc));
  const mbj = Array.isArray(product.marketplace_barcodes_json) ? product.marketplace_barcodes_json : [];
  mbj.forEach(b => { if (b.value) allBarcodes.push(b.value); });
  // Deduplicate and classify — system barcode FIRST (before marketplace check)
  allBarcodes.forEach(bc => {
    if (added.has(bc)) return;
    added.add(bc);
    // System barcode: starts with 2 + 4+ zeros (e.g. 2000000326375)
    if (/^[124]0{5,}\d+$/.test(bc)) { result.push({ label: 'Системный', value: bc, kind: 'system', storeKey: 'system' }); return; }
    const mp = mbj.find(m => m.value === bc);
    if (mp?.type === 'ozon_1') result.push({ label: 'Ozon ИП И.', value: bc, kind: 'ozon', storeKey: 'ozon_1' });
    else if (mp?.type === 'ozon_2') result.push({ label: 'Ozon ИП Е.', value: bc, kind: 'ozon', storeKey: 'ozon_2' });
    else if (mp?.type === 'wb_1') result.push({ label: 'WB ИП И.', value: bc, kind: 'wb', storeKey: 'wb_1' });
    else if (mp?.type === 'wb_2') result.push({ label: 'WB ИП Е.', value: bc, kind: 'wb', storeKey: 'wb_2' });
    else if (mp?.type === 'wb') result.push({ label: 'WB', value: bc, kind: 'wb' });
    else if (mp?.type === 'ozon' || bc.startsWith('OZN')) result.push({ label: 'Ozon', value: bc, kind: 'ozon' });
    else if (bc.startsWith('MRKT')) result.push({ label: 'Яндекс Маркет', value: bc, kind: 'yandex' });
    else if (bc.startsWith('SBER')) result.push({ label: 'СберМегаМаркет', value: bc, kind: 'sber' });
    else result.push({ label: null, value: bc, kind: 'unknown' });
  });
  return result;
}

function parsePrices(sourceJson) {
  if (!sourceJson?.salePrices) return [];
  const WANTED = ['Цена продажи', 'Себестоимость', 'Цена Ozon после скидки', 'Цена Ozon до скидки', 'Цена WB ИП до скидки', 'Цена WB ИП после скидки', 'СберМегаМаркет'];
  return sourceJson.salePrices
    .filter(p => WANTED.includes(p.priceType?.name) && p.value > 0)
    .map(p => ({
      name: p.priceType.name,
      value: (p.value / 100).toLocaleString('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }),
    }));
}

const MAT_GROUP_ICONS = {
  'порошки': PowderIcon, 'полуфабрикаты': SemiProductIcon, 'этикетки': LabelIcon,
  'смеси': MixIcon, 'расходники': SuppliesIcon, 'другое': PackagingMaterialIcon,
};
const SUPPLY_ICON_KEYS = { 'мембран': MembraneIcon, 'крышк': JarLidIcon, 'капсул': CapsuleEmptyIcon, 'флакон': VacuumFlaskIcon, 'дозатор': VacuumFlaskIcon, 'банк': PetJarIcon };
function matIcon(m, size = 16) {
  if (m.material_group === 'расходники') {
    const lower = (m.name || '').toLowerCase();
    for (const [k, I] of Object.entries(SUPPLY_ICON_KEYS)) { if (lower.includes(k)) return <I size={size} />; }
  }
  const I = MAT_GROUP_ICONS[m.material_group] || PackagingMaterialIcon;
  return <I size={size} />;
}

function BarcodeRow({ label, value, kind, onDelete }) {
  const colors = MARKETPLACE_COLORS[kind] || MARKETPLACE_COLORS.unknown;
  return (
    <div className={cn('flex items-center gap-2 px-3 py-2 rounded-xl border group', colors.bg, colors.border)}>
      <div className="w-24 flex-shrink-0">
        {label ? <span className={cn('text-xs font-semibold', colors.text)}>{label}</span>
               : <span className="text-xs text-gray-300 italic">—</span>}
      </div>
      <CopyBadge value={value} className="flex-1 min-w-0" />
      {onDelete && (
        <button onClick={() => onDelete(value)}
          className="flex-shrink-0 opacity-0 group-hover:opacity-100 text-red-300 hover:text-red-500 transition-all">
          <X size={14} />
        </button>
      )}
    </div>
  );
}

// ─── Search with autocomplete suggestions ─────────────────────────────────────
function SearchWithSuggestions({ value, onChange, onSearch, entityType }) {
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const debounceRef = useRef(null);
  const containerRef = useRef(null);

  const fetchSuggestions = useCallback(async (q) => {
    if (!q || q.length < 2) { setSuggestions([]); return; }
    try {
      const res = await api.get('/products', { params: { search: q, entity_type: entityType, limit: 8 } });
      setSuggestions(res.data.items || []);
    } catch {
      setSuggestions([]);
    }
  }, [entityType]);

  const handleChange = (e) => {
    const v = e.target.value;
    onChange(v);
    setActiveIdx(-1);
    clearTimeout(debounceRef.current);
    if (v.length >= 2) {
      debounceRef.current = setTimeout(() => {
        fetchSuggestions(v);
        setShowSuggestions(true);
      }, 300);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const handleSelect = (name) => {
    onChange(name);
    setSuggestions([]);
    setShowSuggestions(false);
    onSearch(name);
  };

  const handleKeyDown = (e) => {
    if (!showSuggestions || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, suggestions.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, -1)); }
    else if (e.key === 'Enter') {
      if (activeIdx >= 0 && suggestions[activeIdx]) {
        e.preventDefault();
        handleSelect(suggestions[activeIdx].name);
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      setActiveIdx(-1);
    }
  };

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative flex-1" ref={containerRef}>
      <Input
        placeholder="Поиск по названию, коду, штрих-коду..."
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
        icon={<Search size={15} />}
        className="w-full"
      />
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          {suggestions.map((item, idx) => (
            <button
              key={item.id}
              type="button"
              className={cn(
                'w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 transition-colors',
                idx === activeIdx ? 'bg-primary-50 text-primary-900' : 'hover:bg-gray-50 text-gray-800'
              )}
              onMouseDown={() => handleSelect(item.name)}
            >
              <div className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 ${item.entity_type === 'bundle' ? 'bg-purple-50' : 'bg-primary-50'}`}>
                {item.entity_type === 'bundle' ? <BundleIcon size={18} /> : <ProductIcon size={18} />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{item.name}</p>
                {item.code && <p className="text-xs text-gray-400 truncate">{item.code}</p>}
              </div>
              {Number(item.stock) > 0 && (
                <span className="text-xs text-green-600 font-semibold flex-shrink-0">{fmtQty(item.stock)} шт.</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Добавление компонента к комплекту ───────────────────────────────────────
function AddComponentModal({ open, onClose, bundleId, onSuccess }) {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [qty, setQty] = useState('1');
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) { setSearch(''); setResults([]); setSelected(null); setQty('1'); }
  }, [open]);

  const doSearch = useCallback(async () => {
    if (!search.trim()) return;
    setLoading(true);
    try {
      const res = await api.get('/products', { params: { search: search.trim(), entity_type: 'product', limit: 20 } });
      setResults(res.data.items);
    } catch { toast.error('Ошибка поиска'); }
    finally { setLoading(false); }
  }, [search]);

  const handleAdd = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await api.post(`/products/${bundleId}/components`, { component_id: selected.id, quantity: parseFloat(qty) || 1 });
      toast.success('Компонент добавлен');
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка');
    } finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Добавить компонент в комплект"
      footer={<>
        <Button variant="ghost" onClick={onClose}>Отмена</Button>
        <Button onClick={handleAdd} loading={saving} disabled={!selected}>Добавить</Button>
      </>}
    >
      <div className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="Поиск единичного товара..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && doSearch()}
            className="flex-1"
          />
          <Button onClick={doSearch} loading={loading} size="md">Найти</Button>
        </div>

        {results.length > 0 && (
          <div className="max-h-48 overflow-y-auto space-y-1 border border-gray-100 rounded-xl p-1">
            {results.map(r => (
              <button
                key={r.id}
                onClick={() => setSelected(r)}
                className={cn(
                  'w-full text-left px-3 py-2 rounded-lg text-sm transition-colors',
                  selected?.id === r.id ? 'bg-primary-100 text-primary-800' : 'hover:bg-gray-50'
                )}
              >
                <p className="font-medium truncate">{r.name}</p>
                {r.code && <p className="text-xs text-gray-400">{r.code}</p>}
              </button>
            ))}
          </div>
        )}

        {selected && (
          <div className="bg-primary-50 rounded-xl px-4 py-3">
            <p className="text-xs text-primary-500 font-medium mb-1">Выбран</p>
            <p className="text-sm font-semibold text-primary-900">{selected.name}</p>
            <div className="mt-3">
              <Input
                label="Количество"
                type="number"
                min="0.001"
                step="0.001"
                value={qty}
                onChange={e => setQty(e.target.value)}
              />
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ─── Product Form Modal (создание/редактирование) ─────────────────────────────
const FORM_INPUT = 'w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400 transition-all';

function FormSection({ title, icon, children, className = '' }) {
  return (
    <div className={`rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden ${className}`}>
      <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
        {icon}
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{title}</p>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

export function ProductFormModal({ open, onClose, onSuccess, initial }) {
  const toast = useToast();
  const isEdit = !!initial?.id;
  const [form, setForm] = useState({ name:'', code:'', article:'', entity_type:'product', barcode_list:'', stock:'', reserve:'' });
  const [barcodes, setBarcodes] = useState([]);
  const [newBarcode, setNewBarcode] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setForm({ name:initial.name||'', code:initial.code||'', article:initial.article||'', entity_type:initial.entity_type||'product',
        barcode_list: '',
        stock:initial.stock!==undefined?fmtQty(initial.stock):'', reserve:initial.reserve!==undefined?fmtQty(initial.reserve):'' });
      const list = (initial.barcode_list||'').split(';').map(s=>s.trim()).filter(Boolean);
      setBarcodes(list);
    } else {
      setForm({ name:'', code:'', article:'', entity_type:'product', barcode_list:'', stock:'', reserve:'' });
      setBarcodes([]);
    }
    setNewBarcode('');
  }, [open, initial]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = { ...form, barcode_list: barcodes.join(';'), stock: parseFloat(form.stock)||0, reserve: parseFloat(form.reserve)||0 };
      if (isEdit) { await api.put(`/products/${initial.id}`, payload); toast.success('Товар обновлён'); }
      else { await api.post('/products', payload); toast.success('Товар добавлен'); }
      onSuccess(initial?.id || null);
      onClose();
    } catch (err) { toast.error(err.response?.data?.error || 'Ошибка'); }
    finally { setLoading(false); }
  };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const addBarcode = () => {
    const v = newBarcode.trim();
    if (!v) return;
    if (barcodes.includes(v)) { toast.error('Штрих-код уже добавлен'); return; }
    setBarcodes(prev => [...prev, v]);
    setNewBarcode('');
  };

  const removeBarcode = (idx) => setBarcodes(prev => prev.filter((_, i) => i !== idx));

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Редактировать товар' : 'Добавить товар'} size="full"
      footer={<><Button variant="ghost" onClick={onClose}>Отмена</Button><Button form="product-form" type="submit" loading={loading}>{isEdit?'Сохранить':'Добавить'}</Button></>}
    >
      <form id="product-form" onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* LEFT */}
          <div className="space-y-4">
            <FormSection title="Основное" icon={<Package size={14} className="text-gray-400" />}>
              <div className="space-y-3">
                <label className="block"><span className="text-[11px] text-gray-400 font-medium">Название *</span>
                  <input value={form.name} onChange={e => set('name', e.target.value)} required className={FORM_INPUT} /></label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block"><span className="text-[11px] text-gray-400 font-medium">Код</span>
                    <input value={form.code} onChange={e => set('code', e.target.value)} className={FORM_INPUT} /></label>
                  <label className="block"><span className="text-[11px] text-gray-400 font-medium">Артикул</span>
                    <input value={form.article} onChange={e => set('article', e.target.value)} className={FORM_INPUT} /></label>
                </div>
                <label className="block"><span className="text-[11px] text-gray-400 font-medium">Тип</span>
                  <select value={form.entity_type} onChange={e => set('entity_type', e.target.value)} className={FORM_INPUT}>
                    <option value="product">Единичный товар</option>
                    <option value="bundle">Комплект (бандл)</option>
                  </select></label>
              </div>
            </FormSection>

            <FormSection title="Остатки" icon={<span className="text-gray-400 text-sm">📊</span>}>
              <div className="grid grid-cols-2 gap-3">
                <label className="block"><span className="text-[11px] text-gray-400 font-medium">Остаток</span>
                  <input type="number" min="0" step="0.001" value={form.stock} onChange={e => set('stock', e.target.value)} className={FORM_INPUT} /></label>
                <label className="block"><span className="text-[11px] text-gray-400 font-medium">Резерв</span>
                  <input type="number" min="0" step="0.001" value={form.reserve} onChange={e => set('reserve', e.target.value)} className={FORM_INPUT} /></label>
              </div>
            </FormSection>
          </div>

          {/* RIGHT */}
          <div className="space-y-4">
            <FormSection title={`Штрихкоды (${barcodes.length})`} icon={<span className="text-gray-400 text-sm">🏷</span>}>
              <div className="flex gap-2 mb-3">
                <input
                  type="text" value={newBarcode} onChange={e => setNewBarcode(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addBarcode(); } }}
                  placeholder="Введите штрихкод и нажмите +"
                  className={`${FORM_INPUT} flex-1 font-mono`}
                />
                <button type="button" onClick={addBarcode}
                  className="px-4 py-2 rounded-xl bg-primary-600 text-white hover:bg-primary-700 transition-colors text-sm font-bold">
                  +
                </button>
              </div>
              {barcodes.length > 0 ? (
                <div className="space-y-1.5 max-h-60 overflow-y-auto">
                  {barcodes.map((bc, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-xl group">
                      <code className="flex-1 text-sm font-mono text-gray-700 dark:text-gray-300">{bc}</code>
                      <button type="button" onClick={() => removeBarcode(i)}
                        className="text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-300 text-center py-4">Нет штрихкодов</p>
              )}
            </FormSection>
          </div>
        </div>
      </form>
    </Modal>
  );
}

// ─── Product Detail Modal ─────────────────────────────────────────────────────
export function ProductDetailModal({ productId, onClose, onEdit, onDelete }) {
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [nestedId, setNestedId] = useState(null);
  const [showAddComp, setShowAddComp] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [newBarcode, setNewBarcode] = useState('');
  const toast = useToast();

  const loadProduct = useCallback(() => {
    if (!productId) return;
    setLoading(true);
    setProduct(null);
    api.get(`/products/${productId}`)
      .then(r => {
        setProduct(r.data);
        setEditForm({
          name: r.data.name || '', code: r.data.code || '', article: r.data.article || '',
          entity_type: r.data.entity_type || 'product',
          stock: r.data.stock !== undefined ? fmtQty(r.data.stock) : '',
          reserve: r.data.reserve !== undefined ? fmtQty(r.data.reserve) : '',
        });
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [productId]);

  useEffect(() => { setNestedId(null); loadProduct(); }, [loadProduct]);

  const handleSave = async () => {
    if (!editForm) return;
    setSaving(true);
    try {
      await api.put(`/products/${productId}`, {
        ...editForm, stock: parseFloat(editForm.stock) || 0, reserve: parseFloat(editForm.reserve) || 0,
      });
      toast.success('Товар сохранён');
      loadProduct();
      onEdit?.();
    } catch (err) { toast.error(err.response?.data?.error || 'Ошибка'); }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!confirm(`Удалить «${product?.name}»?`)) return;
    try {
      await api.delete(`/products/${productId}`);
      toast.success('Товар удалён');
      onDelete?.();
      onClose();
    } catch (err) { toast.error(err.response?.data?.error || 'Ошибка удаления'); }
  };

  const handleDeleteComponent = async (compBcId) => {
    try {
      await api.delete(`/products/${productId}/components/${compBcId}`);
      toast.success('Компонент удалён');
      loadProduct();
    } catch (err) { toast.error(err.response?.data?.error || 'Ошибка'); }
  };

  const handleDeleteBarcode = async (value) => {
    try {
      await api.delete(`/products/${productId}/barcode`, { data: { value } });
      toast.success('Штрих-код удалён');
      loadProduct();
    } catch (err) { toast.error(err.response?.data?.error || 'Ошибка'); }
  };

  const handleAddBarcode = async () => {
    if (!newBarcode.trim()) return;
    try {
      await api.post(`/products/${productId}/barcode`, { value: newBarcode.trim() });
      toast.success('Штрих-код добавлен');
      setNewBarcode('');
      loadProduct();
    } catch (err) { toast.error(err.response?.data?.error || 'Ошибка добавления'); }
  };

  const barcodes = (product ? parseBarcodes(product) : []).sort((a, b) => {
    const rank = (bc) => { if (bc.kind === 'system') return -1; if (bc.storeKey) return 0; if (bc.kind !== 'unknown') return 1; return 2; };
    return rank(a) - rank(b);
  });
  const prices = product ? parsePrices(product.source_json) : [];
  const isBundle = product?.entity_type === 'bundle';
  const physicalStock = product?.shelves?.reduce((sum, s) => sum + Number(s.quantity || 0), 0) || 0;
  const set = (k, v) => setEditForm(f => ({ ...f, [k]: v }));

  return (
    <>
      <Modal open={!!productId} onClose={onClose} size="full" title={product?.name || 'Загрузка...'}
        footer={product ? (
          <div className="flex items-center justify-between w-full">
            <Button variant="danger" size="sm" icon={<Trash2 size={14} />} onClick={handleDelete}>Удалить</Button>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={onClose}>Отмена</Button>
              <Button loading={saving} onClick={handleSave} icon={<Save size={14} />}>Сохранить</Button>
            </div>
          </div>
        ) : undefined}
      >
        {loading ? (
          <div className="flex items-center justify-center py-16"><Spinner size="lg" /></div>
        ) : !product ? null : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* COLUMN 1: основное + остатки */}
            <div className="space-y-4">
              {/* Бейджи */}
              <div className="flex flex-wrap items-center gap-2">
                {isBundle ? <Badge variant="purple">Комплект</Badge> : <Badge variant="info">Единичный</Badge>}
                <Badge variant={physicalStock > 0 ? 'success' : 'danger'}>На складах: {fmtQty(physicalStock)}</Badge>
                {Number(product.reserve) > 0 && <Badge variant="warning">Резерв: {fmtQty(product.reserve)}</Badge>}
              </div>

              <FormSection title="Основное" icon={<Package size={14} className="text-gray-400" />}>
                <div className="space-y-3">
                  <label className="block"><span className="text-[11px] text-gray-400 font-medium">Название</span>
                    <input value={editForm?.name || ''} onChange={e => set('name', e.target.value)} className={FORM_INPUT} /></label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block"><span className="text-[11px] text-gray-400 font-medium">Код</span>
                      <input value={editForm?.code || ''} onChange={e => set('code', e.target.value)} className={FORM_INPUT} /></label>
                    <label className="block"><span className="text-[11px] text-gray-400 font-medium">Артикул</span>
                      <input value={editForm?.article || ''} onChange={e => set('article', e.target.value)} className={FORM_INPUT} /></label>
                  </div>
                  <label className="block"><span className="text-[11px] text-gray-400 font-medium">Тип</span>
                    <select value={editForm?.entity_type || 'product'} onChange={e => set('entity_type', e.target.value)} className={FORM_INPUT}>
                      <option value="product">Единичный товар</option>
                      <option value="bundle">Комплект (бандл)</option>
                    </select></label>
                  {product.folder_path && (
                    <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-xl">
                      <p className="text-[10px] text-gray-400">Папка</p>
                      <p className="text-xs text-gray-600 dark:text-gray-300">{product.folder_path}</p>
                    </div>
                  )}
                </div>
              </FormSection>

              <FormSection title="Остатки (МС)" icon={<span className="text-gray-400 text-sm">📊</span>}>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block"><span className="text-[11px] text-gray-400 font-medium">Остаток</span>
                    <input type="number" min="0" step="0.001" value={editForm?.stock || ''} onChange={e => set('stock', e.target.value)} className={FORM_INPUT} /></label>
                  <label className="block"><span className="text-[11px] text-gray-400 font-medium">Резерв</span>
                    <input type="number" min="0" step="0.001" value={editForm?.reserve || ''} onChange={e => set('reserve', e.target.value)} className={FORM_INPUT} /></label>
                </div>
              </FormSection>

              {/* Цены */}
              {prices.length > 0 && (
                <FormSection title="Цены" icon={<span className="text-gray-400 text-sm">₽</span>}>
                  <div className="grid grid-cols-2 gap-2">
                    {prices.map(p => (
                      <div key={p.name} className="bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2">
                        <p className="text-[10px] text-gray-400">{p.name}</p>
                        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{p.value}</p>
                      </div>
                    ))}
                  </div>
                </FormSection>
              )}
            </div>

            {/* COLUMN 2: штрихкоды + расположение */}
            <div className="space-y-4">
              <FormSection title={`Штрихкоды (${barcodes.length})`} icon={<span className="text-gray-400 text-sm">🏷</span>}>
                <div className="flex gap-2 mb-3">
                  <input type="text" value={newBarcode} onChange={e => setNewBarcode(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddBarcode(); } }}
                    placeholder="Добавить штрихкод..." className={`${FORM_INPUT} flex-1 font-mono text-xs`} />
                  <button onClick={handleAddBarcode}
                    className="px-3 py-2 rounded-xl bg-primary-600 text-white hover:bg-primary-700 transition-colors text-sm font-bold">+</button>
                </div>
                {barcodes.length > 0 ? (
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {barcodes.map((bc, i) => (
                      <BarcodeRow key={i} {...bc} onDelete={handleDeleteBarcode} />
                    ))}
                  </div>
                ) : <p className="text-sm text-gray-300 text-center py-3">Нет штрихкодов</p>}
              </FormSection>

              <FormSection title={`Расположение (${product.shelves?.length || 0})`} icon={<span className="text-gray-400 text-sm">📍</span>}>
                {!product.shelves?.length ? (
                  <p className="text-sm text-gray-300 text-center py-4">Не размещён на складе</p>
                ) : (
                  <div className="space-y-1.5 max-h-64 overflow-y-auto">
                    {product.shelves.map((s, i) => (
                      <div key={i} className="flex items-center justify-between px-3 py-2.5 bg-gradient-to-r from-primary-50 to-transparent dark:from-primary-900/10 rounded-xl border border-primary-100 dark:border-primary-800/30">
                        <div>
                          <p className="text-sm font-semibold text-gray-900 dark:text-white">{s.location_code || s.shelf_code}</p>
                          <p className="text-xs text-gray-400">
                            {s.warehouse_name} · {s.rack_name}
                            {s.location_type === 'pallet' && ' · паллет'}
                            {s.location_type === 'box' && ' · коробка'}
                            {s.location_type === 'shelf_box' && ' · коробка'}
                          </p>
                        </div>
                        <span className="text-sm font-bold text-primary-700 dark:text-primary-400 bg-white dark:bg-gray-800 px-2.5 py-1 rounded-lg shadow-sm">{fmtQty(s.quantity)} шт.</span>
                      </div>
                    ))}
                  </div>
                )}
              </FormSection>
            </div>

            {/* COLUMN 3: техкарта + бандл */}
            <div className="space-y-4">
              {/* Тех. карта */}
              <FormSection title={`Техкарта${product.tech_card ? ` (${product.tech_card.materials?.length || 0} мат.)` : ''}`} icon={<span className="text-gray-400 text-sm">🧪</span>}>
                {product.tech_card ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 px-3 py-2 bg-amber-50 dark:bg-amber-900/10 rounded-xl border border-amber-100 dark:border-amber-800/30">
                      <span className="text-xs text-amber-600 font-medium">Выход:</span>
                      <span className="text-sm font-bold text-amber-700">{fmtQty(product.tech_card.output_quantity)} шт.</span>
                      {product.tech_card.cost > 0 && (
                        <span className="text-xs text-amber-500 ml-auto">Себестоимость: {fmtQty(product.tech_card.cost)} ₽</span>
                      )}
                    </div>
                    <div className="space-y-1 max-h-52 overflow-y-auto">
                      {(product.tech_card.materials || []).filter(m => m.id).map((m, i) => (
                        <div key={m.id || i}
                          className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-800 hover:bg-purple-50 dark:hover:bg-purple-900/10 cursor-pointer transition-colors border border-transparent hover:border-purple-200"
                          onClick={() => { onClose(); navigate(`/admin/products/materials?id=${m.id}`); }}>
                          <span className="flex-shrink-0">{matIcon(m)}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{m.name}</p>
                          </div>
                          <span className="text-xs font-bold text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-700 px-2 py-0.5 rounded-lg">{fmtQty(m.quantity)} {m.unit}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-300 text-center py-4">Нет техкарты</p>
                )}
              </FormSection>

              {/* Бандл */}
              {isBundle && (
                <FormSection title={`Состав комплекта (${product.components?.length || 0})`} icon={<span className="text-gray-400 text-sm">📦</span>}>
                  <div className="mb-2">
                    <button onClick={() => setShowAddComp(true)}
                      className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-800 font-medium">
                      <Plus size={13} /> Добавить компонент
                    </button>
                  </div>
                  {!product.components?.length ? (
                    <p className="text-sm text-gray-300 text-center py-4">Состав не определён</p>
                  ) : (
                    <div className="space-y-1.5 max-h-52 overflow-y-auto">
                      {product.components.map(c => (
                        <div key={c.bc_id || c.id} className="flex items-center gap-2.5 px-3 py-2 bg-primary-50 dark:bg-primary-900/10 rounded-xl border border-primary-100 dark:border-primary-800/30 group">
                          <ProductIcon size={16} />
                          <button className="flex-1 min-w-0 text-left" onClick={() => setNestedId(c.id)}>
                            <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{c.name}</p>
                          </button>
                          <span className="text-xs font-bold text-primary-700 bg-white dark:bg-gray-800 px-2 py-0.5 rounded-lg">{fmtQty(c.quantity)} шт.</span>
                          {c.bc_id && (
                            <button onClick={() => handleDeleteComponent(c.bc_id)}
                              className="opacity-0 group-hover:opacity-100 text-red-300 hover:text-red-500 transition-all"><X size={14} /></button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </FormSection>
              )}
            </div>
          </div>
        )}
      </Modal>

      {nestedId && <ProductDetailModal productId={nestedId} onClose={() => setNestedId(null)} />}

      {showAddComp && product && (
        <AddComponentModal open={showAddComp} onClose={() => setShowAddComp(false)} bundleId={product.id} onSuccess={loadProduct} />
      )}
    </>
  );
}

// ─── Column config ────────────────────────────────────────────────────────────
const COLUMNS_DEF = [
  { key: 'name',        label: 'Название',  required: true  },
  { key: 'code',        label: 'Код',       required: false },
  { key: 'barcode',     label: 'Штрих-код', required: false },
  { key: 'stock',       label: 'Остаток',   required: false },
  { key: 'shelf_codes', label: 'Ячейки',    required: false },
];
const COL_STORAGE_KEY = 'products_columns_v3';
function loadSavedColumns() {
  try {
    const saved = JSON.parse(localStorage.getItem(COL_STORAGE_KEY));
    if (Array.isArray(saved) && saved.length > 0) {
      const savedKeys = new Set(saved.map(c => c.key));
      const result = saved.filter(c => COLUMNS_DEF.some(d => d.key === c.key));
      COLUMNS_DEF.forEach(d => { if (!savedKeys.has(d.key)) result.push({ ...d, visible: true }); });
      return result;
    }
  } catch {}
  return COLUMNS_DEF.map(c => ({ ...c, visible: true }));
}

// ─── Sort header ──────────────────────────────────────────────────────────────
function Th({ label, sortKey, sortBy, sortDir, onSort, hint }) {
  const active = sortBy === sortKey;
  return (
    <th
      className="cursor-pointer select-none hover:bg-gray-50 transition-colors"
      onClick={() => onSort(sortKey)}
    >
      <div className="flex items-center gap-1">
        <span>{label}</span>
        {hint && (
          <span
            className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-gray-200 text-gray-500 text-[9px] font-bold cursor-default leading-none flex-shrink-0"
            title={hint}
            onClick={e => e.stopPropagation()}
          >i</span>
        )}
        {active
          ? (sortDir === 'asc' ? <ArrowUp size={12} className="text-primary-500" /> : <ArrowDown size={12} className="text-primary-500" />)
          : <ArrowDown size={12} className="text-gray-200" />
        }
      </div>
    </th>
  );
}

// ─── Таблица товаров ──────────────────────────────────────────────────────────
function ProductTable({ entityType, onSelect, onEdit }) {
  const toast = useToast();
  const { settings } = useAppSettings();
  const limit = settings.products_page_size;
  const densityClass = settings.products_row_density === 'compact' ? 'data-table-compact'
    : settings.products_row_density === 'large' ? 'data-table-large' : '';
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [sortBy, setSortBy] = useState(entityType === 'product' ? 'stock' : 'name');
  const [sortDir, setSortDir] = useState(entityType === 'product' ? 'desc' : 'asc');
  const [globalStats, setGlobalStats] = useState(null);
  const [columns, setColumns] = useState(loadSavedColumns);
  const [showColPicker, setShowColPicker] = useState(false);
  const colPickerRef = useRef(null);
  const dragColIdx = useRef(null);

  const handleSort = (key) => {
    if (sortBy === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(key);
      setSortDir(['stock', 'warehouse_qty', 'reserve'].includes(key) ? 'desc' : 'asc');
    }
    setPage(1);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { search, entity_type: entityType, page, limit, sort_by: sortBy, sort_dir: sortDir };
      const res = await api.get('/products', { params });
      setItems(res.data.items);
      setTotal(res.data.total);
    } catch { toast.error('Ошибка загрузки'); }
    finally { setLoading(false); }
  }, [search, entityType, page, sortBy, sortDir]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); setSortBy(entityType === 'product' ? 'stock' : 'name'); setSortDir(entityType === 'product' ? 'desc' : 'asc'); }, [entityType]);
  useEffect(() => { setPage(1); }, [limit]);

  // Fetch global product stats for summary bar
  useEffect(() => {
    api.get('/products/stats').then(r => setGlobalStats(r.data)).catch(() => {});
  }, []);

  // Save columns to localStorage
  useEffect(() => {
    localStorage.setItem(COL_STORAGE_KEY, JSON.stringify(columns));
  }, [columns]);

  // Close col picker on outside click
  useEffect(() => {
    const handler = (e) => {
      if (colPickerRef.current && !colPickerRef.current.contains(e.target)) setShowColPicker(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const totalPages = Math.ceil(total / limit);
  const handleSearch = (val) => { setSearch(val); setPage(1); };
  const withCells = items.filter(i => i.shelf_codes).length;
  const thProps = { sortBy, sortDir, onSort: handleSort };
  const visibleCols = columns.filter(c => c.visible || c.required);

  return (
    <div>
      <form className="flex gap-2 mb-3" onSubmit={e => { e.preventDefault(); handleSearch(searchInput); }}>
        <SearchWithSuggestions
          value={searchInput}
          onChange={setSearchInput}
          onSearch={handleSearch}
          entityType={entityType}
        />
        <Button type="submit" size="md">Найти</Button>
        {search && <Button type="button" variant="ghost" size="md" onClick={() => { setSearch(''); setSearchInput(''); setPage(1); }}>Сбросить</Button>}
        {/* Column picker */}
        <div className="relative" ref={colPickerRef}>
          <button
            type="button"
            onClick={() => setShowColPicker(v => !v)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium transition-all',
              showColPicker
                ? 'bg-primary-50 border-primary-300 text-primary-700'
                : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
            )}
          >
            <Settings2 size={14} />
            Столбцы
          </button>
          {showColPicker && (
            <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-2xl shadow-xl p-3 w-52">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">Столбцы</p>
              <div className="space-y-1">
                {columns.map((col, idx) => (
                  <div
                    key={col.key}
                    draggable
                    onDragStart={() => { dragColIdx.current = idx; }}
                    onDragOver={e => e.preventDefault()}
                    onDrop={() => {
                      const from = dragColIdx.current;
                      if (from === idx || from === null) return;
                      const next = [...columns];
                      const [moved] = next.splice(from, 1);
                      next.splice(idx, 0, moved);
                      setColumns(next);
                      dragColIdx.current = null;
                    }}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-gray-50 cursor-grab active:cursor-grabbing select-none"
                  >
                    <GripVertical size={13} className="text-gray-300 flex-shrink-0" />
                    <input
                      type="checkbox"
                      checked={col.visible || col.required}
                      disabled={col.required}
                      onChange={e => {
                        setColumns(cs => cs.map(c => c.key === col.key ? { ...c, visible: e.target.checked } : c));
                      }}
                      className="rounded"
                    />
                    <span className={cn('text-sm', col.required ? 'text-gray-400' : 'text-gray-700')}>{col.label}</span>
                  </div>
                ))}
              </div>
              <button
                className="mt-2 w-full text-xs text-gray-400 hover:text-gray-600 text-center py-1"
                onClick={() => setColumns(COLUMNS_DEF.map(c => ({ ...c, visible: true })))}
              >
                Сбросить
              </button>
            </div>
          )}
        </div>
      </form>

      {/* Итоговая строка */}
      {!loading && items.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-3">
          <div className="flex items-center gap-2 bg-gray-50 text-gray-600 rounded-xl px-3 py-2 text-sm font-medium">
            <span>Размещено на полках: <strong>{withCells}</strong> из <strong>{items.length}</strong></span>
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48"><Spinner size="lg" /></div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400">
            <ProductIcon size={48} className="mb-2 opacity-50" />
            <p className="text-sm">Товары не найдены</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className={`data-table ${densityClass}`}>
              <thead>
                <tr>
                  {visibleCols.map(col => {
                    const sortKeys = { name: 'name', code: 'code', stock: 'stock', shelf_codes: 'shelf_codes' };
                    if (sortKeys[col.key]) return <Th key={col.key} label={col.label} sortKey={col.key} {...thProps} />;
                    return <th key={col.key}>{col.label}</th>;
                  })}
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.id} className="cursor-pointer hover:bg-primary-50/40 transition-colors" onClick={() => onSelect(item.id)}>
                    {visibleCols.map(col => {
                      if (col.key === 'name') return (
                        <td key="name">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${item.entity_type === 'bundle' ? 'bg-purple-50' : 'bg-primary-50'}`}>
                              {item.entity_type === 'bundle' ? <BundleIcon size={20} /> : <ProductIcon size={20} />}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-gray-900 dark:text-white text-sm leading-tight">{item.name}</p>
                              {item.article && <p className="text-xs text-gray-400">{item.article}</p>}
                            </div>
                          </div>
                        </td>
                      );
                      if (col.key === 'code') return <td key="code" className="text-gray-500 text-xs font-mono">{item.code || '—'}</td>;
                      if (col.key === 'barcode') { const bc = item.barcode_list?.split(';')[0] || item.production_barcode; return <td key="barcode">{bc ? <CopyBadge value={bc} /> : <span className="text-xs text-gray-300">—</span>}</td>; }
                      if (col.key === 'stock') return <td key="stock"><StockBadge stock={Number(item.warehouse_qty || item.stock || 0)} /></td>;
                      if (col.key === 'shelf_codes') return (
                        <td key="shelf_codes">
                          {item.shelf_codes
                            ? (
                              <div className="flex flex-wrap gap-1">
                                {item.shelf_codes.split(', ').map(code => (
                                  <span key={code} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-primary-50 text-primary-700 text-xs font-mono rounded-lg border border-primary-100">
                                    <MapPin size={9} />
                                    {code}
                                  </span>
                                ))}
                              </div>
                            )
                            : <span className="text-xs text-gray-300 italic">не размещён</span>
                          }
                        </td>
                      );
                      return null;
                    })}
                    <td className="w-10">
                      <button
                        onClick={e => { e.stopPropagation(); onEdit?.(item); }}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-all"
                        title="Редактировать"
                      >
                        <Pencil size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3">
          <p className="text-sm text-gray-500">{(page-1)*limit+1}–{Math.min(page*limit,total)} из {total}</p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1,p-1))} disabled={page===1} icon={<ChevronLeft size={15} />}>Назад</Button>
            <span className="text-sm text-gray-500 px-2">{page}/{totalPages}</span>
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages,p+1))} disabled={page===totalPages} icon={<ChevronRight size={15} />}>Вперёд</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Главная страница ─────────────────────────────────────────────────────────
export default function ProductsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get('id') ? parseInt(searchParams.get('id')) : null;
  const [showForm, setShowForm] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const activeTab = searchParams.get('type') || 'product';
  const setActiveTab = (t) => { const p = new URLSearchParams(searchParams); p.set('type', t); p.delete('id'); setSearchParams(p); };

  const openProduct = (id) => {
    const p = new URLSearchParams(searchParams);
    p.set('id', id);
    setSearchParams(p);
  };
  const closeProduct = () => {
    const p = new URLSearchParams(searchParams);
    p.delete('id');
    setSearchParams(p);
  };

  // handleFormSuccess: reload table and re-open detail modal if editing existing product
  const handleFormSuccess = useCallback((savedId = null) => {
    setReloadKey(k => k + 1);
    if (savedId) {
      // Briefly close and reopen to force ProductDetailModal to refetch
      const p = new URLSearchParams(searchParams);
      p.delete('id');
      setSearchParams(p);
      setTimeout(() => {
        const p2 = new URLSearchParams(searchParams);
        p2.set('id', savedId);
        setSearchParams(p2);
      }, 30);
    }
  }, [searchParams, setSearchParams]);

  const handleReload = useCallback(() => {
    setReloadKey(k => k + 1);
  }, []);

  const TABS = [
    { value: 'product', label: 'Единичные', Icon: ProductIcon },
    { value: 'bundle', label: 'Комплекты', Icon: BundleIcon },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Шапка */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Карточки товаров</h1>
          <p className="text-gray-500 text-sm mt-1">Каталог — все товары и комплекты</p>
        </div>
        <Button icon={<Plus size={15} />} size="sm" onClick={() => { setEditProduct(null); setShowForm(true); }}>
          Добавить товар
        </Button>
      </div>

      {/* Вкладки */}
      <div className="flex gap-2 mb-5">
        {TABS.map(({ value, label, Icon }) => (
          <button
            key={value}
            onClick={() => setActiveTab(value)}
            className={cn(
              'flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all',
              activeTab === value
                ? value === 'bundle'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'bg-primary-600 text-white shadow-sm'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
            )}
          >
            <Icon size={20} />
            {label}
          </button>
        ))}
      </div>

      {/* Таблицы */}
      <ProductTable key={`${activeTab}-${reloadKey}`} entityType={activeTab} onSelect={openProduct} onEdit={product => { setEditProduct(product); setShowForm(true); }} />

      <ProductDetailModal
        productId={selectedId}
        onClose={closeProduct}
        onEdit={product => { setEditProduct(product); setShowForm(true); }}
        onDelete={handleReload}
      />

      <ProductFormModal
        open={showForm}
        onClose={() => { setShowForm(false); setEditProduct(null); }}
        onSuccess={handleFormSuccess}
        initial={editProduct}
      />
    </div>
  );
}

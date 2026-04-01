import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { printBarcode } from '../../utils/printBarcode';
import { qty } from '../../utils/fmt';
import {
  Warehouse, Plus, Pencil, Trash2, Layers, Package, Search,
  ChevronRight, ChevronLeft, ArrowLeft, Copy, Check, X, Printer, Box, ArrowUp, ArrowDown
} from 'lucide-react';
import { WarehouseIcon, RackIcon, ShelfIcon, PalletIcon, RowIcon, BoxIcon, ProductIcon, RackBadge, RowBadge, ShelfBadge, PalletBadge } from '../../components/ui/WarehouseIcons';
import api from '../../api/client';
import FBSVisualView from '../../components/visual/FBSVisualView';
import { lazy, Suspense } from 'react';
const FBOVisualView = lazy(() => import('../../components/visual/FBOVisualView'));

import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import Spinner from '../../components/ui/Spinner';
import Badge from '../../components/ui/Badge';
import Barcode from '../../components/ui/Barcode';
import CopyBadge from '../../components/ui/CopyBadge';
import { useToast } from '../../components/ui/Toast';
import { cn } from '../../utils/cn';
import { ProductDetailModal, ProductFormModal } from './ProductsPage';

const fmtQ = (v) => { const n = parseFloat(v || 0); return Number.isInteger(n) ? String(n) : n.toFixed(0); };

// ─── Barcode Display (click to show modal) ───────────────────────────────────
function BarcodeDisplay({ value, label }) {
  const [showBarcode, setShowBarcode] = useState(false);
  if (!value) return null;
  return (
    <>
      <span className="inline-flex items-center gap-2">
        <CopyBadge value={value} label={label} />
        <button onClick={() => setShowBarcode(true)}
          className="text-xs text-gray-400 hover:text-primary-600 transition-colors flex items-center gap-1"
          title="Показать штрих-код">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 7v10M11 7v10M15 7v6M19 7v10"/></svg>
        </button>
      </span>
      {showBarcode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={() => setShowBarcode(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 text-center" onClick={e => e.stopPropagation()}>
            <Barcode value={value} height={80} width={2} />
            <div className="flex justify-center gap-3 mt-4">
              <button onClick={() => printBarcode(value, value, '')} className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-xl hover:bg-primary-700 transition-colors flex items-center gap-2">
                <Printer size={14} /> Печать
              </button>
              <button onClick={() => setShowBarcode(false)} className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-200 transition-colors">
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Warehouse Modal (create/edit) ────────────────────────────────────────────
function WarehouseModal({ open, onClose, warehouse, onSuccess }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: '', notes: '', warehouse_type: 'fbs' });
  const [loading, setLoading] = useState(false);

  const TYPE_OPTIONS = [
    { value: 'fbs',    label: 'Стеллажи + полки',  sub: 'Классическое хранение' },
    { value: 'fbo',    label: 'Ряды + паллеты',     sub: 'Паллетное хранение' },
    { value: 'box',    label: 'Коробки',            sub: 'Только коробки, без стеллажей и паллет' },
    { value: 'both',   label: 'Оба варианта',        sub: 'И стеллажи, и ряды' },
  ];

  useEffect(() => {
    setForm(warehouse
      ? { name: warehouse.name, notes: warehouse.notes || '', warehouse_type: warehouse.warehouse_type || 'fbs', active: warehouse.active !== false }
      : { name: '', notes: '', warehouse_type: 'fbs', active: true });
  }, [warehouse, open]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (warehouse) {
        await api.put(`/warehouse/warehouses/${warehouse.id}`, form);
        toast.success('Склад обновлён');
      } else {
        await api.post('/warehouse/warehouses', form);
        toast.success('Склад создан');
      }
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={warehouse ? 'Редактировать склад' : 'Создать склад'}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Отмена</Button>
        <Button form="wh-form" type="submit" loading={loading}>{warehouse ? 'Сохранить' : 'Создать'}</Button>
      </>}>
      <form id="wh-form" onSubmit={handleSubmit} className="space-y-4">
        <Input label="Название склада" placeholder="Склад Ижевск" value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
        <Input label="Примечание" placeholder="Необязательно" value={form.notes}
          onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
        {warehouse && (
          <label className="flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors">
            <input type="checkbox" checked={!form.active} onChange={() => setForm(f => ({ ...f, active: !f.active }))}
              className="w-4 h-4 rounded border-gray-300 text-red-500 focus:ring-red-400" />
            <div>
              <p className="text-sm font-medium text-gray-700">Скрыть склад</p>
              <p className="text-xs text-gray-400">Не учитывается в статистике и остатках</p>
            </div>
          </label>
        )}
        {!warehouse && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Структура склада</label>
            <div className="flex flex-col gap-2">
              {TYPE_OPTIONS.map(opt => (
                <label key={opt.value} className={cn(
                  'flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-all',
                  form.warehouse_type === opt.value
                    ? 'border-primary-400 bg-primary-50'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                )}>
                  <input type="radio" name="warehouse_type" value={opt.value}
                    checked={form.warehouse_type === opt.value}
                    onChange={e => setForm(f => ({ ...f, warehouse_type: e.target.value }))}
                    className="sr-only" />
                  <div className={cn(
                    'w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all',
                    form.warehouse_type === opt.value ? 'border-primary-500 bg-primary-500' : 'border-gray-300'
                  )}>
                    {form.warehouse_type === opt.value && (
                      <div className="w-1.5 h-1.5 rounded-full bg-white" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{opt.label}</p>
                    <p className="text-xs text-gray-500">{opt.sub}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
}

// ─── Rack Modal ───────────────────────────────────────────────────────────────
function RackModal({ open, onClose, warehouseId, rack, onSuccess }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: '', number: '', notes: '' });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setForm(rack
      ? { name: rack.name, number: rack.number, notes: rack.notes || '' }
      : { name: '', number: '', notes: '' }
    );
  }, [rack, open]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (rack) {
        await api.put(`/warehouse/racks/${rack.id}`, { name: form.name, notes: form.notes });
      } else {
        await api.post('/warehouse/racks', { warehouse_id: warehouseId, ...form });
      }
      toast.success(rack ? 'Стеллаж обновлён' : 'Стеллаж добавлен');
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={rack ? 'Редактировать стеллаж' : 'Добавить стеллаж'}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Отмена</Button>
        <Button form="rack-form" type="submit" loading={loading}>{rack ? 'Сохранить' : 'Добавить'}</Button>
      </>}>
      <form id="rack-form" onSubmit={handleSubmit} className="space-y-4">
        <Input label="Название" placeholder="Стеллаж 12" value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
        {!rack && (
          <Input label="Номер" type="number" min="1" placeholder="12" value={form.number}
            onChange={e => setForm(f => ({ ...f, number: e.target.value }))} required />
        )}
        <Input label="Примечание" placeholder="Необязательно" value={form.notes}
          onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
      </form>
    </Modal>
  );
}

// ─── Shelf Modal ──────────────────────────────────────────────────────────────
function ShelfModal({ open, onClose, rackId, shelf, onSuccess }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: '', number: '', notes: '', uses_boxes: false, uses_loose: true });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setForm(shelf
      ? { name: shelf.name, number: shelf.number, notes: shelf.notes || '', uses_boxes: shelf.uses_boxes === true, uses_loose: shelf.uses_loose !== false }
      : { name: '', number: '', notes: '', uses_boxes: false, uses_loose: true }
    );
  }, [shelf, open]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (shelf) {
        await api.put(`/warehouse/shelves/${shelf.id}`, { name: form.name, notes: form.notes, uses_boxes: form.uses_boxes, uses_loose: form.uses_loose });
      } else {
        await api.post('/warehouse/shelves', { rack_id: rackId, ...form });
      }
      toast.success(shelf ? 'Полка обновлена' : 'Полка добавлена');
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={shelf ? 'Редактировать полку' : 'Добавить полку'}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Отмена</Button>
        <Button form="shelf-form" type="submit" loading={loading}>{shelf ? 'Сохранить' : 'Добавить'}</Button>
      </>}>
      <form id="shelf-form" onSubmit={handleSubmit} className="space-y-4">
        <Input label="Название" placeholder="Полка 7" value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
        {!shelf && (
          <Input label="Номер" type="number" min="1" placeholder="7" value={form.number}
            onChange={e => setForm(f => ({ ...f, number: e.target.value }))} required />
        )}
        <Input label="Примечание" placeholder="Необязательно" value={form.notes}
          onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
        <div className="space-y-2 py-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Режим хранения</p>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={form.uses_loose !== false}
              onChange={e => setForm(f => ({ ...f, uses_loose: e.target.checked }))}
              className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
            <div>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Россыпью</p>
              <p className="text-xs text-gray-400">Товар лежит напрямую на полке</p>
            </div>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={form.uses_boxes}
              onChange={e => setForm(f => ({ ...f, uses_boxes: e.target.checked }))}
              className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
            <div>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">В коробках</p>
              <p className="text-xs text-gray-400">Товар раскладывается по коробкам на полке</p>
            </div>
          </label>
        </div>
      </form>
    </Modal>
  );
}

// ─── Shelf Item Row (inline edit) ────────────────────────────────────────────
function ShelfItemRow({ item, shelfId, onUpdate }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [qty, setQty] = useState(String(parseFloat(item.quantity)));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const newQty = parseFloat(qty);
    if (isNaN(newQty) || newQty < 0) return;
    setSaving(true);
    try {
      await api.post(`/warehouse/shelves/${shelfId}/set`, { product_id: item.product_id, quantity: newQty });
      toast.success('Количество обновлено');
      setEditing(false);
      onUpdate();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
      <div className="w-7 h-7 rounded-lg bg-white flex items-center justify-center flex-shrink-0 border border-gray-100">
        <ProductIcon size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{item.product_name}</p>
        <p className="text-xs text-gray-400">{item.product_code}</p>
      </div>
      {editing ? (
        <div className="flex items-center gap-1 flex-shrink-0">
          <input
            type="number" min="0" step="1"
            className="w-16 text-center text-sm font-bold border border-primary-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary-300"
            value={qty}
            onChange={e => setQty(e.target.value)}
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
          />
          <button onClick={save} disabled={saving} className="p-1 rounded-lg text-green-500 hover:bg-green-50 transition-all">
            {saving ? <Spinner size="xs" /> : <Check size={14} />}
          </button>
          <button onClick={() => setEditing(false)} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 transition-all">
            <X size={14} />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-sm font-bold text-gray-900 dark:text-white">{parseFloat(item.quantity)} шт.</span>
          <button
            onClick={() => { setQty(String(parseFloat(item.quantity))); setEditing(true); }}
            className="p-1 rounded-lg text-gray-400 hover:text-primary-500 hover:bg-primary-50 transition-all"
          >
            <Pencil size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Pallet Item Row (inline edit) ───────────────────────────────────────────
function PalletItemRow({ item, palletId, onUpdate }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [editQty, setEditQty] = useState(String(parseFloat(item.quantity)));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const newQty = parseFloat(editQty);
    if (isNaN(newQty) || newQty < 0) return;
    setSaving(true);
    try {
      await api.put(`/fbo/pallets/${palletId}/item/${item.product_id}`, { quantity: newQty });
      toast.success(newQty <= 0 ? 'Товар удалён' : 'Количество обновлено');
      setEditing(false);
      onUpdate();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка');
    } finally { setSaving(false); }
  };

  return (
    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
      <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center flex-shrink-0 border border-gray-100">
        <ProductIcon size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{item.product_name}</p>
        {item.product_code && <p className="text-xs text-gray-400">{item.product_code}</p>}
      </div>
      {editing ? (
        <div className="flex items-center gap-1 flex-shrink-0">
          <input
            type="number" min="0" step="1"
            className="w-16 text-center text-sm font-bold border border-primary-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary-300"
            value={editQty}
            onChange={e => setEditQty(e.target.value)}
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
          />
          <button onClick={save} disabled={saving} className="p-1 rounded-lg text-green-500 hover:bg-green-50 transition-all">
            {saving ? <Spinner size="xs" /> : <Check size={14} />}
          </button>
          <button onClick={() => setEditing(false)} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 transition-all">
            <X size={14} />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-sm font-bold text-primary-600">{parseFloat(item.quantity)} шт.</span>
          <button
            onClick={() => { setEditQty(String(parseFloat(item.quantity))); setEditing(true); }}
            className="p-1 rounded-lg text-gray-400 hover:text-primary-500 hover:bg-primary-50 transition-all"
          >
            <Pencil size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Add Product to Shelf Modal ───────────────────────────────────────────────
function AddProductToShelfModal({ open, onClose, shelfId, onSuccess }) {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [qty, setQty] = useState('1');
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) { setSearch(''); setSelected(null); setQty('1'); setProducts([]); }
  }, [open]);

  useEffect(() => {
    if (!search.trim() || search.length < 2) { setProducts([]); return; }
    const t = setTimeout(async () => {
      setLoadingSearch(true);
      try {
        const res = await api.get('/products', { params: { search, limit: 10 } });
        setProducts(res.data.items || []);
      } finally { setLoadingSearch(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const handleSave = async () => {
    if (!selected) return;
    const newQty = parseFloat(qty);
    if (isNaN(newQty) || newQty < 0) return;
    setSaving(true);
    try {
      await api.post(`/warehouse/shelves/${shelfId}/set`, { product_id: selected.id, quantity: newQty });
      toast.success('Товар добавлен на полку');
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка');
    } finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Добавить товар на полку"
      footer={<>
        <Button variant="ghost" onClick={onClose}>Отмена</Button>
        <Button onClick={handleSave} loading={saving} disabled={!selected}>Сохранить</Button>
      </>}
    >
      <div className="space-y-4">
        {!selected ? (
          <>
            <Input label="Поиск товара" placeholder="Название, артикул, штрих-код..."
              value={search} onChange={e => setSearch(e.target.value)} autoFocus />
            {loadingSearch && <div className="flex justify-center py-2"><Spinner size="sm" /></div>}
            <div className="space-y-1 max-h-52 overflow-y-auto">
              {products.map(p => (
                <button key={p.id} onClick={() => setSelected(p)}
                  className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-primary-50 transition-colors border border-transparent hover:border-primary-100">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{p.name}</p>
                  <p className="text-xs text-gray-400">{p.code || p.article || '—'}</p>
                </button>
              ))}
              {search.length >= 2 && !loadingSearch && products.length === 0 && (
                <p className="text-center text-sm text-gray-400 py-4">Не найдено</p>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3 p-3 bg-primary-50 rounded-xl">
              <ProductIcon size={20} className="flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{selected.name}</p>
                <p className="text-xs text-gray-400">{selected.code}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
                <X size={14} />
              </button>
            </div>
            <Input label="Количество" type="number" min="0" step="1"
              value={qty} onChange={e => setQty(e.target.value)} autoFocus />
          </>
        )}
      </div>
    </Modal>
  );
}

// ─── Shelf Movements helper ────────────────────────────────────────────────────
const OP_LABELS = {
  inventory:            { label: 'Инвентаризация',  color: 'text-blue-600',    bg: 'bg-blue-50' },
  stock_in:             { label: 'Приход',           color: 'text-green-600',   bg: 'bg-green-50' },
  stock_out:            { label: 'Списание',         color: 'text-red-600',     bg: 'bg-red-50' },
  correction:           { label: 'Корректировка',    color: 'text-amber-600',   bg: 'bg-amber-50' },
  transfer:             { label: 'Перемещение',      color: 'text-primary-600', bg: 'bg-primary-50' },
  // movements_s types (universal log)
  box_create:           { label: 'Создание',         color: 'text-green-600',   bg: 'bg-green-50' },
  box_delete:           { label: 'Удаление',         color: 'text-red-600',     bg: 'bg-red-50' },
  edit_add_to_box:      { label: 'Добавление',       color: 'text-green-600',   bg: 'bg-green-50' },
  edit_remove_from_box: { label: 'Списание',         color: 'text-red-600',     bg: 'bg-red-50' },
  box_product_change:   { label: 'Замена товара',    color: 'text-amber-600',   bg: 'bg-amber-50' },
  external_to_pallet:   { label: 'Приход',           color: 'text-green-600',   bg: 'bg-green-50' },
  pallet_correction_in: { label: 'Корректировка +',  color: 'text-green-600',   bg: 'bg-green-50' },
  pallet_correction_out:{ label: 'Корректировка −',  color: 'text-red-600',     bg: 'bg-red-50' },
  edit_add_to_shelf:    { label: 'Добавление',       color: 'text-green-600',   bg: 'bg-green-50' },
  edit_remove_from_shelf:{ label: 'Списание',        color: 'text-red-600',     bg: 'bg-red-50' },
};
function opMeta(type) { return OP_LABELS[type] || { label: type, color: 'text-gray-600', bg: 'bg-gray-100' }; }

function normalizeMovement(r) {
  // Normalize movements_s records to same shape as shelf_movements_s
  if (r._normalized) return r;
  const opType = r.operation_type || r.movement_type || 'unknown';
  const qDelta = r.quantity_delta !== undefined ? Number(r.quantity_delta)
    : (r.quantity_before !== undefined && r.quantity_after !== undefined)
      ? Number(r.quantity_after) - Number(r.quantity_before)
      : Number(r.quantity || 0);
  return { ...r, operation_type: opType, quantity_delta: qDelta, _normalized: true };
}

function groupMovements(rows) {
  const map = new Map();
  for (const raw of rows) {
    const r = normalizeMovement(raw);
    const key = `${r.task_id ?? 'null'}|${r.product_id}|${r.shelf_id ?? r.to_shelf_id ?? r.from_shelf_id ?? 'null'}|${r.operation_type}`;
    if (!map.has(key)) map.set(key, { ...r, quantity_delta: 0, rows: [] });
    const g = map.get(key);
    g.quantity_delta += r.quantity_delta;
    g.quantity_after = r.quantity_after;
    if (new Date(r.created_at) > new Date(g.created_at)) g.created_at = r.created_at;
    g.rows.push(r);
  }
  return [...map.values()].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function fmtMovDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function LocationHistory({ movements, mode, onModeChange, title }) {
  const normalized = useMemo(() => movements.map(normalizeMovement), [movements]);
  const grouped = useMemo(() => groupMovements(movements), [movements]);
  return (
    <div className="card p-4 mt-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          {title || 'История'} <span className="text-primary-500">{movements.length}</span>
        </p>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
          <button onClick={() => onModeChange('grouped')}
            className={`px-2 py-1 rounded text-xs font-medium transition-all ${mode === 'grouped' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400'}`}>
            Группировка
          </button>
          <button onClick={() => onModeChange('detailed')}
            className={`px-2 py-1 rounded text-xs font-medium transition-all ${mode === 'detailed' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400'}`}>
            Все
          </button>
        </div>
      </div>
      {movements.length === 0 ? (
        <p className="text-center text-sm text-gray-300 py-4">Нет записей</p>
      ) : (
        <div className="space-y-1.5 max-h-96 overflow-y-auto">
          {(mode === 'grouped' ? grouped : normalized).map((r, i) => {
            const meta = opMeta(r.operation_type);
            const delta = Number(r.quantity_delta);
            const sign = delta >= 0 ? '+' : '';
            const boxInfo = r.box_name || r.box_barcode || '';
            return (
              <div key={r.id ?? i} className="flex items-center gap-2.5 py-1.5 px-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">
                <span className={`text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${meta.bg} ${meta.color}`}>
                  {meta.label}
                </span>
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-gray-700 dark:text-gray-300 truncate block">{r.product_name || '—'}</span>
                  {boxInfo && <span className="text-[10px] text-gray-400 truncate block">коробка {boxInfo}</span>}
                </div>
                {mode === 'detailed' && (
                  <span className="text-xs font-mono text-gray-400 flex-shrink-0">{qty(r.quantity_before)}→{qty(r.quantity_after)}</span>
                )}
                <span className={`text-sm font-bold flex-shrink-0 ${delta >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {sign}{qty(delta)} шт.
                </span>
                {r.employee_name && (
                  <span className="text-xs text-gray-400 flex-shrink-0 max-w-[80px] truncate" title={r.employee_name}>{r.employee_name.split(' ')[0]}</span>
                )}
                <span className="text-xs text-gray-300 flex-shrink-0">{fmtMovDate(r.created_at)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Backward compat alias
function ShelfMovements({ movements, mode, onModeChange }) {
  return <LocationHistory movements={movements} mode={mode} onModeChange={onModeChange} />;
}

// ─── Shelf Box helpers ──────────────────────────────────────────────────────
function getShelfBoxLabel(box, shelf) {
  if (box?.name) return box.name;
  if (box?.position && (shelf?.code || shelf?.name)) return `${shelf.code || shelf.name}К${box.position}`;
  return 'Коробка';
}

function getPalletBoxLabel(box, pallet) {
  if (box?.name) return box.name;
  const palletNumber = pallet?.number || pallet?.pallet_number;
  if (box?.position && pallet?.row_number && palletNumber) return `Р${pallet.row_number}П${palletNumber}К${box.position}`;
  if (box?.position) return `Коробка К${box.position}`;
  return 'Коробка';
}

function escapePrintHtml(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

let barcodePdfDepsPromise = null;

function loadExternalScript(src, isReady) {
  if (isReady()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => {
      if (isReady()) resolve();
      else reject(new Error(`Скрипт ${src} загрузился, но зависимость недоступна`));
    };
    script.onerror = () => reject(new Error(`Не удалось загрузить ${src}`));
    document.head.appendChild(script);
  });
}

async function ensureBarcodePdfDeps() {
  if (window.jspdf?.jsPDF && window.JsBarcode) {
    return { jsPDF: window.jspdf.jsPDF, JsBarcode: window.JsBarcode };
  }
  if (!barcodePdfDepsPromise) {
    barcodePdfDepsPromise = (async () => {
      await loadExternalScript('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js', () => !!window.jspdf?.jsPDF);
      await loadExternalScript('https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js', () => !!window.JsBarcode);
      return { jsPDF: window.jspdf.jsPDF, JsBarcode: window.JsBarcode };
    })().catch((error) => {
      barcodePdfDepsPromise = null;
      throw error;
    });
  }
  return barcodePdfDepsPromise;
}

function sanitizePdfFilename(value = 'etiketki') {
  const name = String(value ?? 'etiketki')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return `${name || 'etiketki'}.pdf`;
}

function printBarcodesBatch(items, title = 'Этикетки') {
  const printable = (items || []).filter(item => item?.barcodeValue);
  if (!printable.length) {
    return { printed: 0, skipped: Array.isArray(items) ? items.length : 0, blocked: false };
  }

  const pages = printable.map((item, index) => `\
<section class="page">
  <div class="left"><span>${escapePrintHtml(item.labelText)}</span></div>
  <div class="right">
    <svg id="bc-${index}" data-value="${escapePrintHtml(item.barcodeValue)}"></svg>
    ${item.subText ? `<p class="sub">${escapePrintHtml(item.subText)}</p>` : ''}
  </div>
</section>`).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${escapePrintHtml(title)}</title>
  <style>
    @page { size: 6in 4in; margin: 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { background: #fff; }
    body { width: 6in; }
    .page {
      width: 6in;
      height: 4in;
      display: flex;
      flex-direction: row;
      align-items: stretch;
      background: #fff;
      overflow: hidden;
      page-break-after: always;
      break-after: page;
    }
    .page:last-child {
      page-break-after: auto;
      break-after: auto;
    }
    .left {
      width: 0.75in;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      border-right: 2px solid #000;
    }
    .left span {
      transform: rotate(-90deg);
      white-space: nowrap;
      font-family: Arial Black, Arial, sans-serif;
      font-weight: 900;
      font-size: 32px;
      letter-spacing: 1px;
      color: #000;
      user-select: none;
    }
    .right {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 0.15in 0.25in;
      gap: 6px;
    }
    .right svg { width: 100%; }
    .sub {
      font-family: Arial, sans-serif;
      font-size: 15px;
      color: #333;
      text-align: center;
      letter-spacing: 0.5px;
    }
  </style>
</head>
<body>
  ${pages}
  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>
  <script>
    document.querySelectorAll('svg[data-value]').forEach(function(node) {
      JsBarcode(node, node.dataset.value, {
        format: 'CODE128',
        width: 3.5,
        height: 130,
        displayValue: true,
        fontSize: 20,
        margin: 8,
        background: '#ffffff',
        lineColor: '#000000'
      });
    });
    window.onload = function() {
      window.print();
      window.onafterprint = function() { window.close(); };
    };
  </script>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=640,height=460');
  if (!win) {
    return { printed: 0, skipped: Array.isArray(items) ? items.length : 0, blocked: true };
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  return { printed: printable.length, skipped: (items?.length || 0) - printable.length, blocked: false };
}

async function downloadBarcodesPdfBatch(items, filename = 'etiketki.pdf') {
  const printable = (items || []).filter(item => item?.barcodeValue);
  if (!printable.length) {
    return { downloaded: 0, skipped: Array.isArray(items) ? items.length : 0 };
  }

  const { jsPDF, JsBarcode } = await ensureBarcodePdfDeps();
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'in', format: [4, 6] });

  printable.forEach((item, index) => {
    if (index > 0) pdf.addPage([4, 6], 'landscape');

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const leftWidth = 0.75;
    const canvas = document.createElement('canvas');

    JsBarcode(canvas, item.barcodeValue, {
      format: 'CODE128',
      width: 3.5,
      height: 130,
      displayValue: true,
      fontSize: 20,
      margin: 8,
      background: '#ffffff',
      lineColor: '#000000',
    });

    pdf.setDrawColor(0, 0, 0);
    pdf.setLineWidth(0.02);
    pdf.line(leftWidth, 0, leftWidth, pageHeight);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(28);
    pdf.text(String(item.labelText || ''), leftWidth / 2, pageHeight - 0.2, { angle: 90, align: 'center' });

    pdf.addImage(
      canvas.toDataURL('image/png'),
      'PNG',
      leftWidth + 0.2,
      0.5,
      pageWidth - leftWidth - 0.4,
      2.45,
      undefined,
      'FAST'
    );

    if (item.subText) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(14);
      pdf.text(String(item.subText), leftWidth + ((pageWidth - leftWidth) / 2), 3.55, {
        align: 'center',
        maxWidth: pageWidth - leftWidth - 0.5,
      });
    }
  });

  pdf.save(sanitizePdfFilename(filename.replace(/\.pdf$/i, '')));
  return { downloaded: printable.length, skipped: (items?.length || 0) - printable.length };
}

function printShelfBoxBarcode(box, shelf) {
  printBarcode(box.barcode_value, getShelfBoxLabel(box, shelf), shelf?.code || shelf?.name || '');
}

function printPalletBoxBarcode(box, pallet) {
  printBarcode(box.barcode_value, getPalletBoxLabel(box, pallet), pallet?.name || '');
}

function printShelfBoxesBarcodes(boxes, shelf) {
  return printBarcodesBatch(
    (boxes || []).map(box => ({
      barcodeValue: box?.barcode_value,
      labelText: getShelfBoxLabel(box, shelf),
      subText: shelf?.code || shelf?.name || '',
    })),
    `Коробки ${shelf?.code || shelf?.name || ''}`
  );
}

function printPalletBoxesBarcodes(boxes, pallet) {
  return printBarcodesBatch(
    (boxes || []).map(box => ({
      barcodeValue: box?.barcode_value,
      labelText: getPalletBoxLabel(box, pallet),
      subText: pallet?.name || '',
    })),
    `Коробки ${pallet?.name || ''}`
  );
}

function downloadShelfBoxesPdf(boxes, shelf) {
  return downloadBarcodesPdfBatch(
    (boxes || []).map(box => ({
      barcodeValue: box?.barcode_value,
      labelText: getShelfBoxLabel(box, shelf),
      subText: shelf?.code || shelf?.name || '',
    })),
    `Коробки ${shelf?.code || shelf?.name || 'полка'}`
  );
}

function downloadPalletBoxesPdf(boxes, pallet) {
  return downloadBarcodesPdfBatch(
    (boxes || []).map(box => ({
      barcodeValue: box?.barcode_value,
      labelText: getPalletBoxLabel(box, pallet),
      subText: pallet?.name || '',
    })),
    `Коробки ${pallet?.name || 'паллет'}`
  );
}

function getBoxContentsLabel(box) {
  if (Number(box?.products_count || 0) > 1) return `${Number(box.products_count)} товара`;
  if (box?.product_name) return box.product_name;
  return 'Пустая коробка';
}

function BoxEditorModal({ open, onClose, box, title, onSave, loading }) {
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [qty, setQty] = useState('0');
  const [boxSize, setBoxSize] = useState('50');
  const [loadingSearch, setLoadingSearch] = useState(false);

  useEffect(() => {
    if (!open || !box) return;
    setSearch('');
    setProducts([]);
    setQty(String(Number(box.quantity || 0)));
    setBoxSize(String(Number(box.box_size || 50)));
    if (box.product_id) {
      setSelected({
        id: box.product_id,
        name: box.product_name,
        code: box.product_code,
      });
    } else {
      setSelected(null);
    }
  }, [open, box]);

  useEffect(() => {
    if (!open || !search.trim() || search.length < 2) { setProducts([]); return; }
    const t = setTimeout(async () => {
      setLoadingSearch(true);
      try {
        const res = await api.get('/products', { params: { search, limit: 10 } });
        setProducts(res.data.items || []);
      } finally {
        setLoadingSearch(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [open, search]);

  const handleSave = () => {
    const parsedQty = parseInt(qty || '0', 10);
    if (Number.isNaN(parsedQty) || parsedQty < 0) return;
    onSave({ product_id: parsedQty > 0 ? (selected?.id || null) : null, quantity: parsedQty, box_size: parseInt(boxSize) || 50 });
  };

  const boxLabel = box?.name
    || (box?.shelf_code ? getShelfBoxLabel(box, { code: box.shelf_code, name: box.shelf_name }) : null)
    || ((box?.pallet_number || box?.row_number) ? getPalletBoxLabel(box, { row_number: box.row_number, number: box.pallet_number, name: box.pallet_name }) : null)
    || (box?.position ? `Коробка К${box.position}` : 'Коробка');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Отмена</Button>
        <Button onClick={handleSave} loading={loading}>Сохранить</Button>
      </>}
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Коробка</p>
          <p className="text-sm font-medium text-gray-900 dark:text-white">{boxLabel}</p>
          <p className="text-xs font-mono text-gray-500 mt-0.5">{box?.barcode_value}</p>
        </div>

        {!selected ? (
          <div className="space-y-3">
            <Input
              label="Товар"
              placeholder="Поиск по названию, коду, штрих-коду..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
            />
            {loadingSearch && <div className="flex justify-center py-2"><Spinner size="sm" /></div>}
            <div className="space-y-1 max-h-52 overflow-y-auto">
              {products.map(product => (
                <button
                  key={product.id}
                  onClick={() => setSelected(product)}
                  className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-primary-50 transition-colors border border-transparent hover:border-primary-100"
                >
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{product.name}</p>
                  <p className="text-xs text-gray-400">{product.code || product.article || '—'}</p>
                </button>
              ))}
              {search.length >= 2 && !loadingSearch && products.length === 0 && (
                <p className="text-center text-sm text-gray-400 py-4">Не найдено</p>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 bg-primary-50 dark:bg-primary-900/20 rounded-xl">
              <ProductIcon size={20} className="flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{selected.name}</p>
                <p className="text-xs text-gray-400">{selected.code}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
                <X size={14} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Количество"
                type="number"
                min="0"
                step="1"
                value={qty}
                onChange={e => setQty(e.target.value)}
                autoFocus
              />
              <Input
                label="Макс. вместимость"
                type="number"
                min="1"
                step="1"
                value={boxSize}
                onChange={e => setBoxSize(e.target.value)}
              />
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function BoxDetailView({ boxId, boxType, onClose, onChanged }) {
  const [, setSearchParams] = useSearchParams();
  const toast = useToast();
  const [box, setBox] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [movements, setMovements] = useState([]);
  const [movMode, setMovMode] = useState('detailed');

  const isShelfBox = boxType === 'shelf';
  const isStandalone = boxType === 'standalone';

  const load = useCallback(async () => {
    if (!boxId) return;
    setLoading(true);
    try {
      const res = await api.get(isShelfBox ? `/warehouse/shelf-boxes/${boxId}` : `/fbo/boxes/${boxId}`);
      setBox(res.data);
      // Load box movement history independently
      api.get(`/warehouse/box-movements?box_id=${boxId}&box_type=${isShelfBox ? 'shelf' : 'pallet'}&limit=200`)
        .then(r => setMovements(r.data || []))
        .catch(() => setMovements([]));
    } catch {
      toast.error('Ошибка загрузки коробки');
    } finally {
      setLoading(false);
    }
  }, [boxId, isShelfBox]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    setSearchParams(prev => {
      const p = new URLSearchParams(prev);
      p.set('box', boxId);
      p.set('boxtype', boxType);
      return p;
    });
    return () => {
      setSearchParams(prev => {
        const p = new URLSearchParams(prev);
        p.delete('box');
        p.delete('boxtype');
        return p;
      });
    };
  }, [boxId, boxType, setSearchParams]);

  const boxLabel = isShelfBox
    ? getShelfBoxLabel(box, { code: box?.shelf_code, name: box?.shelf_name })
    : getPalletBoxLabel(box, { row_number: box?.row_number, number: box?.pallet_number, name: box?.pallet_name });
  const canSingleEdit = !box?.items || box.items.length <= 1;

  const handleCopy = () => {
    navigator.clipboard.writeText(box?.barcode_value || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = () => {
    if (!box) return;
    if (isShelfBox) {
      printShelfBoxBarcode(box, { code: box.shelf_code, name: box.shelf_name });
    } else {
      printPalletBoxBarcode(box, { row_number: box.row_number, number: box.pallet_number, name: box.pallet_name });
    }
  };

  const handleDownload = async () => {
    if (!box) return;
    try {
      const result = await downloadBarcodesPdfBatch([{
        barcodeValue: box.barcode_value,
        labelText: boxLabel,
        subText: isShelfBox
          ? (box.shelf_code || box.shelf_name || '')
          : (box.pallet_name || ''),
      }], boxLabel);
      if (!result.downloaded) {
        toast.error('У коробки нет штрих-кода для скачивания');
        return;
      }
      toast.success('PDF скачан');
    } catch (err) {
      toast.error('Не удалось скачать PDF');
    }
  };

  const handleSave = async (payload) => {
    if (payload.quantity > 0 && !payload.product_id) {
      toast.error('Для непустой коробки выберите товар');
      return;
    }
    setSaving(true);
    try {
      await api.put(isShelfBox ? `/warehouse/shelf-boxes/${boxId}` : `/fbo/boxes/${boxId}`, payload);
      toast.success('Коробка обновлена');
      setEditing(false);
      await load();
      onChanged?.();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Удалить коробку "${boxLabel}"?`)) return;
    try {
      await api.delete(isShelfBox ? `/warehouse/shelf-boxes/${boxId}` : `/fbo/boxes/${boxId}`);
      toast.success('Коробка удалена');
      onChanged?.();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка');
    }
  };

  if (loading) return <div className="flex items-center justify-center h-40"><Spinner size="lg" /></div>;
  if (!box) return null;

  const locationRows = isShelfBox
    ? [
        { label: 'Склад', value: box.warehouse_name || '—' },
        { label: 'Стеллаж', value: box.rack_code || box.rack_name || '—' },
        { label: 'Полка', value: box.shelf_code || box.shelf_name || '—' },
        { label: 'Коробка', value: boxLabel },
      ]
    : isStandalone
    ? [
        { label: 'Склад', value: box.warehouse_name || '—' },
        { label: 'Коробка', value: boxLabel },
      ]
    : [
        { label: 'Склад', value: box.warehouse_name || '—' },
        { label: 'Ряд', value: box.row_number ? `Р${box.row_number}` : (box.row_name || '—') },
        { label: 'Паллет', value: box.pallet_number ? `Р${box.row_number}П${box.pallet_number}` : (box.pallet_name || '—') },
        { label: 'Коробка', value: boxLabel },
      ];

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <button onClick={onClose}
          className="p-2 rounded-xl text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">{boxLabel}</h2>
            <Badge variant="warning">Коробка</Badge>
            {!isShelfBox && (
              <Badge variant={box.status === 'open' ? 'warning' : 'success'}>
                {box.status === 'open' ? 'Открыта' : 'Закрыта'}
              </Badge>
            )}
          </div>
          <p className="text-sm text-gray-400">
            {box.items?.length > 1
              ? `${box.items.length} товара внутри коробки`
              : box.product_name
              ? `${box.product_name}${box.product_code ? ` · ${box.product_code}` : ''}`
              : 'Пустая коробка'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canSingleEdit && (
            <button onClick={() => setEditing(true)}
              className="p-2 rounded-xl text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-all">
              <Pencil size={15} />
            </button>
          )}
          <button onClick={handleDelete}
            className="p-2 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all">
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      <div className="card p-4 mb-5">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Штрих-код коробки</p>
        <div className="flex items-center justify-center bg-white dark:bg-gray-800 rounded-xl p-3 border border-gray-100 dark:border-gray-700 mb-3">
          <Barcode value={box.barcode_value} height={55} />
        </div>
        <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2">
          <code className="flex-1 text-sm font-mono text-gray-700 dark:text-gray-300">{box.barcode_value}</code>
          <button onClick={handleCopy} className="p-1 rounded text-gray-400 hover:text-primary-600 transition-colors">
            {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
          </button>
          <button onClick={handleDownload} className="p-1 rounded text-gray-400 hover:text-primary-600 transition-colors">
            <ArrowDown size={14} />
          </button>
          <button onClick={handlePrint} className="p-1 rounded text-gray-400 hover:text-primary-600 transition-colors">
            <Printer size={14} />
          </button>
        </div>
      </div>

      <div className="card p-4 mb-5">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Адрес ячейки</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {locationRows.map(row => (
            <div key={row.label} className="rounded-xl bg-gray-50 dark:bg-gray-800 px-3 py-2">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{row.label}</p>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mt-1 break-words">{row.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Содержимое</p>
          {canSingleEdit ? (
            <Button size="sm" onClick={() => setEditing(true)} icon={<Pencil size={14} />}>
              {box.product_id ? 'Изменить' : 'Заполнить'}
            </Button>
          ) : (
            <span className="text-xs text-amber-600">Смешанная коробка редактируется только через инвентаризацию</span>
          )}
        </div>

        {box.items?.length > 0 ? (
          <div className="space-y-2">
            {box.items.map(item => (
              <div key={item.product_id} className="rounded-xl bg-gray-50 dark:bg-gray-800 p-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white dark:bg-gray-700 flex items-center justify-center flex-shrink-0 border border-gray-100 dark:border-gray-600">
                  <ProductIcon size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{item.product_name}</p>
                  <p className="text-xs text-gray-400">{item.product_code || '—'}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs text-gray-400">Количество</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">{qty(item.quantity)} шт.</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-300 bg-gray-50 dark:bg-gray-800 rounded-xl">
            <BoxIcon size={36} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm">Коробка пустая</p>
          </div>
        )}
      </div>

      <LocationHistory movements={movements} mode={movMode} onModeChange={setMovMode} title="История коробки" />

      <BoxEditorModal
        open={editing}
        onClose={() => setEditing(false)}
        box={box}
        title="Заполнить коробку"
        onSave={handleSave}
        loading={saving}
      />
    </div>
  );
}

// ─── Shelf Detail View (inline, with URL) ─────────────────────────────────────
function ShelfDetailView({ shelfId, rackId, onClose, initialBoxId }) {
  const [, setSearchParams] = useSearchParams();
  const toast = useToast();
  const [shelf, setShelf] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [movements, setMovements] = useState([]);
  const [movMode, setMovMode] = useState('detailed');
  const [creatingBox, setCreatingBox] = useState(false);
  const [editingBox, setEditingBox] = useState(null);
  const [boxSaving, setBoxSaving] = useState(false);
  const [drillBoxId, setDrillBoxId] = useState(initialBoxId || null);

  // Set URL
  useEffect(() => {
    setSearchParams(prev => {
      const p = new URLSearchParams(prev);
      p.set('shelf', shelfId);
      return p;
    });
    return () => {
      setSearchParams(prev => {
        const p = new URLSearchParams(prev);
        p.delete('shelf');
        return p;
      });
    };
  }, [shelfId]);

  const load = useCallback(async () => {
    if (!shelfId) return;
    setLoading(true);
    try {
      const shelfRes = await api.get(`/warehouse/shelves/${shelfId}`);
      setShelf(shelfRes.data);
      // Movements load independently — don't block shelf display
      api.get(`/warehouse/movements?shelf_id=${shelfId}&limit=200`)
        .then(r => setMovements(r.data || []))
        .catch(() => setMovements([]));
    } catch {
      toast.error('Ошибка загрузки полки');
    } finally {
      setLoading(false);
    }
  }, [shelfId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (initialBoxId) setDrillBoxId(initialBoxId);
  }, [initialBoxId]);

  const copyBarcode = () => {
    navigator.clipboard.writeText(shelf?.barcode_value || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const doPrint = () => {
    printBarcode(shelf.barcode_value, shelf.code, shelf.name);
  };

  const createShelfBox = async () => {
    setCreatingBox(true);
    try {
      await api.post(`/warehouse/shelves/${shelf.id}/box`, {});
      toast.success('Коробка создана');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка');
    } finally {
      setCreatingBox(false);
    }
  };

  const saveShelfBox = async (payload) => {
    if (payload.quantity > 0 && !payload.product_id) {
      toast.error('Для непустой коробки выберите товар');
      return;
    }
    setBoxSaving(true);
    try {
      await api.put(`/warehouse/shelf-boxes/${editingBox.id}`, payload);
      toast.success('Коробка обновлена');
      setEditingBox(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка');
    } finally {
      setBoxSaving(false);
    }
  };

  const deleteShelfBox = async (box) => {
    if (!confirm(`Удалить коробку "${box.name || box.barcode_value}"?`)) return;
    try {
      await api.delete(`/warehouse/shelf-boxes/${box.id}`);
      toast.success('Коробка удалена');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка');
    }
  };

  const handlePrintAllShelfBoxes = () => {
    const result = printShelfBoxesBarcodes(shelf?.boxes || [], shelf);
    if (result.blocked) {
      toast.error('Браузер заблокировал окно печати');
      return;
    }
    if (!result.printed) {
      toast.error('На полке нет коробок для печати');
      return;
    }
    if (result.skipped > 0) {
      toast.success(`Открыта печать ${result.printed} коробок, ${result.skipped} пропущено без штрих-кода`);
      return;
    }
    toast.success(`Открыта печать ${result.printed} коробок`);
  };

  const handleDownloadAllShelfBoxes = async () => {
    try {
      const result = await downloadShelfBoxesPdf(shelf?.boxes || [], shelf);
      if (!result.downloaded) {
        toast.error('На полке нет коробок для скачивания');
        return;
      }
      if (result.skipped > 0) {
        toast.success(`Скачан PDF: ${result.downloaded} коробок, ${result.skipped} пропущено без штрих-кода`);
        return;
      }
      toast.success(`Скачан PDF на ${result.downloaded} коробок`);
    } catch (err) {
      toast.error('Не удалось скачать PDF');
    }
  };

  if (drillBoxId) {
    return (
      <BoxDetailView
        boxId={drillBoxId}
        boxType="shelf"
        onClose={() => setDrillBoxId(null)}
        onChanged={load}
      />
    );
  }

  if (loading) return <div className="flex items-center justify-center h-40"><Spinner size="lg" /></div>;
  if (!shelf) return null;
  const isBoxMode = shelf.uses_boxes === true;
  const isLooseMode = shelf.uses_loose !== false;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <button onClick={onClose}
          className="p-2 rounded-xl text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all">
          <ArrowLeft size={18} />
        </button>
        <ShelfBadge number={shelf.code?.replace(/\D/g, '').slice(-1) || '?'} size={48} color="#059669" />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">{shelf.name}</h2>
            <span className="text-xs font-mono text-primary-600 bg-primary-50 dark:bg-primary-900/30 px-2 py-0.5 rounded-lg">{shelf.code}</span>
            {isBoxMode && <Badge variant="warning">Коробки</Badge>}
            {isLooseMode && <Badge variant="default">Россыпь</Badge>}
          </div>
          {shelf.notes && <p className="text-sm text-gray-400">{shelf.notes}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setEditOpen(true)}
            className="p-2 rounded-xl text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-all">
            <Pencil size={15} />
          </button>
        </div>
      </div>

      {/* Barcode */}
      <div className="card p-4 mb-5">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Штрих-код</p>
        <BarcodeDisplay value={shelf.barcode_value} />
      </div>


      {/* Shelf contents */}
      {/* Boxes section (when uses_boxes) */}
      {isBoxMode && (
        <div className="card p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Коробки на полке
              {shelf.boxes?.length > 0 && <span className="ml-1.5 text-primary-500">{shelf.boxes.length}</span>}
            </p>
            <div className="flex items-center gap-2">
              {shelf.boxes?.length > 0 && (
                <button
                  onClick={handleDownloadAllShelfBoxes}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-primary-600 bg-white dark:bg-gray-800 border border-primary-200 dark:border-primary-700 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-xl transition-all font-medium"
                >
                  <ArrowDown size={13} />
                  Скачать PDF
                </button>
              )}
              {shelf.boxes?.length > 0 && (
                <button
                  onClick={handlePrintAllShelfBoxes}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-primary-600 bg-primary-50 dark:bg-primary-900/30 hover:bg-primary-100 dark:hover:bg-primary-900/50 rounded-xl transition-all font-medium"
                >
                  <Printer size={13} />
                  Печать всех
                </button>
              )}
              <Button size="sm" onClick={createShelfBox} loading={creatingBox} icon={<Plus size={14} />}>
                Создать коробку
              </Button>
            </div>
          </div>
          {shelf.boxes?.length > 0 ? (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {shelf.boxes.map(box => (
                <div
                  key={box.id}
                  onClick={() => setDrillBoxId(box.id)}
                  className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl group cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <div className="w-8 h-8 rounded-lg bg-white dark:bg-gray-700 flex items-center justify-center flex-shrink-0 border border-gray-100 dark:border-gray-600">
                    <BoxIcon size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{getShelfBoxLabel(box, shelf)}</p>
                    <p className="text-xs text-gray-500 truncate">{getBoxContentsLabel(box)}{box.product_code && Number(box.products_count || 0) <= 1 ? ` · ${box.product_code}` : ''}</p>
                    <p className="text-xs font-mono text-gray-400">{box.barcode_value}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="flex flex-col items-end gap-1">
                      <span className={`text-xs font-semibold ${Number(box.quantity) > Number(box.box_size) ? 'text-red-600' : 'text-gray-600 dark:text-gray-300'}`}>
                        {qty(box.quantity)} из {box.box_size || 50}
                      </span>
                      <span className="text-[11px] text-gray-400">К{box.position}</span>
                    </div>
                    <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={(e) => { e.stopPropagation(); printShelfBoxBarcode(box, shelf); }}
                        className="p-1 text-gray-300 hover:text-primary-500 hover:bg-primary-50 rounded-lg transition-all">
                        <Printer size={12} />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); setEditingBox(box); }}
                        className="p-1 text-gray-300 hover:text-primary-500 hover:bg-primary-50 rounded-lg transition-all">
                        <Pencil size={12} />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); deleteShelfBox(box); }}
                        className="p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-gray-300 bg-gray-50 dark:bg-gray-800 rounded-xl">
              <BoxIcon size={36} className="mx-auto mb-1.5 opacity-40" />
              <p className="text-sm">На полке пока нет коробок</p>
            </div>
          )}
        </div>
      )}

      {/* Loose items section (shown if uses_loose or has items) */}
      {(isLooseMode || shelf.items?.length > 0) && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Товары россыпью
              {shelf.items?.length > 0 && <span className="ml-1.5 text-primary-500">{shelf.items.length}</span>}
            </p>
            {isLooseMode && (
              <button onClick={() => setAddOpen(true)}
                className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 font-medium">
                <Plus size={13} />
                Добавить
              </button>
            )}
          </div>
          {shelf.items?.length > 0 ? (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {shelf.items.map(item => (
                <ShelfItemRow key={item.id} item={item} shelfId={shelf.id} onUpdate={load} />
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-gray-300 bg-gray-50 dark:bg-gray-800 rounded-xl">
              <ProductIcon size={36} className="mx-auto mb-1.5 opacity-40" />
              <p className="text-sm">Полка пустая</p>
            </div>
          )}
        </div>
      )}

      {/* Movement history */}
      <ShelfMovements movements={movements} mode={movMode} onModeChange={setMovMode} />

      <ShelfModal open={editOpen} onClose={() => setEditOpen(false)} shelf={shelf} rackId={shelf.rack_id} onSuccess={load} />
      <AddProductToShelfModal open={addOpen} onClose={() => setAddOpen(false)} shelfId={shelf.id} onSuccess={load} />
      <BoxEditorModal
        open={!!editingBox}
        onClose={() => setEditingBox(null)}
        box={editingBox}
        title="Заполнить коробку"
        onSave={saveShelfBox}
        loading={boxSaving}
      />
    </div>
  );
}

// ─── Rack Detail View ─────────────────────────────────────────────────────────
function RackDetailView({ rack, onBack, onReload, initialShelfId, initialBoxId, initialBoxType, directShelf }) {
  const [, setSearchParams] = useSearchParams();
  const toast = useToast();
  const [shelves, setShelves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddShelf, setShowAddShelf] = useState(false);
  const [editShelf, setEditShelf] = useState(null);
  const [drillShelfId, setDrillShelfId] = useState(initialShelfId || null);
  const [copied, setCopied] = useState(false);
  const [cameDirectly] = useState(!!directShelf);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/warehouse/racks/${rack.id}`);
      setShelves(res.data.shelves || []);
    } finally {
      setLoading(false);
    }
  }, [rack.id]);

  useEffect(() => { load(); }, []);

  const handleDrillShelf = (id) => {
    setDrillShelfId(id);
    if (id) {
      setSearchParams(prev => {
        const p = new URLSearchParams(prev);
        p.set('shelf', id);
        p.delete('box');
        p.delete('boxtype');
        return p;
      });
    } else {
      setSearchParams(prev => {
        const p = new URLSearchParams(prev);
        p.delete('shelf');
        p.delete('box');
        p.delete('boxtype');
        return p;
      });
    }
  };

  const deleteShelf = async (id, name) => {
    if (!confirm(`Удалить полку "${name}"?`)) return;
    try {
      await api.delete(`/warehouse/shelves/${id}`);
      toast.success('Полка удалена');
      load();
    } catch {
      toast.error('Ошибка');
    }
  };

  const copyBarcode = (val) => {
    navigator.clipboard.writeText(val);
    setCopied(val);
    setTimeout(() => setCopied(false), 2000);
  };

  if (drillShelfId) {
    return (
      <ShelfDetailView
        shelfId={drillShelfId}
        rackId={rack.id}
        onClose={() => {
          if (cameDirectly) {
            // Came directly from warehouse → go back to warehouse, skip rack view
            onBack();
          } else {
            handleDrillShelf(null);
          }
        }}
        initialBoxId={initialBoxType === 'shelf' ? initialBoxId : null}
      />
    );
  }

  const rackNum = rack.code?.replace(/\D/g, '') || rack.number || '?';
  const shelfPalette = [
    { bg: '#7c3aed', light: '#ede9fe', text: '#6d28d9' },
    { bg: '#2563eb', light: '#dbeafe', text: '#1d4ed8' },
    { bg: '#0891b2', light: '#cffafe', text: '#0e7490' },
    { bg: '#059669', light: '#d1fae5', text: '#047857' },
    { bg: '#d97706', light: '#fef3c7', text: '#b45309' },
    { bg: '#dc2626', light: '#fee2e2', text: '#b91c1c' },
    { bg: '#db2777', light: '#fce7f3', text: '#be185d' },
    { bg: '#4f46e5', light: '#e0e7ff', text: '#4338ca' },
  ];

  return (
    <div>
      {/* Rack header — colored banner */}
      <div className="card p-0 mb-5 overflow-hidden">
        <div className="flex items-center gap-4 p-5" style={{ borderLeft: '5px solid #7c3aed' }}>
          <button onClick={onBack}
            className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all">
            <ArrowLeft size={18} />
          </button>
          <RackBadge number={rackNum} size={56} color="#7c3aed" />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">{rack.name}</h2>
              <span className="text-xs font-mono text-primary-600 bg-primary-50 dark:bg-primary-900/30 px-2 py-0.5 rounded-lg">{rack.code}</span>
            </div>
            <div className="flex items-center gap-4 mt-1">
              <span className="text-sm text-gray-400">{shelves.length} полок</span>
              {rack.barcode_value && <BarcodeDisplay value={rack.barcode_value} />}
            </div>
          </div>
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setShowAddShelf(true)}>
            Добавить полку
          </Button>
        </div>
      </div>

      {/* Shelves grid */}
      {loading ? (
        <div className="flex items-center justify-center h-40"><Spinner /></div>
      ) : shelves.length === 0 ? (
        <div className="text-center py-12 text-gray-400 card">
          <Layers size={36} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">Нет полок</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {shelves.map((shelf, idx) => {
            const c = shelfPalette[idx % shelfPalette.length];
            const productsCount = Number(shelf.products_count || 0);
            const totalItems = Number(shelf.total_items || 0);
            const shelfNum = shelf.code?.replace(/\D/g, '').slice(-1) || (idx + 1);
            return (
              <div key={shelf.id}
                className="card p-0 hover:shadow-lg transition-all group cursor-pointer overflow-hidden"
                style={{ borderLeft: `4px solid ${c.bg}` }}
                onClick={() => handleDrillShelf(shelf.id)}>
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    <ShelfBadge number={shelfNum} size={44} color={c.bg} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-base font-bold text-gray-900 dark:text-white">{shelf.name}</span>
                        <span className="text-xs font-mono px-1.5 py-0.5 rounded-md" style={{ color: c.text, background: c.light }}>{shelf.code}</span>
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-lg ${shelf.uses_boxes ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'}`}>
                          {shelf.uses_boxes ? 'Коробки' : 'Без коробок'}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 mt-1">
                        <span className="text-xs text-gray-500">
                          {shelf.uses_boxes
                            ? `${Number(shelf.boxes_count || 0)} кор. · ${totalItems.toLocaleString('ru-RU')} шт.`
                            : `${productsCount} тов. · ${totalItems.toLocaleString('ru-RU')} шт.`}
                        </span>
                      </div>
                      <div className="mt-2" onClick={e => e.stopPropagation()}>
                        <BarcodeDisplay value={shelf.barcode_value} />
                      </div>
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={e => e.stopPropagation()}>
                        <button onClick={() => setEditShelf(shelf)}
                          className="p-1.5 rounded-lg text-gray-300 hover:text-primary-500 hover:bg-primary-50 transition-all">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => deleteShelf(shelf.id, shelf.name)}
                          className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all">
                          <Trash2 size={13} />
                        </button>
                      </div>
                      <ChevronRight size={18} className="text-gray-300 group-hover:text-primary-400 transition-colors mt-1" />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ShelfModal open={showAddShelf} onClose={() => setShowAddShelf(false)} rackId={rack.id} onSuccess={load} />
      <ShelfModal open={!!editShelf} onClose={() => setEditShelf(null)} shelf={editShelf} rackId={rack.id} onSuccess={load} />
    </div>
  );
}

// ─── FBO: Pallet Detail View (inline) ─────────────────────────────────────────
function PalletDetailView({ pallet, onClose, initialBoxId }) {
  const [, setSearchParams] = useSearchParams();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [addSearch, setAddSearch] = useState('');
  const [addResults, setAddResults] = useState([]);
  const [addLoading, setAddLoading] = useState(false);
  const [addSelected, setAddSelected] = useState(null);
  const [addQty, setAddQty] = useState('1');
  const [addSaving, setAddSaving] = useState(false);
  const [creatingBox, setCreatingBox] = useState(false);
  const [editingBox, setEditingBox] = useState(null);
  const [boxSaving, setBoxSaving] = useState(false);
  const [drillBoxId, setDrillBoxId] = useState(initialBoxId || null);
  const [movements, setMovements] = useState([]);
  const [movMode, setMovMode] = useState('detailed');
  const addDebRef = useRef(null);

  useEffect(() => {
    setSearchParams(prev => { const p = new URLSearchParams(prev); p.set('pallet', pallet.id); return p; });
    return () => {
      setSearchParams(prev => { const p = new URLSearchParams(prev); p.delete('pallet'); return p; });
    };
  }, [pallet.id]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/fbo/pallets/${pallet.id}`);
      setData(res.data);
      // Load pallet movement history independently
      api.get(`/warehouse/movements?pallet_id=${pallet.id}&limit=200`)
        .then(r => setMovements(r.data || []))
        .catch(() => setMovements([]));
    } catch { toast.error('Ошибка загрузки паллета'); }
    finally { setLoading(false); }
  }, [pallet.id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (initialBoxId) setDrillBoxId(initialBoxId);
  }, [initialBoxId]);

  const doPrint = () => {
    const code = pallet.row_number ? `Р${pallet.row_number}П${pallet.number}` : (pallet.name || 'Паллет');
    printBarcode(pallet.barcode_value, code, pallet.warehouse_name || '');
  };

  const searchProducts = (q) => {
    clearTimeout(addDebRef.current);
    setAddSearch(q);
    if (q.length < 2) { setAddResults([]); return; }
    addDebRef.current = setTimeout(async () => {
      setAddLoading(true);
      try {
        const res = await api.get('/products', { params: { search: q, limit: 10 } });
        setAddResults(res.data.items || []);
      } catch { setAddResults([]); }
      finally { setAddLoading(false); }
    }, 300);
  };

  const handleAddLooseItem = async () => {
    if (!addSelected || !addQty) return;
    setAddSaving(true);
    try {
      await api.post(`/fbo/pallets/${pallet.id}/item`, { product_id: addSelected.id, quantity: parseInt(addQty, 10) });
      toast.success('Товар добавлен на паллет');
      setShowAdd(false); setAddSearch(''); setAddResults([]); setAddSelected(null); setAddQty('1');
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Ошибка'); }
    finally { setAddSaving(false); }
  };

  const handleCreateBox = async () => {
    setCreatingBox(true);
    try {
      await api.post(`/fbo/pallets/${pallet.id}/box`, {});
      toast.success('Коробка создана');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка');
    } finally {
      setCreatingBox(false);
    }
  };

  const handleDeleteBox = async (box) => {
    if (!confirm(`Удалить коробку "${box.barcode_value}"?`)) return;
    try {
      await api.delete(`/fbo/boxes/${box.id}`);
      toast.success('Коробка удалена');
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Ошибка'); }
  };

  const handleSaveBox = async (payload) => {
    if (payload.quantity > 0 && !payload.product_id) {
      toast.error('Для непустой коробки выберите товар');
      return;
    }
    setBoxSaving(true);
    try {
      await api.put(`/fbo/boxes/${editingBox.id}`, payload);
      toast.success('Коробка обновлена');
      setEditingBox(null);
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Ошибка'); }
    finally { setBoxSaving(false); }
  };

  const handlePrintAllPalletBoxes = () => {
    const result = printPalletBoxesBarcodes(data?.boxes || [], data || pallet);
    if (result.blocked) {
      toast.error('Браузер заблокировал окно печати');
      return;
    }
    if (!result.printed) {
      toast.error('На паллете нет коробок для печати');
      return;
    }
    if (result.skipped > 0) {
      toast.success(`Открыта печать ${result.printed} коробок, ${result.skipped} пропущено без штрих-кода`);
      return;
    }
    toast.success(`Открыта печать ${result.printed} коробок`);
  };

  const handleDownloadAllPalletBoxes = async () => {
    try {
      const result = await downloadPalletBoxesPdf(data?.boxes || [], data || pallet);
      if (!result.downloaded) {
        toast.error('На паллете нет коробок для скачивания');
        return;
      }
      if (result.skipped > 0) {
        toast.success(`Скачан PDF: ${result.downloaded} коробок, ${result.skipped} пропущено без штрих-кода`);
        return;
      }
      toast.success(`Скачан PDF на ${result.downloaded} коробок`);
    } catch (err) {
      toast.error('Не удалось скачать PDF');
    }
  };

  const isBoxMode = data?.uses_boxes !== false;

  // Сводка по товарам: группировка коробок по product_name
  const productSummary = useMemo(() => {
    if (!isBoxMode || !data?.boxes?.length) return [];
    const map = {};
    data.boxes.forEach(box => {
      const name = box.product_name || 'Без товара';
      const q = Number(box.quantity || 0);
      if (!map[name]) map[name] = { name, boxes: 0, total: 0, code: box.product_code };
      map[name].boxes += 1;
      map[name].total += q;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [data?.boxes, isBoxMode]);

  if (drillBoxId) {
    return (
      <BoxDetailView
        boxId={drillBoxId}
        boxType="pallet"
        onClose={() => setDrillBoxId(null)}
        onChanged={load}
      />
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <button onClick={onClose}
          className="p-2 rounded-xl text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all">
          <ArrowLeft size={18} />
        </button>
        <PalletBadge number={pallet.number} size={56} color="#7c3aed" />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">{pallet.name}</h2>
            <span className="text-xs font-mono text-primary-600 bg-primary-50 dark:bg-primary-900/30 px-2 py-0.5 rounded-lg">№{pallet.number}</span>
            <Badge variant={isBoxMode ? 'warning' : 'default'}>{isBoxMode ? 'Коробки' : 'Без коробок'}</Badge>
          </div>
          <p className="text-sm text-gray-400">
            {loading ? '...' : isBoxMode ? `${data?.boxes?.length || 0} коробок` : 'Товар напрямую'}
          </p>
        </div>
        {pallet.barcode_value && (
          <button onClick={doPrint}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-primary-600 bg-primary-100 hover:bg-primary-200 rounded-xl transition-all font-medium">
            <Printer size={13} />
            Штрих-код
          </button>
        )}
      </div>

      {/* Сводка по товарам */}
      {!loading && isBoxMode && productSummary.length > 0 && (
        <div className="card overflow-hidden mb-4">
          <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Сводка по товарам</p>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-gray-800">
            {productSummary.map(item => (
              <div key={item.name} className="flex items-center gap-3 px-4 py-2.5">
                <Package size={14} className="text-gray-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{item.name}</p>
                  {item.code && <p className="text-xs text-gray-400">{item.code}</p>}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-gray-900 dark:text-white">{qty(item.total)} шт.</p>
                  <p className="text-xs text-gray-400">{qty(item.boxes)} кор. × {item.boxes > 0 ? qty(Math.round(item.total / item.boxes)) : 0}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700 flex justify-between">
            <span className="text-xs font-semibold text-gray-500">Итого</span>
            <span className="text-xs font-bold text-gray-700 dark:text-gray-300">{qty(productSummary.reduce((s, i) => s + i.total, 0))} шт. в {qty(productSummary.reduce((s, i) => s + i.boxes, 0))} коробках</span>
          </div>
        </div>
      )}

      {isBoxMode && <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Коробки {data?.boxes?.length > 0 && <span className="ml-1.5 text-primary-500">{data.boxes.length}</span>}
          </p>
          <div className="flex items-center gap-2">
            {data?.boxes?.length > 0 && (
              <button
                onClick={handleDownloadAllPalletBoxes}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-primary-600 bg-white dark:bg-gray-800 border border-primary-200 dark:border-primary-700 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded-xl transition-all font-medium"
              >
                <ArrowDown size={13} />
                Скачать PDF
              </button>
            )}
            {data?.boxes?.length > 0 && (
              <button
                onClick={handlePrintAllPalletBoxes}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-primary-600 bg-primary-50 hover:bg-primary-100 rounded-xl transition-all font-medium"
              >
                <Printer size={13} />
                Печать всех
              </button>
            )}
            <Button size="sm" onClick={handleCreateBox} loading={creatingBox} icon={<Plus size={14} />}>
              Создать коробку
            </Button>
          </div>
        </div>
        {loading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : data?.boxes?.length > 0 ? (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {data.boxes.map(box => (
              <div
                key={box.id}
                onClick={() => setDrillBoxId(box.id)}
                className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl group cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <div className="w-8 h-8 rounded-lg bg-white dark:bg-gray-700 flex items-center justify-center flex-shrink-0 border border-gray-100 dark:border-gray-600">
                  <BoxIcon size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{getPalletBoxLabel(box, data || pallet)}</p>
                  <p className="text-xs text-gray-500 truncate">{getBoxContentsLabel(box)}{box.product_code && Number(box.products_count || 0) <= 1 ? ` · ${box.product_code}` : ''}</p>
                  <p className="text-xs text-gray-400 font-mono">{box.barcode_value}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant={box.status === 'open' ? 'warning' : 'success'} dot>
                      {box.status === 'open' ? 'Открыта' : 'Закрыта'}
                    </Badge>
                    <span className="text-xs text-gray-500">{qty(box.quantity)} шт.</span>
                  </div>
                  <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={(e) => { e.stopPropagation(); printPalletBoxBarcode(box, data || pallet); }}
                      className="p-1 text-gray-300 hover:text-primary-500 hover:bg-primary-50 rounded-lg transition-all">
                      <Printer size={12} />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setEditingBox(box); }}
                      className="p-1 text-gray-300 hover:text-primary-500 hover:bg-primary-50 rounded-lg transition-all">
                      <Pencil size={12} />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); handleDeleteBox(box); }}
                      className="p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-300 bg-gray-50 dark:bg-gray-800 rounded-xl">
            <BoxIcon size={36} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm">Нет коробок</p>
          </div>
        )}
      </div>}

      {/* Add product directly (no boxes mode) */}
      {showAdd && !isBoxMode && (
        <div className="card p-4 mt-4 bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-800">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Добавить товар на паллет</p>
          {!addSelected ? (
            <div className="space-y-2">
              <Input placeholder="Поиск по названию, коду, штрих-коду..." value={addSearch} onChange={e => searchProducts(e.target.value)} />
              {addLoading && <div className="text-center py-2"><Spinner size="sm" /></div>}
              {addResults.length > 0 && (
                <div className="max-h-48 overflow-y-auto space-y-1 bg-white dark:bg-gray-800 rounded-xl p-1">
                  {addResults.map(p => (
                    <button key={p.id} onClick={() => setAddSelected(p)}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-primary-50 dark:hover:bg-primary-900/30 transition-colors flex items-center gap-2">
                      <ProductIcon size={18} className="flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{p.name}</p>
                        {p.code && <p className="text-xs text-gray-400">{p.code}</p>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {addSearch.length >= 2 && !addLoading && addResults.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-2">Не найдено</p>
              )}
              <button onClick={() => { setShowAdd(false); setAddSearch(''); setAddResults([]); }}
                className="text-xs text-gray-500 hover:text-gray-700 font-medium">Отмена</button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-800 rounded-xl">
                <ProductIcon size={18} className="flex-shrink-0" />
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200 flex-1 truncate">{addSelected.name}</p>
                <button onClick={() => setAddSelected(null)} className="text-gray-400 hover:text-gray-600">
                  <X size={14} />
                </button>
              </div>
              <div className="flex items-end gap-3">
                <div style={{ width: 100 }}>
                  <Input label="Кол-во" type="number" min="1" value={addQty} onChange={e => setAddQty(e.target.value)} />
                </div>
                <Button onClick={handleAddLooseItem} loading={addSaving} size="sm">Добавить</Button>
                <Button variant="ghost" size="sm" onClick={() => { setShowAdd(false); setAddSelected(null); setAddSearch(''); setAddResults([]); setAddQty('1'); }}>Отмена</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Loose items on pallet (pallet_items_c) */}
      {!loading && (!isBoxMode || data?.items?.length > 0) && (
        <div className="card p-4 mt-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Товары напрямую {data?.items?.length > 0 && <span className="ml-1.5 text-primary-500">{data.items.length}</span>}
            </p>
            {!isBoxMode && !showAdd && (
              <button onClick={() => setShowAdd(true)}
                className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-800 font-medium">
                <Plus size={13} /> Товар
              </button>
            )}
          </div>
          <div className="space-y-2">
            {data.items.map(item => (
              <PalletItemRow key={item.id} item={item} palletId={pallet.id} onUpdate={load} />
            ))}
          </div>
          {data?.items?.length === 0 && !isBoxMode && (
            <div className="text-center py-8 text-gray-300 bg-gray-50 dark:bg-gray-800 rounded-xl">
              <ProductIcon size={36} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">Нет товаров на паллете</p>
            </div>
          )}
        </div>
      )}

      <LocationHistory movements={movements} mode={movMode} onModeChange={setMovMode} title="История паллета" />

      <BoxEditorModal
        open={!!editingBox}
        onClose={() => setEditingBox(null)}
        box={editingBox}
        title="Заполнить коробку"
        onSave={handleSaveBox}
        loading={boxSaving}
      />

    </div>
  );
}

// ─── FBO: Pallet Modal ────────────────────────────────────────────────────────
function PalletModal({ open, onClose, rowId, pallet, onSuccess }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: '', number: '', uses_boxes: true });
  const [loading, setLoading] = useState(false);
  const isEdit = !!pallet;
  useEffect(() => {
    if (open) setForm(pallet
      ? { name: pallet.name, number: String(pallet.number), uses_boxes: pallet.uses_boxes !== false }
      : { name: '', number: '', uses_boxes: true });
  }, [open, pallet]);
  const handleSubmit = async (e) => {
    e.preventDefault(); setLoading(true);
    try {
      if (isEdit) {
        await api.put(`/fbo/pallets/${pallet.id}`, form);
        toast.success('Паллет обновлён');
      } else {
        await api.post('/fbo/pallets', { row_id: rowId, ...form });
        toast.success('Паллет добавлен');
      }
      onSuccess(); onClose();
    } catch (err) { toast.error(err.response?.data?.error || 'Ошибка'); }
    finally { setLoading(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Редактировать паллет' : 'Добавить паллет'}
      footer={<><Button variant="ghost" onClick={onClose}>Отмена</Button><Button form="pallet-form" type="submit" loading={loading}>{isEdit ? 'Сохранить' : 'Добавить'}</Button></>}>
      <form id="pallet-form" onSubmit={handleSubmit} className="space-y-4">
        <Input label="Название" placeholder="Паллет 1" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
        <Input label="Номер" type="number" min="1" placeholder="1" value={form.number} onChange={e => setForm(f => ({ ...f, number: e.target.value }))} required />
        <label className="flex items-center gap-3 cursor-pointer py-2">
          <input
            type="checkbox"
            checked={form.uses_boxes}
            onChange={e => setForm(f => ({ ...f, uses_boxes: e.target.checked }))}
            className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          <div>
            <p className="text-sm font-medium text-gray-800">Товар в коробках</p>
            <p className="text-xs text-gray-400">{form.uses_boxes ? 'Товар раскладывается по коробкам на паллете' : 'Товар лежит напрямую на паллете'}</p>
          </div>
        </label>
      </form>
    </Modal>
  );
}

// ─── FBO: Row → Pallets view ──────────────────────────────────────────────────
function RowDetailView({ row, onBack, initialPalletId, initialBoxId, initialBoxType }) {
  const [, setSearchParams] = useSearchParams();
  const toast = useToast();
  const [pallets, setPallets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddPallet, setShowAddPallet] = useState(false);
  const [editPallet, setEditPallet] = useState(null);
  const [drillPallet, setDrillPallet] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/fbo/rows/${row.id}`);
      const ps = res.data.pallets || [];
      setPallets(ps);
      if (initialPalletId && !drillPallet) {
        const found = ps.find(p => String(p.id) === String(initialPalletId));
        if (found) setDrillPallet(found);
      }
    } catch { toast.error('Ошибка загрузки паллет'); }
    finally { setLoading(false); }
  }, [row.id]);

  useEffect(() => { load(); }, [load]);

  const handleDrillPallet = (p) => {
    setDrillPallet(p);
    if (p) {
      setSearchParams(prev => { const ps = new URLSearchParams(prev); ps.set('pallet', p.id); return ps; });
    } else {
      setSearchParams(prev => { const ps = new URLSearchParams(prev); ps.delete('pallet'); return ps; });
    }
  };

  const deletePallet = async (p) => {
    if (!confirm(`Удалить паллет "${p.name}"?`)) return;
    try {
      await api.delete(`/fbo/pallets/${p.id}`);
      toast.success('Паллет удалён'); load();
    } catch (err) { toast.error(err.response?.data?.error || 'Ошибка'); }
  };

  if (drillPallet) {
    return <PalletDetailView pallet={drillPallet} onClose={() => handleDrillPallet(null)} initialBoxId={initialBoxType === 'pallet' ? initialBoxId : null} />;
  }

  const palletPalette = [
    { bg: '#7c3aed', light: '#ede9fe', text: '#6d28d9', border: '#8b5cf6' },
    { bg: '#2563eb', light: '#dbeafe', text: '#1d4ed8', border: '#3b82f6' },
    { bg: '#0891b2', light: '#cffafe', text: '#0e7490', border: '#06b6d4' },
    { bg: '#059669', light: '#d1fae5', text: '#047857', border: '#10b981' },
    { bg: '#d97706', light: '#fef3c7', text: '#b45309', border: '#f59e0b' },
    { bg: '#dc2626', light: '#fee2e2', text: '#b91c1c', border: '#ef4444' },
    { bg: '#db2777', light: '#fce7f3', text: '#be185d', border: '#ec4899' },
    { bg: '#4f46e5', light: '#e0e7ff', text: '#4338ca', border: '#6366f1' },
  ];

  return (
    <div>
      {/* Row header banner */}
      <div className="card p-0 mb-5 overflow-hidden">
        <div className="flex items-center gap-4 p-5" style={{ borderLeft: '5px solid #7c3aed' }}>
          <button onClick={onBack}
            className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all">
            <ArrowLeft size={18} />
          </button>
          <RowBadge number={row.number} size={56} color="#7c3aed" />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">{row.name}</h2>
              <span className="text-xs font-mono text-primary-600 bg-primary-50 dark:bg-primary-900/30 px-2 py-0.5 rounded-lg">№{row.number}</span>
            </div>
            <p className="text-sm text-gray-400">{pallets.length} паллет</p>
          </div>
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setShowAddPallet(true)}>
            Паллет
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40"><Spinner size="lg" /></div>
      ) : pallets.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 text-gray-400 card">
          <Layers size={36} className="mb-2 opacity-30" />
          <p className="text-sm">Нет паллет</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {pallets.map((p, idx) => {
            const c = palletPalette[idx % palletPalette.length];
            const totalItems = Number(p.total_items || 0);
            const boxesCount = Number(p.boxes_count || 0);
            const isBoxMode = p.uses_boxes !== false;
            return (
              <div key={p.id}
                className="card p-0 hover:shadow-lg transition-all group cursor-pointer overflow-hidden"
                style={{ borderLeft: `4px solid ${c.border}` }}
                onClick={() => handleDrillPallet(p)}>
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    <PalletBadge number={p.number} size={44} color={c.bg} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-base font-bold text-gray-900 dark:text-white">{p.name}</span>
                        <span className="text-xs font-mono px-1.5 py-0.5 rounded-md" style={{ color: c.text, background: c.light }}>Р{row.number}П{p.number}</span>
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-lg ${isBoxMode ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'}`}>
                          {isBoxMode ? 'Коробки' : 'Без коробок'}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 mt-1">
                        {isBoxMode && boxesCount > 0 && <span className="text-xs text-gray-500">{boxesCount} коробок</span>}
                        {!isBoxMode && <span className="text-xs text-gray-500">{qty(p.loose_items_count || 0)} товаров</span>}
                        <span className="text-xs font-bold" style={{ color: c.text }}>{totalItems.toLocaleString('ru-RU')} шт.</span>
                      </div>
                      {p.barcode_value && (
                        <div className="mt-2" onClick={e => e.stopPropagation()}>
                          <BarcodeDisplay value={p.barcode_value} />
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={e => e.stopPropagation()}>
                        <button onClick={() => printBarcode(p.barcode_value, `Р${row.number}П${p.number}`, p.name)}
                          className="p-1.5 rounded-lg text-gray-300 hover:text-primary-500 hover:bg-primary-50 transition-all">
                          <Printer size={13} />
                        </button>
                        <button onClick={() => setEditPallet(p)}
                          className="p-1.5 rounded-lg text-gray-300 hover:text-primary-500 hover:bg-primary-50 transition-all">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => deletePallet(p)}
                          className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all">
                          <Trash2 size={13} />
                        </button>
                      </div>
                      <ChevronRight size={18} className="text-gray-300 group-hover:text-primary-400 transition-colors mt-1" />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <PalletModal open={showAddPallet} onClose={() => setShowAddPallet(false)} rowId={row.id} onSuccess={load} />
      <PalletModal open={!!editPallet} onClose={() => setEditPallet(null)} pallet={editPallet} onSuccess={load} />
    </div>
  );
}

// ─── FBO: Row Modal (create/edit) ────────────────────────────────────────────
function RowModal({ open, onClose, warehouseId, row, onSuccess }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: '', number: '' });
  const [loading, setLoading] = useState(false);
  const isEdit = !!row;
  useEffect(() => {
    if (open) setForm(row ? { name: row.name, number: String(row.number) } : { name: '', number: '' });
  }, [open, row]);
  const handleSubmit = async (e) => {
    e.preventDefault(); setLoading(true);
    try {
      if (isEdit) {
        await api.put(`/fbo/rows/${row.id}`, form);
        toast.success('Ряд обновлён');
      } else {
        await api.post('/fbo/rows', { warehouse_id: warehouseId, ...form });
        toast.success('Ряд добавлен');
      }
      onSuccess(); onClose();
    } catch (err) { toast.error(err.response?.data?.error || 'Ошибка'); }
    finally { setLoading(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Редактировать ряд' : 'Добавить ряд'}
      footer={<><Button variant="ghost" onClick={onClose}>Отмена</Button><Button form="row-form" type="submit" loading={loading}>{isEdit ? 'Сохранить' : 'Добавить'}</Button></>}>
      <form id="row-form" onSubmit={handleSubmit} className="space-y-4">
        <Input label="Название" placeholder="Ряд 1" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
        <Input label="Номер" type="number" min="1" placeholder="1" value={form.number} onChange={e => setForm(f => ({ ...f, number: e.target.value }))} required />
      </form>
    </Modal>
  );
}

// ─── FBO: Rows list ───────────────────────────────────────────────────────────
// ─── Pallet Cards View (FBO analog of ShelfCardsView) ─────────────────────────
function PalletCardsView({ rows, onDrillRow, onDrillPallet, onEditRow, onDeleteRow }) {
  const [rowDetails, setRowDetails] = useState({});
  const [loadingIds, setLoadingIds] = useState(new Set());

  const palette = [
    { bg: '#7c3aed', light: '#ede9fe', text: '#6d28d9', dot: '#8b5cf6' },
    { bg: '#2563eb', light: '#dbeafe', text: '#1d4ed8', dot: '#3b82f6' },
    { bg: '#0891b2', light: '#cffafe', text: '#0e7490', dot: '#06b6d4' },
    { bg: '#059669', light: '#d1fae5', text: '#047857', dot: '#10b981' },
    { bg: '#d97706', light: '#fef3c7', text: '#b45309', dot: '#f59e0b' },
    { bg: '#dc2626', light: '#fee2e2', text: '#b91c1c', dot: '#ef4444' },
    { bg: '#db2777', light: '#fce7f3', text: '#be185d', dot: '#ec4899' },
    { bg: '#4f46e5', light: '#e0e7ff', text: '#4338ca', dot: '#6366f1' },
    { bg: '#0d9488', light: '#ccfbf1', text: '#0f766e', dot: '#14b8a6' },
  ];

  useEffect(() => {
    rows.forEach(row => {
      if (!rowDetails[row.id]) {
        setLoadingIds(prev => new Set([...prev, row.id]));
        api.get(`/fbo/rows/${row.id}`).then(res => {
          setRowDetails(prev => ({ ...prev, [row.id]: res.data.pallets || [] }));
          setLoadingIds(prev => { const s = new Set(prev); s.delete(row.id); return s; });
        }).catch(() => {
          setLoadingIds(prev => { const s = new Set(prev); s.delete(row.id); return s; });
        });
      }
    });
  }, [rows]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
      {rows.map((row, idx) => {
        const c = palette[idx % palette.length];
        const pallets = rowDetails[row.id] || [];
        const isLoading = loadingIds.has(row.id);
        const totalItems = pallets.reduce((s, p) => s + Number(p.total_items || 0), 0);
        const palletsCount = Number(row.pallets_count || pallets.length || 0);
        const occupiedPallets = pallets.filter(p => Number(p.total_items || 0) > 0).length;
        const fillPct = palletsCount > 0 ? Math.round((occupiedPallets / palletsCount) * 100) : 0;

        return (
          <div key={row.id} className="card p-0 overflow-hidden hover:shadow-lg transition-all"
            style={{ borderTop: `3px solid ${c.dot}` }}>
            <div className="p-4 pb-3 cursor-pointer group/row" onClick={() => onDrillRow(row)}>
              <div className="flex items-center gap-3">
                <RowBadge number={row.number} size={40} color={c.bg} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-900 dark:text-white">{row.name}</span>
                    <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ color: c.text, background: c.light }}>№{row.number}</span>
                  </div>
                  <span className="text-xs text-gray-400">{palletsCount} паллет</span>
                </div>
                {(onEditRow || onDeleteRow) && (
                  <div className="flex items-center gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                    {onEditRow && (
                      <button onClick={() => onEditRow(row)}
                        className="p-1.5 rounded-lg text-gray-300 hover:text-primary-500 hover:bg-primary-50 transition-all">
                        <Pencil size={13} />
                      </button>
                    )}
                    {onDeleteRow && (
                      <button onClick={() => onDeleteRow(row)}
                        className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="border-t border-gray-100 dark:border-gray-700">
              {isLoading ? (
                <div className="p-4 text-center text-xs text-gray-400">Загрузка...</div>
              ) : pallets.length === 0 ? (
                <div className="p-4 text-center text-xs text-gray-400">Нет паллет</div>
              ) : (
                <div className="divide-y divide-gray-50 dark:divide-gray-700">
                  {pallets.map(p => {
                    const items = Number(p.total_items || 0);
                    return (
                      <div key={p.id}
                        className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-primary-50 dark:hover:bg-gray-800 cursor-pointer transition-colors group/pallet"
                        onClick={() => onDrillPallet ? onDrillPallet(row, p) : onDrillRow(row)}>
                        <PalletIcon size={16} className="flex-shrink-0" />
                        <span className="text-sm text-gray-700 dark:text-gray-300 flex-1 group-hover/pallet:text-primary-600 transition-colors">{p.name}</span>
                        <span className={`text-sm font-semibold tabular-nums ${items > 0 ? 'text-gray-900 dark:text-white' : 'text-gray-300 dark:text-gray-600'}`}>
                          {items > 0 ? items.toLocaleString('ru-RU') + ' шт.' : '0 шт.'}
                        </span>
                        <ChevronRight size={14} className="text-gray-200 group-hover/pallet:text-primary-400 transition-colors flex-shrink-0" />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {pallets.length > 0 && (
              <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700 flex items-center gap-3">
                <span className="text-sm font-bold text-gray-900 dark:text-white">{totalItems.toLocaleString('ru-RU')} шт.</span>
                <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${fillPct}%`, background: c.dot }} />
                </div>
                <span className="text-xs font-semibold" style={{ color: c.text }}>{fillPct}%</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function FBORowListView({ warehouse, initialRowId, initialPalletId, initialBoxId, initialBoxType, viewMode: extViewMode, onViewMode }) {
  const [, setSearchParams] = useSearchParams();
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddRow, setShowAddRow] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [drillRow, setDrillRow] = useState(null);
  const [quickPalletId, setQuickPalletId] = useState(null);
  const [visualSelection, setVisualSelection] = useState(null);
  const vm = extViewMode || 'cards';

  useEffect(() => { setDrillRow(null); setQuickPalletId(null); }, [warehouse?.id]);

  const loadRows = useCallback(async () => {
    if (!warehouse) return;
    setLoading(true);
    try {
      const res = await api.get(`/fbo/warehouses/${warehouse.id}`);
      const rs = res.data.rows || [];
      setRows(rs);
      if (initialRowId && !drillRow) {
        const found = rs.find(r => String(r.id) === String(initialRowId));
        if (found) setDrillRow(found);
      }
    } catch { toast.error('Ошибка загрузки рядов'); }
    finally { setLoading(false); }
  }, [warehouse?.id]);

  useEffect(() => { loadRows(); }, [loadRows]);

  const handleDrillRow = (row, palletId = null) => {
    setDrillRow(row);
    setQuickPalletId(palletId);
    if (row) {
      setSearchParams(prev => {
        const p = new URLSearchParams(prev);
        p.set('row', row.id);
        if (palletId) p.set('pallet', palletId);
        else p.delete('pallet');
        return p;
      });
    } else {
      setSearchParams(prev => { const p = new URLSearchParams(prev); p.delete('row'); p.delete('pallet'); return p; });
    }
  };

  const deleteRow = async (row) => {
    if (!confirm(`Удалить ряд "${row.name}"?`)) return;
    try {
      await api.delete(`/fbo/rows/${row.id}`);
      toast.success('Ряд удалён'); loadRows();
    } catch (err) { toast.error(err.response?.data?.error || 'Ошибка'); }
  };

  if (drillRow) {
    return <RowDetailView row={drillRow} onBack={() => handleDrillRow(null)} initialPalletId={quickPalletId || initialPalletId} initialBoxId={initialBoxId} initialBoxType={initialBoxType} />;
  }

  const viewBtnStyle = (active) => ({
    display:'inline-flex', alignItems:'center', gap:5, padding:'5px 12px',
    borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer', transition:'all .15s',
    border: active ? '1px solid #4f46e5' : '1px solid #e5e7eb',
    background: active ? '#eef2ff' : '#fff',
    color: active ? '#4f46e5' : '#9ca3af',
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-semibold text-gray-700 dark:text-gray-200">Ряды</h2>
          <p className="text-xs text-gray-400">{rows.length} рядов</p>
        </div>
        <div className="flex items-center gap-2">
          {onViewMode && (
            <>
              <button onClick={() => onViewMode('list')} style={viewBtnStyle(vm === 'list')}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>
                Список
              </button>
              <button onClick={() => onViewMode('visual')} style={viewBtnStyle(vm === 'visual')}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                Визуально
              </button>
              <button onClick={() => onViewMode('cards')} style={viewBtnStyle(vm === 'cards')}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                Карточки
              </button>
            </>
          )}
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setShowAddRow(true)}>
            Ряд
          </Button>
        </div>
      </div>

      {/* Visual mode */}
      {vm === 'visual' && (
        <div className="flex gap-4">
          {/* Mini card — left side, does NOT shrink 3D */}
          {visualSelection && (
            <div className="w-64 flex-shrink-0 self-start">
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg overflow-hidden sticky top-4">
                <div className="px-4 py-3 bg-primary-600 text-white">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium uppercase tracking-wide opacity-80">
                      {visualSelection.type === 'pallet' ? 'Паллет' : 'Коробка'}
                    </span>
                    <button onClick={() => setVisualSelection(null)} className="opacity-70 hover:opacity-100 transition-opacity">
                      <X size={14} />
                    </button>
                  </div>
                  <p className="font-bold text-lg mt-1 truncate">
                    {visualSelection.type === 'pallet' ? visualSelection.palletName : visualSelection.product}
                  </p>
                </div>
                <div className="p-4 space-y-3">
                  {visualSelection.type === 'box' && (
                    <>
                      <div>
                        <span className="text-[11px] text-gray-400 uppercase tracking-wide">Товар</span>
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{visualSelection.product}</p>
                      </div>
                      <div className="flex gap-4">
                        <div>
                          <span className="text-[11px] text-gray-400 uppercase tracking-wide">Кол-во</span>
                          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{visualSelection.qty} шт</p>
                        </div>
                        <div>
                          <span className="text-[11px] text-gray-400 uppercase tracking-wide">Паллет</span>
                          <p className="text-sm text-gray-600 dark:text-gray-300">{visualSelection.palletName}</p>
                        </div>
                      </div>
                      {visualSelection.barcode && visualSelection.barcode !== '—' && (
                        <div>
                          <span className="text-[11px] text-gray-400 uppercase tracking-wide">ШК</span>
                          <p className="text-xs font-mono text-gray-500">{visualSelection.barcode}</p>
                        </div>
                      )}
                      <button
                        onClick={() => {
                          const rowWithPallet = rows.find(r => r.pallets.some(p => p.id === visualSelection.palletId));
                          if (rowWithPallet) handleDrillRow(rowWithPallet, String(visualSelection.palletId));
                        }}
                        className="w-full mt-1 px-3 py-2 bg-primary-50 hover:bg-primary-100 text-primary-700 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                      >
                        <ChevronRight size={14} />
                        Открыть паллет
                      </button>
                    </>
                  )}
                  {visualSelection.type === 'pallet' && (
                    <>
                      <div className="flex gap-4">
                        <div>
                          <span className="text-[11px] text-gray-400 uppercase tracking-wide">Коробок</span>
                          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{visualSelection.boxes.length}</p>
                        </div>
                        <div>
                          <span className="text-[11px] text-gray-400 uppercase tracking-wide">Всего шт</span>
                          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                            {fmtQ(visualSelection.boxes.reduce((s, b) => s + parseFloat(b.quantity || 0), 0))}
                          </p>
                        </div>
                      </div>
                      {visualSelection.boxes.length > 0 && (
                        <div>
                          <span className="text-[11px] text-gray-400 uppercase tracking-wide">Товары</span>
                          <div className="mt-1 space-y-1 max-h-40 overflow-y-auto">
                            {Object.entries(visualSelection.boxes.reduce((acc, b) => {
                              const name = (b.product_name || '—').replace(/GraFLab,?\s*/i, '').trim();
                              acc[name] = (acc[name] || 0) + parseFloat(b.quantity || 0);
                              return acc;
                            }, {})).map(([name, total]) => (
                              <div key={name} className="flex items-center justify-between text-xs">
                                <span className="text-gray-600 dark:text-gray-300 truncate mr-2">{name}</span>
                                <span className="font-medium text-gray-800 dark:text-gray-200 flex-shrink-0">{fmtQ(total)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <button
                        onClick={() => {
                          const rowWithPallet = rows.find(r => r.pallets.some(p => p.id === visualSelection.palletId));
                          if (rowWithPallet) handleDrillRow(rowWithPallet, String(visualSelection.palletId));
                        }}
                        className="w-full mt-1 px-3 py-2 bg-primary-50 hover:bg-primary-100 text-primary-700 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                      >
                        <ChevronRight size={14} />
                        Открыть паллет
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
          {/* 3D view — always full width */}
          <div className="flex-1 min-w-0">
            <Suspense fallback={<div style={{display:'flex',alignItems:'center',justifyContent:'center',height:400}}><Spinner size="lg" /></div>}>
              <FBOVisualView warehouse={warehouse} onSelect={setVisualSelection} />
            </Suspense>
          </div>
        </div>
      )}

      {/* Cards mode */}
      {vm === 'cards' && (
        <PalletCardsView rows={rows} onDrillRow={handleDrillRow} onDrillPallet={(row, pallet) => handleDrillRow(row, String(pallet.id))} onEditRow={r => setEditRow(r)} onDeleteRow={deleteRow} />
      )}

      {/* List mode */}
      {vm === 'list' && loading && (
        <div className="flex items-center justify-center h-40"><Spinner size="lg" /></div>
      )}
      {vm === 'list' && !loading && rows.length === 0 && (
        <div className="flex flex-col items-center justify-center h-40 text-gray-400 card">
          <RowIcon size={44} className="mb-2 opacity-40" />
          <p className="text-sm">Нет рядов</p>
        </div>
      )}
      {vm === 'list' && !loading && rows.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {(() => {
            const palette = [
              { bg: 'linear-gradient(135deg, #7c3aed, #6d28d9)', light: '#ede9fe', text: '#6d28d9', border: '#8b5cf6' },
              { bg: 'linear-gradient(135deg, #2563eb, #1d4ed8)', light: '#dbeafe', text: '#1d4ed8', border: '#3b82f6' },
              { bg: 'linear-gradient(135deg, #0891b2, #0e7490)', light: '#cffafe', text: '#0e7490', border: '#06b6d4' },
              { bg: 'linear-gradient(135deg, #059669, #047857)', light: '#d1fae5', text: '#047857', border: '#10b981' },
              { bg: 'linear-gradient(135deg, #d97706, #b45309)', light: '#fef3c7', text: '#b45309', border: '#f59e0b' },
              { bg: 'linear-gradient(135deg, #dc2626, #b91c1c)', light: '#fee2e2', text: '#b91c1c', border: '#ef4444' },
              { bg: 'linear-gradient(135deg, #db2777, #be185d)', light: '#fce7f3', text: '#be185d', border: '#ec4899' },
              { bg: 'linear-gradient(135deg, #4f46e5, #4338ca)', light: '#e0e7ff', text: '#4338ca', border: '#6366f1' },
              { bg: 'linear-gradient(135deg, #0d9488, #0f766e)', light: '#ccfbf1', text: '#0f766e', border: '#14b8a6' },
            ];
            return rows.map((row, idx) => {
              const c = palette[idx % palette.length];
              const palletsCount = Number(row.pallets_count || 0);
              const totalItems = Number(row.total_items || 0);
              return (
                <div key={row.id}
                  className="card p-0 hover:shadow-lg transition-all group cursor-pointer overflow-hidden"
                  style={{ borderLeft: `4px solid ${c.border}` }}
                  onClick={() => handleDrillRow(row)}>
                  <div className="p-4">
                    <div className="flex items-start gap-3">
                      <RowBadge number={row.number} size={48} color={c.bg} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-base font-bold text-gray-900 dark:text-white">{row.name}</span>
                          <span className="text-xs font-mono px-2 py-0.5 rounded-lg" style={{ color: c.text, background: c.light }}>№{row.number}</span>
                        </div>
                        <div className="flex items-center gap-4 mt-1.5">
                          <span className="text-xs text-gray-500">{qty(palletsCount)} паллет</span>
                          {Number(row.boxes_count) > 0 && <span className="text-xs text-gray-500">{qty(row.boxes_count)} коробок</span>}
                          <span className="text-xs font-bold" style={{ color: c.text }}>{totalItems.toLocaleString('ru-RU')} шт.</span>
                        </div>
                        {palletsCount > 0 && (
                          <div className="mt-2.5 flex gap-1">
                            {Array.from({ length: Math.min(palletsCount, 8) }, (_, i) => (
                              <div key={i} className="h-1.5 rounded-full flex-1" style={{ background: c.light, maxWidth: 32 }}>
                                <div className="h-full rounded-full" style={{ background: c.border, width: '70%', opacity: 0.7 }} />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={e => e.stopPropagation()}>
                        <button onClick={() => setEditRow(row)}
                          className="p-1.5 rounded-lg text-gray-300 hover:text-primary-500 hover:bg-primary-50 transition-all">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => deleteRow(row)}
                          className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all">
                          <Trash2 size={13} />
                        </button>
                      </div>
                      <ChevronRight size={18} className="text-gray-300 flex-shrink-0 group-hover:text-primary-400 transition-colors" />
                    </div>
                  </div>
                </div>
              );
            });
          })()}
        </div>
      )}

      <RowModal open={showAddRow} onClose={() => setShowAddRow(false)} warehouseId={warehouse?.id} onSuccess={loadRows} />
      <RowModal open={!!editRow} onClose={() => setEditRow(null)} row={editRow} onSuccess={loadRows} />
    </div>
  );
}

// ─── Visual Warehouse: Barcode SVG ───────────────────────────────────────────
function BarcodeSVG({ value, height = 22 }) {
  let s = value.split('').reduce((a, c, i) => (a + c.charCodeAt(0) * (i + 1)) & 0xffff, 0);
  const bars = [];
  for (let i = 0; i < 36; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    bars.push({ w: s % 4 === 0 ? 2 : 1, dark: i === 0 || i === 35 || i % 2 === 0 || s % 3 > 0 });
  }
  let x = 1.5;
  const rects = [];
  bars.forEach(b => { if (b.dark) rects.push({ x, w: b.w }); x += b.w + 0.5; });
  const tw = x + 1;
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${tw} ${height}`} preserveAspectRatio="none">
      {rects.map((r, i) => <rect key={i} x={r.x} y={0} width={r.w} height={height * 0.78} fill="#111" />)}
      <text x={tw / 2} y={height - 0.5} textAnchor="middle" fontSize={Math.max(3.5, height * 0.2)} fill="#222" fontFamily="monospace">{value}</text>
    </svg>
  );
}

// ─── Visual Warehouse: Demo product data ─────────────────────────────────────
const DEMO_PRODUCTS = [
  { name: 'Витамин C 1000мг', sku: 'VIT-C1000', cat: 'Витамины', mfr: 'NaturePharma', weight: '320г', dims: '8×6×12см', lot: 'LOT-2025-04A' },
  { name: 'Омега-3 капсулы',  sku: 'OMG-3-90',  cat: 'Жирные кислоты', mfr: 'FishOil Co.', weight: '280г', dims: '7×5×11см', lot: 'LOT-2025-03B' },
  { name: 'Магний B6 табл.',  sku: 'MAG-B6-60', cat: 'Минералы',  mfr: 'MagniMax',    weight: '210г', dims: '6×5×10см', lot: 'LOT-2025-05A' },
  { name: 'Цинк 25мг',        sku: 'ZNC-25-100',cat: 'Минералы',  mfr: 'ZincPlus',    weight: '180г', dims: '6×4×9см',  lot: 'LOT-2025-02C' },
  { name: '5-HTP 100мг',      sku: 'HTP-5-60',  cat: 'Аминокислоты', mfr: 'NeuroBalance', weight: '200г', dims: '6×5×10см', lot: 'LOT-2025-04B' },
  { name: 'Коллаген морской',  sku: 'COL-MAR-30',cat: 'Коллаген', mfr: 'MarineLife',  weight: '350г', dims: '9×7×13см', lot: 'LOT-2025-01A' },
  { name: 'Мелатонин 3мг',    sku: 'MEL-3-30',  cat: 'Сон',      mfr: 'SleepWell',   weight: '90г',  dims: '4×4×8см',  lot: 'LOT-2025-06A' },
  { name: 'Железо 18мг',      sku: 'IRN-18-90', cat: 'Минералы', mfr: 'IronForce',   weight: '195г', dims: '6×5×10см', lot: 'LOT-2025-03A' },
  { name: 'Витамин D3 2000',  sku: 'VIT-D3-60', cat: 'Витамины', mfr: 'SunVit',      weight: '140г', dims: '5×4×9см',  lot: 'LOT-2025-05B' },
  { name: 'Куркумин 500мг',   sku: 'CUR-500-45',cat: 'Антиоксид.', mfr: 'GoldenRoot', weight: '220г', dims: '7×5×10см', lot: 'LOT-2025-04C' },
  { name: 'Пробиотик Pro-11', sku: 'PRB-11-30', cat: 'Пробиотики', mfr: 'BioFlora',  weight: '160г', dims: '5×4×9см',  lot: 'LOT-2025-02A' },
  { name: 'Глицин 400мг',     sku: 'GLY-400-50',cat: 'Аминокислоты', mfr: 'BrainFood', weight: '170г', dims: '6×4×9см',  lot: 'LOT-2025-06B' },
  { name: 'L-карнитин 500',   sku: 'LCN-500-60',cat: 'Спортпит', mfr: 'SportLab',    weight: '230г', dims: '7×5×11см', lot: 'LOT-2025-03C' },
  { name: 'Биотин 5000мкг',   sku: 'BIO-5000-30',cat: 'Витамины', mfr: 'HairBeauty', weight: '120г', dims: '5×4×8см',  lot: 'LOT-2025-01B' },
  { name: 'Фолиевая к-та',    sku: 'FOL-400-90',cat: 'Витамины', mfr: 'FolicPlus',   weight: '185г', dims: '6×4×10см', lot: 'LOT-2025-05C' },
  { name: 'Витамин B12',      sku: 'B12-500-30',cat: 'Витамины', mfr: 'CobaLab',     weight: '110г', dims: '4×4×8см',  lot: 'LOT-2025-02B' },
  { name: 'Рыбий жир 1000',   sku: 'FSH-1000-90',cat: 'Жирные кислоты', mfr: 'OceanPure', weight: '310г', dims: '8×6×12см', lot: 'LOT-2025-04D' },
  { name: 'Ашваганда 300мг',  sku: 'ASH-300-60',cat: 'Адаптогены', mfr: 'AyurWell', weight: '200г', dims: '6×5×10см', lot: 'LOT-2025-01C' },
];
function getDemoProd(barcode) {
  const h = barcode.split('').reduce((a, c) => (a + c.charCodeAt(0)) & 0xffff, 0);
  return DEMO_PRODUCTS[h % DEMO_PRODUCTS.length];
}

// ─── Visual Warehouse: 3D Cardboard Box ──────────────────────────────────────
function BoxFace({ prod, barcode }) {
  return (
    <>
      <div style={{ height: 8, margin: '0 4px', background: 'linear-gradient(135deg, #c8a03c 0%, #9e7625 100%)', borderRadius: '2px 2px 0 0' }} />
      <div style={{
        background: 'linear-gradient(180deg, #edbe62 0%, #d4a63e 55%, #c08e2c 100%)',
        border: '1px solid #b87e28', borderTop: 'none',
        borderRadius: '0 0 3px 3px',
        padding: '4px 3px 4px',
        minHeight: 82,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between',
        position: 'relative', overflow: 'hidden', gap: 3,
      }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'rgba(155,105,15,0.3)' }} />
        <p style={{
          fontSize: 9, fontWeight: 900, color: '#4a2e08',
          fontFamily: 'sans-serif', textAlign: 'center',
          lineHeight: 1.3, width: '100%',
          overflow: 'hidden', display: '-webkit-box',
          WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
          textTransform: 'uppercase', letterSpacing: '-0.2px',
          marginTop: 2, flexShrink: 0,
        }}>
          {prod.name}
        </p>
        <div style={{ width: '100%', height: 1, background: 'rgba(100,55,0,0.18)', flexShrink: 0 }} />
        <div style={{
          background: 'white', border: '1px solid #ccc', borderRadius: 1,
          padding: '0px 3px', display: 'flex', alignItems: 'center',
          height: 9, width: '25%', flexShrink: 0, overflow: 'hidden', alignSelf: 'flex-start',
        }}>
          <div style={{ width: '100%', height: 6, overflow: 'hidden', lineHeight: 0 }}>
            <BarcodeSVG value="DEMO" height={6} />
          </div>
        </div>
      </div>
      <div style={{
        position: 'absolute', top: 8, right: -3, bottom: 3, width: 4,
        background: 'linear-gradient(90deg, rgba(0,0,0,0.18), transparent)',
        borderRadius: '0 2px 2px 0', pointerEvents: 'none',
      }} />
    </>
  );
}

function Box3D({ box, onPointerDown, onClick, isDragging, shiftX, isWiggling }) {
  const prod = getDemoProd(box.barcode_value);
  const springBase = 'transform 0.32s cubic-bezier(0.34, 1.56, 0.64, 1)';
  return (
    <div
      data-box-id={box.id}
      onPointerDown={e => { e.preventDefault(); onPointerDown(e); }}
      onClick={e => { if (Math.abs(shiftX || 0) < 2) onClick(e); }}
      title={`${prod.name} · ${box.barcode_value}`}
      style={{
        flex: 1, cursor: isDragging ? 'grabbing' : 'grab',
        userSelect: 'none', position: 'relative',
        opacity: isDragging ? 0.12 : 1,
        transform: `translateX(${shiftX || 0}px)`,
        transition: isDragging ? 'opacity 0.15s' : `${springBase}, opacity 0.15s`,
        animation: isWiggling && !isDragging ? 'wms-wiggle 0.45s ease-in-out infinite' : 'none',
        filter: 'drop-shadow(1px 3px 4px rgba(0,0,0,0.2))',
      }}
    >
      <BoxFace prod={prod} barcode={box.barcode_value} />
    </div>
  );
}

// ─── Visual Warehouse: Metal Rack ─────────────────────────────────────────────
const VIS_POLE = 13;

function RackVisual({ rack, onBoxClick, drag, startDrag }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
      <div style={{
        background: 'linear-gradient(180deg, #d4d8e0, #c0c4cc)',
        color: '#444', textAlign: 'center',
        padding: '3px 0', fontSize: 11, fontWeight: 800, letterSpacing: '0.12em',
        borderRadius: '4px 4px 0 0',
        border: '1px solid #b8bcc6', borderBottom: 'none',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7)',
      }}>
        {rack.code}
      </div>

      <div style={{
        position: 'relative', flex: 1,
        background: '#f2f3f5',
        border: '1px solid #c0c4cc', borderTop: 'none',
        boxShadow: '2px 6px 18px rgba(0,0,0,0.13)',
      }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: VIS_POLE, zIndex: 2, background: 'linear-gradient(90deg, #b8bcc6 0%, #dde0e6 45%, #eceef2 55%, #d4d8e0 100%)', borderRight: '1px solid #b0b4bc' }}>
          {Array.from({ length: 22 }, (_, i) => (<div key={i} style={{ position: 'absolute', left: 3, right: 3, top: 4 + i * 11, height: 4, background: '#a8acb6', borderRadius: 1, boxShadow: 'inset 0 1px 1px rgba(0,0,0,0.3)' }} />))}
        </div>
        <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: VIS_POLE, zIndex: 2, background: 'linear-gradient(90deg, #d4d8e0 0%, #eceef2 45%, #dde0e6 55%, #b8bcc6 100%)', borderLeft: '1px solid #b0b4bc' }}>
          {Array.from({ length: 22 }, (_, i) => (<div key={i} style={{ position: 'absolute', left: 3, right: 3, top: 4 + i * 11, height: 4, background: '#a8acb6', borderRadius: 1, boxShadow: 'inset 0 1px 1px rgba(0,0,0,0.3)' }} />))}
        </div>

        <div style={{ marginLeft: VIS_POLE, marginRight: VIS_POLE }}>
          {rack.shelves?.map((shelf) => {
            const isHovered = drag && drag.hoverShelfId === shelf.id;
            const hoverBoxIdx = isHovered && drag.hoverBoxId
              ? shelf.boxes?.findIndex(b => b.id === drag.hoverBoxId && b.id !== drag.boxId)
              : -1;
            const isWiggling = isHovered && hoverBoxIdx < 0;

            return (
              <div key={shelf.id}>
                <div style={{
                  height: 11,
                  background: 'linear-gradient(180deg, #e0e3ea 0%, #c8ccd4 40%, #a8acb8 100%)',
                  boxShadow: '0 3px 7px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.55)',
                  display: 'flex', alignItems: 'center', padding: '0 6px', gap: 5,
                }}>
                  <div style={{ background: 'white', border: '1px solid #bbb', borderRadius: 1, padding: '0px 3px', display: 'flex', alignItems: 'center', gap: 3, height: 8, flexShrink: 0 }}>
                    <span style={{ fontSize: 5.5, fontFamily: 'monospace', fontWeight: 800, color: '#333', lineHeight: 1, whiteSpace: 'nowrap' }}>{shelf.code}</span>
                    <div style={{ width: 24, height: 6, overflow: 'hidden', lineHeight: 0 }}>
                      <BarcodeSVG value={shelf.barcode_value || shelf.code} height={6} />
                    </div>
                  </div>
                </div>

                <div
                  data-shelf-id={shelf.id}
                  style={{
                    display: 'flex', gap: 6, alignItems: 'flex-end',
                    padding: '10px 6px 8px',
                    minHeight: 108,
                    background: isHovered ? 'rgba(99,102,241,0.05)' : 'transparent',
                    outline: isHovered ? '2px dashed rgba(99,102,241,0.35)' : '2px dashed transparent',
                    outlineOffset: -3,
                    transition: 'background 0.2s, outline 0.2s',
                  }}
                >
                  {shelf.boxes?.map((box, boxIdx) => {
                    const isDragging = drag?.boxId === box.id;
                    let shiftX = 0;
                    if (isHovered && !isDragging && hoverBoxIdx >= 0) {
                      shiftX = boxIdx >= hoverBoxIdx ? 20 : -20;
                    }
                    return (
                      <Box3D
                        key={box.id}
                        box={box}
                        isDragging={isDragging}
                        shiftX={shiftX}
                        isWiggling={isWiggling && !isDragging}
                        onPointerDown={e => startDrag(e, box, shelf, rack)}
                        onClick={() => !drag && onBoxClick({ box, shelf, rack })}
                      />
                    );
                  })}
                  {(!shelf.boxes || shelf.boxes.length === 0) && (
                    <div style={{ flex: 1, height: 76, border: '2px dashed #d0d3da', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: 10, color: '#bbb' }}>пусто</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          <div style={{ height: 10, background: 'linear-gradient(180deg, #d0d4dc 0%, #9094a4 100%)', boxShadow: '0 4px 10px rgba(0,0,0,0.22)' }} />
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: VIS_POLE * 0.3, paddingRight: VIS_POLE * 0.3 }}>
        {[0, 1].map(i => (<div key={i} style={{ width: VIS_POLE, height: 14, background: 'linear-gradient(180deg, #b8bcc6, #80848e)', borderRadius: '0 0 3px 3px', boxShadow: '0 3px 6px rgba(0,0,0,0.18)' }} />))}
      </div>
    </div>
  );
}

// ─── Visual Warehouse View ────────────────────────────────────────────────────
function VisualWarehouseView({ warehouse }) {
  const [racksData, setRacksData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [popup, setPopup] = useState(null);
  const [drag, setDrag] = useState(null);
  const dropRef = useRef(null);
  const lastXRef = useRef(0);
  const RACKS_PER_PAGE = 3;

  // Inject CSS keyframes
  useEffect(() => {
    const s = document.createElement('style');
    s.id = 'wms-box-anim';
    s.textContent = `
      @keyframes wms-wiggle {
        0%,100% { transform: rotate(0deg) scale(1); }
        20% { transform: rotate(-3deg) scale(1.05); }
        60% { transform: rotate(3deg) scale(1.05); }
      }
    `;
    document.head.appendChild(s);
    return () => document.getElementById('wms-box-anim')?.remove();
  }, []);

  useEffect(() => {
    setLoading(true);
    api.get(`/warehouse/visual/${warehouse.id}`)
      .then(r => setRacksData(r.data.racks || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [warehouse.id]);

  const handleMove = useCallback((boxId, fromShelfId, toShelfId) => {
    setRacksData(prev => {
      let movedBox = null;
      for (const rack of prev) {
        for (const shelf of (rack.shelves || [])) {
          const f = (shelf.boxes || []).find(b => b.id === boxId);
          if (f) { movedBox = f; break; }
        }
        if (movedBox) break;
      }
      if (!movedBox) return prev;
      return prev.map(rack => ({
        ...rack,
        shelves: rack.shelves?.map(shelf => {
          if (shelf.id === fromShelfId) return { ...shelf, boxes: shelf.boxes.filter(b => b.id !== boxId) };
          if (shelf.id === toShelfId) return { ...shelf, boxes: [...(shelf.boxes || []), movedBox] };
          return shelf;
        }),
      }));
    });
  }, []);

  const startDrag = useCallback((e, box, shelf, rack) => {
    e.preventDefault();
    lastXRef.current = e.clientX;
    setDrag({
      boxId: box.id, fromShelfId: shelf.id,
      ghostX: e.clientX, ghostY: e.clientY, rotation: 0,
      prod: getDemoProd(box.barcode_value),
      hoverShelfId: null, hoverBoxId: null,
    });
  }, []);

  useEffect(() => {
    if (!drag) return;
    const fromShelfId = drag.fromShelfId;
    const boxId = drag.boxId;

    const onMove = (e) => {
      const vx = e.clientX - lastXRef.current;
      lastXRef.current = e.clientX;
      const rotation = Math.max(-14, Math.min(14, vx * 1.2));

      const el = document.elementFromPoint(e.clientX, e.clientY);
      const shelfEl = el?.closest('[data-shelf-id]');
      const boxEl = el?.closest('[data-box-id]');
      const hoverShelfId = shelfEl ? +shelfEl.dataset.shelfId : null;
      const hoverBoxId = boxEl ? +boxEl.dataset.boxId : null;

      dropRef.current = { hoverShelfId, hoverBoxId };
      setDrag(d => d ? { ...d, ghostX: e.clientX, ghostY: e.clientY, rotation, hoverShelfId, hoverBoxId } : null);
    };

    const onUp = () => {
      const t = dropRef.current;
      if (t?.hoverShelfId && t.hoverShelfId !== fromShelfId) {
        handleMove(boxId, fromShelfId, t.hoverShelfId);
      }
      setDrag(null);
      dropRef.current = null;
      document.body.style.cursor = '';
    };

    document.body.style.cursor = 'grabbing';
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.body.style.cursor = '';
    };
  }, [drag?.boxId]);

  if (loading) return <div className="flex items-center justify-center h-48"><Spinner size="lg" /></div>;

  const totalPages = Math.ceil(racksData.length / RACKS_PER_PAGE);
  const visibleRacks = racksData.slice(page * RACKS_PER_PAGE, (page + 1) * RACKS_PER_PAGE);

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
          className="p-2.5 rounded-xl border border-gray-200 text-gray-500 hover:border-gray-400 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
          <ChevronLeft size={20} />
        </button>
        <span className="text-sm text-gray-500 font-medium">
          {page * RACKS_PER_PAGE + 1}–{Math.min((page + 1) * RACKS_PER_PAGE, racksData.length)} из {racksData.length} стеллажей
        </span>
        <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
          className="p-2.5 rounded-xl border border-gray-200 text-gray-500 hover:border-gray-400 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
          <ChevronRight size={20} />
        </button>
      </div>

      <p className="text-xs text-gray-400 mb-4 text-center">Перетащите коробку на другую полку чтобы переместить</p>

      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        {visibleRacks.map(rack => (
          <RackVisual key={rack.id} rack={rack} onBoxClick={setPopup} drag={drag} startDrag={startDrag} />
        ))}
      </div>

      {/* Drag ghost */}
      {drag && (
        <div style={{
          position: 'fixed',
          left: drag.ghostX - 36,
          top: drag.ghostY - 62,
          width: 72,
          zIndex: 9999,
          pointerEvents: 'none',
          transform: `rotate(${drag.rotation}deg) scale(1.1)`,
          transition: 'transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1)',
          filter: 'drop-shadow(6px 16px 28px rgba(0,0,0,0.65))',
        }}>
          <BoxFace prod={drag.prod} barcode="DEMO" />
        </div>
      )}

      {/* Box popup */}
      {popup && (() => {
        const prod = getDemoProd(popup.box.barcode_value);
        const Field = ({ label, value, mono }) => (
          <div>
            <p className="text-[10px] text-gray-400 font-medium mb-0.5 uppercase tracking-wide">{label}</p>
            <p className={`text-sm text-gray-800 font-medium ${mono ? 'font-mono' : ''} ${!value ? 'text-gray-300' : ''}`}>
              {value || '—'}
            </p>
          </div>
        );
        const Section = ({ title, children }) => (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{title}</span>
              <div className="flex-1 h-px bg-gray-100" />
            </div>
            {children}
          </div>
        );
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setPopup(null)}>
            <div className="absolute inset-0 bg-black/50" />
            <div className="relative bg-white rounded-2xl shadow-2xl z-10 w-full overflow-y-auto"
              style={{ maxWidth: 560, maxHeight: '90vh' }} onClick={e => e.stopPropagation()}>
              <div className="flex items-start justify-between p-5 pb-4 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center flex-shrink-0">
                    <BoxIcon size={22} />
                  </div>
                  <div>
                    <p className="font-bold text-gray-900 dark:text-white text-base">{prod.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5 font-mono">{popup.box.barcode_value}</p>
                  </div>
                </div>
                <button onClick={() => setPopup(null)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 ml-3 flex-shrink-0">
                  <X size={16} />
                </button>
              </div>

              <div className="p-5 space-y-5">
                <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
                  <BarcodeSVG value={popup.box.barcode_value} height={52} />
                  <div className="flex justify-end mt-2">
                    <button onClick={() => printBarcode(popup.box.barcode_value, popup.shelf.code, prod.name)}
                      className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-primary-600 hover:bg-primary-50 px-2.5 py-1.5 rounded-lg transition-all">
                      <Printer size={12} /> Печать
                    </button>
                  </div>
                </div>

                <Section title="Местонахождение">
                  <div className="flex gap-2 flex-wrap">
                    {[{ label: 'Склад', val: 'Экспериментальный' }, { label: 'Стеллаж', val: popup.rack.code }, { label: 'Полка', val: popup.shelf.code }, { label: 'Коробка', val: popup.box.name }].map(item => (
                      <div key={item.label} className="flex flex-col items-center bg-primary-50 border border-primary-100 rounded-xl px-4 py-2 min-w-[90px]">
                        <span className="text-[9px] text-primary-400 font-semibold uppercase tracking-wider">{item.label}</span>
                        <span className="text-sm font-bold text-primary-700 mt-0.5 font-mono">{item.val}</span>
                      </div>
                    ))}
                  </div>
                </Section>

                <Section title="Товар">
                  <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                    <Field label="Название" value={prod.name} />
                    <Field label="Артикул" value={prod.sku} mono />
                    <Field label="Категория" value={prod.cat} />
                    <Field label="Производитель" value={prod.mfr} />
                    <Field label="Количество, шт." value={null} />
                    <Field label="Ед. измерения" value="шт." />
                  </div>
                </Section>

                <Section title="Упаковка">
                  <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                    <Field label="Дата упаковки" value={null} />
                    <Field label="Серийный номер" value={null} mono />
                    <Field label="Партия / Лот" value={prod.lot} mono />
                    <Field label="Срок годности" value={null} />
                  </div>
                </Section>

                <Section title="Физические параметры">
                  <div className="grid grid-cols-3 gap-x-4 gap-y-4">
                    <Field label="Вес нетто" value={prod.weight} />
                    <Field label="Вес брутто" value={null} />
                    <Field label="Объём, м³" value={null} />
                    <Field label="Д × Ш × В" value={prod.dims} />
                    <Field label="Тара" value={null} />
                    <Field label="Кол-во в уп." value={null} />
                  </div>
                </Section>

                <Section title="Логистика">
                  <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                    <Field label="Поставщик" value={null} />
                    <Field label="Транспортная компания" value={null} />
                    <Field label="Дата прихода" value={null} />
                    <Field label="Номер накладной" value={null} mono />
                    <Field label="Ответственный" value={null} />
                    <Field label="Статус" value="На хранении" />
                  </div>
                </Section>

                <Section title="Примечание">
                  <div className="bg-gray-50 rounded-xl p-3 min-h-[52px] border border-gray-100">
                    <p className="text-sm text-gray-300">Нет примечаний</p>
                  </div>
                </Section>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ─── Warehouse List View ──────────────────────────────────────────────────────
function WarehouseListView({ warehouses, selectedId, onSelect, onReload, onDeleted }) {
  const toast = useToast();
  const [editWh, setEditWh] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  const deleteWh = async (wh) => {
    if (!confirm(`Удалить склад "${wh.name}"?\n\nВсе стеллажи, полки и товары на полках будут удалены.\nЗадачи и история перемещений сохранятся.`)) return;
    try {
      await api.delete(`/warehouse/warehouses/${wh.id}`);
      toast.success('Склад удалён');
      if (onDeleted) onDeleted(wh.id);
      onReload();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка');
    }
  };

  // Structure label based on type
  const structureLabel = (wh) => {
    if (wh.warehouse_type === 'box') return `${qty(wh.boxes_count)} кор.`;
    if (wh.warehouse_type === 'fbo') return `${qty(wh.rows_count)} р.`;
    if (wh.warehouse_type === 'both') return `${qty(wh.racks_count)}с · ${qty(wh.rows_count)}р`;
    return `${wh.racks_count} ст.`;
  };

  return (
    <>
      <div className="flex items-center gap-2 mb-1">
        <div className="flex-1 flex gap-2 overflow-x-auto pb-1">
          {warehouses.map(wh => (
            <button
              key={wh.id}
              onClick={() => onSelect(wh)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap',
                selectedId === wh.id
                  ? 'bg-primary-600 text-white shadow-sm'
                  : wh.active === false
                    ? 'bg-gray-50 border border-dashed border-gray-300 text-gray-400'
                    : 'bg-white border border-gray-200 text-gray-600 hover:border-primary-300'
              )}
            >
              <WarehouseIcon size={18} className={wh.active === false ? 'opacity-40' : ''} />
              <span className={wh.active === false ? 'line-through opacity-60' : ''}>{wh.name}</span>
              {wh.active === false && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 text-gray-500">скрыт</span>}
              <span className={cn(
                'text-xs px-1.5 py-0.5 rounded-md',
                selectedId === wh.id ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
              )}>
                {structureLabel(wh)}
              </span>
              {selectedId === wh.id && (
                <>
                  <button onClick={e => { e.stopPropagation(); setEditWh(wh); }} className="ml-1 opacity-70 hover:opacity-100">
                    <Pencil size={12} />
                  </button>
                  <button onClick={e => { e.stopPropagation(); deleteWh(wh); }} className="opacity-70 hover:opacity-100">
                    <Trash2 size={12} />
                  </button>
                </>
              )}
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" icon={<Plus size={14} />} onClick={() => setShowCreate(true)}>
          Склад
        </Button>
      </div>

      <WarehouseModal open={showCreate} onClose={() => setShowCreate(false)} onSuccess={onReload} />
      <WarehouseModal open={!!editWh} onClose={() => setEditWh(null)} warehouse={editWh} onSuccess={onReload} />
    </>
  );
}

// ─── Shelf Cards View (Visual 2) ──────────────────────────────────────────────
function ShelfCardsView({ warehouse, racks, onDrillRack, onDrillShelf }) {
  const [rackDetails, setRackDetails] = useState({});
  const [loadingIds, setLoadingIds] = useState(new Set());

  const palette = [
    { bg: '#7c3aed', light: '#ede9fe', text: '#6d28d9', dot: '#8b5cf6' },
    { bg: '#2563eb', light: '#dbeafe', text: '#1d4ed8', dot: '#3b82f6' },
    { bg: '#0891b2', light: '#cffafe', text: '#0e7490', dot: '#06b6d4' },
    { bg: '#059669', light: '#d1fae5', text: '#047857', dot: '#10b981' },
    { bg: '#d97706', light: '#fef3c7', text: '#b45309', dot: '#f59e0b' },
    { bg: '#dc2626', light: '#fee2e2', text: '#b91c1c', dot: '#ef4444' },
    { bg: '#db2777', light: '#fce7f3', text: '#be185d', dot: '#ec4899' },
    { bg: '#4f46e5', light: '#e0e7ff', text: '#4338ca', dot: '#6366f1' },
    { bg: '#0d9488', light: '#ccfbf1', text: '#0f766e', dot: '#14b8a6' },
    { bg: '#ca8a04', light: '#fef9c3', text: '#a16207', dot: '#eab308' },
    { bg: '#9333ea', light: '#f3e8ff', text: '#7e22ce', dot: '#a855f7' },
    { bg: '#e11d48', light: '#ffe4e6', text: '#be123c', dot: '#f43f5e' },
  ];

  useEffect(() => {
    racks.forEach(rack => {
      if (!rackDetails[rack.id]) {
        setLoadingIds(prev => new Set([...prev, rack.id]));
        api.get(`/warehouse/racks/${rack.id}`).then(res => {
          setRackDetails(prev => ({ ...prev, [rack.id]: res.data.shelves || [] }));
          setLoadingIds(prev => { const s = new Set(prev); s.delete(rack.id); return s; });
        }).catch(() => {
          setLoadingIds(prev => { const s = new Set(prev); s.delete(rack.id); return s; });
        });
      }
    });
  }, [racks]);

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {racks.map((rack, idx) => {
          const c = palette[idx % palette.length];
          const shelves = rackDetails[rack.id] || [];
          const isLoading = loadingIds.has(rack.id);
          const num = rack.code?.replace(/\D/g, '') || (idx + 1);
          const totalItems = shelves.reduce((s, sh) => s + Number(sh.total_items || 0), 0);
          const shelvesCount = Number(rack.shelves_count || shelves.length || 0);
          const occupiedShelves = shelves.filter(sh => Number(sh.total_items || 0) > 0).length;
          const fillPct = shelvesCount > 0 ? Math.round((occupiedShelves / shelvesCount) * 100) : 0;

          return (
            <div key={rack.id} className="card p-0 overflow-hidden hover:shadow-lg transition-all"
              style={{ borderTop: `3px solid ${c.dot}` }}>
              {/* Header */}
              <div className="p-4 pb-3 cursor-pointer" onClick={() => onDrillRack(rack)}>
                <div className="flex items-center gap-3">
                  <RackBadge number={num} size={40} color={c.bg} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-gray-900 dark:text-white">{rack.name}</span>
                      <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ color: c.text, background: c.light }}>{rack.code}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-400">{shelvesCount} полок</span>
                      {rack.barcode_value && (
                        <span className="text-xs font-mono text-gray-400" onClick={e => e.stopPropagation()}>
                          <CopyBadge value={rack.barcode_value} />
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Shelves list */}
              <div className="border-t border-gray-100 dark:border-gray-700">
                {isLoading ? (
                  <div className="p-4 text-center text-xs text-gray-400">Загрузка...</div>
                ) : shelves.length === 0 ? (
                  <div className="p-4 text-center text-xs text-gray-400">Нет полок</div>
                ) : (
                  <div className="divide-y divide-gray-50 dark:divide-gray-700">
                    {shelves.map(shelf => {
                      const items = Number(shelf.total_items || 0);
                      const dotColor = items > 0 ? c.dot : '#d1d5db';
                      return (
                        <div key={shelf.id}
                          className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-primary-50 dark:hover:bg-gray-800 cursor-pointer transition-colors group/shelf"
                          onClick={() => onDrillShelf ? onDrillShelf(rack, shelf) : onDrillRack(rack)}>
                          <ShelfIcon size={16} className="flex-shrink-0" />
                          <span className="text-sm text-gray-700 dark:text-gray-300 flex-1 group-hover/shelf:text-primary-600 transition-colors">{shelf.name}</span>
                          <span className={`text-sm font-semibold tabular-nums ${items > 0 ? 'text-gray-900 dark:text-white' : 'text-gray-300 dark:text-gray-600'}`}>
                            {items > 0 ? items.toLocaleString('ru-RU') + ' шт.' : '0 шт.'}
                          </span>
                          <ChevronRight size={14} className="text-gray-200 group-hover/shelf:text-primary-400 transition-colors flex-shrink-0" />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Footer — total + fill bar */}
              {shelves.length > 0 && (
                <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700 flex items-center gap-3">
                  <span className="text-sm font-bold text-gray-900 dark:text-white">{totalItems.toLocaleString('ru-RU')} шт.</span>
                  <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${fillPct}%`, background: c.dot }} />
                  </div>
                  <span className="text-xs font-semibold" style={{ color: c.text }}>{fillPct}%</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Box Warehouse View ─────────────────────────────────────────────────────
function BoxWarehouseView({ warehouse }) {
  const toast = useToast();
  const [boxes, setBoxes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editBox, setEditBox] = useState(null);
  const [products, setProducts] = useState([]);
  const [drillBoxId, setDrillBoxId] = useState(null);

  const loadBoxes = useCallback(async () => {
    if (!warehouse) return;
    setLoading(true);
    try {
      const res = await api.get(`/fbo/box-warehouse/${warehouse.id}/boxes`);
      setBoxes(res.data);
    } catch { toast.error('Ошибка загрузки коробок'); }
    finally { setLoading(false); }
  }, [warehouse?.id]);

  useEffect(() => { loadBoxes(); }, [loadBoxes]);

  // Load products for the modal
  useEffect(() => {
    api.get('/products', { params: { limit: 1000 } }).then(res => setProducts(res.data.items || [])).catch(() => {});
  }, []);

  const deleteBox = async (box) => {
    if (!confirm(`Удалить коробку "${box.name || box.barcode_value}"?`)) return;
    try {
      await api.delete(`/fbo/box-warehouse/boxes/${box.id}`);
      toast.success('Коробка удалена');
      loadBoxes();
    } catch (err) { toast.error(err.response?.data?.error || 'Ошибка'); }
  };

  const palette = [
    { bg: '#f59e0b', light: '#fef3c7', text: '#b45309', border: '#f59e0b' },
    { bg: '#3b82f6', light: '#dbeafe', text: '#1d4ed8', border: '#3b82f6' },
    { bg: '#10b981', light: '#d1fae5', text: '#047857', border: '#10b981' },
    { bg: '#8b5cf6', light: '#ede9fe', text: '#6d28d9', border: '#8b5cf6' },
    { bg: '#ef4444', light: '#fee2e2', text: '#b91c1c', border: '#ef4444' },
    { bg: '#ec4899', light: '#fce7f3', text: '#be185d', border: '#ec4899' },
    { bg: '#06b6d4', light: '#cffafe', text: '#0e7490', border: '#06b6d4' },
    { bg: '#14b8a6', light: '#ccfbf1', text: '#0f766e', border: '#14b8a6' },
  ];

  if (drillBoxId) {
    return (
      <BoxDetailView
        boxId={drillBoxId}
        boxType="standalone"
        onClose={() => setDrillBoxId(null)}
        onChanged={loadBoxes}
      />
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-semibold text-gray-700 dark:text-gray-200">Коробки</h2>
          <p className="text-xs text-gray-400">{boxes.length} коробок</p>
        </div>
        <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setShowAdd(true)}>
          Коробка
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40"><Spinner size="lg" /></div>
      ) : boxes.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 text-gray-400 card">
          <Box size={36} className="mb-2 opacity-30" />
          <p className="text-sm">Нет коробок</p>
          <p className="text-xs mt-1">Нажмите «Коробка» чтобы создать</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {boxes.map((box, idx) => {
            const c = palette[idx % palette.length];
            const itemsCount = Number(box.quantity || box.total_items || 0);
            return (
              <div key={box.id}
                onClick={() => setDrillBoxId(box.id)}
                className="card p-0 hover:shadow-lg transition-all group cursor-pointer overflow-hidden"
                style={{ borderLeft: `4px solid ${c.border}` }}>
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: c.light }}>
                      <Box size={20} style={{ color: c.text }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-base font-bold text-gray-900 dark:text-white truncate">
                          {box.name || `Коробка #${box.id}`}
                        </span>
                      </div>
                      {box.product_name && (
                        <p className="text-xs text-gray-500 mt-0.5 truncate">{box.product_name}</p>
                      )}
                      <div className="flex items-center gap-4 mt-1">
                        <span className="text-xs font-bold" style={{ color: c.text }}>{itemsCount.toLocaleString('ru-RU')} шт.</span>
                        <span className="text-xs text-gray-400">макс. {box.box_size}</span>
                      </div>
                      {box.barcode_value && (
                        <div className="mt-2" onClick={e => e.stopPropagation()}>
                          <BarcodeDisplay value={box.barcode_value} />
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={e => e.stopPropagation()}>
                      <button onClick={() => box.barcode_value && printBarcode(box.barcode_value, box.name || `Коробка #${box.id}`, '')}
                        className="p-1.5 rounded-lg text-gray-300 hover:text-primary-500 hover:bg-primary-50 transition-all">
                        <Printer size={13} />
                      </button>
                      <button onClick={() => setEditBox(box)}
                        className="p-1.5 rounded-lg text-gray-300 hover:text-primary-500 hover:bg-primary-50 transition-all">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => deleteBox(box)}
                        className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <BoxWarehouseModal open={showAdd} onClose={() => setShowAdd(false)} warehouseId={warehouse?.id} products={products} onSuccess={loadBoxes} />
      <BoxWarehouseModal open={!!editBox} onClose={() => setEditBox(null)} box={editBox} products={products} onSuccess={loadBoxes} />
    </div>
  );
}

// ─── Box Warehouse Modal (create/edit box) ──────────────────────────────────
function BoxWarehouseModal({ open, onClose, warehouseId, box, products, onSuccess }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: '', product_id: '', quantity: '', box_size: '50' });
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const isEdit = !!box;

  useEffect(() => {
    if (open) {
      setForm(box
        ? { name: box.name || '', product_id: String(box.product_id || ''), quantity: String(box.quantity || ''), box_size: String(box.box_size || '50') }
        : { name: '', product_id: '', quantity: '', box_size: '50' });
      setSearch('');
    }
  }, [open, box]);

  const filteredProducts = useMemo(() => {
    if (!search) return products.slice(0, 20);
    const q = search.toLowerCase();
    return products.filter(p => p.name?.toLowerCase().includes(q) || p.code?.toLowerCase().includes(q) || p.barcode?.includes(q)).slice(0, 20);
  }, [products, search]);

  const selectedProduct = products.find(p => String(p.id) === form.product_id);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = {
        name: form.name || null,
        product_id: form.product_id ? Number(form.product_id) : null,
        quantity: form.quantity ? Number(form.quantity) : 0,
        box_size: form.box_size ? Number(form.box_size) : 50,
      };
      if (isEdit) {
        await api.put(`/fbo/box-warehouse/boxes/${box.id}`, data);
        toast.success('Коробка обновлена');
      } else {
        await api.post(`/fbo/box-warehouse/${warehouseId}/boxes`, data);
        toast.success('Коробка создана');
      }
      onSuccess();
      onClose();
    } catch (err) { toast.error(err.response?.data?.error || 'Ошибка'); }
    finally { setLoading(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Редактировать коробку' : 'Создать коробку'}
      footer={<><Button variant="ghost" onClick={onClose}>Отмена</Button><Button form="box-wh-form" type="submit" loading={loading}>{isEdit ? 'Сохранить' : 'Создать'}</Button></>}>
      <form id="box-wh-form" onSubmit={handleSubmit} className="space-y-4">
        <Input label="Название" placeholder="Коробка A1" value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />

        {/* Product selector */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Товар</label>
          {selectedProduct ? (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-primary-50 border border-primary-200">
              <span className="text-sm font-medium text-gray-800 flex-1 truncate">{selectedProduct.name}</span>
              <button type="button" onClick={() => setForm(f => ({ ...f, product_id: '' }))}
                className="p-1 rounded text-gray-400 hover:text-red-500"><X size={14} /></button>
            </div>
          ) : (
            <div>
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Поиск товара..."
                className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm" />
              {search && filteredProducts.length > 0 && (
                <div className="mt-1 max-h-40 overflow-y-auto rounded-xl border border-gray-200 bg-white divide-y divide-gray-50">
                  {filteredProducts.map(p => (
                    <button key={p.id} type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-primary-50 transition-colors"
                      onClick={() => { setForm(f => ({ ...f, product_id: String(p.id) })); setSearch(''); }}>
                      <span className="font-medium">{p.name}</span>
                      {p.code && <span className="text-xs text-gray-400 ml-2">{p.code}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input label="Количество" type="number" min="0" placeholder="0" value={form.quantity}
            onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} />
          <Input label="Макс. вместимость" type="number" min="1" placeholder="50" value={form.box_size}
            onChange={e => setForm(f => ({ ...f, box_size: e.target.value }))} />
        </div>
      </form>
    </Modal>
  );
}

// ─── Warehouse Content (FBS / FBO / Both) ────────────────────────────────────
function WarehouseContent({ warehouse, initialRackId, initialShelfId, initialRowId, initialPalletId, initialBoxId, initialBoxType }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const viewMode = searchParams.get('view') || 'cards';
  const setViewMode = (mode) => {
    setSearchParams(prev => {
      const p = new URLSearchParams(prev);
      p.set('view', mode);
      return p;
    });
  };
  const toast = useToast();
  const [racks, setRacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddRack, setShowAddRack] = useState(false);
  const [editRack, setEditRack] = useState(null);
  const [drillRack, setDrillRack] = useState(null);
  const [quickShelfId, setQuickShelfId] = useState(null);
  const [productSearch, setProductSearch] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);

  const wtype = warehouse?.warehouse_type;
  const hasFBS = wtype !== 'fbo' && wtype !== 'box';
  const hasFBO = wtype === 'fbo' || wtype === 'both';
  const hasBox = wtype === 'box';

  // Product search in warehouse
  const handleProductSearch = useCallback(async (q) => {
    setProductSearch(q);
    if (!q || q.length < 2) { setSearchResults(null); return; }
    setSearchLoading(true);
    try {
      const res = await api.get('/products', {
        params: { search: q, warehouse_id: warehouse?.id, placed_only: 'true', limit: 20 }
      });
      setSearchResults(res.data.items || []);
    } catch { setSearchResults([]); }
    finally { setSearchLoading(false); }
  }, [warehouse?.id]);

  useEffect(() => {
    const t = setTimeout(() => handleProductSearch(productSearch), 400);
    return () => clearTimeout(t);
  }, [productSearch]);

  useEffect(() => { setDrillRack(null); setQuickShelfId(null); }, [warehouse?.id]);

  const loadRacks = useCallback(async () => {
    if (!warehouse || !hasFBS) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await api.get('/warehouse/racks', { params: { warehouse_id: warehouse.id } });
      const rs = res.data;
      setRacks(rs);
      if (!drillRack) {
        if (initialRackId) {
          const found = rs.find(r => String(r.id) === String(initialRackId));
          if (found) setDrillRack(found);
        } else if (initialShelfId) {
          // URL has shelf but no rack — find rack containing this shelf
          try {
            const shelfRes = await api.get(`/warehouse/shelves/${initialShelfId}`);
            const rackId = shelfRes.data?.rack_id;
            if (rackId) {
              const found = rs.find(r => String(r.id) === String(rackId));
              if (found) {
                setDrillRack(found);
                setQuickShelfId(String(initialShelfId));
              }
            }
          } catch { /* shelf not found, just show warehouse */ }
        }
      }
    } catch (err) {
      console.error('[Warehouse] loadRacks error:', err.message);
      setRacks([]);
    } finally { setLoading(false); }
  }, [warehouse?.id, hasFBS]);

  useEffect(() => { loadRacks(); }, [loadRacks]);

  const handleDrillRack = (rack, shelfId = null) => {
    setDrillRack(rack);
    setQuickShelfId(shelfId);
    if (rack) {
      setSearchParams(prev => {
        const p = new URLSearchParams(prev);
        p.set('rack', rack.id);
        if (shelfId) p.set('shelf', shelfId);
        else p.delete('shelf');
        return p;
      });
    } else {
      setSearchParams(prev => { const p = new URLSearchParams(prev); p.delete('rack'); p.delete('shelf'); return p; });
    }
  };

  const deleteRack = async (rack) => {
    if (!confirm(`Удалить стеллаж "${rack.name}"?`)) return;
    try {
      await api.delete(`/warehouse/racks/${rack.id}`);
      toast.success('Стеллаж удалён');
      loadRacks();
    } catch { toast.error('Ошибка'); }
  };

  // If drilled into a rack
  if (drillRack) {
    return (
      <RackDetailView
        rack={drillRack}
        onBack={() => handleDrillRack(null)}
        onReload={loadRacks}
        initialShelfId={quickShelfId || initialShelfId}
        initialBoxId={initialBoxId}
        initialBoxType={initialBoxType}
        directShelf={!!quickShelfId}
      />
    );
  }

  const viewBtnStyle = (active) => ({
    display:'inline-flex', alignItems:'center', gap:5, padding:'5px 12px',
    borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer', transition:'all .15s',
    border: active ? '1px solid #4f46e5' : '1px solid #e5e7eb',
    background: active ? '#eef2ff' : '#fff',
    color: active ? '#4f46e5' : '#9ca3af',
  });

  return (
    <div>
      {/* Product search */}
      <div className="mb-4">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={productSearch}
            onChange={e => setProductSearch(e.target.value)}
            placeholder="Найти товар на складе..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 transition-all"
          />
          {productSearch && (
            <button onClick={() => { setProductSearch(''); setSearchResults(null); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={16} />
            </button>
          )}
        </div>
        {searchResults !== null && (
          <div className="mt-2 card p-0 overflow-hidden">
            {searchLoading ? (
              <div className="p-4 text-center text-sm text-gray-400">Поиск...</div>
            ) : searchResults.length === 0 ? (
              <div className="p-4 text-center text-sm text-gray-400">Товар не найден на этом складе</div>
            ) : (
              <div className="divide-y divide-gray-50 dark:divide-gray-700">
                {searchResults.map(item => (
                  <div key={item.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{item.name}</p>
                      <p className="text-xs text-gray-400">{item.code}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-primary-600">{Number(item.warehouse_qty || 0).toLocaleString('ru-RU')} шт.</p>
                    </div>
                    <div className="flex flex-wrap gap-1 max-w-[300px]">
                      {(item.shelf_codes || '').split(', ').filter(Boolean).map(code => (
                        <span key={code} className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-xs font-mono rounded-lg border border-primary-100 dark:border-primary-800">
                          {code}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* FBS section */}
      {hasFBS && (
        <div className={hasFBO ? 'mb-8' : ''}>
          {hasFBO && (
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Стеллажи и полки</span>
              <div className="flex-1 h-px bg-gray-100" />
            </div>
          )}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-gray-700 dark:text-gray-200">Стеллажи</h2>
              <p className="text-xs text-gray-400">{racks.length} стеллажей</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setViewMode('list')} style={viewBtnStyle(viewMode === 'list')}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>
                Список
              </button>
              <button onClick={() => setViewMode('visual')} style={viewBtnStyle(viewMode === 'visual')}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                Визуально
              </button>
              <button onClick={() => setViewMode('cards')} style={viewBtnStyle(viewMode === 'cards')}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                Карточки
              </button>
              <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setShowAddRack(true)}>
                Стеллаж
              </Button>
            </div>
          </div>

          {/* Visual mode content */}
          {viewMode === 'visual' && hasFBS && (
            <div>
              <FBSVisualView warehouse={warehouse} onClose={() => setViewMode('list')} />
            </div>
          )}

          {/* Cards mode content */}
          {viewMode === 'cards' && (
            <ShelfCardsView warehouse={warehouse} racks={racks} onDrillRack={handleDrillRack} onDrillShelf={(rack, shelf) => handleDrillRack(rack, String(shelf.id))} />
          )}

          {/* List mode content */}
          {viewMode === 'list' && loading && (
            <div className="flex items-center justify-center h-40"><Spinner size="lg" /></div>
          )}
          {viewMode === 'list' && !loading && racks.length === 0 && (
            <div className="flex flex-col items-center justify-center h-40 text-gray-400 card">
              <WarehouseIcon size={44} className="mb-2 opacity-40" />
              <p className="text-sm">Нет стеллажей</p>
            </div>
          )}
          {viewMode === 'list' && !loading && racks.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {(() => {
                const palette = [
                  { bg: 'linear-gradient(135deg, #7c3aed, #6d28d9)', light: '#ede9fe', text: '#6d28d9', border: '#8b5cf6' },
                  { bg: 'linear-gradient(135deg, #2563eb, #1d4ed8)', light: '#dbeafe', text: '#1d4ed8', border: '#3b82f6' },
                  { bg: 'linear-gradient(135deg, #0891b2, #0e7490)', light: '#cffafe', text: '#0e7490', border: '#06b6d4' },
                  { bg: 'linear-gradient(135deg, #059669, #047857)', light: '#d1fae5', text: '#047857', border: '#10b981' },
                  { bg: 'linear-gradient(135deg, #d97706, #b45309)', light: '#fef3c7', text: '#b45309', border: '#f59e0b' },
                  { bg: 'linear-gradient(135deg, #dc2626, #b91c1c)', light: '#fee2e2', text: '#b91c1c', border: '#ef4444' },
                  { bg: 'linear-gradient(135deg, #db2777, #be185d)', light: '#fce7f3', text: '#be185d', border: '#ec4899' },
                  { bg: 'linear-gradient(135deg, #7c3aed, #5b21b6)', light: '#ede9fe', text: '#5b21b6', border: '#8b5cf6' },
                  { bg: 'linear-gradient(135deg, #4f46e5, #4338ca)', light: '#e0e7ff', text: '#4338ca', border: '#6366f1' },
                  { bg: 'linear-gradient(135deg, #0d9488, #0f766e)', light: '#ccfbf1', text: '#0f766e', border: '#14b8a6' },
                  { bg: 'linear-gradient(135deg, #ca8a04, #a16207)', light: '#fef9c3', text: '#a16207', border: '#eab308' },
                  { bg: 'linear-gradient(135deg, #9333ea, #7e22ce)', light: '#f3e8ff', text: '#7e22ce', border: '#a855f7' },
                ];
                return racks.map((rack, idx) => {
                  const shelvesCount = Number(rack.shelves_count || 0);
                  const totalItems = Number(rack.total_items || 0);
                  const c = palette[idx % palette.length];
                  const num = rack.code?.replace(/\D/g, '') || rack.number || (idx + 1);
                  return (
                    <div key={rack.id}
                      className="card p-0 hover:shadow-lg transition-all group cursor-pointer overflow-hidden"
                      style={{ borderLeft: `4px solid ${c.border}` }}
                      onClick={() => handleDrillRack(rack)}>
                      <div className="p-4">
                        <div className="flex items-start gap-3">
                          <RackBadge number={num} size={48} color={c.bg} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-base font-bold text-gray-900 dark:text-white">{rack.name}</span>
                              <span className="text-xs font-mono px-2 py-0.5 rounded-lg" style={{ color: c.text, background: c.light }}>{rack.code}</span>
                            </div>
                            <div className="flex items-center gap-4 mt-1.5">
                              <span className="text-xs text-gray-500">{shelvesCount} полок</span>
                              <span className="text-xs font-bold" style={{ color: c.text }}>{totalItems.toLocaleString('ru-RU')} шт.</span>
                            </div>
                            {shelvesCount > 0 && (
                              <div className="mt-2.5 flex gap-1">
                                {Array.from({ length: shelvesCount }, (_, i) => (
                                  <div key={i} className="h-1.5 rounded-full flex-1" style={{ background: c.light, maxWidth: 32 }}>
                                    <div className="h-full rounded-full" style={{ background: c.border, width: '70%', opacity: 0.7 }} />
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={e => e.stopPropagation()}>
                            <button onClick={() => setEditRack(rack)}
                              className="p-1.5 rounded-lg text-gray-300 hover:bg-gray-100 transition-all"
                              style={{ '--tw-text-opacity': 1 }}
                              onMouseEnter={e => e.currentTarget.style.color = c.text}
                              onMouseLeave={e => e.currentTarget.style.color = ''}>
                              <Pencil size={13} />
                            </button>
                            <button onClick={() => deleteRack(rack)}
                              className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all">
                              <Trash2 size={13} />
                            </button>
                          </div>
                          <ChevronRight size={18} className="text-gray-300 flex-shrink-0 transition-colors"
                            style={{ color: undefined }}
                            onMouseEnter={() => {}} />
                        </div>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          )}

          <RackModal open={showAddRack} onClose={() => setShowAddRack(false)} warehouseId={warehouse?.id} onSuccess={loadRacks} />
          <RackModal open={!!editRack} onClose={() => setEditRack(null)} rack={editRack} onSuccess={loadRacks} />
        </div>
      )}

      {/* FBO section */}
      {hasFBO && (
        <div>
          {hasFBS && (
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Ряды и паллеты</span>
              <div className="flex-1 h-px bg-gray-100" />
            </div>
          )}
          <FBORowListView
            warehouse={warehouse}
            initialRowId={initialRowId}
            initialPalletId={initialPalletId}
            initialBoxId={initialBoxId}
            initialBoxType={initialBoxType}
            viewMode={!hasFBS ? viewMode : 'list'}
            onViewMode={!hasFBS ? setViewMode : null}
          />
        </div>
      )}

      {/* BOX section */}
      {hasBox && (
        <BoxWarehouseView warehouse={warehouse} />
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function WarehousePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialRackId = searchParams.get('rack');
  const initialShelfId = searchParams.get('shelf');
  const initialRowId = searchParams.get('row');
  const initialPalletId = searchParams.get('pallet');
  const initialBoxId = searchParams.get('box');
  const initialBoxType = searchParams.get('boxtype');

  const [warehouses, setWarehouses] = useState([]);
  const [selectedWh, setSelectedWh] = useState(null);
  const [loading, setLoading] = useState(true);

  const handleSelectWh = useCallback((wh) => {
    setSelectedWh(wh);
    setSearchParams(prev => {
      const p = new URLSearchParams();
      p.set('wh', String(wh.id));
      return p;
    });
  }, [setSearchParams]);

  const loadWarehouses = useCallback(async () => {
    try {
      const res = await api.get('/warehouse/warehouses');
      setWarehouses(res.data);
      if (res.data.length > 0) {
        const urlWhId = searchParams.get('wh');
        const fromUrl = urlWhId ? res.data.find(w => w.id === +urlWhId) : null;
        setSelectedWh(prev => fromUrl || (prev ? (res.data.find(w => w.id === prev.id) || res.data[0]) : res.data[0]));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadWarehouses(); }, []);

  return (
    <div className="p-6 mx-auto max-w-6xl">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Склады</h1>
          <p className="text-gray-500 text-sm mt-0.5">Управление складами, стеллажами и паллетами</p>
        </div>
        {selectedWh && (
          <div className="flex items-center gap-1.5 text-sm text-gray-400 flex-wrap">
            <button onClick={() => setSearchParams(new URLSearchParams())} className="hover:text-primary-500 transition-colors">Склады</button>
            <ChevronRight size={12} />
            <button onClick={() => setSearchParams(p => { const n = new URLSearchParams(); n.set('wh', selectedWh.id); return n; })} className="hover:text-primary-500 transition-colors">{selectedWh.name}</button>
            {initialRackId && <><ChevronRight size={12} /><span className="text-gray-600 dark:text-gray-300">Стеллаж {initialRackId}</span></>}
            {initialShelfId && <><ChevronRight size={12} /><span className="text-gray-700 dark:text-gray-200 font-medium">Полка {initialShelfId}</span></>}
            {initialRowId && <><ChevronRight size={12} /><span className="text-gray-600 dark:text-gray-300">Ряд {initialRowId}</span></>}
            {initialPalletId && <><ChevronRight size={12} /><span className="text-gray-700 dark:text-gray-200 font-medium">Паллет {initialPalletId}</span></>}
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48"><Spinner size="lg" /></div>
      ) : (
        <>
          <div className="mb-5">
            <WarehouseListView
              warehouses={warehouses}
              selectedId={selectedWh?.id}
              onSelect={handleSelectWh}
              onReload={loadWarehouses}
              onDeleted={(deletedId) => {
                if (selectedWh?.id === deletedId) {
                  setSelectedWh(null);
                  setSearchParams(new URLSearchParams());
                }
              }}
            />
          </div>
          {selectedWh && (
            <WarehouseContent
              warehouse={selectedWh}
              initialRackId={initialRackId}
              initialShelfId={initialShelfId}
              initialRowId={initialRowId}
              initialPalletId={initialPalletId}
              initialBoxId={initialBoxId}
              initialBoxType={initialBoxType}
            />
          )}
        </>
      )}
    </div>
  );
}

import { useState, useEffect, useMemo } from 'react';
import api from '../../../api/client';
import Button from '../../../components/ui/Button';
import Modal from '../../../components/ui/Modal';
import Input from '../../../components/ui/Input';
import Spinner from '../../../components/ui/Spinner';
import { useToast } from '../../../components/ui/Toast';
import { cn } from '../../../utils/cn';
import { ProductIcon } from '../../../components/ui/WarehouseIcons';
import { X } from 'lucide-react';
import { getShelfBoxLabel, getPalletBoxLabel } from './warehouseUtils';

// ─── Warehouse Modal (create/edit) ────────────────────────────────────────────
export function WarehouseModal({ open, onClose, warehouse, onSuccess }) {
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
        <Button variant="primary-solid" form="wh-form" type="submit" loading={loading}>{warehouse ? 'Сохранить' : 'Создать'}</Button>
      </>}>
      <form id="wh-form" onSubmit={handleSubmit} className="space-y-4">
        <Input label="Название склада" placeholder="Склад Ижевск" value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
        <Input label="Примечание" placeholder="Необязательно" value={form.notes}
          onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
        {warehouse && (
          <label className="flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors">
            <input type="checkbox" checked={!form.active} onChange={() => setForm(f => ({ ...f, active: !f.active }))}
              className="w-4 h-4 rounded border-gray-300 text-rose-500 focus:ring-rose-400" />
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
export function RackModal({ open, onClose, warehouseId, rack, onSuccess }) {
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
        <Button variant="primary-solid" form="rack-form" type="submit" loading={loading}>{rack ? 'Сохранить' : 'Добавить'}</Button>
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
export function ShelfModal({ open, onClose, rackId, shelf, onSuccess }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: '', number: '', notes: '', uses_boxes: true, uses_loose: false });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setForm(shelf
      ? { name: shelf.name, number: shelf.number, notes: shelf.notes || '', uses_boxes: shelf.uses_boxes !== false, uses_loose: false }
      : { name: '', number: '', notes: '', uses_boxes: true, uses_loose: false }
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
        <Button variant="primary-solid" form="shelf-form" type="submit" loading={loading}>{shelf ? 'Сохранить' : 'Добавить'}</Button>
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

// ─── Box Editor Modal ─────────────────────────────────────────────────────────
export function BoxEditorModal({ open, onClose, box, title, onSave, loading }) {
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

// ─── FBO: Pallet Modal ────────────────────────────────────────────────────────
export function PalletModal({ open, onClose, rowId, pallet, onSuccess }) {
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
      footer={<><Button variant="ghost" onClick={onClose}>Отмена</Button><Button variant="primary-solid" form="pallet-form" type="submit" loading={loading}>{isEdit ? 'Сохранить' : 'Добавить'}</Button></>}>
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

// ─── FBO: Row Modal (create/edit) ────────────────────────────────────────────
export function RowModal({ open, onClose, warehouseId, row, onSuccess }) {
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
      footer={<><Button variant="ghost" onClick={onClose}>Отмена</Button><Button variant="primary-solid" form="row-form" type="submit" loading={loading}>{isEdit ? 'Сохранить' : 'Добавить'}</Button></>}>
      <form id="row-form" onSubmit={handleSubmit} className="space-y-4">
        <Input label="Название" placeholder="Ряд 1" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
        <Input label="Номер" type="number" min="1" placeholder="1" value={form.number} onChange={e => setForm(f => ({ ...f, number: e.target.value }))} required />
      </form>
    </Modal>
  );
}

// ─── Box Warehouse Modal (create/edit box) ──────────────────────────────────
export function BoxWarehouseModal({ open, onClose, warehouseId, box, products, onSuccess }) {
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
      footer={<><Button variant="ghost" onClick={onClose}>Отмена</Button><Button variant="primary-solid" form="box-wh-form" type="submit" loading={loading}>{isEdit ? 'Сохранить' : 'Создать'}</Button></>}>
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
                className="p-1 rounded text-gray-400 hover:text-rose-500"><X size={14} /></button>
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

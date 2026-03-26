import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, Package, X, ChevronRight, Save, Pencil } from 'lucide-react';
import { RawMaterialsIcon, IngredientIcon, PackagingMaterialIcon, TechCardIcon } from '../../components/ui/WarehouseIcons';
import api from '../../api/client';
import Spinner from '../../components/ui/Spinner';

function fmtQty(val) {
  const n = parseFloat(val);
  if (isNaN(n)) return '0';
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
}

function fmtPrice(val) {
  const n = parseFloat(val);
  if (isNaN(n) || n === 0) return '—';
  return n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₽';
}

const GROUP_LABELS = {
  'порошки': { label: 'Порошки', color: 'bg-green-50 text-green-700' },
  'полуфабрикаты': { label: 'Полуфабрикаты', color: 'bg-purple-50 text-purple-700' },
  'этикетки': { label: 'Этикетки', color: 'bg-amber-50 text-amber-700' },
  'расходники': { label: 'Расходники', color: 'bg-blue-50 text-blue-700' },
  'другое': { label: 'Другое', color: 'bg-gray-100 text-gray-600' },
};

function groupBadge(group) {
  const g = GROUP_LABELS[group] || GROUP_LABELS['другое'];
  return <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${g.color}`}>{g.label}</span>;
}

/* ═══════════════════ Material Detail Modal ═══════════════════ */

function MaterialDetailModal({ materialId, onClose, onUpdated }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!materialId) return;
    setLoading(true);
    setEditing(false);
    api.get(`/materials/${materialId}`)
      .then(r => {
        const d = r.data;
        setData(d);
        setForm({
          name: d.name || '', code: d.code || '', unit: d.unit || 'шт',
          category: d.category || 'ingredient', material_group: d.material_group || 'другое',
          buy_price: d.buy_price || '', stock: d.stock || '',
          min_stock: d.min_stock || '', supplier: d.supplier || '', notes: d.notes || '',
        });
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [materialId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const body = { ...form };
      if (body.buy_price === '') body.buy_price = null;
      if (body.stock === '') body.stock = 0;
      if (body.min_stock === '') body.min_stock = 0;
      await api.put(`/materials/${materialId}`, body);
      setEditing(false);
      const res = await api.get(`/materials/${materialId}`);
      setData(res.data);
      onUpdated?.();
    } catch {}
    setSaving(false);
  };

  if (!materialId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {loading ? (
          <div className="flex items-center justify-center py-20"><Spinner /></div>
        ) : !data ? (
          <div className="p-6 text-center text-gray-400">Не найдено</div>
        ) : (
          <div className="p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-gray-50">
                  {data.category === 'packaging' ? <PackagingMaterialIcon size={28} /> : <IngredientIcon size={28} />}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">{data.name}</h2>
                  <div className="flex items-center gap-2 mt-0.5">
                    {data.code && <span className="text-xs font-mono text-gray-400">{data.code}</span>}
                    {groupBadge(data.material_group)}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {!editing && <button onClick={() => setEditing(true)} className="text-gray-300 hover:text-purple-500 transition-colors p-1"><Pencil size={16} /></button>}
                <button onClick={onClose} className="text-gray-300 hover:text-gray-500 transition-colors p-1"><X size={20} /></button>
              </div>
            </div>

            {!editing && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-lg font-bold text-gray-900">{fmtQty(data.stock)}</p>
                    <p className="text-[10px] text-gray-400">Остаток ({data.unit || 'шт'})</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-lg font-bold text-gray-900">{fmtPrice(data.buy_price)}</p>
                    <p className="text-[10px] text-gray-400">Закупка за {data.unit || 'шт'}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-sm font-bold text-gray-900">{data.unit || 'шт'}</p>
                    <p className="text-[10px] text-gray-400">Единица</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-sm font-bold text-gray-900">{fmtQty(data.min_stock)}</p>
                    <p className="text-[10px] text-gray-400">Мин. остаток</p>
                  </div>
                </div>
                {data.supplier && <p className="text-sm"><span className="text-gray-400">Поставщик:</span> <span className="font-medium text-gray-700">{data.supplier}</span></p>}
                {data.notes && <p className="text-sm"><span className="text-gray-400">Заметки:</span> <span className="text-gray-600">{data.notes}</span></p>}
              </>
            )}

            {editing && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <label className="block"><span className="text-[11px] text-gray-400 font-medium">Название</span>
                    <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full mt-0.5 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" /></label>
                  <label className="block"><span className="text-[11px] text-gray-400 font-medium">Код</span>
                    <input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} className="w-full mt-0.5 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" /></label>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <label className="block"><span className="text-[11px] text-gray-400 font-medium">Группа</span>
                    <select value={form.material_group} onChange={e => setForm({ ...form, material_group: e.target.value })} className="w-full mt-0.5 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400">
                      {Object.entries(GROUP_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select></label>
                  <label className="block"><span className="text-[11px] text-gray-400 font-medium">Единица</span>
                    <input value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} className="w-full mt-0.5 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" /></label>
                  <label className="block"><span className="text-[11px] text-gray-400 font-medium">Цена закупки</span>
                    <input type="number" step="0.01" value={form.buy_price} onChange={e => setForm({ ...form, buy_price: e.target.value })} className="w-full mt-0.5 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" /></label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block"><span className="text-[11px] text-gray-400 font-medium">Остаток</span>
                    <input type="number" step="0.001" value={form.stock} onChange={e => setForm({ ...form, stock: e.target.value })} className="w-full mt-0.5 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" /></label>
                  <label className="block"><span className="text-[11px] text-gray-400 font-medium">Мин. остаток</span>
                    <input type="number" step="0.001" value={form.min_stock} onChange={e => setForm({ ...form, min_stock: e.target.value })} className="w-full mt-0.5 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" /></label>
                </div>
                <label className="block"><span className="text-[11px] text-gray-400 font-medium">Поставщик</span>
                  <input value={form.supplier || ''} onChange={e => setForm({ ...form, supplier: e.target.value })} className="w-full mt-0.5 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" /></label>
                <label className="block"><span className="text-[11px] text-gray-400 font-medium">Заметки</span>
                  <textarea value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full mt-0.5 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 resize-none" /></label>
                <div className="flex items-center gap-2 pt-1">
                  <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-semibold hover:bg-purple-700 disabled:opacity-50 transition-colors">
                    <Save size={14} />{saving ? 'Сохранение...' : 'Сохранить'}</button>
                  <button onClick={() => setEditing(false)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">Отмена</button>
                </div>
              </div>
            )}

            {!editing && data.tech_cards?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5"><TechCardIcon size={14} /> Используется в тех. картах ({data.tech_cards.length})</p>
                <div className="space-y-1.5">
                  {data.tech_cards.map((tc, i) => (
                    <div key={tc.id || i} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-50 border border-gray-100">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{tc.product_name}</p>
                        <p className="text-[10px] text-gray-400">{tc.name}</p>
                      </div>
                      <span className="text-sm font-bold text-purple-600 flex-shrink-0">{fmtQty(tc.quantity)} {data.unit || 'шт'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════ Main Page ═══════════════════ */

export default function MaterialsPage() {
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState('');
  const [archived, setArchived] = useState(false);
  const [page, setPage] = useState(1);
  const limit = 50;

  const [materials, setMaterials] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, groups: [] });
  const [selectedId, setSelectedId] = useState(null);

  const [debouncedSearch, setDebouncedSearch] = useState('');
  const debounceRef = useRef(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [search]);

  const fetchMaterials = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit };
      if (debouncedSearch) params.search = debouncedSearch;
      if (group) params.material_group = group;
      if (archived) params.archived = true;
      const res = await api.get('/materials', { params });
      setMaterials(res.data.rows || []);
      setTotal(res.data.total || 0);
    } catch { setMaterials([]); setTotal(0); }
    finally { setLoading(false); }
  }, [page, debouncedSearch, group, archived]);

  const fetchStats = useCallback(async () => {
    try { const res = await api.get('/materials/stats'); setStats(res.data); } catch {}
  }, []);

  useEffect(() => { fetchMaterials(); }, [fetchMaterials]);
  useEffect(() => { fetchStats(); }, [fetchStats]);

  const totalPages = Math.ceil(total / limit) || 1;

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
          <RawMaterialsIcon size={28} />
          Сырьё и упаковка
        </h1>
        {/* Group filter chips */}
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <button
            onClick={() => { setGroup(''); setPage(1); }}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${!group ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            Все ({stats.total})
          </button>
          {(stats.groups || []).map(g => {
            const gl = GROUP_LABELS[g.group] || GROUP_LABELS['другое'];
            return (
              <button
                key={g.group}
                onClick={() => { setGroup(g.group); setPage(1); }}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${group === g.group ? 'bg-purple-600 text-white' : gl.color + ' hover:opacity-80'}`}
              >
                {gl.label} ({g.count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input placeholder="Поиск по названию или коду..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent" />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer whitespace-nowrap">
            <input type="checkbox" checked={archived} onChange={e => { setArchived(e.target.checked); setPage(1); }} className="rounded border-gray-300" />
            Архивные
          </label>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20"><Spinner /></div>
        ) : materials.length === 0 ? (
          <div className="text-center py-20">
            <Package size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-400 text-sm">Материалы не найдены</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Название</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Код</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Группа</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Ед.</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Закупка</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Остаток</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {materials.map(m => (
                  <tr key={m.id} onClick={() => setSelectedId(m.id)} className="border-b border-gray-50 hover:bg-purple-50/30 cursor-pointer transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {m.category === 'packaging' ? <PackagingMaterialIcon size={18} /> : <IngredientIcon size={18} />}
                        <span className="font-medium text-gray-800">{m.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{m.code || '—'}</td>
                    <td className="px-4 py-3">{groupBadge(m.material_group)}</td>
                    <td className="px-4 py-3 text-gray-500">{m.unit || '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{fmtPrice(m.buy_price)}</td>
                    <td className="px-4 py-3 text-right font-bold text-gray-900">{fmtQty(m.stock)}</td>
                    <td className="px-4 py-3"><ChevronRight size={14} className="text-gray-300" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-400">Страница {page} из {totalPages} · {total} записей</p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors">Назад</button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors">Вперёд</button>
            </div>
          </div>
        )}
      </div>

      <MaterialDetailModal materialId={selectedId} onClose={() => setSelectedId(null)} onUpdated={() => { fetchMaterials(); fetchStats(); }} />
    </div>
  );
}

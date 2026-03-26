import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, Download, Package, X, ChevronRight } from 'lucide-react';
import { RawMaterialsIcon, IngredientIcon, PackagingMaterialIcon, TechCardIcon } from '../../components/ui/WarehouseIcons';
import api from '../../api/client';
import Spinner from '../../components/ui/Spinner';

function fmtQty(val) {
  const n = parseFloat(val);
  if (isNaN(n)) return '—';
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
}

/* ═══════════════════ Material Detail Modal ═══════════════════ */

function MaterialDetailModal({ materialId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!materialId) return;
    setLoading(true);
    api.get(`/materials/${materialId}`)
      .then(r => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [materialId]);

  if (!materialId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {loading ? (
          <div className="flex items-center justify-center py-20"><Spinner /></div>
        ) : !data ? (
          <div className="p-6 text-center text-gray-400">Не найдено</div>
        ) : (
          <div className="p-6 space-y-5">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-gray-50">
                  {data.category === 'packaging' ? <PackagingMaterialIcon size={28} /> : <IngredientIcon size={28} />}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">{data.name}</h2>
                  <div className="flex items-center gap-2 mt-0.5">
                    {data.code && <span className="text-xs font-mono text-gray-400">{data.code}</span>}
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                      data.category === 'packaging' ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-600'
                    }`}>
                      {data.category === 'packaging' ? 'Упаковка' : 'Ингредиент'}
                    </span>
                  </div>
                </div>
              </div>
              <button onClick={onClose} className="text-gray-300 hover:text-gray-500 transition-colors">
                <X size={20} />
              </button>
            </div>

            {/* Info grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-lg font-bold text-gray-900">{fmtQty(data.stock)}</p>
                <p className="text-[10px] text-gray-400">Остаток</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-sm font-bold text-gray-900">{data.unit || 'шт'}</p>
                <p className="text-[10px] text-gray-400">Единица</p>
              </div>
            </div>

            {data.folder_path && (
              <p className="text-xs text-gray-400">Папка: {data.folder_path}</p>
            )}

            {/* Tech cards using this material */}
            {data.tech_cards?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <TechCardIcon size={14} />
                  Используется в тех. картах ({data.tech_cards.length})
                </p>
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
  const [category, setCategory] = useState('');
  const [archived, setArchived] = useState(false);
  const [page, setPage] = useState(1);
  const limit = 50;

  const [materials, setMaterials] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, ingredients: 0, packaging: 0 });
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  const [debouncedSearch, setDebouncedSearch] = useState('');
  const debounceRef = useRef(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [search]);

  const fetchMaterials = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit };
      if (debouncedSearch) params.search = debouncedSearch;
      if (category) params.category = category;
      if (archived) params.archived = true;
      const res = await api.get('/materials', { params });
      const data = res.data;
      setMaterials(data.rows || data.items || []);
      setTotal(data.total || 0);
    } catch {
      setMaterials([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, category, archived]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get('/materials/stats');
      setStats(res.data);
    } catch {}
  }, []);

  useEffect(() => { fetchMaterials(); }, [fetchMaterials]);
  useEffect(() => { fetchStats(); }, [fetchStats]);

  const handleImport = async () => {
    setImporting(true);
    setImportResult(null);
    try {
      const res = await api.post('/materials/import');
      setImportResult({ success: true, data: res.data });
      fetchMaterials();
      fetchStats();
    } catch (err) {
      setImportResult({ success: false, error: err.response?.data?.error || 'Ошибка импорта' });
    } finally {
      setImporting(false);
    }
  };

  const totalPages = Math.ceil(total / limit) || 1;

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <RawMaterialsIcon size={28} />
            Сырьё и упаковка
          </h1>
          <div className="flex items-center gap-3 mt-2 text-xs">
            <span className="bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full font-semibold">{stats.total} всего</span>
            <span className="bg-green-50 text-green-700 px-2.5 py-1 rounded-full font-semibold flex items-center gap-1">
              <IngredientIcon size={12} />{stats.ingredients} ингредиентов
            </span>
            <span className="bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full font-semibold flex items-center gap-1">
              <PackagingMaterialIcon size={12} />{stats.packaging} упаковка
            </span>
          </div>
        </div>
        <button
          onClick={handleImport}
          disabled={importing}
          className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-semibold hover:bg-purple-700 disabled:opacity-50 transition-colors"
        >
          {importing ? <Spinner size="sm" /> : <Download size={16} />}
          {importing ? 'Импорт...' : 'Импорт из МойСклад'}
        </button>
      </div>

      {/* Import result */}
      {importResult && (
        <div className={`rounded-xl p-4 text-sm ${importResult.success ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
          {importResult.success ? (
            <p>Импорт завершён: {importResult.data?.matched || 0} тех. карт, {importResult.data?.materials_count || 0} материалов</p>
          ) : (
            <p>Ошибка: {importResult.error}</p>
          )}
          <button onClick={() => setImportResult(null)} className="text-xs underline mt-1 opacity-60">закрыть</button>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              placeholder="Поиск по названию или коду..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent"
            />
          </div>
          <select
            value={category}
            onChange={e => { setCategory(e.target.value); setPage(1); }}
            className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-400"
          >
            <option value="">Все категории</option>
            <option value="ingredient">Ингредиенты</option>
            <option value="packaging">Упаковка</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer whitespace-nowrap">
            <input
              type="checkbox"
              checked={archived}
              onChange={e => { setArchived(e.target.checked); setPage(1); }}
              className="rounded border-gray-300"
            />
            Архивные
          </label>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Spinner />
          </div>
        ) : materials.length === 0 ? (
          <div className="text-center py-20">
            <Package size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-400 text-sm">
              {stats.total === 0 ? 'Нажмите «Импорт из МойСклад» чтобы загрузить материалы' : 'Материалы не найдены'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Название</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Код</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Категория</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Единица</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Остаток</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Папка</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {materials.map(m => (
                  <tr
                    key={m.id}
                    onClick={() => setSelectedId(m.id)}
                    className="border-b border-gray-50 hover:bg-purple-50/30 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {m.category === 'packaging' ? <PackagingMaterialIcon size={18} /> : <IngredientIcon size={18} />}
                        <span className="font-medium text-gray-800">{m.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{m.code || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${
                        m.category === 'packaging'
                          ? 'bg-blue-50 text-blue-600'
                          : 'bg-green-50 text-green-600'
                      }`}>
                        {m.category === 'packaging' ? 'Упаковка' : 'Ингредиент'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{m.unit || '—'}</td>
                    <td className="px-4 py-3 text-right font-bold text-gray-900">{fmtQty(m.stock)}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs truncate max-w-[200px]">{m.folder_path || '—'}</td>
                    <td className="px-4 py-3">
                      <ChevronRight size={14} className="text-gray-300" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-400">
              Страница {page} из {totalPages} · {total} записей
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors"
              >
                Назад
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors"
              >
                Вперёд
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail modal */}
      <MaterialDetailModal materialId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}

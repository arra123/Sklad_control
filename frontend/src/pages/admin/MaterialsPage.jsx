import { useState, useEffect, useCallback, useRef } from 'react';
import { FlaskConical, Search, Download, Package } from 'lucide-react';
import api from '../../api/client';
import Spinner from '../../components/ui/Spinner';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { useToast } from '../../components/ui/Toast';

export default function MaterialsPage() {
  const { addToast } = useToast();

  // Filters
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [archived, setArchived] = useState(false);
  const [page, setPage] = useState(1);
  const limit = 50;

  // Data
  const [materials, setMaterials] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, ingredients: 0, packaging: 0 });
  const [importing, setImporting] = useState(false);

  // Debounced search
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

  // Fetch materials
  const fetchMaterials = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit };
      if (debouncedSearch) params.search = debouncedSearch;
      if (category) params.category = category;
      if (archived) params.archived = true;
      const res = await api.get('/materials', { params });
      setMaterials(res.data.items || res.data);
      setTotal(res.data.total || (res.data.items || res.data).length);
    } catch (err) {
      addToast('Ошибка загрузки материалов', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, category, archived, addToast]);

  // Fetch stats
  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get('/materials/stats');
      setStats(res.data);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => { fetchMaterials(); }, [fetchMaterials]);
  useEffect(() => { fetchStats(); }, [fetchStats]);

  // Import
  const handleImport = async () => {
    setImporting(true);
    try {
      const res = await api.post('/materials/import');
      const count = res.data?.imported ?? res.data?.count ?? 0;
      addToast(`Импортировано материалов: ${count}`, 'success');
      fetchMaterials();
      fetchStats();
    } catch (err) {
      addToast(err.response?.data?.error || 'Ошибка импорта', 'error');
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
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2.5">
            <FlaskConical size={24} className="text-primary-600" />
            Сырьё и упаковка
          </h1>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="default">{stats.total} всего</Badge>
            <Badge variant="success">{stats.ingredients} ингредиентов</Badge>
            <Badge variant="info">{stats.packaging} упаковка</Badge>
          </div>
        </div>
        <Button onClick={handleImport} disabled={importing} variant="primary" className="flex items-center gap-2">
          {importing ? <Spinner size="sm" /> : <Download size={16} />}
          Импорт из МойСклад
        </Button>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Поиск по названию или коду..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <select
            value={category}
            onChange={e => { setCategory(e.target.value); setPage(1); }}
            className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">Все категории</option>
            <option value="ingredient">Ингредиенты</option>
            <option value="packaging">Упаковка</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 cursor-pointer whitespace-nowrap">
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
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Spinner />
          </div>
        ) : materials.length === 0 ? (
          <div className="text-center py-20">
            <Package size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-400 text-sm">Материалы не найдены</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">Название</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">Код</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">Категория</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">Единица</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">Папка</th>
                </tr>
              </thead>
              <tbody>
                {materials.map(m => (
                  <tr
                    key={m.id}
                    className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/30 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-gray-800 dark:text-gray-100">{m.name}</td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 font-mono text-xs">{m.code || '—'}</td>
                    <td className="px-4 py-3">
                      {m.category === 'packaging'
                        ? <Badge variant="info">Упаковка</Badge>
                        : <Badge variant="success">Ингредиент</Badge>
                      }
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{m.unit || '—'}</td>
                    <td className="px-4 py-3 text-gray-400 dark:text-gray-500 text-xs truncate max-w-[200px]">{m.folder_path || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-gray-800">
            <p className="text-xs text-gray-400">
              Страница {page} из {totalPages} · {total} записей
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Назад
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Вперёд
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

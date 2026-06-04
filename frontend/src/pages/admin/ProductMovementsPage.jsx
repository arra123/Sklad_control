import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  History, Search, Package, ChevronLeft, ChevronRight, RotateCcw,
  ChevronDown, CalendarDays, TrendingUp, Layers, ArrowRight, X,
} from 'lucide-react';
import api from '../../api/client';
import Spinner from '../../components/ui/Spinner';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import { TYPE_META, getTypeMeta, fmtSource } from '../../utils/movementTypes';

const DASH = '—';
const ALL_TYPES = Object.keys(TYPE_META);

function typeBadge(t) {
  const m = getTypeMeta(t);
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${m.cls}`}>{m.label}</span>;
}

function fmtQty(v) {
  const n = parseFloat(v);
  if (isNaN(n)) return v;
  return n % 1 === 0 ? String(Math.round(n)) : n.toFixed(1);
}

function fmtTime(iso) {
  if (!iso) return DASH;
  const d = new Date(iso), now = new Date();
  const hms = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  if (d.toDateString() === now.toDateString()) return hms;
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')} ${hms}`;
}

function getDateStr(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

const DATE_PRESETS = [
  { label: 'Сегодня', from: () => getDateStr(0), to: () => getDateStr(0) },
  { label: 'Вчера', from: () => getDateStr(1), to: () => getDateStr(1) },
  { label: '3 дня', from: () => getDateStr(2), to: () => getDateStr(0) },
  { label: 'Неделя', from: () => getDateStr(6), to: () => getDateStr(0) },
  { label: 'Месяц', from: () => getDateStr(29), to: () => getDateStr(0) },
  { label: 'Все', from: () => '', to: () => '' },
];

function StatCard({ icon: Icon, label, value, color }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    purple: 'bg-purple-50 text-purple-600',
    amber: 'bg-amber-50 text-amber-600',
    primary: 'bg-primary-50 text-primary-600',
    gray: 'bg-gray-100 text-gray-600',
  };
  return (
    <div className="card p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${colors[color] || colors.gray}`}>
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 truncate">{label}</p>
        <p className="text-lg font-bold text-gray-900 dark:text-white truncate">{value ?? DASH}</p>
      </div>
    </div>
  );
}

const COL = {
  time: 'w-[75px]',
  type: 'w-[170px]',
  qty: 'w-[80px]',
  route: 'flex-1 min-w-[200px]',
  employee: 'w-[150px]',
};

function MovementRow({ m }) {
  const [open, setOpen] = useState(false);
  const from = fmtSource(m, 'from');
  const to = fmtSource(m, 'to');
  const date = m.created_at ? new Date(m.created_at) : null;

  return (
    <div className="border-b border-gray-50 dark:border-gray-800 last:border-0">
      <div className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer"
        onClick={() => setOpen(!open)}>
        <div className={`${COL.time} flex-shrink-0`}>
          <p className="text-xs font-mono text-gray-500">{fmtTime(m.created_at)}</p>
        </div>
        <div className={`${COL.type} flex-shrink-0`}>{typeBadge(m.movement_type)}</div>
        <div className={`${COL.qty} flex-shrink-0 text-right`}>
          <span className="text-sm font-bold text-gray-900 dark:text-white">{fmtQty(m.quantity)} <span className="text-gray-400 font-normal text-xs">шт.</span></span>
        </div>
        <div className={`${COL.route} flex items-center gap-1.5 min-w-0`}>
          <span className="text-xs text-gray-500 truncate" title={from || DASH}>{from || DASH}</span>
          <ArrowRight size={12} className="text-gray-300 flex-shrink-0" />
          <span className="text-xs text-gray-700 dark:text-gray-300 truncate font-medium" title={to || DASH}>{to || DASH}</span>
        </div>
        <div className={`${COL.employee} flex-shrink-0 text-right`}>
          <p className="text-xs text-gray-400 truncate" title={m.performer_name || m.performed_by_name || ''}>{m.performer_name || m.performed_by_name || DASH}</p>
        </div>
        <ChevronDown size={14} className={`text-gray-300 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>
      {open && (
        <div className="px-4 pb-3 pt-0">
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-xs">
            <div>
              <span className="text-gray-400">ID записи</span>
              <p className="font-mono text-gray-600 dark:text-gray-300">#{m.id}</p>
            </div>
            <div>
              <span className="text-gray-400">Тип</span>
              <p className="text-gray-700 dark:text-gray-300">{m.movement_type}</p>
            </div>
            <div>
              <span className="text-gray-400">Источник</span>
              <p className="text-gray-700 dark:text-gray-300">{m.source || 'manual'}</p>
            </div>
            <div>
              <span className="text-gray-400">Дата/время</span>
              <p className="text-gray-700 dark:text-gray-300">{date ? date.toLocaleString('ru-RU') : DASH}</p>
            </div>
            <div>
              <span className="text-gray-400">Исполнитель</span>
              <p className="text-gray-700 dark:text-gray-300">{m.performer_name || m.performed_by_name || DASH}</p>
            </div>
            <div>
              <span className="text-gray-400">Кол-во</span>
              <p className="font-bold text-gray-900 dark:text-white">{fmtQty(m.quantity)} шт.</p>
            </div>
            {from && (
              <div>
                <span className="text-gray-400">Откуда</span>
                <p className="text-gray-700 dark:text-gray-300">{from}</p>
              </div>
            )}
            {to && (
              <div>
                <span className="text-gray-400">Куда</span>
                <p className="text-gray-700 dark:text-gray-300">{to}</p>
              </div>
            )}
            {m.notes && (
              <div className="col-span-2 sm:col-span-3">
                <span className="text-gray-400">Заметка</span>
                <p className="text-gray-700 dark:text-gray-300">{m.notes}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ProductSearchBox({ product, onPick, onClear }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef(null);
  const debRef = useRef(null);

  useEffect(() => {
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(() => {
    if (debRef.current) clearTimeout(debRef.current);
    if (!query.trim()) { setResults([]); return; }
    debRef.current = setTimeout(async () => {
      try {
        setLoading(true);
        const r = await api.get('/products', { params: { search: query.trim(), limit: 20, page: 1 } });
        const items = r.data?.items || r.data?.data || r.data || [];
        setResults(Array.isArray(items) ? items : []);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => debRef.current && clearTimeout(debRef.current);
  }, [query]);

  if (product) {
    return (
      <div className="card p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center flex-shrink-0">
          <Package size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{product.name}</p>
          <p className="text-xs text-gray-400 truncate">
            {product.code ? `Код: ${product.code}` : ''}
            {product.warehouse_qty != null ? ` · Остаток: ${fmtQty(product.warehouse_qty)} шт.` : ''}
          </p>
        </div>
        <button
          onClick={onClear}
          className="px-3 py-2 rounded-xl text-xs text-gray-500 border border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800 transition-colors flex items-center gap-1.5"
        >
          <X size={13} />
          Сменить
        </button>
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="relative">
      <Input
        placeholder="Начните вводить название товара (например, NMN)…"
        icon={<Search size={14} />}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length && setOpen(true)}
        autoFocus
      />
      {open && (results.length > 0 || loading) && (
        <div className="absolute z-20 top-full mt-1.5 w-full bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg max-h-80 overflow-y-auto">
          {loading && (
            <div className="px-4 py-3 text-xs text-gray-400">Поиск…</div>
          )}
          {!loading && results.map((p) => (
            <button
              key={p.id}
              onClick={() => { onPick(p); setQuery(''); setOpen(false); }}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left border-b border-gray-50 dark:border-gray-800 last:border-0"
            >
              <Package size={14} className="text-gray-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900 dark:text-white truncate">{p.name}</p>
                {p.code && <p className="text-xs text-gray-400 truncate">Код: {p.code}</p>}
              </div>
              {p.warehouse_qty != null && (
                <span className="text-xs text-gray-500 flex-shrink-0">{fmtQty(p.warehouse_qty)} шт.</span>
              )}
            </button>
          ))}
          {!loading && !results.length && (
            <div className="px-4 py-3 text-xs text-gray-400">Ничего не найдено</div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ProductMovementsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [product, setProduct] = useState(null);
  const [history, setHistory] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [type, setType] = useState('');
  const [empId, setEmpId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [activePreset, setActivePreset] = useState(-1);
  const limit = 50;

  // Восстанавливаем товар из URL ?product=ID при загрузке
  useEffect(() => {
    const pid = searchParams.get('product');
    if (pid && !product) {
      api.get(`/products/${pid}`).then(r => setProduct(r.data)).catch(() => {});
    }
    api.get('/staff/employees').then(r => setEmployees(r.data?.items || r.data || [])).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Синхронизируем product_id с URL
  useEffect(() => {
    setSearchParams(prev => {
      const p = new URLSearchParams(prev);
      if (product?.id) p.set('product', String(product.id));
      else p.delete('product');
      return p;
    }, { replace: true });
  }, [product, setSearchParams]);

  const fetchData = useCallback(async (p = page) => {
    if (!product?.id) { setHistory([]); setTotal(0); return; }
    setLoading(true);
    try {
      const params = { product_id: product.id, page: p, limit };
      if (type) params.movement_type = type;
      if (empId) params.employee_id = empId;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      const r = await api.get('/movements/history', { params });
      const d = r.data;
      setHistory(d.items || d.data || d || []);
      setTotal(d.total ?? (d.items || []).length);
    } catch {
      setHistory([]); setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [product, page, type, empId, dateFrom, dateTo]);

  useEffect(() => { setPage(1); }, [product?.id, type, empId, dateFrom, dateTo]);
  useEffect(() => { fetchData(page); }, [fetchData, page]);

  const resetFilters = () => {
    setType(''); setEmpId(''); setDateFrom(''); setDateTo(''); setPage(1); setActivePreset(-1);
  };

  const handlePreset = (idx) => {
    const p = DATE_PRESETS[idx];
    setDateFrom(p.from());
    setDateTo(p.to());
    setActivePreset(idx);
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));

  // Быстрые сводки из загруженной страницы (для отображения, не точная статистика)
  const summary = useMemo(() => {
    const todayStr = getDateStr(0);
    const weekAgo = getDateStr(6);
    let today = 0, week = 0, qtyToday = 0;
    let last = null;
    for (const m of history) {
      const d = (m.created_at || '').slice(0, 10);
      if (d === todayStr) { today++; qtyToday += parseFloat(m.quantity) || 0; }
      if (d >= weekAgo) week++;
      if (!last || (m.created_at && m.created_at > last.created_at)) last = m;
    }
    return { today, week, qtyToday, last };
  }, [history]);

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <History size={24} className="text-primary-500" />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Движение товара</h1>
      </div>

      {/* Product picker */}
      <div className="mb-6">
        <ProductSearchBox product={product} onPick={setProduct} onClear={() => setProduct(null)} />
      </div>

      {!product ? (
        <div className="card flex flex-col items-center justify-center py-20 text-gray-400">
          <Package size={48} className="mb-3 opacity-30" />
          <p className="text-sm">Выберите товар, чтобы посмотреть историю его перемещений</p>
        </div>
      ) : (
        <>
          {/* Stat cards (по загруженной странице) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <StatCard icon={Layers} label="Всего записей" value={total} color="primary" />
            <StatCard icon={CalendarDays} label="За сегодня (стр.)" value={summary.today} color="blue" />
            <StatCard icon={TrendingUp} label="За неделю (стр.)" value={summary.week} color="green" />
            <StatCard
              icon={History}
              label="Последнее движение"
              value={summary.last ? fmtTime(summary.last.created_at) : DASH}
              color="amber"
            />
          </div>

          {/* Filters */}
          <div className="card p-4 mb-6 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <CalendarDays size={14} className="text-gray-400" />
              {DATE_PRESETS.map((p, i) => (
                <button
                  key={i}
                  onClick={() => handlePreset(i)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    activePreset === i
                      ? 'bg-primary-500 text-white shadow-sm'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
              <Select value={type} onChange={e => setType(e.target.value)}>
                <option value="">Все типы</option>
                {ALL_TYPES.map(t => <option key={t} value={t}>{TYPE_META[t].label}</option>)}
              </Select>
              <Select value={empId} onChange={e => setEmpId(e.target.value)}>
                <option value="">Все сотрудники</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.full_name || e.name}</option>)}
              </Select>
              <Input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setActivePreset(-1); }} />
              <div className="flex gap-2">
                <Input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setActivePreset(-1); }} containerClass="flex-1" />
                <button
                  onClick={resetFilters}
                  className="px-3 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800 transition-colors flex items-center justify-center"
                  title="Сбросить"
                >
                  <RotateCcw size={14} />
                </button>
              </div>
            </div>
          </div>

          {/* Content */}
          {loading ? (
            <div className="flex justify-center py-20"><Spinner size="lg" /></div>
          ) : !history.length ? (
            <div className="card flex flex-col items-center justify-center py-16 text-gray-400">
              <History size={40} className="mb-3 opacity-30" />
              <p className="text-sm">По выбранным фильтрам движений нет</p>
            </div>
          ) : (
            <div className="card overflow-hidden">
              <div className="hidden lg:flex items-center gap-3 px-4 py-2.5 border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wide font-medium">
                <div className={`${COL.time} flex-shrink-0`}>Время</div>
                <div className={`${COL.type} flex-shrink-0`}>Тип</div>
                <div className={`${COL.qty} flex-shrink-0 text-right`}>Кол-во</div>
                <div className={COL.route}>Откуда &rarr; Куда</div>
                <div className={`${COL.employee} flex-shrink-0 text-right`}>Сотрудник</div>
              </div>
              <div>
                {history.map(m => <MovementRow key={m.id} m={m} />)}
              </div>
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                <span className="text-xs text-gray-400">Стр. {page} из {totalPages} ({total} записей)</span>
                <div className="flex gap-1">
                  <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30 transition-colors">
                    <ChevronLeft size={16} />
                  </button>
                  <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30 transition-colors">
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

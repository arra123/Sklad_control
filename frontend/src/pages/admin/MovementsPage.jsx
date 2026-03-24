import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Activity, Search, ChevronLeft, ChevronRight, RotateCcw, ChevronDown, ChevronUp, Users, Package, CalendarDays, TrendingUp, Layers, UserCheck, ArrowRight, Clock, Filter } from 'lucide-react';
import api from '../../api/client';
import Spinner from '../../components/ui/Spinner';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';

const DASH = '—';

// ─── Movement types → Russian labels + colors ────────────────────────────────
const TYPE_META = {
  shelf_to_shelf:           { label: 'Полка \u2192 Полка',           cls: 'bg-blue-100 text-blue-700' },
  shelf_to_pallet:          { label: 'Полка \u2192 Паллет',          cls: 'bg-purple-100 text-purple-700' },
  pallet_to_shelf:          { label: 'Паллет \u2192 Полка',          cls: 'bg-green-100 text-green-700' },
  pallet_to_pallet:         { label: 'Паллет \u2192 Паллет',         cls: 'bg-indigo-100 text-indigo-700' },
  shelf_to_employee:        { label: 'Полка \u2192 Сотрудник',       cls: 'bg-orange-100 text-orange-700' },
  employee_to_shelf:        { label: 'Сотрудник \u2192 Полка',       cls: 'bg-teal-100 text-teal-700' },
  employee_to_pallet:       { label: 'Сотрудник \u2192 Паллет',      cls: 'bg-cyan-100 text-cyan-700' },
  pallet_to_employee:       { label: 'Паллет \u2192 Сотрудник',      cls: 'bg-amber-100 text-amber-700' },
  external_to_shelf:        { label: 'Приход на полку',              cls: 'bg-emerald-100 text-emerald-700' },
  external_to_pallet:       { label: 'Приход на паллет',             cls: 'bg-emerald-100 text-emerald-700' },
  external_to_employee:     { label: 'Выдача сотруднику',            cls: 'bg-amber-100 text-amber-700' },
  edit_add_to_shelf:        { label: 'Добавление на полку',          cls: 'bg-sky-100 text-sky-700' },
  edit_remove_from_shelf:   { label: 'Списание с полки',             cls: 'bg-red-100 text-red-700' },
  edit_add_to_pallet:       { label: 'Добавление на паллет',         cls: 'bg-indigo-100 text-indigo-700' },
  edit_remove_from_pallet:  { label: 'Списание с паллета',           cls: 'bg-rose-100 text-rose-700' },
  pallet_correction_in:     { label: 'Коррекция паллета +',          cls: 'bg-lime-100 text-lime-700' },
  pallet_correction_out:    { label: 'Коррекция паллета \u2212',     cls: 'bg-rose-100 text-rose-700' },
  employee_correction_in:   { label: 'Добавление сотруднику',        cls: 'bg-sky-100 text-sky-700' },
  employee_correction_out:  { label: 'Списание у сотрудника',        cls: 'bg-red-100 text-red-700' },
  employee_write_off:       { label: 'Списание у сотрудника',        cls: 'bg-red-100 text-red-700' },
  employee_writeoff:        { label: 'Списание у сотрудника',        cls: 'bg-red-100 text-red-700' },
  box_to_shelf:             { label: 'Коробка \u2192 Полка',         cls: 'bg-teal-100 text-teal-700' },
  box_to_pallet:            { label: 'Коробка \u2192 Паллет',        cls: 'bg-violet-100 text-violet-700' },
  shelf_to_box:             { label: 'Полка \u2192 Коробка',         cls: 'bg-fuchsia-100 text-fuchsia-700' },
  pallet_to_box:            { label: 'Паллет \u2192 Коробка',        cls: 'bg-fuchsia-100 text-fuchsia-700' },
  box_to_employee:          { label: 'Коробка \u2192 Сотрудник',     cls: 'bg-orange-100 text-orange-700' },
  employee_to_box:          { label: 'Сотрудник \u2192 Коробка',     cls: 'bg-cyan-100 text-cyan-700' },
  write_off:                { label: 'Списание',                     cls: 'bg-red-100 text-red-700' },
  manual_correction:        { label: 'Ручная коррекция',             cls: 'bg-amber-100 text-amber-700' },
};
const ALL_TYPES = Object.keys(TYPE_META);

// Fallback: translate English type to Russian
const WORD_MAP = {
  shelf: 'Полка', pallet: 'Паллет', employee: 'Сотрудник', box: 'Коробка',
  external: 'Внешний', edit: 'Ред.', add: 'Добавл.', remove: 'Списание',
  correction: 'Коррекция', write: 'Списание', off: '', to: '\u2192', from: 'из',
  in: '+', out: '\u2212', manual: 'Ручн.', transfer: 'Перенос', production: 'Производство',
  writeoff: 'Списание', stock: 'Склад',
};

function translateType(t) {
  return t.split('_').map(w => WORD_MAP[w] || w).filter(Boolean).join(' ');
}

function typeBadge(t) {
  const m = TYPE_META[t];
  if (m) return <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${m.cls}`}>{m.label}</span>;
  return <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 whitespace-nowrap">{translateType(t)}</span>;
}

function fmtQty(v) {
  const n = parseFloat(v);
  if (isNaN(n)) return v;
  return n % 1 === 0 ? String(Math.round(n)) : n.toFixed(1);
}

function fmtSource(m, dir) {
  const code = m[`${dir}_shelf_code`] || m[`${dir}_shelf_name`];
  const pal  = m[`${dir}_pallet_name`];
  const emp  = m[`${dir}_employee_name`];
  if (code) return `Полка ${code}`;
  if (pal)  return `Паллет ${pal}`;
  if (emp)  return emp;
  // Fallback: for corrections, show performer
  if (dir === 'from' && m.movement_type?.includes('correction') && m.performer_name) return m.performer_name;
  if (dir === 'to' && m.movement_type?.includes('correction') && m.performer_name) return m.performer_name;
  return null;
}

function fmtTime(iso) {
  if (!iso) return DASH;
  const d = new Date(iso), now = new Date();
  const hms = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  if (d.toDateString() === now.toDateString()) return hms;
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')} ${hms}`;
}

// ─── Quick date presets ──────────────────────────────────────────────────────
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

// ─── Stat Card ───────────────────────────────────────────────────────────────
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
        <p className="text-lg font-bold text-gray-900 dark:text-white">{value ?? DASH}</p>
      </div>
    </div>
  );
}

// ─── Column widths (shared between header & rows) ────────────────────────────
const COL = {
  time: 'w-[75px]',
  type: 'w-[170px]',
  product: 'flex-1 min-w-[120px]',
  qty: 'w-[80px]',
  route: 'w-[240px]',
  employee: 'w-[130px]',
};

// ─── Movement Row (expandable) ──────────────────────────────────────────────
function MovementRow({ m }) {
  const [open, setOpen] = useState(false);
  const from = fmtSource(m, 'from');
  const to = fmtSource(m, 'to');
  const date = m.created_at ? new Date(m.created_at) : null;

  return (
    <div className="border-b border-gray-50 dark:border-gray-800 last:border-0">
      <div className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer"
        onClick={() => setOpen(!open)}>
        {/* Time */}
        <div className={`${COL.time} flex-shrink-0`}>
          <p className="text-xs font-mono text-gray-500">{fmtTime(m.created_at)}</p>
        </div>

        {/* Type badge */}
        <div className={`${COL.type} flex-shrink-0`}>
          {typeBadge(m.movement_type)}
        </div>

        {/* Product */}
        <div className={COL.product}>
          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{m.product_name || DASH}</p>
        </div>

        {/* Quantity */}
        <div className={`${COL.qty} flex-shrink-0 text-right`}>
          <span className="text-sm font-bold text-gray-900 dark:text-white">{fmtQty(m.quantity)} <span className="text-gray-400 font-normal text-xs">шт.</span></span>
        </div>

        {/* From → To */}
        <div className={`${COL.route} flex-shrink-0 flex items-center gap-1.5 min-w-0`}>
          <span className="text-xs text-gray-500 truncate max-w-[100px]" title={from || DASH}>{from || DASH}</span>
          <ArrowRight size={12} className="text-gray-300 flex-shrink-0" />
          <span className="text-xs text-gray-700 dark:text-gray-300 truncate max-w-[100px] font-medium" title={to || DASH}>{to || DASH}</span>
        </div>

        {/* Performer */}
        <div className={`${COL.employee} flex-shrink-0 text-right`}>
          <p className="text-xs text-gray-400 truncate" title={m.performer_name || m.performed_by_name || ''}>{m.performer_name || m.performed_by_name || DASH}</p>
        </div>

        <ChevronDown size={14} className={`text-gray-300 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>

      {/* Expanded detail */}
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

// ─── By-Employee View ────────────────────────────────────────────────────────
function ByEmployeeView({ history }) {
  const [expanded, setExpanded] = useState(new Set());

  const grouped = {};
  for (const m of history) {
    const name = m.performer_name || m.performed_by_name || 'Неизвестный';
    const key = m.performed_by || name;
    if (!grouped[key]) grouped[key] = { name, items: [], totalQty: 0 };
    grouped[key].items.push(m);
    grouped[key].totalQty += parseFloat(m.quantity) || 0;
  }

  const entries = Object.entries(grouped).sort((a, b) => b[1].items.length - a[1].items.length);

  if (!entries.length) return <p className="text-center text-sm text-gray-400 py-10">Нет данных</p>;

  return (
    <div className="divide-y divide-gray-100">
      {entries.map(([key, g]) => {
        const isOpen = expanded.has(key);
        return (
          <div key={key}>
            <button
              onClick={() => setExpanded(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; })}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                <Users size={14} className="text-primary-600" />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{g.name}</p>
                <p className="text-xs text-gray-400">{g.items.length} операций &middot; {fmtQty(g.totalQty)} шт.</p>
              </div>
              {isOpen ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
            </button>
            {isOpen && (
              <div className="bg-gray-50/50">
                {g.items.map(m => <MovementRow key={m.id} m={m} />)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── By-Type View ────────────────────────────────────────────────────────────
function ByTypeView({ history }) {
  const [expanded, setExpanded] = useState(new Set());

  const grouped = {};
  for (const m of history) {
    const t = m.movement_type;
    if (!grouped[t]) grouped[t] = { items: [], totalQty: 0 };
    grouped[t].items.push(m);
    grouped[t].totalQty += parseFloat(m.quantity) || 0;
  }

  const entries = Object.entries(grouped).sort((a, b) => b[1].items.length - a[1].items.length);

  if (!entries.length) return <p className="text-center text-sm text-gray-400 py-10">Нет данных</p>;

  return (
    <div className="divide-y divide-gray-100">
      {entries.map(([type, g]) => {
        const isOpen = expanded.has(type);
        return (
          <div key={type}>
            <button
              onClick={() => setExpanded(prev => { const n = new Set(prev); n.has(type) ? n.delete(type) : n.add(type); return n; })}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
            >
              {typeBadge(type)}
              <div className="flex-1 min-w-0 text-left">
                <p className="text-xs text-gray-400">{g.items.length} операций &middot; {fmtQty(g.totalQty)} шт.</p>
              </div>
              {isOpen ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
            </button>
            {isOpen && (
              <div className="bg-gray-50/50">
                {g.items.map(m => <MovementRow key={m.id} m={m} />)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function MovementsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [view, setView] = useState(searchParams.get('view') || 'all');
  const [type, setType] = useState(searchParams.get('type') || '');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [empId, setEmpId] = useState(searchParams.get('employee') || '');
  const [activePreset, setActivePreset] = useState(-1);

  // Sync view/type/empId to URL
  useEffect(() => {
    setSearchParams(prev => {
      const p = new URLSearchParams(prev);
      if (view !== 'all') p.set('view', view); else p.delete('view');
      if (type) p.set('type', type); else p.delete('type');
      if (empId) p.set('employee', empId); else p.delete('employee');
      return p;
    }, { replace: true });
  }, [view, type, empId]);
  const limit = 50;
  const intervalRef = useRef(null);

  const fetchData = useCallback(async (p = page) => {
    try {
      const params = {};
      if (view === 'by_employee' || view === 'by_type') {
        params.limit = 10000;
        params.page = 1;
      } else {
        params.page = p;
        params.limit = limit;
      }
      if (search) params.search = search;
      if (type) params.movement_type = type;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      if (empId) params.employee_id = empId;
      const [hist, st] = await Promise.all([
        api.get('/movements/history', { params }),
        api.get('/movements/stats'),
      ]);
      const d = hist.data;
      setHistory(d.items || d.data || d);
      setTotal(d.total ?? (d.items || d.data || d).length);
      setStats(st.data);
    } catch { /* ignore */ }
    setLoading(false);
  }, [page, view, search, type, dateFrom, dateTo, empId]);

  useEffect(() => {
    api.get('/staff/employees').then(r => setEmployees(r.data?.items || r.data || [])).catch(() => {});
  }, []);

  useEffect(() => { setLoading(true); fetchData(page); }, [fetchData, page]);

  useEffect(() => {
    intervalRef.current = setInterval(() => fetchData(page), 30000);
    return () => clearInterval(intervalRef.current);
  }, [fetchData, page]);

  const resetFilters = () => { setSearch(''); setType(''); setDateFrom(''); setDateTo(''); setEmpId(''); setPage(1); setActivePreset(-1); };
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const s = stats || {};

  const handlePreset = (idx) => {
    const p = DATE_PRESETS[idx];
    setDateFrom(p.from());
    setDateTo(p.to());
    setActivePreset(idx);
    setPage(1);
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Activity size={24} className="text-primary-500" />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Перемещения</h1>
        <span className="relative flex h-2.5 w-2.5 ml-1">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
        </span>
        <span className="text-xs text-gray-400 ml-1">live</span>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <StatCard icon={CalendarDays} label="За сегодня" value={s.today ?? DASH} color="blue" />
        <StatCard icon={TrendingUp} label="За неделю" value={s.week ?? DASH} color="green" />
        <StatCard icon={Layers} label="За месяц" value={s.month ?? DASH} color="purple" />
        <StatCard icon={UserCheck} label="Сотрудников сегодня" value={s.today_users ?? DASH} color="amber" />
        <StatCard icon={Package} label="Товаров сегодня" value={s.today_products ?? DASH} color="primary" />
        <StatCard icon={Users} label="Полки / Палл. / Сотр." value={`${s.today_shelf ?? 0} / ${s.today_pallet ?? 0} / ${s.today_employee ?? 0}`} color="gray" />
      </div>

      {/* Filters */}
      <div className="card p-4 mb-6 space-y-3">
        {/* Date presets */}
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

        {/* Other filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
          <Input placeholder="Поиск по товару / сотруднику" icon={<Search size={14} />} value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
          <Select value={type} onChange={e => { setType(e.target.value); setPage(1); }}>
            <option value="">Все типы</option>
            {ALL_TYPES.map(t => <option key={t} value={t}>{TYPE_META[t].label}</option>)}
          </Select>
          <Select value={empId} onChange={e => { setEmpId(e.target.value); setPage(1); }}>
            <option value="">Все сотрудники</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.full_name || e.name}</option>)}
          </Select>
          <button onClick={resetFilters} className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2">
            <RotateCcw size={14} />
            Сбросить
          </button>
        </div>
      </div>

      {/* View tabs */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-xl p-1 w-fit">
        {[
          { key: 'all', label: 'Все логи', icon: Clock },
          { key: 'by_employee', label: 'По сотрудникам', icon: Users },
          { key: 'by_type', label: 'По типу', icon: Filter },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setView(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              view === tab.key
                ? 'bg-white text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <tab.icon size={14} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : !history.length ? (
        <div className="card flex flex-col items-center justify-center py-16 text-gray-400">
          <Activity size={40} className="mb-3 opacity-30" />
          <p className="text-sm">Нет перемещений</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          {view === 'all' ? (
            <>
              {/* Table header — same widths as MovementRow */}
              <div className="hidden lg:flex items-center gap-3 px-4 py-2.5 border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wide font-medium">
                <div className={`${COL.time} flex-shrink-0`}>Время</div>
                <div className={`${COL.type} flex-shrink-0`}>Тип</div>
                <div className={COL.product}>Товар</div>
                <div className={`${COL.qty} flex-shrink-0 text-right`}>Кол-во</div>
                <div className={`${COL.route} flex-shrink-0`}>Откуда &rarr; Куда</div>
                <div className={`${COL.employee} flex-shrink-0 text-right`}>Сотрудник</div>
              </div>
              {/* Rows */}
              <div>
                {history.map(m => <MovementRow key={m.id} m={m} />)}
              </div>
            </>
          ) : view === 'by_employee' ? (
            <ByEmployeeView history={history} />
          ) : (
            <ByTypeView history={history} />
          )}

          {/* Pagination — only for "all" view */}
          {view === 'all' && (
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
          )}
        </div>
      )}
    </div>
  );
}

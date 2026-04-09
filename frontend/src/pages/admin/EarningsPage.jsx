import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronRight, ChevronDown, RefreshCw, Search } from 'lucide-react';
import api from '../../api/client';
import Spinner from '../../components/ui/Spinner';
import { useToast } from '../../components/ui/Toast';

/* ─── Formatters ────────────────────────────────────────────────────────── */
function fmt(v) {
  const n = Number(v || 0);
  const abs = Math.abs(n);
  // adaptive precision: keep more decimals for small values (rates in ₽)
  const maxDigits = abs >= 100 ? 2 : abs >= 1 ? 2 : 4;
  const s = String(n);
  const d = s.includes('.') ? s.split('.')[1].length : 0;
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: Math.min(d, maxDigits) }).format(n);
}

/* ─── Periods ───────────────────────────────────────────────────────────── */
const PERIODS = [
  { value: 'today', label: 'Сегодня' },
  { value: 'week', label: 'Неделя' },
  { value: 'month', label: 'Месяц' },
  { value: 'all', label: 'Всё время' },
];

/* ─── Currency (GRA ⇄ ₽) ────────────────────────────────────────────────── */
const GRA_TO_RUB = 0.01; // 1 GRA = 0.01 ₽ (см. CLAUDE.md)
function convert(value, unit) {
  const n = Number(value || 0);
  return unit === 'rub' ? n * GRA_TO_RUB : n;
}
function unitLabel(unit) { return unit === 'rub' ? '₽' : 'GRA'; }

/* ─── Line Icons ────────────────────────────────────────────────────────── */
const IconCoin = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9"/><path d="M12 7v10"/><path d="M9 9.5C9 8.67 10.34 8 12 8s3 .67 3 1.5S13.66 11 12 11s-3 .67-3 1.5S10.34 14 12 14s3 .67 3 1.5c0 .83-1.34 1.5-3 1.5s-3-.67-3-1.5"/>
  </svg>
);
const IconUsers = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
  </svg>
);
const IconScan = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 7V5a2 2 0 012-2h2"/><path d="M17 3h2a2 2 0 012 2v2"/><path d="M21 17v2a2 2 0 01-2 2h-2"/><path d="M7 21H5a2 2 0 01-2-2v-2"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);
const IconTrend = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
  </svg>
);

/* ─── Stat Card ─────────────────────────────────────────────────────────── */
function Stat({ icon, label, value, color }) {
  return (
    <div className="bg-white/50 backdrop-blur-xl border border-white/75 rounded-[14px] px-4 py-3 flex items-center gap-3 min-w-0">
      <div className={`w-8 h-8 rounded-lg ${color || 'bg-primary-50 text-primary-600'} flex items-center justify-center flex-shrink-0`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-lg font-extrabold text-gray-900 truncate">{value}</p>
        <p className="text-[10px] text-gray-400 uppercase tracking-wider">{label}</p>
      </div>
    </div>
  );
}

/* ─── Rates Bar ─────────────────────────────────────────────────────────── */
const RATE_LABELS = {
  inventory: 'Инвентаризация',
  packaging: 'Оприходование',
  production_transfer: 'Перенос',
  assembly: 'Сборка',
};

function RatesBar({ rates, unit }) {
  if (!rates) return null;
  const entries = Object.entries(RATE_LABELS).filter(([k]) => rates[k] != null);
  if (entries.length === 0) return null;
  return (
    <div className="flex items-center gap-2 flex-wrap bg-white/50 backdrop-blur-xl border border-white/75 rounded-[14px] px-3 py-2 mb-4">
      <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mr-1">Ставка за скан</span>
      {entries.map(([key, label]) => (
        <div key={key} className="inline-flex items-center gap-1.5 bg-gray-50 border border-gray-100 rounded-full px-2.5 py-1">
          <span className="text-[11px] text-gray-500">{label}</span>
          <span className="text-[11px] font-bold text-amber-600">
            {fmt(convert(rates[key], unit))} {unitLabel(unit)}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════════════════ */
export default function EarningsPage() {
  const toast = useToast();
  const [sp, setSp] = useSearchParams();

  const period = sp.get('period') || 'all';
  const employeeId = sp.get('employee');
  const unit = sp.get('unit') === 'gra' ? 'gra' : 'rub';

  const [summary, setSummary] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [search, setSearch] = useState('');

  /* ─── Fetch summary ─────────────────────────────────────────────────── */
  const fetchSummary = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/earnings/summary', { params: { period } });
      setSummary(data);
    } catch (e) {
      toast.error('Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, [period, toast]);

  /* ─── Fetch employee detail ─────────────────────────────────────────── */
  const fetchDetail = useCallback(async (eid) => {
    setDetailLoading(true);
    try {
      const { data } = await api.get(`/earnings/employees/${eid}`, { params: { period } });
      setDetail(data);
    } catch (e) {
      toast.error('Ошибка загрузки сотрудника');
    } finally {
      setDetailLoading(false);
    }
  }, [period, toast]);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);
  useEffect(() => {
    if (employeeId) fetchDetail(employeeId);
    else setDetail(null);
  }, [employeeId, fetchDetail]);

  /* ─── URL helpers ───────────────────────────────────────────────────── */
  const update = (patch) => {
    const n = new URLSearchParams(sp);
    Object.entries(patch).forEach(([k, v]) => {
      if (v == null || v === '') n.delete(k); else n.set(k, v);
    });
    setSp(n, { replace: true });
  };
  const setPeriod = (p) => update({ period: p });
  const setUnit = (u) => update({ unit: u === 'gra' ? 'gra' : null });
  const selectEmployee = (eid) => update({ employee: eid });
  const clearEmployee = () => update({ employee: null });

  const ov = summary?.overview;
  const leaders = summary?.leaders || [];
  const rates = summary?.settings?.rates;

  /* ═══ RENDER ═══ */
  return (
    <div className="p-6 max-w-7xl mx-auto">

      {/* ─── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 mb-5 flex-wrap">
        <h1 className="text-2xl font-bold text-gray-900">Заработок</h1>

        <div className="flex items-center gap-1.5 flex-wrap">
          {PERIODS.map(p => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`px-3.5 py-1.5 rounded-[12px] text-sm font-medium transition-all border ${
                period === p.value
                  ? 'glass-btn text-primary-700 bg-primary-600/10 border-primary-600/25 shadow-sm backdrop-blur-xl'
                  : 'text-gray-500 bg-white/50 border-transparent hover:bg-white/70 hover:text-gray-700'
              }`}
            >
              {p.label}
            </button>
          ))}

          {/* GRA ⇄ ₽ */}
          <div className="ml-2 flex items-center bg-white/50 backdrop-blur-xl border border-gray-200 rounded-[12px] p-0.5">
            <button
              onClick={() => setUnit('gra')}
              className={`px-2.5 py-1 rounded-[9px] text-xs font-semibold transition-all ${
                unit === 'gra' ? 'bg-amber-500/15 text-amber-700 shadow-sm' : 'text-gray-400 hover:text-gray-600'
              }`}
            >GRA</button>
            <button
              onClick={() => setUnit('rub')}
              className={`px-2.5 py-1 rounded-[9px] text-xs font-semibold transition-all ${
                unit === 'rub' ? 'bg-green-500/15 text-green-700 shadow-sm' : 'text-gray-400 hover:text-gray-600'
              }`}
            >₽</button>
          </div>

          <button onClick={() => { fetchSummary(); if (employeeId) fetchDetail(employeeId); }} className="p-2 rounded-xl text-gray-400 hover:text-primary-600 hover:bg-white/70 transition-all">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : ov ? (
        <>
          {/* Stats row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <Stat icon={<IconCoin />} label={`Общий баланс ${unitLabel(unit)}`} value={fmt(convert(ov.total_current_balance, unit))} color="bg-amber-50 text-amber-600" />
            <Stat icon={<IconUsers />} label="Сотрудников" value={ov.employees_with_activity || 0} color="bg-primary-50 text-primary-600" />
            <Stat icon={<IconScan />} label="Сканов" value={fmt(ov.rewarded_scans)} color="bg-blue-50 text-blue-600" />
            <Stat icon={<IconTrend />} label={`Начислено ${unitLabel(unit)}`} value={fmt(convert(ov.total_awarded, unit))} color="bg-green-50 text-green-600" />
          </div>

          {/* Rates bar */}
          <RatesBar rates={rates} unit={unit} />

          {/* Two-pane: employee list + detail/leaderboard */}
          <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">

            {/* Left: employee list */}
            <div className="bg-white rounded-[18px] border border-gray-100 overflow-hidden flex flex-col max-h-[calc(100vh-280px)]">
              <div className="p-3 border-b border-gray-100 flex items-center gap-2">
                <div className="relative flex-1">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Поиск сотрудника..."
                    className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-100 rounded-[10px] text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:border-primary-300 focus:bg-white"
                  />
                </div>
                {employeeId && (
                  <button
                    onClick={clearEmployee}
                    className="text-[11px] font-semibold text-gray-400 hover:text-primary-600 px-2 py-1 rounded-md hover:bg-gray-50"
                    title="Показать сводку"
                  >
                    Сброс
                  </button>
                )}
              </div>
              <div className="overflow-y-auto flex-1">
                {leaders
                  .filter(emp => emp.full_name.toLowerCase().includes(search.toLowerCase()))
                  .map(emp => (
                    <button
                      key={emp.employee_id}
                      onClick={() => selectEmployee(emp.employee_id)}
                      className={`w-full text-left px-4 py-3 border-b border-gray-50 transition-colors ${
                        String(employeeId) === String(emp.employee_id)
                          ? 'bg-primary-50 border-l-2 border-l-primary-500'
                          : 'hover:bg-gray-50 border-l-2 border-l-transparent'
                      }`}
                    >
                      <p className="text-sm font-semibold text-gray-900 truncate">{emp.full_name}</p>
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="text-[11px] text-gray-400">{fmt(emp.rewarded_scans)} сканов</span>
                        <span className="text-xs font-bold text-green-600">{fmt(convert(emp.current_balance, unit))} {unitLabel(unit)}</span>
                      </div>
                    </button>
                  ))}
                {leaders.length === 0 && (
                  <p className="text-center text-sm text-gray-400 py-8">Нет данных</p>
                )}
              </div>
            </div>

            {/* Right: detail or leaderboard */}
            <div>
              {employeeId ? (
                detailLoading ? (
                  <div className="flex justify-center py-20"><Spinner /></div>
                ) : detail ? (
                  <EmployeeDetail detail={detail} unit={unit} />
                ) : null
              ) : (
                <>
                  <PayrollSummary payroll={summary?.payroll || []} unit={unit} />
                  <Leaderboard
                    leaders={leaders}
                    adjustments={summary?.recent_adjustments || []}
                    unit={unit}
                    onSelect={selectEmployee}
                  />
                </>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   PAYROLL SUMMARY
   ═══════════════════════════════════════════════════════════════════════════ */
function PayrollSummary({ payroll, unit }) {
  if (!payroll.length) return null;

  const active = payroll.filter(e => e.active);
  const fired = payroll.filter(e => !e.active);

  const sumGra = (arr) => arr.reduce((s, e) => s + Number(e.gra_balance || 0), 0);
  const totalActive = sumGra(active);
  const totalFired = sumGra(fired);
  const grandTotal = totalActive + totalFired;

  const sections = [
    { key: 'active', label: 'Активные сотрудники', employees: active, total: totalActive, color: 'text-green-600', bg: 'bg-green-50' },
    { key: 'fired', label: 'Уволенные', employees: fired, total: totalFired, color: 'text-rose-600', bg: 'bg-rose-50' },
  ].filter(s => s.employees.length > 0);

  return (
    <div className="bg-white rounded-[18px] border border-gray-100 overflow-hidden mb-4">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Расчёт выплат</h3>
        <span className="text-sm font-bold text-gray-900">{fmt(convert(grandTotal, unit))} {unitLabel(unit)}</span>
      </div>
      <div className="divide-y divide-gray-50">
        {sections.map(sec => (
          <div key={sec.key} className="px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{sec.label} ({sec.employees.length})</span>
              <span className={`text-sm font-bold ${sec.color}`}>{fmt(convert(sec.total, unit))} {unitLabel(unit)}</span>
            </div>
            <div className="space-y-1">
              {sec.employees.map(e => (
                <div key={e.id} className="flex items-center justify-between py-1">
                  <div className="min-w-0 flex-1">
                    <span className="text-sm text-gray-700 truncate block">{e.full_name}</span>
                    {e.position && <span className="text-[10px] text-gray-400">{e.position}</span>}
                  </div>
                  <span className={`text-xs font-semibold ${sec.color} flex-shrink-0 ml-2`}>{fmt(convert(e.gra_balance, unit))} {unitLabel(unit)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   LEADERBOARD (default right-pane)
   ═══════════════════════════════════════════════════════════════════════════ */
function Leaderboard({ leaders, adjustments, unit, onSelect }) {
  return (
    <>
      <div className="bg-white rounded-[18px] border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50">
          <h3 className="text-sm font-semibold text-gray-700">Лидеры</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-10">#</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Сотрудник</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Сканы</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Склад</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Сборка</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Текущий баланс</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {leaders.map((emp, i) => (
              <tr
                key={emp.employee_id}
                onClick={() => onSelect(emp.employee_id)}
                className={`group border-b border-gray-50 cursor-pointer transition-colors hover:bg-primary-50/30 ${
                  i < 3 ? 'bg-amber-50/20' : ''
                }`}
              >
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                    i === 0 ? 'bg-amber-100 text-amber-700' :
                    i === 1 ? 'bg-gray-200 text-gray-600' :
                    i === 2 ? 'bg-orange-100 text-orange-700' :
                    'text-gray-400'
                  }`}>{i + 1}</span>
                </td>
                <td className="px-4 py-3 font-medium text-gray-900">{emp.full_name}</td>
                <td className="px-4 py-3 text-right font-mono text-gray-600">{fmt(emp.rewarded_scans)}</td>
                <td className="px-4 py-3 text-right text-primary-600 font-semibold">{fmt(convert(emp.total_awarded, unit))}</td>
                <td className="px-4 py-3 text-right text-purple-600 font-semibold">{fmt(convert(emp.sborka_amount, unit))}</td>
                <td className="px-4 py-3 text-right font-bold text-green-600">{fmt(convert(emp.current_balance, unit))}</td>
                <td className="pr-3 text-gray-300 group-hover:text-primary-500 transition-colors">
                  <ChevronRight size={16} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {adjustments.length > 0 && (
        <div className="mt-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Корректировки</h3>
          <div className="space-y-2">
            {adjustments.slice(0, 5).map(adj => (
              <div key={adj.id} className="bg-white/50 backdrop-blur-xl border border-white/75 rounded-xl px-4 py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{adj.employee_name}</p>
                  <p className="text-xs text-gray-400 truncate">{adj.notes || '—'}</p>
                </div>
                <span className={`text-sm font-bold flex-shrink-0 ${Number(adj.amount_delta) >= 0 ? 'text-green-600' : 'text-rose-600'}`}>
                  {Number(adj.amount_delta) >= 0 ? '+' : ''}{fmt(convert(adj.amount_delta, unit))} {unitLabel(unit)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   EMPLOYEE DETAIL VIEW
   ═══════════════════════════════════════════════════════════════════════════ */
const TASK_TYPE_LABELS = {
  inventory: 'Инвентаризация',
  packaging: 'Оприходование',
  production_transfer: 'Перенос с производства',
  bundle_assembly: 'Сборка комплекта',
  returns: 'Возвраты',
};

function taskLocation(t) {
  if (t.shelf_code || t.shelf_name) return `${t.rack_name ? t.rack_name + ' · ' : ''}${t.shelf_code || t.shelf_name}`;
  if (t.pallet_name) return `${t.pallet_row_name ? t.pallet_row_name + ' · ' : ''}${t.pallet_name}`;
  return '—';
}

function EmployeeDetail({ detail, unit = 'gra' }) {
  const emp = detail.employee;
  const tasks = detail.tasks || [];
  const adjustments = detail.adjustments || [];
  const sborka = detail.sborka_picks || [];
  const liveEvents = detail.sborka_live_events || [];
  const [expandedDay, setExpandedDay] = useState(null);

  const dailyData = useMemo(() => {
    const byDate = {};
    const ensure = (date) => {
      if (!byDate[date]) byDate[date] = {
        date, scans: 0, tasks: 0, warehouse: 0, sborka: 0,
        pickCount: 0, orderCount: 0,
        taskItems: [], sborkaItems: [], liveOrders: [], livePicks: [],
      };
      return byDate[date];
    };

    tasks.forEach(t => {
      const date = t.last_earned_at ? new Date(t.last_earned_at).toLocaleDateString('ru-RU') : 'Без даты';
      const d = ensure(date);
      d.scans += Number(t.rewarded_scans || 0);
      d.tasks += 1;
      d.warehouse += Number(t.amount_earned || 0);
      d.taskItems.push(t);
    });

    sborka.forEach(s => {
      const date = s.created_at ? new Date(s.created_at).toLocaleDateString('ru-RU') : 'Без даты';
      const d = ensure(date);
      d.sborka += Number(s.amount_delta || 0);
      d.sborkaItems.push(s);
      // Count orders from collects (authoritative source — more complete than live_events)
      if (s.event_type === 'external_order_collect') {
        d.orderCount += 1;
      }
    });

    // Live sborka events — for expanded order list (order_id, product_name, time)
    liveEvents.forEach(e => {
      const date = e.created_at ? new Date(e.created_at).toLocaleDateString('ru-RU') : 'Без даты';
      const d = ensure(date);
      if (e.event_type === 'pick') {
        d.pickCount += 1;
        d.livePicks.push(e);
      } else if (e.event_type === 'order_complete') {
        d.liveOrders.push(e);
      }
    });

    return Object.values(byDate).sort((a, b) => {
      const da = a.date.split('.').reverse().join('-');
      const db = b.date.split('.').reverse().join('-');
      return db.localeCompare(da);
    });
  }, [tasks, sborka, liveEvents]);

  const totalSborka = Number(emp?.sborka_amount || 0);
  const totalOrders = sborka.filter(s => s.event_type === 'external_order_collect').length;

  return (
    <>
      <div className="mb-4">
        <h2 className="text-xl font-bold text-gray-900">{emp?.full_name}</h2>
        <p className="text-xs text-gray-400">Статистика за выбранный период</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <Stat icon={<IconCoin />} label={`Текущий баланс ${unitLabel(unit)}`} value={fmt(convert(emp?.current_balance, unit))} color="bg-green-50 text-green-600" />
        <Stat icon={<IconScan />} label="Сканов" value={fmt(emp?.rewarded_scans)} color="bg-blue-50 text-blue-600" />
        <Stat icon={<IconTrend />} label={`Склад ${unitLabel(unit)}`} value={fmt(convert(emp?.total_awarded, unit))} color="bg-primary-50 text-primary-600" />
        <Stat icon={<IconCoin />} label={`Сборка ${unitLabel(unit)}`} value={fmt(convert(totalSborka, unit))} color="bg-purple-50 text-purple-600" />
        <Stat icon={<IconScan />} label="Заказов собрано" value={fmt(totalOrders)} color="bg-fuchsia-50 text-fuchsia-600" />
      </div>

      {dailyData.length > 0 && (
        <div className="bg-white rounded-[18px] border border-gray-100 overflow-hidden mb-5">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50">
            <h3 className="text-sm font-semibold text-gray-700">По дням</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="w-8"></th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Дата</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Сканы</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Задачи</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Заказов</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Склад</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Сборка</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Итого</th>
              </tr>
            </thead>
            <tbody>
              {dailyData.map(day => {
                const isOpen = expandedDay === day.date;
                return (
                  <Fragment key={day.date}>
                    <tr
                      onClick={() => setExpandedDay(isOpen ? null : day.date)}
                      className={`border-b border-gray-50 cursor-pointer transition-colors ${isOpen ? 'bg-primary-50/30' : 'hover:bg-gray-50/50'}`}
                    >
                      <td className="pl-3 text-gray-400">
                        {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">{day.date}</td>
                      <td className="px-3 py-3 text-right font-mono text-gray-600">{fmt(day.scans)}</td>
                      <td className="px-3 py-3 text-right text-gray-600">{day.tasks}</td>
                      <td className="px-3 py-3 text-right text-purple-600 font-semibold">{day.orderCount || 0}</td>
                      <td className="px-3 py-3 text-right text-primary-600 font-semibold">{fmt(convert(day.warehouse, unit))}</td>
                      <td className="px-3 py-3 text-right text-purple-600 font-semibold">{fmt(convert(day.sborka, unit))}</td>
                      <td className="px-3 py-3 text-right font-bold text-gray-900">{fmt(convert(day.warehouse + day.sborka, unit))}</td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-gray-50/40 border-b border-gray-100">
                        <td></td>
                        <td colSpan={7} className="px-4 py-3">
                          {day.taskItems.length === 0 && day.sborkaItems.length === 0 && day.liveOrders.length === 0 && (
                            <p className="text-xs text-gray-400">Нет детализации</p>
                          )}
                          {day.taskItems.length > 0 && (
                            <div className="mb-2">
                              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Задачи склада</p>
                              <div className="space-y-1">
                                {day.taskItems.map((t, i) => (
                                  <div key={(t.task_id || 'x') + '-' + i} className="flex items-center justify-between gap-3 bg-white rounded-lg border border-gray-100 px-3 py-2">
                                    <div className="min-w-0 flex-1">
                                      <p className="text-sm font-medium text-gray-900 truncate">{t.title}</p>
                                      <p className="text-[11px] text-gray-400 truncate">
                                        {TASK_TYPE_LABELS[t.task_type] || t.task_type} · {taskLocation(t)}
                                      </p>
                                    </div>
                                    <div className="text-right flex-shrink-0">
                                      <p className="text-sm font-bold text-primary-600">{fmt(convert(t.amount_earned, unit))} {unitLabel(unit)}</p>
                                      <p className="text-[11px] text-gray-400">{fmt(t.rewarded_scans)} сканов</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {day.sborkaItems.length > 0 && (
                            <div className="mb-2">
                              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Начисления за сборку</p>
                              <div className="space-y-1">
                                {day.sborkaItems.map(s => (
                                  <div key={s.id} className="flex items-center justify-between gap-3 bg-white rounded-lg border border-gray-100 px-3 py-2">
                                    <div className="min-w-0 flex-1">
                                      <p className="text-sm font-medium text-gray-900 truncate">
                                        {s.source_product_name || s.source_entity_name || 'Сборка'}
                                      </p>
                                      <p className="text-[11px] text-gray-400 truncate">
                                        {[s.source_marketplace, s.source_store_name, s.source_article].filter(Boolean).join(' · ') || '—'}
                                      </p>
                                    </div>
                                    <div className="text-right flex-shrink-0">
                                      <p className="text-sm font-bold text-purple-600">+{fmt(convert(s.amount_delta, unit))} {unitLabel(unit)}</p>
                                      <p className="text-[11px] text-gray-400">{new Date(s.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {day.liveOrders.length > 0 && (
                            <div>
                              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                                Заказы собраны ({day.liveOrders.length})
                              </p>
                              <div className="space-y-1 max-h-[260px] overflow-y-auto">
                                {day.liveOrders.map(o => (
                                  <div key={o.id} className="flex items-center justify-between gap-3 bg-white rounded-lg border border-gray-100 px-3 py-2">
                                    <div className="min-w-0 flex-1">
                                      <p className="text-sm font-medium text-gray-900 truncate">{o.order_id || '—'}</p>
                                      <p className="text-[11px] text-gray-400 truncate">
                                        {(o.marketplace || '—').toUpperCase()}{o.product_name ? ' · ' + o.product_name : ''}
                                      </p>
                                    </div>
                                    <div className="text-right flex-shrink-0">
                                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-green-50 text-green-600">готов</span>
                                      <p className="text-[11px] text-gray-400 mt-0.5">{new Date(o.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {adjustments.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Корректировки</h3>
          <div className="space-y-2">
            {adjustments.map(adj => (
              <div key={adj.id} className="bg-white/50 backdrop-blur-xl border border-white/75 rounded-xl px-4 py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs text-gray-400">{new Date(adj.created_at).toLocaleString('ru-RU')} · {adj.changed_by_username}</p>
                  <p className="text-sm text-gray-600 truncate">{adj.notes || '—'}</p>
                </div>
                <span className={`text-sm font-bold flex-shrink-0 ${Number(adj.amount_delta) >= 0 ? 'text-green-600' : 'text-rose-600'}`}>
                  {Number(adj.amount_delta) >= 0 ? '+' : ''}{fmt(convert(adj.amount_delta, unit))} {unitLabel(unit)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {dailyData.length === 0 && adjustments.length === 0 && (
        <div className="bg-white rounded-[18px] border border-gray-100 py-16 text-center text-gray-400">
          <p className="text-lg font-semibold mb-1">Нет данных</p>
          <p className="text-sm">За выбранный период нет начислений</p>
        </div>
      )}
    </>
  );
}

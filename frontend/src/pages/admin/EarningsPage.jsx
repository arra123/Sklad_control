import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { GRACoinIcon, WalletIcon, ScannerIcon, OrderPickIcon, TrendUpIcon, AdjustIcon, RateGearIcon } from '../../components/ui/WarehouseIcons';
import api from '../../api/client';
import Button from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';
import { useToast } from '../../components/ui/Toast';

function fmtGra(value) {
  const amount = Number(value || 0);
  // Определяем реальное количество знаков (до 6, без лишних нулей)
  const str = String(amount);
  const dec = str.includes('.') ? str.split('.')[1].length : 0;
  return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: Math.min(dec, 6) }).format(amount);
}

function fmtRub(value) {
  const gra = Number(value || 0);
  const rub = gra / 100;
  // Показываем реальное значение без округления (до 6 знаков)
  const str = String(rub);
  const dec = str.includes('.') ? str.split('.')[1].length : 0;
  return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: Math.min(dec, 2), maximumFractionDigits: Math.min(dec, 6) }).format(rub);
}

function fmtRubRate(value) {
  const gra = Number(value || 0);
  const rub = gra / 100;
  const str = String(rub);
  const dec = str.includes('.') ? str.split('.')[1].length : 0;
  return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: Math.min(dec, 3), maximumFractionDigits: Math.min(dec, 6) }).format(rub);
}

function fmtDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtShort(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}

// ─── Balance Modal ───────────────────────────────────────────────────────────
function BalanceAdjustModal({ employee, onClose, onSubmit, saving }) {
  const [newBalance, setNewBalance] = useState(String(Number(employee?.current_balance || 0)));
  const [notes, setNotes] = useState('');
  useEffect(() => { setNewBalance(String(Number(employee?.current_balance || 0))); setNotes(''); }, [employee]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-5" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-gray-900">Изменить баланс</h3>
        <p className="text-sm text-gray-500 mt-1">{employee?.full_name}</p>
        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Новый текущий баланс</label>
            <input type="number" min="0" step="0.001" value={newBalance} onChange={e => setNewBalance(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-primary-400 focus:ring-2 focus:ring-primary-100 focus:outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Причина изменения</label>
            <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-primary-400 focus:ring-2 focus:ring-primary-100 focus:outline-none resize-none"
              placeholder="Например: выплата за март" />
          </div>
        </div>
        <div className="mt-5 flex gap-3">
          <Button variant="ghost" className="flex-1" onClick={onClose}>Отмена</Button>
          <Button className="flex-1" loading={saving} onClick={() => onSubmit({ newBalance, notes })}>Сохранить</Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function EarningsPage() {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const tab = searchParams.get('tab') || 'summary';
  const selectedEmployeeId = searchParams.get('employee') || null;
  const selectedTaskId = searchParams.get('task') || null;
  const detailTab = searchParams.get('dtab') || 'sklad';

  const setTab = useCallback((v) => setSearchParams(prev => { const p = new URLSearchParams(prev); p.set('tab', v); return p; }, { replace: true }), [setSearchParams]);
  const setSelectedEmployeeId = useCallback((v) => {
    if (typeof v === 'function') {
      setSearchParams(prev => { const p = new URLSearchParams(prev); const cur = p.get('employee') || null; const next = v(cur); if (next) p.set('employee', next); else p.delete('employee'); return p; }, { replace: true });
    } else {
      setSearchParams(prev => { const p = new URLSearchParams(prev); if (v) p.set('employee', v); else p.delete('employee'); return p; }, { replace: true });
    }
  }, [setSearchParams]);
  const setSelectedTaskId = useCallback((v) => setSearchParams(prev => { const p = new URLSearchParams(prev); if (v) p.set('task', v); else p.delete('task'); return p; }, { replace: true }), [setSearchParams]);
  const setDetailTab = useCallback((v) => setSearchParams(prev => { const p = new URLSearchParams(prev); p.set('dtab', v); return p; }, { replace: true }), [setSearchParams]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [employeeDetails, setEmployeeDetails] = useState(null);
  const [employeeLoading, setEmployeeLoading] = useState(false);
  const [taskDetails, setTaskDetails] = useState(null);
  const [taskLoading, setTaskLoading] = useState(false);
  const [rateDraft, setRateDraft] = useState('10');
  const [savingRate, setSavingRate] = useState(false);
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [savingBalance, setSavingBalance] = useState(false);
  const [expandedTask, setExpandedTask] = useState(null);
  const [showRub, setShowRub] = useState(false);
  const [period, setPeriod] = useState('all');
  const fmt = (v) => showRub ? fmtRub(v) : fmtGra(v);
  const fmtRate = (v) => showRub ? fmtRubRate(v) : fmtGra(v);
  const unit = showRub ? '₽' : 'GRA';

  const loadBase = useCallback(async (background = false) => {
    if (background) setRefreshing(true); else setLoading(true);
    try {
      const [summaryRes, employeesRes] = await Promise.all([api.get('/earnings/summary'), api.get('/earnings/employees')]);
      setSummary(summaryRes.data);
      setEmployees(employeesRes.data || []);
      setRateDraft(String(summaryRes.data?.settings?.gra_inventory_scan_rate ?? 10));
      setSelectedEmployeeId(prev => {
        if (prev && (employeesRes.data || []).some(item => Number(item.employee_id) === Number(prev))) return prev;
        return employeesRes.data?.[0]?.employee_id || null;
      });
    } catch (err) { toast.error(err.response?.data?.error || 'Не удалось загрузить'); }
    finally { if (background) setRefreshing(false); else setLoading(false); }
  }, [toast]);

  const employeeAbort = useRef(null);
  const taskAbort = useRef(null);

  const loadEmployeeDetails = useCallback(async (employeeId, p) => {
    if (employeeAbort.current) employeeAbort.current.abort();
    if (!employeeId) { setEmployeeDetails(null); return; }
    const ctrl = new AbortController();
    employeeAbort.current = ctrl;
    setEmployeeLoading(true);
    try {
      const res = await api.get(`/earnings/employees/${employeeId}`, { signal: ctrl.signal, params: { period: p || period } });
      setEmployeeDetails(res.data);
    } catch (err) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
      toast.error(err.response?.data?.error || 'Ошибка');
    } finally { if (!ctrl.signal.aborted) setEmployeeLoading(false); }
  }, [toast]);

  const loadTaskDetails = useCallback(async (taskId) => {
    if (taskAbort.current) taskAbort.current.abort();
    if (!taskId) { setTaskDetails(null); return; }
    const ctrl = new AbortController();
    taskAbort.current = ctrl;
    setTaskLoading(true);
    try {
      const res = await api.get(`/earnings/tasks/${taskId}`, { signal: ctrl.signal });
      setTaskDetails(res.data);
    } catch (err) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
      toast.error(err.response?.data?.error || 'Ошибка');
    } finally { if (!ctrl.signal.aborted) setTaskLoading(false); }
  }, [toast]);

  useEffect(() => { loadBase(); }, [loadBase]);
  useEffect(() => {
    setSearchParams(prev => { const p = new URLSearchParams(prev); p.delete('task'); p.set('dtab', 'sklad'); return p; }, { replace: true });
    setEmployeeDetails(null); setTaskDetails(null); setExpandedTask(null);
    if (selectedEmployeeId) loadEmployeeDetails(selectedEmployeeId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEmployeeId, loadEmployeeDetails]);
  useEffect(() => { if (selectedTaskId) loadTaskDetails(selectedTaskId); }, [selectedTaskId, loadTaskDetails]);
  useEffect(() => { if (selectedEmployeeId) loadEmployeeDetails(selectedEmployeeId, period); }, [period]);

  const selectedEmployee = useMemo(() => {
    if (!selectedEmployeeId) return null;
    return employees.find(item => Number(item.employee_id) === Number(selectedEmployeeId)) || employeeDetails?.employee || null;
  }, [employees, employeeDetails, selectedEmployeeId]);

  const saveRate = async () => {
    const numeric = Number.parseFloat(String(rateDraft).replace(',', '.'));
    if (!Number.isFinite(numeric) || numeric < 0) { toast.error('Укажите корректную ставку'); return; }
    setSavingRate(true);
    try { await api.put('/settings', { gra_inventory_scan_rate: numeric }); toast.success('Ставка сохранена'); await loadBase(true); }
    catch (err) { toast.error(err.response?.data?.error || 'Ошибка'); }
    finally { setSavingRate(false); }
  };

  const saveBalance = async ({ newBalance, notes }) => {
    const numeric = Number.parseFloat(String(newBalance).replace(',', '.'));
    if (!Number.isFinite(numeric) || numeric < 0) { toast.error('Укажите корректный баланс'); return; }
    if (!notes.trim()) { toast.error('Укажите причину'); return; }
    if (!selectedEmployee) return;
    setSavingBalance(true);
    try {
      await api.post(`/earnings/employees/${selectedEmployee.employee_id}/set-balance`, { new_balance: numeric, notes });
      toast.success('Баланс обновлён'); setAdjustModalOpen(false);
      await Promise.all([loadBase(true), loadEmployeeDetails(selectedEmployee.employee_id)]);
    } catch (err) { toast.error(err.response?.data?.error || 'Ошибка'); }
    finally { setSavingBalance(false); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>;

  const overview = summary?.overview || {};
  const leaders = summary?.leaders || [];
  const recentAdjustments = summary?.recent_adjustments || [];
  const employeeTasks = employeeDetails?.tasks || [];
  const employeeAdjustments = employeeDetails?.adjustments || [];
  const sborkaPicks = employeeDetails?.sborka_picks || [];

  const TASK_TYPE_LABELS = { inventory: 'Инвентаризация', packaging: 'Оприходование', production_transfer: 'Перенос', bundle_assembly: 'Сборка', inventory_scan: 'Сканирование' };
  const taskLocation = (t) => {
    if (t.shelf_code) return `${t.rack_name || t.rack_code || 'Стеллаж'} · ${t.shelf_name || t.shelf_code}`;
    if (t.pallet_name) return `${t.pallet_row_name || 'Ряд'} · ${t.pallet_name}`;
    return TASK_TYPE_LABELS[t.task_type] || '—';
  };

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center"><GRACoinIcon size={24} /></div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Заработок</h1>
            <p className="text-xs text-gray-400">GRACoin — система вознаграждений</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-gray-100 rounded-xl p-1 gap-0.5">
            {[['summary', 'Сводка'], ['history', 'История'], ['settings', 'Настройки']].map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${tab === k ? 'bg-white shadow-sm text-gray-900 font-semibold' : 'text-gray-500 hover:text-gray-700'}`}>{l}</button>
            ))}
          </div>
          <button onClick={() => setShowRub(!showRub)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${showRub ? 'bg-green-50 border-green-200 text-green-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
            {showRub ? '₽ рубли' : 'G GRACoin'}
          </button>
          <button onClick={() => loadBase(true)} className="p-2 rounded-xl text-gray-400 hover:text-primary-500 hover:bg-primary-50 transition-all">
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ═══ СВОДКА ═══ */}
      {tab === 'summary' && (
        <>
          <div className="grid grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            {[
              { Icon: GRACoinIcon, label: 'Сотрудников', value: overview.employees_with_activity || 0, bg: 'bg-purple-50' },
              { Icon: WalletIcon, label: `Баланс ${unit}`, value: fmt(overview.total_current_balance), color: 'text-green-600', bg: 'bg-green-50' },
              { Icon: ScannerIcon, label: 'Сканов', value: fmtGra(overview.rewarded_scans || 0), bg: 'bg-blue-50' },
              { Icon: TrendUpIcon, label: 'Начислено', value: `${fmt(overview.total_awarded)} ${unit}`, bg: 'bg-emerald-50' },
              { Icon: OrderPickIcon, label: 'Сборки', value: `${fmt(overview.total_sborka_amount)} ${unit}`, hint: `${fmtGra(overview.total_sborka_units || 0)} пиков`, bg: 'bg-pink-50' },
              { Icon: RateGearIcon, label: 'Ставка', value: `${fmtRate(summary?.settings?.gra_inventory_scan_rate || 0)} ${unit}`, color: 'text-amber-600', bg: 'bg-amber-50' },
            ].map((s, i) => (
              <div key={i} className="bg-white rounded-2xl p-4 border border-gray-100">
                <div className={`w-8 h-8 rounded-lg ${s.bg} flex items-center justify-center mb-2`}><s.Icon size={20} /></div>
                <p className={`text-2xl font-black ${s.color || 'text-gray-900'}`}>{s.value}</p>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider">{s.label}</p>
                {s.hint && <p className="text-[9px] text-gray-300">{s.hint}</p>}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Leaders table */}
            <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
                <GRACoinIcon size={18} />
                <h2 className="font-bold text-gray-900 text-sm">Лидеры по балансу</h2>
              </div>
              {leaders.length === 0 ? (
                <div className="text-center py-12 text-gray-400"><p className="font-medium">Начислений ещё нет</p></div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50/60">
                      {['#', 'Сотрудник', 'Сканы', 'Задачи', 'Склад', 'Сборки', 'Баланс'].map((h, i) => (
                        <th key={h} className={`${i <= 1 ? 'text-left' : 'text-right'} px-3 py-2.5 text-[10px] font-semibold text-gray-400 uppercase ${i === 0 ? 'w-12 px-4' : ''} ${i === 6 ? 'px-4' : ''}`}>{h}</th>
                      ))}
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {leaders.map((item, index) => (
                      <tr key={item.employee_id} onClick={() => { setSearchParams(prev => { const p = new URLSearchParams(prev); p.set('tab', 'history'); if (item.employee_id) p.set('employee', item.employee_id); return p; }, { replace: true }); }}
                        className="hover:bg-primary-50/30 cursor-pointer transition-colors">
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex w-6 h-6 rounded-full items-center justify-center text-xs font-black ${index === 0 ? 'bg-amber-100 text-amber-700' : index === 1 ? 'bg-gray-200 text-gray-600' : index === 2 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'}`}>{index + 1}</span>
                        </td>
                        <td className="px-3 py-3 font-semibold text-gray-900">{item.full_name}</td>
                        <td className="px-3 py-3 text-right text-gray-600">{fmtGra(item.rewarded_scans || 0)}</td>
                        <td className="px-3 py-3 text-right text-gray-600">{item.rewarded_tasks_count || 0}</td>
                        <td className="px-3 py-3 text-right text-blue-600 font-semibold">{fmt(item.total_awarded)}</td>
                        <td className="px-3 py-3 text-right text-pink-600 font-semibold">{fmt(item.sborka_amount || 0)}</td>
                        <td className="px-4 py-3 text-right font-black text-green-600">{fmt(item.current_balance)}</td>
                        <td className="pr-3"><ChevronRight size={14} className="text-gray-300" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Adjustments */}
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
                <AdjustIcon size={18} />
                <h2 className="font-bold text-gray-900 text-sm">Корректировки</h2>
              </div>
              {recentAdjustments.length === 0 ? (
                <div className="text-center py-12 text-gray-400"><p className="font-medium">Ручных правок не было</p></div>
              ) : (
                <div className="divide-y divide-gray-50 max-h-[400px] overflow-y-auto">
                  {recentAdjustments.map(item => (
                    <div key={item.id} className="px-4 py-3 hover:bg-gray-50/50 transition-colors">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-gray-800">{item.employee_name}</p>
                        <span className={`text-sm font-black ${Number(item.amount_delta) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {Number(item.amount_delta) >= 0 ? '+' : ''}{fmt(item.amount_delta)} {unit}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-400 mt-0.5">{fmtDateTime(item.created_at)} · {item.changed_by_username || 'система'}</p>
                      {item.notes && <p className="text-[11px] text-gray-500 mt-0.5">{item.notes}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ═══ ИСТОРИЯ ═══ */}
      {tab === 'history' && (
        <div className="flex gap-5">
          {/* Sidebar */}
          <div className="w-72 flex-shrink-0 bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Сотрудники</h3>
            </div>
            {employees.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">Нет данных</div>
            ) : (
              <div className="max-h-[70vh] overflow-y-auto divide-y divide-gray-50">
                {employees.map(item => (
                  <button key={item.employee_id} onClick={() => setSelectedEmployeeId(item.employee_id)}
                    className={`w-full px-4 py-3 text-left transition-colors border-l-[3px] ${Number(selectedEmployeeId) === Number(item.employee_id) ? 'bg-primary-50 border-primary-500' : 'border-transparent hover:bg-gray-50'}`}>
                    <div className="flex justify-between items-baseline">
                      <p className={`text-sm ${Number(selectedEmployeeId) === Number(item.employee_id) ? 'font-bold text-gray-900' : 'font-medium text-gray-700'}`}>{item.full_name}</p>
                      <p className="text-sm font-black text-green-600">{fmt(item.current_balance)}</p>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {fmtGra(item.rewarded_scans || 0)} скан · {item.rewarded_tasks_count || 0} задач
                      {Number(item.sborka_amount) > 0 && ` · сборки: ${fmt(item.sborka_amount)}`}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Detail */}
          <div className="flex-1 space-y-4 min-w-0 min-h-[70vh]">
            {!selectedEmployee ? (
              <div className="bg-white rounded-2xl border border-gray-100 text-center py-16 text-gray-400">
                <p className="font-medium">Выберите сотрудника</p>
              </div>
            ) : (
              <>
                {/* Employee header card */}
                <div className="bg-white rounded-2xl border border-gray-100 p-5">
                  {employeeLoading && !employeeDetails ? (
                    <div className="flex items-center justify-center h-32"><Spinner size="md" /></div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h2 className="text-lg font-bold text-gray-900">{selectedEmployee.full_name}</h2>
                          <p className="text-xs text-gray-400">Последнее: {fmtDateTime(selectedEmployee.last_earned_at)}</p>
                        </div>
                        <button onClick={() => setAdjustModalOpen(true)} className="px-3 py-1.5 text-xs font-semibold text-primary-600 bg-primary-50 rounded-lg hover:bg-primary-100 transition-colors">Изменить баланс</button>
                      </div>
                      <div className="grid grid-cols-4 gap-3">
                        {[
                          { Icon: WalletIcon, label: 'Баланс', value: fmt(employeeDetails?.employee?.current_balance ?? selectedEmployee.current_balance), color: 'text-green-600', border: 'border-green-100', bg: 'bg-green-50' },
                          { Icon: ScannerIcon, label: 'Склад', value: fmt(employeeDetails?.employee?.total_awarded || 0), color: 'text-blue-600', border: 'border-blue-100', bg: 'bg-blue-50' },
                          { Icon: OrderPickIcon, label: 'Сборки', value: fmt(employeeDetails?.employee?.sborka_amount || 0), color: 'text-pink-600', border: 'border-pink-100', bg: 'bg-pink-50' },
                          { Icon: AdjustIcon, label: 'Корректировки', value: fmt(employeeDetails?.employee?.total_manual_adjustments || 0), color: 'text-amber-600', border: 'border-amber-100', bg: 'bg-amber-50' },
                        ].map((s, i) => (
                          <div key={i} className={`rounded-xl p-3 ${s.bg} border ${s.border}`}>
                            <div className="flex items-center gap-2 mb-1"><s.Icon size={16} /><span className="text-[10px] text-gray-500 uppercase">{s.label}</span></div>
                            <p className={`text-xl font-black ${s.color}`}>{s.value} <span className="text-xs font-semibold text-gray-400">{unit}</span></p>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* Sub tabs + period filter */}
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
                    {[['sklad', 'Склад'], ['orders', 'Заказы']].map(([k, l]) => (
                      <button key={k} onClick={() => setDetailTab(k)} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${detailTab === k ? 'bg-white shadow-sm text-gray-900 font-semibold' : 'text-gray-500'}`}>{l}</button>
                    ))}
                  </div>
                  <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
                    {[['all', 'Всё время'], ['month', 'Месяц'], ['week', 'Неделя'], ['today', 'Сегодня']].map(([k, l]) => (
                      <button key={k} onClick={() => setPeriod(k)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${period === k ? 'bg-white shadow-sm text-gray-900 font-semibold' : 'text-gray-500'}`}>{l}</button>
                    ))}
                  </div>
                </div>

                {/* Warehouse tasks */}
                {detailTab === 'sklad' && (
                  <div className="space-y-2">
                    {employeeLoading && !employeeDetails ? (
                      <div className="flex items-center justify-center py-16"><Spinner size="md" /></div>
                    ) : employeeTasks.length === 0 ? (
                      <div className="text-center py-12 text-gray-400 bg-white rounded-2xl border border-gray-100">Нет оплаченных задач</div>
                    ) : employeeTasks.map((task, idx) => {
                      const rowKey = task.row_key || `${task.task_id}-${idx}`;
                      const isExpanded = expandedTask === rowKey;
                      const typeColors = { inventory: 'bg-blue-100 text-blue-700', packaging: 'bg-purple-100 text-purple-700', production_transfer: 'bg-amber-100 text-amber-700', bundle_assembly: 'bg-green-100 text-green-700' };
                      return (
                        <div key={rowKey} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                          {/* Task row */}
                          <div onClick={() => { setSelectedTaskId(task.task_id); setExpandedTask(isExpanded ? null : rowKey); }}
                            className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50/50 transition-colors">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-gray-800 truncate">{task.title}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg ${typeColors[task.task_type] || 'bg-gray-100 text-gray-600'}`}>
                                  {TASK_TYPE_LABELS[task.task_type] || task.task_type}
                                </span>
                                {task.shelf_code && <span className="text-[10px] text-gray-400">{task.rack_name} · {task.shelf_name}</span>}
                                {task.pallet_name && <span className="text-[10px] text-gray-400">{task.pallet_row_name} · {task.pallet_name}</span>}
                                {!task.task_id && <span className="text-[10px] text-red-400">удалена</span>}
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-xs text-gray-400">{fmtGra(task.rewarded_scans)} сканов</p>
                            </div>
                            <div className="text-right flex-shrink-0 w-20">
                              <p className="text-sm font-black text-green-600">{fmt(task.amount_earned)}</p>
                              <p className="text-[10px] text-gray-300">{unit}</p>
                            </div>
                            <div className="flex-shrink-0 w-12 text-right">
                              <p className="text-[10px] text-gray-400">{fmtShort(task.last_earned_at)}</p>
                            </div>
                            <div className="flex-shrink-0">
                              {isExpanded ? <ChevronDown size={14} className="text-primary-400" /> : <ChevronRight size={14} className="text-gray-300" />}
                            </div>
                          </div>
                          {/* Expanded details */}
                          {isExpanded && task.task_id && (
                            <div className="border-t border-gray-100 bg-gray-50/30 px-4 py-3">
                              {taskLoading ? (
                                <div className="flex items-center justify-center py-6"><Spinner size="sm" /></div>
                              ) : !taskDetails ? null : (
                                <div className="space-y-2">
                                  {(taskDetails.scopes || []).map(scope => (
                                    <div key={scope.scope_key} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                                      <div className="bg-gray-50 px-3 py-1.5 flex items-center justify-between">
                                        <span className="text-[10px] font-bold text-gray-500">{scope.scope_label}</span>
                                        <span className="text-[10px] font-bold text-green-600">{fmt(scope.amount_earned)} {unit} · {fmtGra(scope.rewarded_scans)} сканов</span>
                                      </div>
                                      <div className="divide-y divide-gray-50 max-h-[200px] overflow-y-auto">
                                        {scope.scans.map((scan, si) => (
                                          <div key={scan.earning_id} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                                            <span className="text-gray-300 w-5 text-right">#{si + 1}</span>
                                            <span className="flex-1 text-gray-700 truncate">{scan.product_name || scan.scanned_value}</span>
                                            <span className="text-gray-400 font-mono text-[10px]">{scan.product_code || ''}</span>
                                            <span className="font-bold text-green-600">+{fmt(scan.amount_delta)}</span>
                                            <span className="text-gray-300 text-[10px]">{fmtGra(scan.reward_units)} × {fmtRate(scan.rate_per_unit)}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Orders */}
                {detailTab === 'orders' && (
                  <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
                      <OrderPickIcon size={18} />
                      <h2 className="font-bold text-gray-900 text-sm">Заказы (сборка OZ/WB)</h2>
                    </div>
                    {employeeLoading && !employeeDetails ? (
                      <div className="flex items-center justify-center h-40"><Spinner size="md" /></div>
                    ) : sborkaPicks.length === 0 ? (
                      <div className="text-center py-12 text-gray-400">Нет начислений за сборку</div>
                    ) : (
                      <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 sticky top-0">
                            <tr>
                              {['Дата', 'Маркетплейс', 'Магазин', 'Товар', 'Артикул', 'GRA', 'Пики'].map((h, i) => (
                                <th key={h} className={`${i >= 5 ? 'text-right' : 'text-left'} px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase`}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {sborkaPicks.map(pick => (
                              <tr key={pick.id} className="hover:bg-gray-50 transition-colors">
                                <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{fmtShort(pick.created_at)}</td>
                                <td className="px-4 py-2.5 text-gray-900 font-medium">{pick.source_marketplace || '—'}</td>
                                <td className="px-4 py-2.5 text-gray-600 truncate max-w-[160px]">{pick.source_store_name || '—'}</td>
                                <td className="px-4 py-2.5 text-gray-600 truncate max-w-[200px]">{pick.source_product_name || pick.source_entity_name || '—'}</td>
                                <td className="px-4 py-2.5 text-gray-500 font-mono text-xs">{pick.source_article || '—'}</td>
                                <td className="px-4 py-2.5 text-right font-bold text-green-600">+{fmt(pick.amount_delta)}</td>
                                <td className="px-4 py-2.5 text-right text-gray-600">{fmtGra(pick.reward_units)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* Adjustments for employee */}
                {employeeAdjustments.length > 0 && (
                  <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
                      <AdjustIcon size={18} />
                      <h2 className="font-bold text-gray-900 text-sm">Ручные корректировки</h2>
                    </div>
                    <div className="divide-y divide-gray-50 max-h-[200px] overflow-y-auto">
                      {employeeAdjustments.map(item => (
                        <div key={item.id} className="px-4 py-3">
                          <div className="flex items-center justify-between">
                            <span className={`text-sm font-black ${Number(item.amount_delta) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                              {Number(item.amount_delta) >= 0 ? '+' : ''}{fmt(item.amount_delta)} {unit}
                            </span>
                            <span className="text-xs text-gray-400">{fmtDateTime(item.created_at)}</span>
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">{fmt(item.balance_before)} → {fmt(item.balance_after)} {unit} · {item.changed_by_username || 'система'}</p>
                          {item.notes && <p className="text-xs text-gray-400 mt-0.5">{item.notes}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ═══ НАСТРОЙКИ ═══ */}
      {tab === 'settings' && (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-5">
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <div className="flex items-center gap-2 mb-4">
              <RateGearIcon size={22} />
              <h2 className="font-bold text-gray-900">Ставка начисления</h2>
            </div>
            <div className="max-w-md">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">GRACoin за 1 успешный скан товара</label>
              <input type="number" min="0" step="0.001" value={rateDraft} onChange={e => setRateDraft(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-primary-400 focus:ring-2 focus:ring-primary-100 focus:outline-none" />
            </div>
            <div className="mt-4 flex gap-3">
              <Button onClick={saveRate} loading={savingRate}>Сохранить ставку</Button>
              <Button variant="ghost" onClick={() => setRateDraft(String(summary?.settings?.gra_inventory_scan_rate ?? 10))}>Сбросить</Button>
            </div>
            <div className="mt-5 rounded-2xl bg-primary-50 border border-primary-100 p-4">
              <p className="text-sm font-semibold text-primary-700">Правило применения</p>
              <ul className="text-sm text-primary-700/90 mt-2 space-y-1.5">
                <li>Начисление только за успешные сканы товаров в инвентаризации.</li>
                <li>Сканы полок, паллет, коробок и ошибки ШК не оплачиваются.</li>
                <li>Новая ставка не пересчитывает старую историю.</li>
              </ul>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100">
              <h3 className="font-bold text-gray-900 text-sm">Конфигурация</h3>
            </div>
            <div className="p-5 space-y-3">
              {[
                { label: 'Ставка сейчас', value: `${fmtRate(summary?.settings?.gra_inventory_scan_rate || 0)} ${unit}` },
                { label: 'Сотрудников', value: overview.employees_with_activity || 0 },
                { label: 'Суммарный баланс', value: `${fmt(overview.total_current_balance)} ${unit}` },
              ].map((s, i) => (
                <div key={i} className="rounded-xl bg-gray-50 px-4 py-3">
                  <p className="text-xs text-gray-400">{s.label}</p>
                  <p className="text-lg font-bold text-gray-900">{s.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {adjustModalOpen && selectedEmployee && (
        <BalanceAdjustModal employee={selectedEmployee} saving={savingBalance} onClose={() => setAdjustModalOpen(false)} onSubmit={saveBalance} />
      )}
    </div>
  );
}

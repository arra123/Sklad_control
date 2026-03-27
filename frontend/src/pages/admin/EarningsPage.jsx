import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  ChevronRight,
  ClipboardList,
  Package,
  RefreshCw,
  ScanLine,
  Settings,
  ShoppingCart,
  Users,
} from 'lucide-react';
import api from '../../api/client';
import Button from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';
import { useToast } from '../../components/ui/Toast';

function fmtGra(value) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: amount % 1 === 0 ? 0 : 3,
  }).format(amount);
}

function fmtDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function StatCard({ icon: Icon, label, value, hint, tone = 'primary' }) {
  const tones = {
    primary: 'bg-primary-50 text-primary-600',
    green: 'bg-green-50 text-green-600',
    blue: 'bg-blue-50 text-blue-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600',
  };

  return (
    <div className="card p-4 flex items-start gap-3">
      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 ${tones[tone]}`}>
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-400">{label}</p>
        <p className="text-lg font-bold text-gray-900 mt-0.5 whitespace-nowrap">{value}</p>
        {hint ? <p className="text-xs text-gray-400 mt-0.5">{hint}</p> : null}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
        active
          ? 'bg-primary-600 text-white border-primary-600 shadow-sm'
          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
      }`}
    >
      {children}
    </button>
  );
}

function SectionEmpty({ title, hint }) {
  return (
    <div className="text-center py-12 text-gray-400">
      <p className="font-medium">{title}</p>
      {hint ? <p className="text-sm mt-1">{hint}</p> : null}
    </div>
  );
}

function BalanceAdjustModal({ employee, onClose, onSubmit, saving }) {
  const [newBalance, setNewBalance] = useState(String(Number(employee?.current_balance || 0)));
  const [notes, setNotes] = useState('');

  useEffect(() => {
    setNewBalance(String(Number(employee?.current_balance || 0)));
    setNotes('');
  }, [employee]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md card p-5" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-gray-900">Изменить баланс</h3>
        <p className="text-sm text-gray-500 mt-1">{employee?.full_name}</p>

        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Новый текущий баланс</label>
            <input
              type="number"
              min="0"
              step="0.001"
              value={newBalance}
              onChange={e => setNewBalance(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Причина изменения</label>
            <textarea
              rows={3}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 focus:outline-none resize-none"
              placeholder="Например: корректировка после внешнего списания"
            />
          </div>
        </div>

        <div className="mt-5 flex gap-3">
          <Button variant="ghost" className="flex-1" onClick={onClose}>Отмена</Button>
          <Button className="flex-1" loading={saving} onClick={() => onSubmit({ newBalance, notes })}>
            Сохранить
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function EarningsPage() {
  const toast = useToast();
  const [tab, setTab] = useState('summary');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(null);
  const [employeeDetails, setEmployeeDetails] = useState(null);
  const [employeeLoading, setEmployeeLoading] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [taskDetails, setTaskDetails] = useState(null);
  const [taskLoading, setTaskLoading] = useState(false);
  const [rateDraft, setRateDraft] = useState('10');
  const [savingRate, setSavingRate] = useState(false);
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [savingBalance, setSavingBalance] = useState(false);
  const [detailTab, setDetailTab] = useState('sklad');

  const loadBase = useCallback(async (background = false) => {
    if (background) setRefreshing(true);
    else setLoading(true);
    try {
      const [summaryRes, employeesRes] = await Promise.all([
        api.get('/earnings/summary'),
        api.get('/earnings/employees'),
      ]);
      setSummary(summaryRes.data);
      setEmployees(employeesRes.data || []);
      setRateDraft(String(summaryRes.data?.settings?.gra_inventory_scan_rate ?? 10));
      setSelectedEmployeeId(prev => {
        if (prev && (employeesRes.data || []).some(item => Number(item.employee_id) === Number(prev))) return prev;
        return employeesRes.data?.[0]?.employee_id || null;
      });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Не удалось загрузить заработок');
    } finally {
      if (background) setRefreshing(false);
      else setLoading(false);
    }
  }, [toast]);

  const loadEmployeeDetails = useCallback(async (employeeId) => {
    if (!employeeId) {
      setEmployeeDetails(null);
      return;
    }
    setEmployeeLoading(true);
    try {
      const res = await api.get(`/earnings/employees/${employeeId}`);
      setEmployeeDetails(res.data);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Не удалось загрузить историю сотрудника');
    } finally {
      setEmployeeLoading(false);
    }
  }, [toast]);

  const loadTaskDetails = useCallback(async (taskId) => {
    if (!taskId) {
      setTaskDetails(null);
      return;
    }
    setTaskLoading(true);
    try {
      const res = await api.get(`/earnings/tasks/${taskId}`);
      setTaskDetails(res.data);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Не удалось загрузить детализацию задачи');
    } finally {
      setTaskLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadBase(); }, [loadBase]);
  useEffect(() => {
    setSelectedTaskId(null);
    setTaskDetails(null);
    setDetailTab('sklad');
    if (selectedEmployeeId) loadEmployeeDetails(selectedEmployeeId);
  }, [selectedEmployeeId, loadEmployeeDetails]);
  useEffect(() => {
    if (selectedTaskId) loadTaskDetails(selectedTaskId);
  }, [selectedTaskId, loadTaskDetails]);

  const selectedEmployee = useMemo(() => {
    if (!selectedEmployeeId) return null;
    return employees.find(item => Number(item.employee_id) === Number(selectedEmployeeId)) || employeeDetails?.employee || null;
  }, [employees, employeeDetails, selectedEmployeeId]);

  const saveRate = async () => {
    const numeric = Number.parseFloat(String(rateDraft).replace(',', '.'));
    if (!Number.isFinite(numeric) || numeric < 0) {
      toast.error('Укажите корректную ставку');
      return;
    }
    setSavingRate(true);
    try {
      await api.put('/settings', { gra_inventory_scan_rate: numeric });
      toast.success('Ставка сохранена. Новая ставка применяется только к новым сканам.');
      await loadBase(true);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Не удалось сохранить ставку');
    } finally {
      setSavingRate(false);
    }
  };

  const saveBalance = async ({ newBalance, notes }) => {
    const numeric = Number.parseFloat(String(newBalance).replace(',', '.'));
    if (!Number.isFinite(numeric) || numeric < 0) {
      toast.error('Укажите корректный баланс');
      return;
    }
    if (!notes.trim()) {
      toast.error('Укажите причину изменения');
      return;
    }
    if (!selectedEmployee) return;

    setSavingBalance(true);
    try {
      await api.post(`/earnings/employees/${selectedEmployee.employee_id}/set-balance`, {
        new_balance: numeric,
        notes,
      });
      toast.success('Баланс обновлён');
      setAdjustModalOpen(false);
      await Promise.all([loadBase(true), loadEmployeeDetails(selectedEmployee.employee_id)]);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Не удалось обновить баланс');
    } finally {
      setSavingBalance(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  const overview = summary?.overview || {};
  const leaders = summary?.leaders || [];
  const recentAdjustments = summary?.recent_adjustments || [];
  const employeeTasks = employeeDetails?.tasks || [];
  const employeeAdjustments = employeeDetails?.adjustments || [];
  const sborkaPicks = employeeDetails?.sborka_picks || [];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Заработок</h1>
          <p className="text-gray-500 text-sm mt-1">
            Начисления сотрудникам за успешные сканы товаров в инвентаризации, текущие балансы и полный аудит изменений.
          </p>
        </div>
        <button
          onClick={() => loadBase(true)}
          className="p-2.5 rounded-xl text-gray-400 hover:text-primary-500 hover:bg-primary-50 transition-all flex-shrink-0"
        >
          <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        <TabButton active={tab === 'summary'} onClick={() => setTab('summary')}>Сводка</TabButton>
        <TabButton active={tab === 'history'} onClick={() => setTab('history')}>История</TabButton>
        <TabButton active={tab === 'settings'} onClick={() => setTab('settings')}>Настройка</TabButton>
      </div>

      {tab === 'summary' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-4 mb-6">
            <StatCard icon={Users} label="Сотрудников с активностью" value={overview.employees_with_activity || 0} />
            <StatCard icon={BarChart3} label="Текущий баланс всего" value={`${fmtGra(overview.total_current_balance)} GRA`} tone="primary" />
            <StatCard icon={ScanLine} label="Оплаченных сканов" value={fmtGra(overview.rewarded_scans || 0)} tone="green" />
            <StatCard icon={ClipboardList} label="Начислено за сканы" value={`${fmtGra(overview.total_awarded)} GRA`} tone="blue" />
            <StatCard icon={ShoppingCart} label="Заработок на сборках" value={`${fmtGra(overview.total_sborka_amount)} GRA`} hint={`${fmtGra(overview.total_sborka_units || 0)} пиков`} tone="green" />
            <StatCard icon={Settings} label="Текущая ставка" value={`${fmtGra(summary?.settings?.gra_inventory_scan_rate || 0)} GRA`} hint="за 1 успешный скан" tone="amber" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 card overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-50">
                <h2 className="font-semibold text-gray-900">Лидеры по текущему балансу</h2>
                <p className="text-xs text-gray-400 mt-0.5">Показываются только сотрудники, у которых уже были начисления или ручные корректировки</p>
              </div>
              {leaders.length === 0 ? (
                <SectionEmpty title="Начислений ещё нет" hint="После первых успешных инвентаризационных сканов сотрудники появятся здесь" />
              ) : (
                <div className="divide-y divide-gray-50">
                  {leaders.map((item, index) => (
                    <button
                      key={item.employee_id}
                      onClick={() => {
                        setTab('history');
                        setSelectedEmployeeId(item.employee_id);
                      }}
                      className="w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors text-left"
                    >
                      <span className={`text-sm font-bold w-6 flex-shrink-0 ${index === 0 ? 'text-amber-500' : index === 1 ? 'text-gray-400' : index === 2 ? 'text-amber-700' : 'text-gray-300'}`}>
                        {index + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{item.full_name}</p>
                        <p className="text-xs text-gray-400">
                          {fmtGra(item.rewarded_scans || 0)} оплаченных сканов
                          {item.rewarded_tasks_count ? ` · ${item.rewarded_tasks_count} задач` : ''}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-bold text-primary-600">{fmtGra(item.current_balance)} GRA</p>
                        <p className="text-xs text-gray-400">склад: {fmtGra(item.total_awarded)} GRA</p>
                        {Number(item.sborka_amount) > 0 && (
                          <p className="text-xs text-green-500">сборки: {fmtGra(item.sborka_amount)} GRA</p>
                        )}
                      </div>
                      <ChevronRight size={16} className="text-gray-300" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-50">
                <h2 className="font-semibold text-gray-900">Последние ручные изменения</h2>
              </div>
              {recentAdjustments.length === 0 ? (
                <SectionEmpty title="Ручных правок не было" />
              ) : (
                <div className="divide-y divide-gray-50">
                  {recentAdjustments.map(item => (
                    <div key={item.id} className="px-5 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-gray-900 truncate">{item.employee_name}</p>
                        <span className={`text-sm font-bold ${Number(item.amount_delta) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                          {Number(item.amount_delta) >= 0 ? '+' : ''}{fmtGra(item.amount_delta)} GRA
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {fmtDateTime(item.created_at)} · {item.changed_by_username || 'система'}
                      </p>
                      {item.notes ? <p className="text-xs text-gray-500 mt-1">{item.notes}</p> : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
      {tab === 'history' && (
        <div className="grid grid-cols-1 xl:grid-cols-[320px_minmax(0,1fr)] gap-5">
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50">
              <h2 className="font-semibold text-gray-900">Сотрудники</h2>
            </div>
            {employees.length === 0 ? (
              <SectionEmpty title="Нет сотрудников с начислениями" />
            ) : (
              <div className="divide-y divide-gray-50 max-h-[78vh] overflow-y-auto">
                {employees.map(item => (
                  <button
                    key={item.employee_id}
                    onClick={() => setSelectedEmployeeId(item.employee_id)}
                    className={`w-full px-5 py-3 text-left transition-colors ${
                      Number(selectedEmployeeId) === Number(item.employee_id) ? 'bg-primary-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{item.full_name}</p>
                        <p className="text-xs text-gray-400">
                          {fmtGra(item.rewarded_scans || 0)} сканов · {item.rewarded_tasks_count || 0} задач
                        </p>
                        {Number(item.sborka_amount) > 0 && (
                          <p className="text-xs text-green-500">сборки: {fmtGra(item.sborka_amount)} GRA</p>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-bold text-primary-600">{fmtGra(item.current_balance)} GRA</p>
                        <p className="text-[11px] text-gray-400">{fmtDateTime(item.last_earned_at)}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-5 min-w-0">
            {!selectedEmployee ? (
              <div className="card">
                <SectionEmpty title="Выберите сотрудника" hint="Слева откройте историю начислений нужного сотрудника" />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_320px] gap-5">
                  <div className="card p-5">
                    {employeeLoading && !employeeDetails ? (
                      <div className="flex items-center justify-center h-32"><Spinner size="md" /></div>
                    ) : (
                      <>
                        <div className="flex items-start justify-between gap-4 mb-4">
                          <div>
                            <h2 className="text-xl font-bold text-gray-900">{selectedEmployee.full_name}</h2>
                            <p className="text-sm text-gray-400 mt-1">Текущий баланс и заработок по инвентаризации</p>
                          </div>
                          <Button onClick={() => setAdjustModalOpen(true)}>Изменить баланс</Button>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <StatCard icon={BarChart3} label="Текущий баланс" value={`${fmtGra(employeeDetails?.employee?.current_balance ?? selectedEmployee.current_balance)} GRA`} tone="primary" />
                          <StatCard icon={ScanLine} label="Склад: инвентаризация" value={`${fmtGra(employeeDetails?.employee?.total_awarded || 0)} GRA`} hint={`${fmtGra(employeeDetails?.employee?.rewarded_scans || 0)} сканов`} tone="blue" />
                          <StatCard icon={ShoppingCart} label="Заказы OZ/WB" value={`${fmtGra(employeeDetails?.employee?.sborka_amount || 0)} GRA`} hint={`${fmtGra(employeeDetails?.employee?.sborka_units || 0)} пиков`} tone="green" />
                          <StatCard icon={AlertTriangle} label="Корректировки" value={`${fmtGra(employeeDetails?.employee?.total_manual_adjustments || 0)} GRA`} tone="amber" />
                        </div>
                      </>
                    )}
                  </div>

                  <div className="card overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-50">
                      <h3 className="font-semibold text-gray-900">Ручные изменения</h3>
                    </div>
                    {employeeAdjustments.length === 0 ? (
                      <SectionEmpty title="Ручных корректировок нет" />
                    ) : (
                      <div className="divide-y divide-gray-50 max-h-[320px] overflow-y-auto">
                        {employeeAdjustments.map(item => (
                          <div key={item.id} className="px-5 py-3">
                            <div className="flex items-center justify-between gap-3">
                              <span className={`text-sm font-bold ${Number(item.amount_delta) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                {Number(item.amount_delta) >= 0 ? '+' : ''}{fmtGra(item.amount_delta)} GRA
                              </span>
                              <span className="text-xs text-gray-400">{fmtDateTime(item.created_at)}</span>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                              {fmtGra(item.balance_before)} → {fmtGra(item.balance_after)} GRA · {item.changed_by_username || 'система'}
                            </p>
                            {item.notes ? <p className="text-xs text-gray-400 mt-1">{item.notes}</p> : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex gap-2 mb-4">
                  <TabButton active={detailTab === 'sklad'} onClick={() => setDetailTab('sklad')}>Склад</TabButton>
                  <TabButton active={detailTab === 'orders'} onClick={() => setDetailTab('orders')}>Заказы</TabButton>
                </div>

                {detailTab === 'sklad' && (
                <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-5">
                  <div className="card overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-50">
                      <h3 className="font-semibold text-gray-900">Задачи сотрудника</h3>
                      <p className="text-xs text-gray-400 mt-0.5">Сколько сотрудник получил за каждую задачу</p>
                    </div>
                    {employeeLoading && !employeeDetails ? (
                      <div className="flex items-center justify-center h-40"><Spinner size="md" /></div>
                    ) : employeeTasks.length === 0 ? (
                      <SectionEmpty title="Нет оплаченных задач" />
                    ) : (
                      <div className="divide-y divide-gray-50 max-h-[70vh] overflow-y-auto">
                        {employeeTasks.map(task => (
                          <button
                            key={task.task_id}
                            onClick={() => setSelectedTaskId(task.task_id)}
                            className={`w-full flex items-center gap-3 px-5 py-3 text-left transition-colors ${
                              Number(selectedTaskId) === Number(task.task_id) ? 'bg-primary-50' : 'hover:bg-gray-50'
                            }`}
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{task.title}</p>
                              <p className="text-xs text-gray-400">
                                {task.shelf_code
                                  ? `${task.rack_name || task.rack_code || 'Стеллаж'} · ${task.shelf_name || task.shelf_code}`
                                  : task.pallet_name
                                  ? `${task.pallet_row_name || 'Ряд'} · ${task.pallet_name}`
                                  : 'Инвентаризация'}
                              </p>
                              <p className="text-xs text-gray-400 mt-0.5">
                                {fmtDateTime(task.last_earned_at)}
                                {task.scopes_count ? ` · зон: ${task.scopes_count}` : ''}
                              </p>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-sm font-bold text-primary-600">{fmtGra(task.amount_earned)} GRA</p>
                              <p className="text-xs text-gray-400">{fmtGra(task.rewarded_scans)} сканов</p>
                            </div>
                            <ChevronRight size={16} className="text-gray-300" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="card overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-50">
                      <h3 className="font-semibold text-gray-900">Детализация задачи</h3>
                      <p className="text-xs text-gray-400 mt-0.5">Разбивка по коробкам или ячейкам и точный список оплаченных сканов</p>
                    </div>
                    {taskLoading ? (
                      <div className="flex items-center justify-center h-48"><Spinner size="md" /></div>
                    ) : !taskDetails ? (
                      <SectionEmpty title="Выберите задачу справа" hint="После выбора появится точная раскадровка начислений" />
                    ) : (
                      <div className="p-5 space-y-5">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <StatCard icon={BarChart3} label="Всего за задачу" value={`${fmtGra(taskDetails.task.total_earned)} GRA`} tone="primary" />
                          <StatCard icon={ScanLine} label="Оплаченных сканов" value={fmtGra(taskDetails.task.rewarded_scans)} tone="green" />
                          <StatCard icon={ClipboardList} label="Событий начисления" value={fmtGra(taskDetails.task.earning_events)} tone="blue" />
                        </div>

                        <div>
                          <h4 className="text-sm font-semibold text-gray-900 mb-3">Разбивка по коробкам / ячейкам</h4>
                          {taskDetails.scopes.length === 0 ? (
                            <SectionEmpty title="Нет начислений в этой задаче" />
                          ) : (
                            <div className="space-y-3">
                              {taskDetails.scopes.map(scope => (
                                <div key={scope.scope_key} className="rounded-2xl border border-gray-100 bg-gray-50/70 p-4">
                                  <div className="flex items-start justify-between gap-3 mb-3">
                                    <div>
                                      <p className="text-sm font-semibold text-gray-900">{scope.scope_label}</p>
                                      {scope.box_barcode ? <p className="text-xs text-gray-400 font-mono mt-0.5">{scope.box_barcode}</p> : null}
                                    </div>
                                    <div className="text-right">
                                      <p className="text-sm font-bold text-primary-600">{fmtGra(scope.amount_earned)} GRA</p>
                                      <p className="text-xs text-gray-400">{fmtGra(scope.rewarded_scans)} сканов</p>
                                    </div>
                                  </div>

                                  <div className="space-y-2">
                                    {scope.scans.map((scan, index) => (
                                      <div key={scan.earning_id} className="flex items-center gap-3 rounded-xl bg-white px-3 py-2 border border-gray-100">
                                        <span className="text-xs font-mono text-gray-300 w-5 text-right flex-shrink-0">{index + 1}</span>
                                        <div className="flex-1 min-w-0">
                                          <p className="text-sm font-medium text-gray-900 truncate">{scan.product_name || scan.scanned_value}</p>
                                          <p className="text-xs text-gray-400">
                                            {scan.product_code || scan.scanned_value}
                                            {scan.scanned_at ? ` · ${fmtDateTime(scan.scanned_at)}` : ''}
                                          </p>
                                        </div>
                                        <div className="text-right flex-shrink-0">
                                          <p className="text-sm font-bold text-primary-600">+{fmtGra(scan.amount_delta)} GRA</p>
                                          <p className="text-xs text-gray-400">{fmtGra(scan.reward_units)} × {fmtGra(scan.rate_per_unit)}</p>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                )}

                {detailTab === 'orders' && (
                  <div className="card overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-50">
                      <h3 className="font-semibold text-gray-900">Заказы (сборка OZ/WB)</h3>
                      <p className="text-xs text-gray-400 mt-0.5">Начисления за пики при сборке заказов</p>
                    </div>
                    {employeeLoading && !employeeDetails ? (
                      <div className="flex items-center justify-center h-40"><Spinner size="md" /></div>
                    ) : sborkaPicks.length === 0 ? (
                      <SectionEmpty title="Нет начислений за сборку" />
                    ) : (
                      <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 sticky top-0">
                            <tr>
                              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Дата</th>
                              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Маркетплейс</th>
                              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Магазин</th>
                              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Товар</th>
                              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Артикул</th>
                              <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">Сумма</th>
                              <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">Пики</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {sborkaPicks.map(pick => (
                              <tr key={pick.id} className="hover:bg-gray-50 transition-colors">
                                <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{fmtDateTime(pick.created_at)}</td>
                                <td className="px-4 py-2.5 text-gray-900 font-medium">{pick.source_marketplace || '—'}</td>
                                <td className="px-4 py-2.5 text-gray-600 truncate max-w-[160px]">{pick.source_store_name || '—'}</td>
                                <td className="px-4 py-2.5 text-gray-600 truncate max-w-[200px]">{pick.source_product_name || pick.source_entity_name || '—'}</td>
                                <td className="px-4 py-2.5 text-gray-500 font-mono text-xs">{pick.source_article || '—'}</td>
                                <td className="px-4 py-2.5 text-right font-bold text-primary-600 whitespace-nowrap">+{fmtGra(pick.amount_delta)} GRA</td>
                                <td className="px-4 py-2.5 text-right text-gray-600">{fmtGra(pick.reward_units)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {tab === 'settings' && (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-5">
          <div className="card p-6">
            <div className="flex items-center gap-2 mb-4">
              <Settings className="w-5 h-5 text-primary-500" />
              <h2 className="font-semibold text-gray-900">Ставка начисления</h2>
            </div>

            <div className="max-w-md">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">GRAcoin за 1 успешный скан товара</label>
              <input
                type="number"
                min="0"
                step="0.001"
                value={rateDraft}
                onChange={e => setRateDraft(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 focus:outline-none"
              />
            </div>

            <div className="mt-4 flex gap-3">
              <Button onClick={saveRate} loading={savingRate}>Сохранить ставку</Button>
              <Button variant="ghost" onClick={() => setRateDraft(String(summary?.settings?.gra_inventory_scan_rate ?? 10))}>Сбросить</Button>
            </div>

            <div className="mt-5 rounded-2xl bg-primary-50 border border-primary-100 p-4">
              <p className="text-sm font-semibold text-primary-700">Правило применения</p>
              <ul className="text-sm text-primary-700/90 mt-2 space-y-1.5">
                <li>Начисление идёт только за успешные сканы товаров в задачах инвентаризации.</li>
                <li>Сканы полок, паллет, коробок и ошибки штрихкода не оплачиваются.</li>
                <li>Новая ставка влияет только на новые сканы и не пересчитывает старую историю.</li>
              </ul>
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50">
              <h3 className="font-semibold text-gray-900">Текущая конфигурация</h3>
            </div>
            <div className="p-5 space-y-4">
              <div className="rounded-2xl bg-gray-50 px-4 py-3">
                <p className="text-xs text-gray-400">Ставка сейчас</p>
                <p className="text-lg font-bold text-gray-900">{fmtGra(summary?.settings?.gra_inventory_scan_rate || 0)} GRA</p>
              </div>
              <div className="rounded-2xl bg-gray-50 px-4 py-3">
                <p className="text-xs text-gray-400">Сотрудников в системе заработка</p>
                <p className="text-lg font-bold text-gray-900">{overview.employees_with_activity || 0}</p>
              </div>
              <div className="rounded-2xl bg-gray-50 px-4 py-3">
                <p className="text-xs text-gray-400">Текущий суммарный баланс</p>
                <p className="text-lg font-bold text-gray-900">{fmtGra(overview.total_current_balance)} GRA</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {adjustModalOpen && selectedEmployee ? (
        <BalanceAdjustModal
          employee={selectedEmployee}
          saving={savingBalance}
          onClose={() => setAdjustModalOpen(false)}
          onSubmit={saveBalance}
        />
      ) : null}
    </div>
  );
}

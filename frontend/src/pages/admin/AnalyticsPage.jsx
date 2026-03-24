import { useState, useEffect, useCallback } from 'react';
import {
  BarChart3, Clock, ScanLine, AlertTriangle, ChevronRight,
  ArrowLeft, Package, CheckCircle2, Warehouse
} from 'lucide-react';
import api from '../../api/client';
import { qty } from '../../utils/fmt';
import Spinner from '../../components/ui/Spinner';
import Badge from '../../components/ui/Badge';
import { cn } from '../../utils/cn';
import InventoryAnalyticsView from './InventoryAnalyticsView';

function fmt(seconds) {
  if (!seconds || seconds < 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m} мин ${s} с` : `${s} с`;
}

function fmtTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function TaskAnalytics({ taskId, onBack }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(null);

  useEffect(() => {
    setTab(null);
    api.get(`/tasks/${taskId}/analytics`)
      .then(r => { setData(r.data); setTab(r.data.task.task_type === 'packaging' ? 'boxes' : 'scans'); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [taskId]);

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>;
  if (!data) return null;

  const { task, scans, errors, perMinute, boxes = [] } = data;
  const isPackaging = task.task_type === 'packaging';
  const duration = task.duration_seconds;
  const totalItems = isPackaging
    ? boxes.filter(b => b.status === 'closed').reduce((s, b) => s + Number(b.quantity), 0)
    : scans.length;
  const scansPerMin = duration > 0 ? ((totalItems / duration) * 60).toFixed(1) : '—';
  const avgGap = scans.length > 1
    ? (scans.slice(1).reduce((s, sc) => s + (Number(sc.seconds_since_prev) || 0), 0) / (scans.length - 1)).toFixed(1)
    : '—';
  const maxPerMin = perMinute.length > 0 ? Math.max(...perMinute.map(r => Number(r.scan_count))) : 0;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">{task.title}</h1>
          <p className="text-sm text-gray-400">
            {task.employee_name}
            {isPackaging ? ' · Оприходование' : (task.rack_name ? ` · ${task.rack_name}${task.shelf_name ? ` · ${task.shelf_name}` : ''}` : '')}
          </p>
        </div>
        <Badge variant={task.status === 'completed' ? 'success' : 'warning'}>
          {task.status === 'completed' ? 'Выполнена' : 'В работе'}
        </Badge>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Время', value: fmt(duration), icon: Clock, color: 'text-blue-500', bg: 'bg-blue-50' },
          { label: isPackaging ? 'Упаковано' : 'Сканирований', value: totalItems, icon: isPackaging ? Package : ScanLine, color: 'text-green-500', bg: 'bg-green-50' },
          { label: isPackaging ? 'Коробок' : 'Скан/мин', value: isPackaging ? boxes.filter(b => b.status === 'closed').length : scansPerMin, icon: BarChart3, color: 'text-primary-500', bg: 'bg-primary-50' },
          { label: 'Ошибок', value: errors.length, icon: AlertTriangle, color: errors.length > 0 ? 'text-red-500' : 'text-gray-400', bg: errors.length > 0 ? 'bg-red-50' : 'bg-gray-50' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="card p-4 flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center flex-shrink-0`}>
              <Icon size={16} className={color} />
            </div>
            <div>
              <p className="text-xs text-gray-400">{label}</p>
              <p className="text-lg font-bold text-gray-900">{value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="card p-4">
          <p className="text-xs text-gray-400 mb-1">Начало</p>
          <p className="text-sm font-semibold text-gray-900">{fmtDate(task.started_at)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-400 mb-1">Конец</p>
          <p className="text-sm font-semibold text-gray-900">{fmtDate(task.completed_at)}</p>
        </div>
        {isPackaging && (
          <div className="card p-4">
            <p className="text-xs text-gray-400 mb-1">Паллет/ряд</p>
            <p className="text-sm font-semibold text-gray-900">
              {boxes[0] ? `Р${boxes[0].row_number}П${boxes[0].pallet_number}` : '—'}
            </p>
          </div>
        )}
        <div className="card p-4">
          <p className="text-xs text-gray-400 mb-1">Среднее между сканами</p>
          <p className="text-sm font-semibold text-gray-900">
            {avgGap !== '—' ? `${avgGap} с` : '—'}
          </p>
        </div>
      </div>

      {perMinute.length > 0 && (
        <div className="card p-5 mb-6">
          <p className="text-sm font-semibold text-gray-700 mb-4">Сканирования по минутам</p>
          <div className="flex items-end gap-1.5 h-20">
            {perMinute.map(row => (
              <div key={row.minute_offset} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-xs text-gray-400">{row.scan_count}</span>
                <div
                  className="w-full bg-primary-500 rounded-t-sm"
                  style={{ height: `${maxPerMin > 0 ? (Number(row.scan_count) / maxPerMin) * 56 : 4}px`, minHeight: '4px' }}
                />
                <span className="text-xs text-gray-300">{row.minute_offset + 1}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2 text-center">мин от начала задачи</p>
        </div>
      )}

      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-4">
        {isPackaging ? (
          <button onClick={() => setTab('boxes')}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${tab === 'boxes' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400'}`}>
            Коробки ({boxes.length})
          </button>
        ) : (
          <button onClick={() => setTab('scans')}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${tab === 'scans' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400'}`}>
            Хронология сканов ({scans.length})
          </button>
        )}
        <button
          onClick={() => setTab('errors')}
          className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
            tab === 'errors'
              ? errors.length > 0 ? 'bg-red-500 text-white shadow-sm' : 'bg-white text-gray-900 shadow-sm'
              : errors.length > 0 ? 'text-red-400' : 'text-gray-400'
          }`}
        >
          Ошибки ({errors.length})
        </button>
      </div>

      {tab === 'boxes' && (
        <div className="card overflow-hidden">
          {boxes.length === 0 ? (
            <div className="text-center py-10 text-gray-400">Нет коробок</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {boxes.map((b, i) => (
                <div key={b.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="text-xs text-gray-300 w-6 text-right flex-shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{b.product_name || '—'}</p>
                    <p className="text-xs text-gray-400">
                      {b.pallet_number ? `Р${b.row_number}П${b.pallet_number}` : '—'}
                      {b.barcode_value ? ` · ${b.barcode_value}` : ''}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-gray-800">{qty(b.quantity)} шт.</p>
                    <p className={`text-xs ${b.status === 'closed' ? 'text-green-500' : 'text-gray-400'}`}>
                      {b.status === 'closed' ? 'закрыта' : 'открыта'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'scans' && (
        <div className="card overflow-hidden">
          {scans.length === 0 ? (
            <div className="text-center py-10 text-gray-400">Нет сканирований</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {scans.map((sc, i) => (
                <div key={sc.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="text-xs text-gray-300 w-6 text-right flex-shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">
                      {sc.product_name || <span className="text-red-400 italic">Неизвестен</span>}
                    </p>
                    {sc.product_code && <p className="text-xs text-gray-400">{sc.product_code}</p>}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs font-mono text-gray-700">{fmtTime(sc.created_at)}</p>
                    {sc.seconds_since_prev !== null && (
                      <p className="text-xs text-gray-300">+{sc.seconds_since_prev}с</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'errors' && (
        <div className="card overflow-hidden">
          {errors.length === 0 ? (
            <div className="text-center py-10 text-gray-400">Ошибок нет</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {errors.map(err => (
                <div key={err.id} className="px-4 py-3">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-mono font-medium text-red-700">{err.scanned_value}</p>
                    <p className="text-xs text-gray-400">{fmtTime(err.created_at)}</p>
                  </div>
                  {err.employee_note && (
                    <p className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-1.5 mt-1">
                      {err.employee_note}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AnalyticsPage() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [tab, setTab] = useState('summary');
  const [warehouses, setWarehouses] = useState([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api.get('/tasks/analytics/summary')
      .then(r => setSummary(r.data))
      .catch(err => setError(err?.response?.data?.error || err.message || 'Ошибка загрузки'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.get('/warehouse/warehouses').then(r => setWarehouses(r.data || [])).catch(() => {});
  }, []);

  if (selectedTask && tab === 'summary') {
    return <TaskAnalytics taskId={selectedTask} onBack={() => setSelectedTask(null)} />;
  }

  const renderSummary = () => {
    if (loading) return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>;
    if (error) {
      return (
        <div className="p-6 max-w-md mx-auto mt-10 card text-center">
          <AlertTriangle size={32} className="text-red-400 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-800 mb-1">Ошибка загрузки аналитики</p>
          <p className="text-xs text-gray-400 mb-4">{error}</p>
          <button onClick={load} className="btn-primary text-sm px-4 py-2">Повторить</button>
        </div>
      );
    }
    if (!summary) return null;

    const { overview = {}, topEmployees = [], recentTasks = [] } = summary;
    return (
      <>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Задач выполнено', value: overview?.completed_tasks || 0, icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-50' },
            { label: 'Всего сканов', value: overview?.total_scans || 0, icon: ScanLine, color: 'text-primary-500', bg: 'bg-primary-50' },
            { label: 'Среднее время', value: overview?.avg_duration_minutes ? `${overview.avg_duration_minutes} мин` : '—', icon: Clock, color: 'text-blue-500', bg: 'bg-blue-50' },
            { label: 'Сред. между пиками', value: overview?.avg_seconds_per_scan ? `${overview.avg_seconds_per_scan} с` : '—', icon: BarChart3, color: 'text-primary-500', bg: 'bg-primary-50' },
            { label: 'Ошибки сканов', value: overview?.total_errors || 0, icon: AlertTriangle, color: Number(overview?.total_errors) > 0 ? 'text-red-500' : 'text-gray-400', bg: Number(overview?.total_errors) > 0 ? 'bg-red-50' : 'bg-gray-50' },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="card p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-2xl ${bg} flex items-center justify-center flex-shrink-0`}>
                <Icon size={18} className={color} />
              </div>
              <div>
                <p className="text-xs text-gray-400">{label}</p>
                <p className="text-xl font-bold text-gray-900">{value}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 card overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50">
              <h2 className="font-semibold text-gray-900">Завершённые задачи</h2>
              <p className="text-xs text-gray-400 mt-0.5">Нажмите на задачу для детальной аналитики</p>
            </div>
            {recentTasks.length === 0 ? (
              <div className="text-center py-10 text-gray-400">Нет завершённых задач</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {recentTasks.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTask(t.id)}
                    className="w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{t.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-gray-400">{t.employee_name || '—'}</span>
                        <span className="text-gray-200">·</span>
                        <span className="text-xs text-gray-400">{fmtDate(t.completed_at)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="text-right">
                        <p className="text-xs font-semibold text-gray-700">{t.scans_count} сканов</p>
                        <p className="text-xs text-gray-400">
                          {t.duration_minutes ? `${t.duration_minutes} мин` : '—'}
                          {t.avg_scan_gap != null ? ` · ⚡${t.avg_scan_gap}с` : ''}
                        </p>
                      </div>
                      {Number(t.errors_count) > 0 && (
                        <span className="text-xs bg-red-50 text-red-500 px-1.5 py-0.5 rounded-lg font-medium">
                          {t.errors_count} ош.
                        </span>
                      )}
                      <ChevronRight size={15} className="text-gray-300" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50">
              <h2 className="font-semibold text-gray-900">Топ сотрудников</h2>
            </div>
            {topEmployees.length === 0 ? (
              <div className="text-center py-10 text-gray-400">Нет данных</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {topEmployees.map((e, i) => (
                  <div key={e.full_name} className="flex items-center gap-3 px-5 py-3">
                    <span className={`text-sm font-bold w-5 flex-shrink-0 ${i === 0 ? 'text-amber-500' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-amber-700' : 'text-gray-300'}`}>
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{e.full_name}</p>
                      <p className="text-xs text-gray-400">
                        {e.tasks_count} задач
                        {e.avg_minutes ? ` · ${e.avg_minutes} мин/зад.` : ''}
                        {e.avg_scan_gap != null ? ` · ⚡${e.avg_scan_gap}с/скан` : ''}
                      </p>
                    </div>
                    <span className="text-sm font-bold text-primary-600 flex-shrink-0">{e.scans_count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </>
    );
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{tab === 'inventory' ? 'Аналитика инвентаризации' : 'Аналитика'}</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          {tab === 'inventory'
            ? 'Последний инвент, прошлый инвент, участвовавшие коробки и зоны, которые давно не считались'
            : 'Статистика по выполнению задач и сотрудникам'}
        </p>
      </div>

      <div className="flex gap-2 mb-5 flex-wrap">
        {[
          { value: 'summary', label: 'Сводка' },
          { value: 'inventory', label: 'Инвентаризация' },
        ].map(item => (
          <button
            key={item.value}
            onClick={() => {
              setTab(item.value);
              if (item.value !== 'summary') setSelectedTask(null);
            }}
            className={cn(
              'px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all',
              tab === item.value
                ? 'bg-primary-600 text-white border-primary-600 shadow-sm'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'inventory' ? (
        <InventoryAnalyticsView />
      ) : (
        renderSummary()
      )}
    </div>
  );
}

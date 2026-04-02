import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';
import { ArrowLeft, RefreshCw, Zap, TrendingUp, Clock, Package, ScanLine, Award } from 'lucide-react';

function timeAgo(iso) {
  if (!iso) return '—';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}с назад`;
  if (diff < 3600) return `${Math.floor(diff / 60)}м назад`;
  return `${Math.floor(diff / 3600)}ч назад`;
}

function fmtNum(n) {
  return Number(n || 0).toLocaleString('ru-RU');
}

function EmployeeCard({ emp, onClick }) {
  const task = emp.active_task;
  const isActive = task && task.status === 'in_progress';
  const lastScanRecent = emp.last_scan_at && (Date.now() - new Date(emp.last_scan_at).getTime()) < 120000;

  return (
    <button onClick={onClick} className="w-full text-left bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-primary-200 transition-all p-4 relative overflow-hidden">
      {/* Activity indicator */}
      {isActive && lastScanRecent && (
        <div className="absolute top-3 right-3 flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-[10px] font-semibold text-green-600">LIVE</span>
        </div>
      )}
      {isActive && !lastScanRecent && (
        <div className="absolute top-3 right-3">
          <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
        </div>
      )}

      {/* Name */}
      <h3 className="text-sm font-bold text-gray-900 pr-14 leading-tight">{emp.full_name}</h3>

      {/* Active task */}
      {task ? (
        <div className="mt-2 px-2.5 py-1.5 bg-primary-50 rounded-xl border border-primary-100">
          <p className="text-xs font-semibold text-primary-700 truncate">{task.title}</p>
          <div className="flex items-center gap-2 mt-1 text-[10px] text-primary-500">
            <span>{task.type === 'bundle_assembly' ? 'Сборка' : task.type === 'packaging' ? 'Оприход.' : task.type === 'production_transfer' ? 'Перенос' : 'Инвент.'}</span>
            {task.scans > 0 && <span>· {task.scans} сканов</span>}
            {task.boxes_total > 0 && <span>· {task.boxes_done}/{task.boxes_total} кор.</span>}
            {task.type === 'bundle_assembly' && <span>· {task.assembled}/{task.bundle_qty} собр.</span>}
          </div>
        </div>
      ) : (
        <p className="mt-2 text-xs text-gray-300 italic">Нет активной задачи</p>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-2 mt-3">
        <div className="bg-gray-50 rounded-xl px-2 py-1.5 text-center">
          <p className="text-[9px] text-gray-400 uppercase font-semibold">Сканов</p>
          <p className="text-base font-black text-gray-800">{fmtNum(emp.scans_today)}</p>
        </div>
        <div className="bg-green-50 rounded-xl px-2 py-1.5 text-center">
          <p className="text-[9px] text-green-500 uppercase font-semibold">Заработок</p>
          <p className="text-base font-black text-green-700">{fmtNum(Math.round(emp.earned_today))}</p>
        </div>
        <div className="bg-blue-50 rounded-xl px-2 py-1.5 text-center">
          <p className="text-[9px] text-blue-500 uppercase font-semibold">Скорость</p>
          <p className="text-base font-black text-blue-700">{emp.avg_speed_today ? `${emp.avg_speed_today}с` : '—'}</p>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-2.5 text-[10px] text-gray-400">
        <span>{emp.tasks_today} задач сегодня</span>
        <span>{emp.last_scan_at ? timeAgo(emp.last_scan_at) : '—'}</span>
      </div>
    </button>
  );
}

function EmployeeDetail({ emp, onBack }) {
  const task = emp.active_task;
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-gray-500 hover:text-primary-600 mb-4">
        <ArrowLeft size={16} /> Назад к мониторингу
      </button>

      <h2 className="text-xl font-bold text-gray-900 mb-1">{emp.full_name}</h2>
      <p className="text-sm text-gray-400 mb-6">Баланс: {fmtNum(Math.round(emp.balance))} GRA</p>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { icon: ScanLine, label: 'Сканов сегодня', value: fmtNum(emp.scans_today), color: 'text-gray-800 bg-gray-50' },
          { icon: Award, label: 'Заработано сегодня', value: `${fmtNum(Math.round(emp.earned_today))} GRA`, color: 'text-green-700 bg-green-50' },
          { icon: Zap, label: 'Скорость', value: emp.avg_speed_today ? `${emp.avg_speed_today} с/шт` : '—', color: 'text-blue-700 bg-blue-50' },
          { icon: TrendingUp, label: 'Задач сегодня', value: emp.tasks_today, color: 'text-purple-700 bg-purple-50' },
        ].map((s, i) => (
          <div key={i} className={`rounded-2xl p-4 ${s.color}`}>
            <s.icon size={18} className="mb-2 opacity-60" />
            <p className="text-2xl font-black">{s.value}</p>
            <p className="text-[10px] uppercase font-semibold opacity-60 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Active task */}
      {task && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Package size={16} className="text-primary-500" />
            <h3 className="font-bold text-gray-900">Активная задача</h3>
            <span className="ml-auto flex items-center gap-1.5 text-xs text-green-600">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" /> В работе
            </span>
          </div>
          <p className="text-sm font-semibold text-gray-800">{task.title}</p>
          <div className="grid grid-cols-3 gap-2 mt-3">
            <div className="bg-gray-50 rounded-xl px-3 py-2 text-center">
              <p className="text-xs text-gray-400">Сканов</p>
              <p className="text-lg font-bold text-gray-800">{task.scans || 0}</p>
            </div>
            {task.boxes_total > 0 && (
              <div className="bg-gray-50 rounded-xl px-3 py-2 text-center">
                <p className="text-xs text-gray-400">Коробки</p>
                <p className="text-lg font-bold text-gray-800">{task.boxes_done}/{task.boxes_total}</p>
              </div>
            )}
            {task.type === 'bundle_assembly' && (
              <div className="bg-gray-50 rounded-xl px-3 py-2 text-center">
                <p className="text-xs text-gray-400">Собрано</p>
                <p className="text-lg font-bold text-gray-800">{task.assembled}/{task.bundle_qty}</p>
              </div>
            )}
            <div className="bg-gray-50 rounded-xl px-3 py-2 text-center">
              <p className="text-xs text-gray-400">Начата</p>
              <p className="text-xs font-semibold text-gray-600 mt-1">
                {task.started_at ? new Date(task.started_at).toLocaleTimeString('ru-RU') : '—'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Last scan */}
      <div className="text-center text-sm text-gray-400 mt-4">
        <Clock size={14} className="inline mr-1" />
        Последний скан: {emp.last_scan_at ? new Date(emp.last_scan_at).toLocaleString('ru-RU') : '—'}
      </div>
    </div>
  );
}

export default function LiveMonitorPage() {
  const navigate = useNavigate();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const intervalRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/tasks/analytics/live');
      setEmployees(res.data.employees || []);
      setLastUpdate(new Date());
      // Update selected employee if viewing detail
      if (selectedEmp) {
        const updated = (res.data.employees || []).find(e => e.employee_id === selectedEmp.employee_id);
        if (updated) setSelectedEmp(updated);
      }
    } catch {} finally { setLoading(false); }
  }, [selectedEmp]);

  useEffect(() => {
    load();
    intervalRef.current = setInterval(load, 10000); // Auto-refresh every 10s
    return () => clearInterval(intervalRef.current);
  }, [load]);

  if (selectedEmp) {
    return <EmployeeDetail emp={selectedEmp} onBack={() => setSelectedEmp(null)} />;
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/admin/tasks')} className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              Live-мониторинг
              <span className="flex items-center gap-1 text-xs font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" /> LIVE
              </span>
            </h1>
            <p className="text-sm text-gray-400 mt-0.5">
              {employees.length} сотрудников активно · обновление каждые 10с
              {lastUpdate && <span className="ml-2">{lastUpdate.toLocaleTimeString('ru-RU')}</span>}
            </p>
          </div>
        </div>
        <button onClick={load} className="p-2 rounded-xl text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-colors">
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {employees.length === 0 && !loading && (
        <div className="text-center py-20 text-gray-300">
          <ScanLine size={48} className="mx-auto mb-3 opacity-40" />
          <p className="text-lg font-semibold">Нет активных сотрудников</p>
          <p className="text-sm mt-1">Сотрудники появятся здесь как только начнут работать</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {employees.map(emp => (
          <EmployeeCard key={emp.employee_id} emp={emp} onClick={() => setSelectedEmp(emp)} />
        ))}
      </div>
    </div>
  );
}

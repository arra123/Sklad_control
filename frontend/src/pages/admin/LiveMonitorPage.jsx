import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../../api/client';
import Spinner from '../../components/ui/Spinner';
import { ArrowLeft, RefreshCw, Zap, TrendingUp, Clock, Package, ScanLine, Award, CheckCircle2, Play, Pause, Timer, ChevronDown } from 'lucide-react';
import { WorkerAvatar } from '../../components/ui/WarehouseIcons';
import { fmtNum, fmtCompact } from './live-monitor/liveMonitorUtils';
import ActivityTimeline from './live-monitor/ActivityTimeline';
import { EmployeeDetailView, EmployeeCard } from './live-monitor/EmployeeDetail';

const POLL_MS = 5000;

export default function LiveMonitorPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const selectedId = searchParams.get('emp') ? parseInt(searchParams.get('emp')) : null;
  const setSelectedId = (id) => {
    const p = {};
    if (id) p.emp = id;
    if (selectedDate !== todayStr) p.date = selectedDate;
    setSearchParams(p);
  };
  const todayStr = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState(searchParams.get('date') || todayStr);
  const isToday = selectedDate === todayStr;
  const [lastUpdate, setLastUpdate] = useState(null);
  const [thresholds, setThresholds] = useState({ t1:3, t2:6, t3:10, t4:15, t5:22, t6:30 });

  // Load settings once
  useEffect(() => {
    api.get('/settings').then(r => {
      const s = r.data;
      setThresholds({
        t1: Number(s.live_scan_t1) || 3,
        t2: Number(s.live_scan_t2) || 6,
        t3: Number(s.live_scan_t3) || 10,
        t4: Number(s.live_scan_t4) || 15,
        t5: Number(s.live_scan_t5) || 22,
        t6: Number(s.live_scan_t6) || 30,
      });
    }).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    try {
      const params = {};
      if (selectedDate !== todayStr) params.date = selectedDate;
      const res = await api.get('/tasks/analytics/live', { params });
      setEmployees(res.data.employees || []);
      setLastUpdate(new Date());
    } catch {} finally { setLoading(false); }
  }, [selectedDate, todayStr]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!isToday) return;
    const iv = setInterval(load, POLL_MS);
    return () => clearInterval(iv);
  }, [load, isToday]);

  const selectedEmployee = useMemo(() =>
    selectedId ? employees.find(e => e.employee_id === selectedId) : null
  , [selectedId, employees]);

  const activeCount = employees.filter(e => e.active_task).length;

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>;

  // Detail view
  if (selectedEmployee) {
    return <EmployeeDetailView
      employee={selectedEmployee}
      date={selectedDate}
      isToday={isToday}
      thresholds={thresholds}
      onBack={() => setSelectedId(null)}
    />;
  }

  // Grid view
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/admin/tasks')} className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              Мониторинг
              {isToday && (
                <span className="flex items-center gap-1 text-xs font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" /> LIVE
                </span>
              )}
            </h1>
            <p className="text-sm text-gray-400 mt-0.5">
              {isToday ? `${activeCount} работают · ` : ''}{employees.length} сотрудников · {employees.reduce((s, e) => s + Number(e.scans_today || 0), 0).toLocaleString('ru-RU')} сканов
              {isToday && lastUpdate && <span className="ml-1">· {lastUpdate.toLocaleTimeString('ru-RU')}</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
            className="px-3 py-1.5 rounded-xl border border-gray-200 text-sm" />
          <button onClick={load} className="p-2 rounded-xl text-gray-400 hover:text-primary-500 hover:bg-primary-50">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {employees.map(emp => (
          <EmployeeCard key={emp.employee_id} emp={emp} thresholds={thresholds} onClick={() => setSelectedId(emp.employee_id)} />
        ))}
      </div>
    </div>
  );
}

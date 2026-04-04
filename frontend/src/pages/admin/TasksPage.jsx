import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Plus, ClipboardList, Video } from 'lucide-react';
import api from '../../api/client';
import Button from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';
import TaskDetailPanel from './tasks/TaskDetailPanel';
import CreateTaskModal from './tasks/CreateTaskModal';
import TaskCard from './tasks/TaskCard';

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function TasksPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  // URL-backed state
  const selectedTaskId = searchParams.get('id');
  const filterEmployee = searchParams.get('employee') || '';
  const filterStatus = searchParams.get('status') || '';

  const selectedTask = useMemo(
    () => (selectedTaskId ? items.find(t => String(t.id) === selectedTaskId) || null : null),
    [selectedTaskId, items]
  );

  const setSelectedTask = useCallback((task) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (task) { next.set('id', String(task.id)); } else { next.delete('id'); }
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const setFilterEmployee = useCallback((val) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (val) { next.set('employee', val); } else { next.delete('employee'); }
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const setFilterStatus = useCallback((val) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (val) { next.set('status', val); } else { next.delete('status'); }
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  // Inline filters (client-side)
  const [searchText, setSearchText] = useState('');
  const [filterLocation, setFilterLocation] = useState('');
  const [filterType, setFilterType] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/tasks', { params: { limit: 100 } });
      setItems(res.data.items);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Derive unique employees, statuses, locations for dropdown options
  const uniqueEmployees = [...new Set(items.map(t => t.employee_name).filter(Boolean))].sort();
  const uniqueLocations = [...new Set(items.flatMap(t => [t.rack_name, t.pallet_row_name].filter(Boolean)))].sort();

  // Client-side filtering
  const filtered = items.filter(task => {
    if (searchText) {
      const q = searchText.toLowerCase();
      if (!(task.title || '').toLowerCase().includes(q)) return false;
    }
    if (filterEmployee && task.employee_name !== filterEmployee) return false;
    if (filterStatus && task.status !== filterStatus) return false;
    if (filterLocation) {
      const loc = task.rack_name || task.pallet_row_name || '';
      if (loc !== filterLocation) return false;
    }
    if (filterType && task.task_type !== filterType) return false;
    return true;
  });

  // Stats
  const statsInProgress = items.filter(t => t.status === 'in_progress').length;
  const statsNew = items.filter(t => t.status === 'new').length;
  const today = new Date().toDateString();
  const statsCompletedToday = items.filter(t => t.status === 'completed' && t.completed_at && new Date(t.completed_at).toDateString() === today).length;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Задачи</h1>
          <p className="text-gray-500 text-sm mt-1">Задачи инвентаризации · нажмите для деталей</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/admin/live-monitor')}
            title="Live-мониторинг"
            className="p-2 rounded-xl text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
          >
            <Video size={18} />
          </button>
          <Button icon={<Plus size={15} />} size="sm" onClick={() => setShowCreate(true)}>
            Создать задачу
          </Button>
        </div>
      </div>

      {/* Stats cards */}
      {!loading && items.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3 text-center">
            <p className="text-2xl font-black text-amber-600">{statsInProgress}</p>
            <p className="text-[11px] text-amber-500 font-medium">В работе</p>
          </div>
          <div className="bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3 text-center">
            <p className="text-2xl font-black text-gray-500">{statsNew}</p>
            <p className="text-[11px] text-gray-400 font-medium">Новых</p>
          </div>
          <div className="bg-green-50 border border-green-100 rounded-2xl px-4 py-3 text-center">
            <p className="text-2xl font-black text-green-600">{statsCompletedToday}</p>
            <p className="text-[11px] text-green-500 font-medium">Выполнено сегодня</p>
          </div>
        </div>
      )}

      {/* Inline filters */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
        <input
          type="text"
          placeholder="Поиск по названию..."
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          className="px-3 py-2 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-200 transition-colors"
        />
        <select
          value={filterEmployee}
          onChange={e => setFilterEmployee(e.target.value)}
          className="px-3 py-2 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-200 transition-colors text-gray-600"
        >
          <option value="">Все сотрудники</option>
          {uniqueEmployees.map(name => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-2 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-200 transition-colors text-gray-600"
        >
          <option value="">Все статусы</option>
          <option value="new">Новые</option>
          <option value="in_progress">В работе</option>
          <option value="paused">На паузе</option>
          <option value="completed">Выполненные</option>
          <option value="cancelled">Отменённые</option>
        </select>
        <select
          value={filterLocation}
          onChange={e => setFilterLocation(e.target.value)}
          className="px-3 py-2 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-200 transition-colors text-gray-600"
        >
          <option value="">Все локации</option>
          {uniqueLocations.map(loc => (
            <option key={loc} value={loc}>{loc}</option>
          ))}
        </select>
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          className="px-3 py-2 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-200 transition-colors text-gray-600"
        >
          <option value="">Все типы</option>
          <option value="inventory">Инвентаризация</option>
          <option value="packaging">Оприходование</option>
          <option value="production_transfer">Перенос</option>
          <option value="bundle_assembly">Сборка</option>
          <option value="returns">Возвраты</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48"><Spinner size="lg" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-gray-400">
          <ClipboardList size={40} className="mb-2 opacity-30" />
          <p className="text-sm">{items.length === 0 ? 'Нет задач' : 'Ничего не найдено'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(task => (
            <TaskCard key={task.id} task={task} onClick={setSelectedTask} />
          ))}
        </div>
      )}

      <CreateTaskModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSuccess={load}
      />

      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onReload={load}
        />
      )}
    </div>
  );
}

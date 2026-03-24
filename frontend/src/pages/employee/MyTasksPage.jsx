import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, Clock, CheckCircle2, ChevronRight, RefreshCw, Box } from 'lucide-react';
import api from '../../api/client';
import Spinner from '../../components/ui/Spinner';
import Badge from '../../components/ui/Badge';

const STATUS_MAP = {
  new: { label: 'Новая', variant: 'default' },
  in_progress: { label: 'В работе', variant: 'warning' },
  completed: { label: 'Выполнена', variant: 'success' },
  cancelled: { label: 'Отменена', variant: 'danger' },
};

export default function MyTasksPage() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/tasks', { params: { limit: 100 } });
      setTasks(res.data.items);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, []);

  const activeTasks = tasks.filter(t => t.status === 'new' || t.status === 'in_progress');
  const doneTasks = tasks.filter(t => t.status === 'completed' || t.status === 'cancelled');

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="p-4 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-gray-900">Мои задачи</h1>
        <button
          onClick={load}
          className="p-2 rounded-xl text-gray-400 hover:text-primary-500 hover:bg-primary-50 transition-all"
        >
          <RefreshCw size={18} />
        </button>
      </div>

      {tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-gray-400">
          <ClipboardList size={48} className="mb-3 opacity-30" />
          <p className="font-medium">Нет задач</p>
          <p className="text-sm mt-1">Задачи появятся здесь когда будут назначены</p>
        </div>
      ) : (
        <>
          {/* Active tasks */}
          {activeTasks.length > 0 && (
            <div className="mb-5">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Активные ({activeTasks.length})
              </h2>
              <div className="space-y-2.5">
                {activeTasks.map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onClick={() => navigate(task.task_type === 'packaging' ? `/employee/packaging/${task.id}` : `/employee/tasks/${task.id}`)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Done tasks */}
          {doneTasks.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Завершённые ({doneTasks.length})
              </h2>
              <div className="space-y-2.5">
                {doneTasks.slice(0, 5).map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onClick={() => navigate(task.task_type === 'packaging' ? `/employee/packaging/${task.id}` : `/employee/tasks/${task.id}`)}
                    muted
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TaskCard({ task, onClick, muted }) {
  const status = STATUS_MAP[task.status] || STATUS_MAP.new;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-4 rounded-2xl border transition-all active:scale-[0.98] ${
        muted
          ? 'bg-white border-gray-100 opacity-60'
          : task.status === 'in_progress'
          ? 'bg-amber-50 border-amber-200 shadow-sm'
          : 'bg-white border-gray-100 shadow-sm hover:shadow-md hover:border-primary-200'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            {(task.task_type === 'packaging' || task.task_type === 'production_transfer') && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded-lg">
                <Box size={10} />
                Оприходование
              </span>
            )}
          </div>
          <p className="font-semibold text-gray-900 leading-tight">{task.title}</p>
          {(task.rack_name || task.shelf_name) && (
            <p className="text-sm text-gray-500 mt-1">
              📦 {task.rack_name}{task.shelf_name ? ` · ${task.shelf_name}` : ''}
            </p>
          )}
          {!task.shelf_name && task.pallet_name && (
            <p className="text-sm text-gray-500 mt-1">
              📦 {task.pallet_row_name || 'Ряд'} · {task.pallet_name}
            </p>
          )}
          {Number(task.task_boxes_total || 0) > 0 && (
            <p className="text-sm text-gray-500 mt-1">
              📦 Коробки {Number(task.task_boxes_completed || 0)} / {Number(task.task_boxes_total || 0)}
            </p>
          )}
          {task.box_barcode && (
            <p className="text-sm text-gray-500 mt-1">
              📦 Коробка {task.box_barcode}
            </p>
          )}
          {task.notes && (
            <p className="text-xs text-gray-400 mt-1 line-clamp-1">{task.notes}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <Badge variant={status.variant}>{status.label}</Badge>
          {task.scans_count > 0 && (
            <span className="text-xs text-gray-400">{task.scans_count} сканирований</span>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between mt-3">
        <span className="text-xs text-gray-400">
          {new Date(task.created_at).toLocaleDateString('ru-RU')}
        </span>
        <ChevronRight size={16} className="text-gray-300" />
      </div>
    </button>
  );
}

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  CheckCircle2, ScanLine, AlertTriangle, Users,
  ChevronRight, ChevronDown,
} from 'lucide-react';
import api from '../../api/client';
import Spinner from '../../components/ui/Spinner';

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function AnalyticsTableView() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState('desc');

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api.get('/tasks/analytics/table-report')
      .then(r => setData(r.data))
      .catch(err => setError(err?.response?.data?.error || err.message || 'Ошибка загрузки'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleExpand = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  const handleSort = (col) => {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir('desc');
    }
  };

  const sortIndicator = (col) => {
    if (sortCol !== col) return <span className="text-gray-300 ml-1">▲▼</span>;
    return <span className="text-primary-500 ml-1">{sortDir === 'asc' ? '▲' : '▼'}</span>;
  };

  const months = data?.months || [];
  const currentMonthKey = months.length > 0 ? `${months[0].year}-${months[0].month}` : null;

  const sortedEmployees = useMemo(() => {
    if (!data?.employees) return [];
    const list = [...data.employees];
    if (!sortCol) return list;

    list.sort((a, b) => {
      let va, vb;
      if (sortCol === 'name') {
        va = a.full_name; vb = b.full_name;
        return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      if (sortCol === 'tasks') {
        va = a.tasks.length; vb = b.tasks.length;
      } else {
        // Format: "2026-3-scans" or "2026-3-errors"
        const parts = sortCol.split('-');
        const field = parts.pop(); // scans or errors
        const key = parts.join('-'); // year-month
        va = a.months[key]?.[field] || 0;
        vb = b.months[key]?.[field] || 0;
      }
      return sortDir === 'asc' ? va - vb : vb - va;
    });
    return list;
  }, [data, sortCol, sortDir]);

  // Grand totals
  const totals = useMemo(() => {
    if (!data?.employees || !months.length) return {};
    const result = { tasks: 0 };
    for (const mo of months) {
      const key = `${mo.year}-${mo.month}`;
      result[`${key}-scans`] = 0;
      result[`${key}-errors`] = 0;
    }
    for (const emp of data.employees) {
      result.tasks += emp.tasks.length;
      for (const mo of months) {
        const key = `${mo.year}-${mo.month}`;
        result[`${key}-scans`] += emp.months[key]?.scans || 0;
        result[`${key}-errors`] += emp.months[key]?.errors || 0;
      }
    }
    return result;
  }, [data, months]);

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>;
  if (error) {
    return (
      <div className="p-6 max-w-md mx-auto mt-10 card text-center">
        <AlertTriangle size={32} className="text-red-400 mx-auto mb-3" />
        <p className="text-sm font-medium text-gray-800 mb-1">Ошибка загрузки</p>
        <p className="text-xs text-gray-400 mb-4">{error}</p>
        <button onClick={load} className="btn-primary text-sm px-4 py-2">Повторить</button>
      </div>
    );
  }
  if (!data) return null;

  const { summary } = data;

  return (
    <>
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Задач выполнено', value: summary.total_tasks, icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-50' },
          { label: 'Всего сканов', value: summary.total_scans, icon: ScanLine, color: 'text-primary-500', bg: 'bg-primary-50' },
          { label: 'Ошибки', value: summary.total_errors, icon: AlertTriangle, color: summary.total_errors > 0 ? 'text-red-500' : 'text-gray-400', bg: summary.total_errors > 0 ? 'bg-red-50' : 'bg-gray-50' },
          { label: 'Сотрудников', value: summary.total_employees, icon: Users, color: 'text-blue-500', bg: 'bg-blue-50' },
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

      {/* View mode */}
      <div className="flex gap-2 mb-4">
        <button className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary-600 text-white shadow-sm">
          По сотрудникам
        </button>
      </div>

      {/* Table */}
      <div className="card overflow-hidden rounded-2xl">
        <div className="overflow-x-auto">
          <table className="data-table w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-4 py-3 font-semibold text-gray-700 cursor-pointer select-none whitespace-nowrap"
                    onClick={() => handleSort('name')}>
                  Сотрудник{sortIndicator('name')}
                </th>
                <th className="text-center px-3 py-3 font-semibold text-gray-700 cursor-pointer select-none whitespace-nowrap"
                    onClick={() => handleSort('tasks')}>
                  Зад.{sortIndicator('tasks')}
                </th>
                {months.map(mo => {
                  const key = `${mo.year}-${mo.month}`;
                  const isCurrent = key === currentMonthKey;
                  return [
                    <th key={`${key}-s`}
                        className={`text-center px-3 py-3 font-semibold cursor-pointer select-none whitespace-nowrap ${isCurrent ? 'bg-primary-50/50 text-primary-700' : 'text-gray-700'}`}
                        onClick={() => handleSort(`${key}-scans`)}>
                      {mo.label} Сканы{sortIndicator(`${key}-scans`)}
                    </th>,
                    <th key={`${key}-e`}
                        className={`text-center px-3 py-3 font-semibold cursor-pointer select-none whitespace-nowrap ${isCurrent ? 'bg-primary-50/50 text-primary-700' : 'text-gray-700'}`}
                        onClick={() => handleSort(`${key}-errors`)}>
                      {mo.label} Ошибки{sortIndicator(`${key}-errors`)}
                    </th>,
                  ];
                })}
              </tr>
            </thead>
            <tbody>
              {sortedEmployees.map(emp => {
                const isOpen = expanded[emp.employee_id];
                return [
                  <tr key={emp.employee_id}
                      className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => toggleExpand(emp.employee_id)}>
                    <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                      <span className="inline-flex items-center gap-2">
                        {isOpen
                          ? <ChevronDown size={14} className="text-gray-400 flex-shrink-0" />
                          : <ChevronRight size={14} className="text-gray-400 flex-shrink-0" />}
                        {emp.full_name}
                      </span>
                    </td>
                    <td className="text-center px-3 py-3 font-semibold text-gray-700">{emp.tasks.length}</td>
                    {months.map(mo => {
                      const key = `${mo.year}-${mo.month}`;
                      const md = emp.months[key] || {};
                      const isCurrent = key === currentMonthKey;
                      return [
                        <td key={`${key}-s`} className={`text-center px-3 py-3 ${isCurrent ? 'bg-primary-50/50 font-bold text-gray-900' : 'text-gray-500'}`}>
                          {md.scans || 0}
                        </td>,
                        <td key={`${key}-e`} className={`text-center px-3 py-3 ${isCurrent ? 'bg-primary-50/50' : ''} ${(md.errors || 0) > 0 ? 'text-red-500 font-semibold' : 'text-gray-400'}`}>
                          {md.errors || 0}
                        </td>,
                      ];
                    })}
                  </tr>,
                  ...(isOpen ? emp.tasks.map(task => (
                    <tr key={`t-${task.task_id}`} className="border-b border-gray-50 bg-gray-25 hover:bg-gray-50 transition-colors">
                      <td className="pl-8 pr-4 py-2 text-gray-600 whitespace-nowrap">
                        <div>
                          <span className="text-sm font-medium">{task.title}</span>
                          {task.location && <span className="text-xs text-gray-400 ml-2">{task.location}</span>}
                        </div>
                        <div className="text-xs text-gray-400">
                          {task.duration_min != null ? `${task.duration_min} мин` : '—'}
                          {task.avg_gap != null ? ` · ${task.avg_gap}с/скан` : ''}
                          {' · '}{fmtDate(task.completed_at)}
                        </div>
                      </td>
                      <td className="text-center px-3 py-2 text-gray-400 text-xs">—</td>
                      {months.map(mo => {
                        const key = `${mo.year}-${mo.month}`;
                        const isCurrent = key === currentMonthKey;
                        const isTaskMonth = task.month_key === key;
                        return [
                          <td key={`${key}-s`} className={`text-center px-3 py-2 text-xs ${isCurrent ? 'bg-primary-50/50' : ''} ${isTaskMonth ? 'text-gray-700' : 'text-gray-300'}`}>
                            {isTaskMonth ? task.scans_count : ''}
                          </td>,
                          <td key={`${key}-e`} className={`text-center px-3 py-2 text-xs ${isCurrent ? 'bg-primary-50/50' : ''} ${isTaskMonth && task.errors_count > 0 ? 'text-red-500' : isTaskMonth ? 'text-gray-400' : 'text-gray-300'}`}>
                            {isTaskMonth ? task.errors_count : ''}
                          </td>,
                        ];
                      })}
                    </tr>
                  )) : []),
                ];
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-gray-50 font-bold">
                <td className="px-4 py-3 text-gray-900">Итого</td>
                <td className="text-center px-3 py-3 text-gray-900">{totals.tasks}</td>
                {months.map(mo => {
                  const key = `${mo.year}-${mo.month}`;
                  const isCurrent = key === currentMonthKey;
                  return [
                    <td key={`${key}-s`} className={`text-center px-3 py-3 text-gray-900 ${isCurrent ? 'bg-primary-50/50' : ''}`}>
                      {totals[`${key}-scans`]}
                    </td>,
                    <td key={`${key}-e`} className={`text-center px-3 py-3 ${isCurrent ? 'bg-primary-50/50' : ''} ${totals[`${key}-errors`] > 0 ? 'text-red-500' : 'text-gray-400'}`}>
                      {totals[`${key}-errors`]}
                    </td>,
                  ];
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </>
  );
}

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../../api/client';
import Spinner from '../../../components/ui/Spinner';
import { ArrowLeft, RefreshCw, Zap, TrendingUp, Clock, Package, ScanLine, Award, CheckCircle2, Play, Pause, Timer, ChevronDown } from 'lucide-react';
import { WorkerAvatar } from '../../../components/ui/WarehouseIcons';
import { timeAgo, fmtNum, fmtCompact, fmtDuration, fmtTime, taskTypeLabel, taskTypeBg, taskTypeBarColor, statusBadge } from './liveMonitorUtils';

function EmployeeDetailView({ employeeId, employees, onBack, thresholds, date, isToday = true }) {
  const navigate = useNavigate();
  const [timeline, setTimeline] = useState(null);
  const [loading, setLoading] = useState(true);
  const [breakLoading, setBreakLoading] = useState(false);
  const [expandedTaskId, setExpandedTaskId] = useState(null);

  const emp = useMemo(() => employees.find(e => e.employee_id === employeeId), [employees, employeeId]);

  const loadTimeline = useCallback(async () => {
    try {
      const dateQ = !isToday && date ? `?date=${date}` : '';
      const res = await api.get(`/tasks/analytics/live/${employeeId}/timeline${dateQ}`);
      setTimeline(res.data);
      setLoading(false);
    } catch { setLoading(false); }
  }, [employeeId]);

  useEffect(() => {
    loadTimeline();
    if (isToday) {
      const id = setInterval(loadTimeline, POLL_MS);
      return () => clearInterval(id);
    }
  }, [loadTimeline, isToday]);

  const [showBreakForm, setShowBreakForm] = useState(false);
  const [breakFrom, setBreakFrom] = useState('');
  const [breakTo, setBreakTo] = useState('');

  const addTechBreak = async () => {
    if (!breakFrom || !breakTo) return;
    setBreakLoading(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      await api.post('/staff/breaks/admin-add', {
        employee_id: employeeId,
        break_type: 'tech',
        started_at: new Date(`${today}T${breakFrom}`).toISOString(),
        ended_at: new Date(`${today}T${breakTo}`).toISOString(),
      });
      setShowBreakForm(false);
      setBreakFrom(''); setBreakTo('');
      await loadTimeline();
    } catch {} finally { setBreakLoading(false); }
  };

  if (!emp) return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <p className="text-sm text-gray-400">Загрузка данных сотрудника...</p>
      </div>
      <div className="flex justify-center py-12"><Spinner size="lg" /></div>
    </div>
  );

  const task = emp.active_task;
  const isLive = task?.status === 'in_progress' && emp.last_scan_at && (Date.now() - new Date(emp.last_scan_at).getTime()) < 120000;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-gray-900">{emp.full_name}</h2>
            {isLive && (
              <span className="flex items-center gap-1 text-[10px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" /> LIVE
              </span>
            )}
          </div>
          <p className="text-sm text-gray-400">
            Баланс: {fmtNum(Math.round(emp.balance))} GRA · Последний скан: {emp.last_scan_at ? timeAgo(emp.last_scan_at) : '—'}
          </p>
        </div>
        {/* Active break indicator + end button */}
        {(() => {
          const activeBr = timeline?.breaks?.find(b => !b.ended_at);
          if (activeBr) {
            const brLabel = activeBr.break_type === 'lunch' ? '🍽 Обед' : activeBr.break_type === 'rest' ? '☕ Перерыв' : '🔧 Тех. проблема';
            return (
              <button onClick={async () => {
                setBreakLoading(true);
                try {
                  await api.post('/staff/breaks/end', { employee_id: employeeId });
                  await loadTimeline();
                } catch {} finally { setBreakLoading(false); }
              }} disabled={breakLoading}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-red-100 text-red-700 hover:bg-red-200 ring-1 ring-red-300 transition-all flex-shrink-0">
                {brLabel} — Снять
              </button>
            );
          }
          return (
            <button onClick={() => setShowBreakForm(v => !v)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-gray-100 text-gray-500 hover:bg-orange-50 hover:text-orange-600 transition-all flex-shrink-0">
              <Pause size={14} /> Доб. паузу
            </button>
          );
        })()}
      </div>

      {/* Tech break form */}
      {showBreakForm && (
        <div className="mb-4 bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-center gap-3 flex-wrap" style={{ animation: 'fadeIn 0.15s ease-out' }}>
          <span className="text-xs font-semibold text-orange-700">Добавить паузу:</span>
          <div className="flex items-center gap-1.5">
            <input type="time" value={breakFrom} onChange={e => setBreakFrom(e.target.value)}
              className="px-2 py-1.5 rounded-lg border border-orange-200 text-xs bg-white w-24 focus:outline-none focus:ring-1 focus:ring-orange-400" />
            <span className="text-gray-400 text-xs">→</span>
            <input type="time" value={breakTo} onChange={e => setBreakTo(e.target.value)}
              className="px-2 py-1.5 rounded-lg border border-orange-200 text-xs bg-white w-24 focus:outline-none focus:ring-1 focus:ring-orange-400" />
          </div>
          <button onClick={addTechBreak} disabled={breakLoading || !breakFrom || !breakTo}
            className="px-3 py-1.5 rounded-lg bg-orange-500 text-white text-xs font-semibold hover:bg-orange-600 disabled:opacity-40 transition-colors">
            Добавить
          </button>
          <button onClick={() => setShowBreakForm(false)} className="text-xs text-gray-400 hover:text-gray-600">Отмена</button>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        {[
          { icon: ScanLine, label: 'Сканов', value: fmtNum(emp.scans_today), bg: 'bg-gray-50', color: 'text-gray-800' },
          { icon: Award, label: 'Заработок', value: fmtNum(Math.round(emp.earned_today)), bg: 'bg-green-50', color: 'text-green-700' },
          { icon: Zap, label: 'Скорость', value: emp.avg_speed_today ? `${emp.avg_speed_today}с` : '—', bg: 'bg-blue-50', color: 'text-blue-700' },
          { icon: TrendingUp, label: 'Задач', value: emp.tasks_today, bg: 'bg-purple-50', color: 'text-purple-700' },
        ].map((s, i) => (
          <div key={i} className={`${s.bg} rounded-2xl p-3 text-center`}>
            <s.icon size={16} className={`mx-auto mb-1 ${s.color} opacity-50`} />
            <p className={`text-xl font-black ${s.color}`}>{s.value}</p>
            <p className="text-[9px] uppercase font-semibold text-gray-400 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Activity Timeline */}
      {loading ? (
        <div className="flex justify-center py-10"><Spinner size="lg" /></div>
      ) : timeline ? (
        <>
          <ActivityTimeline buckets={timeline.activity_buckets} tasks={timeline.tasks} breaks={timeline.breaks} thresholds={thresholds} />

          {/* Tasks list */}
          <div className="mt-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Задачи сегодня ({timeline.tasks.length})
            </p>
            {timeline.tasks.length === 0 ? (
              <div className="text-center py-8 text-gray-300 bg-white rounded-2xl border border-gray-100">
                <Package size={24} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm">Нет задач сегодня</p>
              </div>
            ) : (
              <div className="space-y-2">
                {timeline.tasks.map(t => {
                  const st = statusBadge(t.status);
                  const StIcon = st.icon;
                  const durationSec = t.started_at && t.completed_at
                    ? (new Date(t.completed_at) - new Date(t.started_at)) / 1000
                    : t.started_at ? (Date.now() - new Date(t.started_at)) / 1000 : 0;
                  const location = [t.rack_name, t.shelf_code || t.shelf_name, t.pallet_name].filter(Boolean).join(' → ');

                  const isExpanded = expandedTaskId === t.id;
                  const pauses = t.pause_log || [];
                  const todayMid = new Date(); todayMid.setHours(0,0,0,0);
                  const totalPause = pauses.reduce((s, p) => {
                    if (!p.paused_at) return s;
                    const start = Math.max(new Date(p.paused_at).getTime(), todayMid.getTime());
                    const end = p.resumed_at ? new Date(p.resumed_at).getTime() : Date.now();
                    return s + Math.max(0, end - start) / 1000;
                  }, 0);

                  return (
                    <div key={t.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                      {/* Header — clickable to expand */}
                      <button
                        onClick={() => setExpandedTaskId(isExpanded ? null : t.id)}
                        className="w-full flex items-center gap-3 p-3.5 text-left hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${taskTypeBg(t.task_type)}`}>
                              {taskTypeLabel(t.task_type)}
                            </span>
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex items-center gap-1 ${st.bg}`}>
                              <StIcon size={10} /> {st.label}
                            </span>
                          </div>
                          <p className="text-sm font-medium text-gray-900 truncate">{t.title}</p>
                          {location && <p className="text-[11px] text-gray-400">{location}</p>}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-xs text-gray-500">{fmtTime(t.started_at)} → {t.completed_at ? fmtTime(t.completed_at) : '...'}</p>
                          <p className="text-xs font-bold text-green-600">+{fmtNum(Math.round(parseFloat(t.earned)))} GRA</p>
                        </div>
                        <ChevronDown size={16} className={`text-gray-300 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
                      </button>

                      {/* Expanded details */}
                      {isExpanded && (
                        <div className="px-3.5 pb-3.5 border-t border-gray-50" style={{ animation: 'fadeIn 0.15s ease-out' }}>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
                            <div className="bg-gray-50 rounded-lg px-3 py-2">
                              <p className="text-[9px] text-gray-400 uppercase font-bold">Длит.</p>
                              <p className="text-xs font-semibold text-gray-700">{fmtDuration(durationSec)}</p>
                            </div>
                            <div className="bg-gray-50 rounded-lg px-3 py-2">
                              <p className="text-[9px] text-gray-400 uppercase font-bold">Сканов</p>
                              <p className="text-xs font-semibold text-gray-700">{fmtNum(t.scan_count)}</p>
                            </div>
                            <div className="bg-gray-50 rounded-lg px-3 py-2">
                              <p className="text-[9px] text-gray-400 uppercase font-bold">Ср. скорость</p>
                              <p className="text-xs font-semibold text-gray-700">{t.avg_scan_time ? `${t.avg_scan_time} с` : '—'}</p>
                            </div>
                            <div className="bg-green-50 rounded-lg px-3 py-2">
                              <p className="text-[9px] text-green-500 uppercase font-bold">Заработок</p>
                              <p className="text-xs font-black text-green-700">+{fmtNum(Math.round(parseFloat(t.earned)))} GRA</p>
                            </div>
                          </div>
                          {parseInt(t.boxes_total) > 0 && (
                            <div className="mt-2">
                              <div className="flex items-center justify-between text-[10px] text-gray-400 mb-1">
                                <span>Коробки</span>
                                <span>{t.boxes_done}/{t.boxes_total}</span>
                              </div>
                              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full bg-indigo-400 rounded-full transition-all"
                                  style={{ width: `${Math.round((parseInt(t.boxes_done) / parseInt(t.boxes_total)) * 100)}%` }} />
                              </div>
                            </div>
                          )}
                          {pauses.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-gray-100">
                              <p className="text-[10px] font-bold text-red-400 mb-1">⏸ Паузы ({pauses.length}) — {fmtDuration(totalPause)}</p>
                              <div className="flex flex-wrap gap-1">
                                {pauses.map((p, idx) => (
                                  <span key={idx} className="text-[10px] bg-red-50 text-red-500 rounded px-1.5 py-0.5">
                                    {fmtTime(p.paused_at)} → {p.resumed_at ? fmtTime(p.resumed_at) : 'сейчас'}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          <button onClick={() => navigate(`/admin/tasks?id=${t.id}`)}
                            className="mt-2 text-[11px] text-primary-500 hover:text-primary-700 font-medium">
                            Открыть задачу →
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

// ─── Employee Card ──────────────────────────────────────────────────────────

function EmployeeCard({ emp, onClick }) {
  const task = emp.active_task;
  const isActive = task && task.status === 'in_progress';
  const lastScanRecent = emp.last_scan_at && (Date.now() - new Date(emp.last_scan_at).getTime()) < 120000;

  const statusDot = isActive && lastScanRecent
    ? <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" /><span className="text-[10px] font-bold text-green-600">LIVE</span></span>
    : isActive
      ? <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
      : <span className="w-2 h-2 rounded-full bg-gray-200 inline-block" />;

  return (
    <button onClick={onClick} className="w-full text-left bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-primary-200 transition-all p-3.5 flex flex-col">
      {/* Name + status */}
      <div className="flex items-start gap-2 mb-2">
        <div className="w-7 h-7 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center flex-shrink-0">
          <WorkerAvatar size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-xs font-bold text-gray-900 leading-snug truncate">{emp.full_name}</h3>
          {emp.position && <p className="text-[9px] text-gray-400 truncate">{emp.position}</p>}
        </div>
        <div className="flex-shrink-0 mt-0.5">{statusDot}</div>
      </div>

      {/* Task zone — fixed height */}
      <div className="h-[56px] mb-2">
        {task ? (
          <div className="px-2 py-1.5 bg-primary-50 rounded-lg border border-primary-100 h-full overflow-hidden">
            <p className="text-[11px] font-semibold text-primary-700 truncate leading-tight">{task.title}</p>
            <div className="flex items-center gap-1 mt-1 text-[9px] text-primary-500 flex-wrap leading-tight">
              <span className="bg-primary-100 rounded px-1 py-px font-bold">{taskTypeLabel(task.type)}</span>
              {task.scans > 0 && <span>· {fmtCompact(task.scans)}</span>}
              {task.boxes_total > 0 && <span>· {task.boxes_done}/{task.boxes_total}</span>}
              {task.type === 'bundle_assembly' && <span>· {task.assembled}/{task.bundle_qty}</span>}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full bg-gray-50 rounded-lg border border-dashed border-gray-200">
            <p className="text-[11px] text-gray-300 italic">Нет активной задачи</p>
          </div>
        )}
      </div>

      {/* Stats — compact */}
      <div className="grid grid-cols-3 gap-1 mt-auto">
        <div className="bg-gray-50 rounded-lg py-1.5 text-center overflow-hidden">
          <p className="text-[7px] text-gray-400 uppercase font-bold">Сканов</p>
          <p className="text-xs font-black text-gray-800 leading-tight mt-px truncate px-0.5">{fmtCompact(emp.scans_today)}</p>
        </div>
        <div className="bg-green-50 rounded-lg py-1.5 text-center overflow-hidden">
          <p className="text-[7px] text-green-500 uppercase font-bold">GRA</p>
          <p className="text-xs font-black text-green-700 leading-tight mt-px truncate px-0.5">{fmtCompact(Math.round(emp.earned_today))}</p>
        </div>
        <div className="bg-blue-50 rounded-lg py-1.5 text-center overflow-hidden">
          <p className="text-[7px] text-blue-500 uppercase font-bold">Скорость</p>
          <p className="text-xs font-black text-blue-700 leading-tight mt-px truncate px-0.5">{emp.avg_speed_today ? `${emp.avg_speed_today}с` : '—'}</p>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-gray-50 text-[9px] text-gray-400">
        <span>{emp.tasks_today} задач</span>
        <span>{emp.last_scan_at ? timeAgo(emp.last_scan_at) : '—'}</span>
      </div>
    </button>
  );
}

export { EmployeeDetailView, EmployeeCard };

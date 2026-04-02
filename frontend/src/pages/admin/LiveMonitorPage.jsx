import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';
import Spinner from '../../components/ui/Spinner';
import { ArrowLeft, RefreshCw, Zap, TrendingUp, Clock, Package, ScanLine, Award, CheckCircle2, Play, Pause, Timer } from 'lucide-react';

const POLL_MS = 5000;

// ─── Helpers ────────────────────────────────────────────────────────────────

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

function fmtDuration(seconds) {
  if (!seconds || seconds <= 0) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}ч ${m}м`;
  if (m > 0) return `${m}м`;
  return `${Math.floor(seconds)}с`;
}

function fmtTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function taskTypeLabel(type) {
  if (type === 'bundle_assembly') return 'Сборка';
  if (type === 'packaging') return 'Оприход.';
  if (type === 'production_transfer') return 'Перенос';
  return 'Инвент.';
}

function taskTypeBg(type) {
  if (type === 'bundle_assembly') return 'bg-purple-100 text-purple-700';
  if (type === 'packaging') return 'bg-amber-100 text-amber-700';
  if (type === 'production_transfer') return 'bg-blue-100 text-blue-700';
  return 'bg-primary-100 text-primary-700';
}

function statusBadge(status) {
  if (status === 'completed') return { bg: 'bg-green-100 text-green-700', label: 'Завершена', icon: CheckCircle2 };
  if (status === 'in_progress') return { bg: 'bg-blue-100 text-blue-700', label: 'В работе', icon: Play };
  if (status === 'paused') return { bg: 'bg-amber-100 text-amber-700', label: 'Пауза', icon: Pause };
  return { bg: 'bg-gray-100 text-gray-600', label: status, icon: Clock };
}

// ─── Activity Timeline ──────────────────────────────────────────────────────

function ActivityTimeline({ buckets, tasks }) {
  const [hoveredBucket, setHoveredBucket] = useState(null);

  // Calculate time range: from first activity to now
  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const nowBucket = Math.floor((now - todayStart) / 300000); // current 5-min bucket

  // Find range
  const allBucketNums = buckets.map(b => parseInt(b.bucket));
  const taskBuckets = tasks.filter(t => t.started_at).map(t => Math.floor((new Date(t.started_at) - todayStart) / 300000));
  const allNums = [...allBucketNums, ...taskBuckets];

  if (allNums.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Активность за день</p>
        <div className="text-center py-6 text-gray-300">
          <Clock size={24} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">Нет активности сегодня</p>
        </div>
      </div>
    );
  }

  const minBucket = Math.min(...allNums);
  const maxBucket = Math.max(nowBucket, ...allNums);
  const totalBuckets = maxBucket - minBucket + 1;

  // Build bucket map for fast lookup
  const bucketMap = {};
  let maxScans = 1;
  for (const b of buckets) {
    const num = parseInt(b.bucket);
    bucketMap[num] = parseInt(b.scan_count);
    if (bucketMap[num] > maxScans) maxScans = bucketMap[num];
  }

  // Calculate active/idle time
  let activeBuckets = 0;
  for (let i = minBucket; i <= maxBucket; i++) {
    if (bucketMap[i]) activeBuckets++;
  }
  const totalWorkBuckets = maxBucket - minBucket + 1;
  const idleBuckets = totalWorkBuckets - activeBuckets;
  const activeMinutes = activeBuckets * 5;
  const idleMinutes = idleBuckets * 5;

  // Hour markers
  const startHour = Math.floor(minBucket * 5 / 60);
  const endHour = Math.ceil((maxBucket + 1) * 5 / 60);
  const hourMarkers = [];
  for (let h = startHour; h <= endHour; h++) {
    const hBucket = (h * 60) / 5; // bucket number for this hour
    if (hBucket >= minBucket && hBucket <= maxBucket) {
      const pct = ((hBucket - minBucket) / totalBuckets) * 100;
      hourMarkers.push({ hour: h, pct });
    }
  }

  // Now marker position
  const nowPct = Math.min(100, ((nowBucket - minBucket) / totalBuckets) * 100);

  function bucketToTime(bucketNum) {
    const minutes = bucketNum * 5;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Активность за день</p>
        <div className="flex items-center gap-3 text-[10px]">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded bg-green-200" />
            <span className="w-2.5 h-2.5 rounded bg-green-400" />
            <span className="w-2.5 h-2.5 rounded bg-green-500" />
            <span className="w-2.5 h-2.5 rounded bg-green-600" />
            <span className="text-gray-400 ml-0.5">1→30+</span>
          </span>
          <span className="text-gray-500">Работа: <b className="text-green-700">{fmtDuration(activeMinutes * 60)}</b></span>
          <span className="text-gray-500">Простой: <b className="text-red-500">{fmtDuration(idleMinutes * 60)}</b></span>
        </div>
      </div>

      {/* Timeline bar */}
      <div className="relative">
        <div className="flex h-10 rounded-xl overflow-hidden bg-gray-100 border border-gray-200 relative">
          {Array.from({ length: totalBuckets }).map((_, i) => {
            const bNum = minBucket + i;
            const scans = bucketMap[bNum] || 0;
            const isHovered = hoveredBucket === bNum;
            // Absolute intensity scale: 1-5 light, 6-15 medium, 16-30 strong, 30+ max
            const greenClass = scans === 0 ? ''
              : scans <= 5 ? (isHovered ? 'bg-green-400' : 'bg-green-200')
              : scans <= 15 ? (isHovered ? 'bg-green-500' : 'bg-green-400')
              : scans <= 30 ? (isHovered ? 'bg-green-600' : 'bg-green-500')
              : (isHovered ? 'bg-green-700' : 'bg-green-600');

            return (
              <div
                key={bNum}
                className="relative h-full transition-all duration-75"
                style={{ width: `${100 / totalBuckets}%` }}
                onMouseEnter={() => setHoveredBucket(bNum)}
                onMouseLeave={() => setHoveredBucket(null)}
              >
                <div
                  className={`h-full ${scans > 0
                    ? greenClass
                    : isHovered ? 'bg-gray-200' : 'bg-gray-100'
                  } transition-colors`}
                />
                {/* Tooltip */}
                {isHovered && (
                  <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-20 px-2.5 py-1.5 bg-gray-900 text-white rounded-lg text-[10px] whitespace-nowrap shadow-lg pointer-events-none">
                    <p className="font-bold">{bucketToTime(bNum)}–{bucketToTime(bNum + 1)}</p>
                    <p>{scans > 0 ? `${scans} сканов` : 'Простой'}</p>
                  </div>
                )}
              </div>
            );
          })}
          {/* Now marker */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10"
            style={{ left: `${nowPct}%` }}
          >
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-red-500" />
          </div>
        </div>

        {/* Hour labels */}
        <div className="relative h-5 mt-1">
          {hourMarkers.map(({ hour, pct }) => (
            <span
              key={hour}
              className="absolute text-[10px] text-gray-400 font-medium -translate-x-1/2"
              style={{ left: `${pct}%` }}
            >
              {String(hour).padStart(2, '0')}:00
            </span>
          ))}
        </div>
      </div>

      {/* Task spans — lane layout to avoid overlaps */}
      {tasks.length > 0 && (() => {
        const LANE_H = 22; // px per lane
        const GAP = 2;
        // Build items with positions
        const items = tasks.filter(t => t.started_at).map(t => {
          const startB = Math.max(minBucket, Math.floor((new Date(t.started_at) - todayStart) / 300000));
          const endB = t.completed_at
            ? Math.min(maxBucket, Math.floor((new Date(t.completed_at) - todayStart) / 300000))
            : nowBucket;
          return { ...t, startB, endB };
        }).sort((a, b) => a.startB - b.startB);

        // Assign lanes — greedy: put each task in the first lane where it doesn't overlap
        const lanes = []; // lanes[i] = endB of last task in that lane
        const itemLanes = items.map(item => {
          let lane = lanes.findIndex(laneEnd => item.startB > laneEnd);
          if (lane === -1) { lane = lanes.length; lanes.push(0); }
          lanes[lane] = item.endB;
          return lane;
        });

        const totalLanes = lanes.length || 1;

        return (
          <div className="relative mt-1 mb-1" style={{ height: totalLanes * (LANE_H + GAP) }}>
            {items.map((t, i) => {
              const leftPct = ((t.startB - minBucket) / totalBuckets) * 100;
              const widthPct = Math.max(2, ((t.endB - t.startB + 1) / totalBuckets) * 100);
              const colors = t.status === 'in_progress' ? 'bg-blue-100 border-blue-300' : 'bg-green-50 border-green-300';
              const top = itemLanes[i] * (LANE_H + GAP);
              return (
                <div
                  key={t.id}
                  className={`absolute ${colors} border rounded-md flex items-center overflow-hidden px-1.5`}
                  style={{ left: `${leftPct}%`, width: `${widthPct}%`, top, height: LANE_H }}
                  title={`${t.title}\n${fmtTime(t.started_at)} → ${t.completed_at ? fmtTime(t.completed_at) : 'сейчас'}`}
                >
                  <span className="text-[8px] font-semibold text-gray-600 truncate">
                    {taskTypeLabel(t.task_type)}
                    {t.completed_at && <span className="text-gray-400 ml-1">{fmtTime(t.started_at)}–{fmtTime(t.completed_at)}</span>}
                  </span>
                </div>
              );
            })}
          </div>
        );
      })()}
    </div>
  );
}

// ─── Employee Detail View ───────────────────────────────────────────────────

function EmployeeDetailView({ employeeId, employees, onBack }) {
  const [timeline, setTimeline] = useState(null);
  const [loading, setLoading] = useState(true);

  const emp = useMemo(() => employees.find(e => e.employee_id === employeeId), [employees, employeeId]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await api.get(`/tasks/analytics/live/${employeeId}/timeline`);
        if (alive) { setTimeline(res.data); setLoading(false); }
      } catch { if (alive) setLoading(false); }
    };
    load();
    const id = setInterval(load, POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, [employeeId]);

  if (!emp) return null;

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
      </div>

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
          <ActivityTimeline buckets={timeline.activity_buckets} tasks={timeline.tasks} />

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

                  return (
                    <div key={t.id} className="bg-white rounded-xl border border-gray-100 p-4 hover:border-gray-200 transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${taskTypeBg(t.task_type)}`}>
                              {taskTypeLabel(t.task_type)}
                            </span>
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex items-center gap-1 ${st.bg}`}>
                              <StIcon size={10} /> {st.label}
                            </span>
                          </div>
                          <p className="text-sm font-semibold text-gray-900 truncate">{t.title}</p>
                          {location && <p className="text-[11px] text-gray-400 mt-0.5">{location}</p>}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 mt-2.5 pt-2.5 border-t border-gray-50 flex-wrap">
                        <span className="flex items-center gap-1 text-[11px] text-gray-500">
                          <Clock size={11} className="flex-shrink-0" />
                          {fmtTime(t.started_at)} → {t.completed_at ? fmtTime(t.completed_at) : 'сейчас'}
                        </span>
                        <span className="flex items-center gap-1 text-[11px] text-gray-500">
                          <Timer size={11} className="flex-shrink-0" />
                          {fmtDuration(durationSec)}
                        </span>
                        <span className="flex items-center gap-1 text-[11px] text-gray-500">
                          <ScanLine size={11} className="flex-shrink-0" />
                          {fmtNum(t.scan_count)}
                        </span>
                        <span className="flex items-center gap-1 text-[11px] font-semibold text-green-600">
                          <Award size={11} className="flex-shrink-0" />
                          {fmtNum(Math.round(parseFloat(t.earned)))}
                        </span>
                        {parseInt(t.boxes_total) > 0 && (
                          <span className="flex items-center gap-1 text-[11px] text-gray-500">
                            <Package size={11} className="flex-shrink-0" />
                            {t.boxes_done}/{t.boxes_total}
                          </span>
                        )}
                      </div>

                      {/* Progress bar for in_progress tasks */}
                      {t.status === 'in_progress' && parseInt(t.boxes_total) > 0 && (
                        <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 rounded-full transition-all"
                            style={{ width: `${Math.round((parseInt(t.boxes_done) / parseInt(t.boxes_total)) * 100)}%` }}
                          />
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

function fmtCompact(n) {
  n = Number(n || 0);
  if (n >= 100000) return `${(n / 1000).toFixed(0)}k`;
  if (n >= 10000) return `${(n / 1000).toFixed(1)}k`;
  return fmtNum(n);
}

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
      <div className="flex items-start justify-between gap-1.5 mb-2">
        <h3 className="text-xs font-bold text-gray-900 leading-snug line-clamp-2">{emp.full_name}</h3>
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

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function LiveMonitorPage() {
  const navigate = useNavigate();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);

  // Stable polling — no dependency on selectedId
  const loadGrid = useCallback(async () => {
    try {
      const res = await api.get('/tasks/analytics/live');
      setEmployees(res.data.employees || []);
      setLastUpdate(new Date());
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => {
    loadGrid();
    const id = setInterval(loadGrid, POLL_MS);
    return () => clearInterval(id);
  }, [loadGrid]);

  // Detail view
  if (selectedId) {
    return (
      <EmployeeDetailView
        employeeId={selectedId}
        employees={employees}
        onBack={() => setSelectedId(null)}
      />
    );
  }

  // Sort: active+live first, then active, then by scans
  const sorted = [...employees].sort((a, b) => {
    const aActive = a.active_task?.status === 'in_progress' ? 1 : 0;
    const bActive = b.active_task?.status === 'in_progress' ? 1 : 0;
    if (aActive !== bActive) return bActive - aActive;
    const aRecent = a.last_scan_at && (Date.now() - new Date(a.last_scan_at).getTime()) < 120000 ? 1 : 0;
    const bRecent = b.last_scan_at && (Date.now() - new Date(b.last_scan_at).getTime()) < 120000 ? 1 : 0;
    if (aRecent !== bRecent) return bRecent - aRecent;
    return (b.scans_today || 0) - (a.scans_today || 0);
  });

  const activeCount = employees.filter(e => e.active_task?.status === 'in_progress').length;

  return (
    <div className="p-6 max-w-6xl mx-auto">
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
              {activeCount} работают · {employees.length} всего · обновление каждые 5с
              {lastUpdate && <span className="ml-2">{lastUpdate.toLocaleTimeString('ru-RU')}</span>}
            </p>
          </div>
        </div>
        <button onClick={loadGrid} className="p-2 rounded-xl text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-colors">
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

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {sorted.map(emp => (
          <EmployeeCard key={emp.employee_id} emp={emp} onClick={() => setSelectedId(emp.employee_id)} />
        ))}
      </div>
    </div>
  );
}

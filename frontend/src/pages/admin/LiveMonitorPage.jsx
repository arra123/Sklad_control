import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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

function fmtCompact(n) {
  n = Number(n || 0);
  if (n >= 100000) return `${(n / 1000).toFixed(0)}k`;
  if (n >= 10000) return `${(n / 1000).toFixed(1)}k`;
  return fmtNum(n);
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

function ActivityTimeline({ buckets, tasks, breaks = [], thresholds }) {
  const T1 = thresholds?.t1 || 3;
  const T2 = thresholds?.t2 || 6;
  const T3 = thresholds?.t3 || 10;
  const T4 = thresholds?.t4 || 15;
  const T5 = thresholds?.t5 || 22;
  const T6 = thresholds?.t6 || 30;
  const [hoveredBucket, setHoveredBucket] = useState(null);
  const [zoomLevel, setZoomLevel] = useState(0);
  const [panOffset, setPanOffset] = useState(0);
  const [popupTask, setPopupTask] = useState(null);
  const dragRef = useRef(null);
  const barRef = useRef(null);

  // Fixed work day: 07:00–17:00
  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const nowBucket = Math.floor((now - todayStart) / 300000);
  const WORK_START = 84; // 07:00 = 7*60/5
  const WORK_END = 204;  // 17:00 = 17*60/5
  const FULL_RANGE = WORK_END - WORK_START;

  // Zoom: 0=120 buckets (full), 1=60, 2=30, 3=15
  const visibleCount = Math.max(12, Math.floor(FULL_RANGE / Math.pow(2, zoomLevel)));
  const center = Math.min(WORK_END - Math.floor(visibleCount / 2), Math.max(WORK_START + Math.floor(visibleCount / 2), Math.floor((WORK_START + Math.min(nowBucket, WORK_END)) / 2) + panOffset));
  const minBucket = Math.max(WORK_START, center - Math.floor(visibleCount / 2));
  const maxBucket = Math.min(WORK_END, minBucket + visibleCount);
  const totalBuckets = maxBucket - minBucket;

  const canZoomIn = zoomLevel < 3;
  const canZoomOut = zoomLevel > 0;
  const canPanLeft = minBucket > WORK_START;
  const canPanRight = maxBucket < WORK_END;

  // Build break bucket set for coloring
  const breakBuckets = new Set();
  for (const br of breaks) {
    const bStart = Math.max(minBucket, Math.floor((new Date(br.started_at) - todayStart) / 300000));
    const bEnd = br.ended_at
      ? Math.min(maxBucket, Math.floor((new Date(br.ended_at) - todayStart) / 300000))
      : Math.min(maxBucket, nowBucket);
    for (let i = bStart; i <= bEnd; i++) breakBuckets.add(i);
  }

  // Build task pause buckets from pause_log
  const taskPauseBuckets = new Set();
  for (const t of tasks) {
    const log = t.pause_log || [];
    for (const p of log) {
      if (!p.paused_at) continue;
      const pStart = Math.max(minBucket, Math.floor((new Date(p.paused_at) - todayStart) / 300000));
      const pEnd = p.resumed_at
        ? Math.min(maxBucket, Math.floor((new Date(p.resumed_at) - todayStart) / 300000))
        : Math.min(maxBucket, nowBucket);
      for (let i = pStart; i <= pEnd; i++) taskPauseBuckets.add(i);
    }
  }

  // Map bucket → active task name for richer tooltips
  const bucketTaskMap = {};
  for (const t of tasks) {
    if (!t.started_at) continue;
    const tStart = Math.floor((new Date(t.started_at) - todayStart) / 300000);
    const tEnd = t.completed_at ? Math.floor((new Date(t.completed_at) - todayStart) / 300000) : nowBucket;
    for (let i = Math.max(minBucket, tStart); i <= Math.min(maxBucket, tEnd); i++) {
      bucketTaskMap[i] = taskTypeLabel(t.task_type);
    }
  }

  // Pre-compute contiguous regions for range tooltips
  const bucketType = (b) => {
    if (breakBuckets.has(b)) return 'break';
    if (taskPauseBuckets.has(b) && !(bucketMap[b] > 0)) return 'pause';
    if (bucketMap[b] > 0) return 'active';
    return 'idle';
  };
  const regionMap = {};
  for (let i = minBucket; i < maxBucket; i++) {
    if (regionMap[i]) continue;
    const type = bucketType(i);
    let end = i;
    while (end + 1 < maxBucket && bucketType(end + 1) === type) end++;
    for (let j = i; j <= end; j++) regionMap[j] = { start: i, end: end + 1, type };
  }

  if (buckets.length === 0 && tasks.length === 0) {
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

  // Build bucket map for fast lookup
  const bucketMap = {};
  let maxScans = 1;
  for (const b of buckets) {
    const num = parseInt(b.bucket);
    bucketMap[num] = parseInt(b.scan_count);
    if (bucketMap[num] > maxScans) maxScans = bucketMap[num];
  }

  // Calculate active/idle/break time — only up to current time
  const countUpTo = Math.min(nowBucket, maxBucket);
  let activeBuckets = 0;
  let breakBucketCount = 0;
  let taskPauseCount = 0;
  for (let i = minBucket; i < countUpTo; i++) {
    if (breakBuckets.has(i)) breakBucketCount++;
    else if (taskPauseBuckets.has(i) && !bucketMap[i]) taskPauseCount++;
    else if (bucketMap[i]) activeBuckets++;
  }
  const elapsedBuckets = Math.max(0, countUpTo - minBucket);
  const activeMinutes = activeBuckets * 5;
  const breakMinutes = breakBucketCount * 5;
  const taskPauseMinutes = taskPauseCount * 5;
  const idleBuckets = elapsedBuckets - activeBuckets - breakBucketCount - taskPauseCount;
  const idleMinutes = Math.max(0, idleBuckets) * 5;

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
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Активность за день</p>
          {/* Zoom controls */}
          <div className="flex items-center gap-0.5 ml-2">
            <button onClick={() => { setZoomLevel(z => Math.min(3, z + 1)); setPanOffset(0); }} disabled={!canZoomIn}
              className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-primary-100 text-gray-500 hover:text-primary-600 flex items-center justify-center text-sm font-bold disabled:opacity-30 transition-colors">+</button>
            <button onClick={() => { setZoomLevel(z => Math.max(0, z - 1)); setPanOffset(0); }} disabled={!canZoomOut}
              className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center text-sm font-bold disabled:opacity-30 transition-colors">−</button>
            {zoomLevel > 0 && (
              <>
                <button onClick={() => setPanOffset(o => o - Math.floor(visibleCount / 2))} disabled={!canPanLeft}
                  className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center text-sm disabled:opacity-30 transition-colors">←</button>
                <button onClick={() => setPanOffset(o => o + Math.floor(visibleCount / 2))} disabled={!canPanRight}
                  className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center text-sm disabled:opacity-30 transition-colors">→</button>
                <button onClick={() => { setZoomLevel(0); setPanOffset(0); }}
                  className="px-2 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 text-[10px] text-gray-500 font-semibold transition-colors">Всё</button>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 text-[10px] flex-wrap">
          <span className="text-gray-500">Работа: <b className="text-green-700">{fmtDuration(activeMinutes * 60)}</b></span>
          {breakMinutes > 0 && (
            <span className="text-gray-500">Тех. пауза: <b className="text-amber-600">{fmtDuration(breakMinutes * 60)}</b></span>
          )}
          {taskPauseMinutes > 0 && (
            <span className="text-gray-500">Пауза: <b className="text-red-400">{fmtDuration(taskPauseMinutes * 60)}</b></span>
          )}
          <span className="text-gray-500">Простой: <b className="text-red-500">{fmtDuration(idleMinutes * 60)}</b></span>
        </div>
      </div>

      {/* Timeline bar */}
      <div className="relative">
        <div
          ref={barRef}
          className={`flex h-10 rounded-xl overflow-hidden bg-gray-100 border border-gray-200 relative select-none ${zoomLevel > 0 ? 'cursor-grab active:cursor-grabbing' : ''}`}
          onMouseDown={zoomLevel > 0 ? (e) => {
            e.preventDefault();
            dragRef.current = { startX: e.clientX, startOffset: panOffset };
          } : undefined}
          onMouseMove={(e) => {
            if (!dragRef.current || !barRef.current) return;
            const dx = e.clientX - dragRef.current.startX;
            const barW = barRef.current.offsetWidth;
            const bucketsPerPx = totalBuckets / barW;
            setPanOffset(Math.round(dragRef.current.startOffset - dx * bucketsPerPx));
          }}
          onMouseUp={() => { dragRef.current = null; }}
          onMouseLeave={() => { dragRef.current = null; }}>
          {Array.from({ length: totalBuckets }).map((_, i) => {
            const bNum = minBucket + i;
            const scans = bucketMap[bNum] || 0;
            const isHovered = hoveredBucket === bNum;
            const isBreak = breakBuckets.has(bNum);
            // 7 levels: T1/T2/T3/T4/T5/T6/above
            const isTaskPause = taskPauseBuckets.has(bNum);
            const colorClass = isBreak
              ? (isHovered ? 'bg-amber-400' : 'bg-amber-300')
              : isTaskPause
              ? (isHovered ? 'bg-red-300' : 'bg-red-200')
              : scans <= 0 ? (isHovered ? 'bg-gray-200' : 'bg-gray-100')
              : scans <= T1 ? (isHovered ? 'bg-green-300' : 'bg-green-100')
              : scans <= T2 ? (isHovered ? 'bg-green-400' : 'bg-green-200')
              : scans <= T3 ? (isHovered ? 'bg-green-400' : 'bg-green-300')
              : scans <= T4 ? (isHovered ? 'bg-green-500' : 'bg-green-400')
              : scans <= T5 ? (isHovered ? 'bg-green-600' : 'bg-green-500')
              : scans <= T6 ? (isHovered ? 'bg-green-700' : 'bg-green-600')
              : (isHovered ? 'bg-green-800' : 'bg-green-700');

            return (
              <div
                key={bNum}
                className="relative h-full transition-all duration-75"
                style={{ width: `${100 / totalBuckets}%` }}
                onMouseEnter={() => setHoveredBucket(bNum)}
                onMouseLeave={() => setHoveredBucket(null)}
              >
                <div
                  className={`h-full ${colorClass} transition-colors`}
                />
                {/* Tooltip */}
                {isHovered && (
                  <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-20 px-2.5 py-1.5 bg-gray-900 text-white rounded-lg text-[10px] whitespace-nowrap shadow-lg pointer-events-none">
                    {(() => {
                      const reg = regionMap[bNum];
                      const rangeStr = reg ? `${bucketToTime(reg.start)} → ${bucketToTime(reg.end)}` : `${bucketToTime(bNum)}–${bucketToTime(bNum + 1)}`;
                      const label = isBreak ? '⏸ Тех. пауза' : isTaskPause ? '⏸ Пауза задачи' : scans > 0 ? `${bucketTaskMap[bNum] || 'Работа'}: ${scans} пиков` : 'Простой';
                      return <>
                        <p className="font-bold">{rangeStr}</p>
                        <p>{label}</p>
                      </>;
                    })()}
                  </div>
                )}
              </div>
            );
          })}
          {/* Now marker — only show if in visible range */}
          {nowPct >= 0 && nowPct <= 100 && (
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10"
              style={{ left: `${nowPct}%` }}
            >
              <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-red-500" />
            </div>
          )}
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
          const rawStart = Math.floor((new Date(t.started_at) - todayStart) / 300000);
          const rawEnd = t.completed_at
            ? Math.floor((new Date(t.completed_at) - todayStart) / 300000)
            : nowBucket;
          const startB = Math.max(minBucket, rawStart);
          const endB = Math.min(maxBucket, rawEnd);
          return { ...t, startB, endB };
        }).filter(t => t.endB > minBucket && t.startB < maxBucket)
          .sort((a, b) => a.startB - b.startB);

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
                  onClick={() => setPopupTask(popupTask?.id === t.id ? null : t)}
                  className={`absolute ${colors} border rounded-md flex items-center overflow-hidden px-1.5 cursor-pointer hover:opacity-80 transition-opacity`}
                  style={{ left: `${leftPct}%`, width: `${widthPct}%`, top, height: LANE_H }}
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

      {/* Task popup */}
      {popupTask && (() => {
        const t = popupTask;
        const st = statusBadge(t.status);
        const StIcon = st.icon;
        const durationSec = t.started_at && t.completed_at
          ? (new Date(t.completed_at) - new Date(t.started_at)) / 1000
          : t.started_at ? (Date.now() - new Date(t.started_at)) / 1000 : 0;
        const pauses = t.pause_log || [];
        const todayMidnight = new Date(); todayMidnight.setHours(0,0,0,0);
        const totalPauseSec = pauses.reduce((sum, p) => {
          if (!p.paused_at) return sum;
          const start = Math.max(new Date(p.paused_at).getTime(), todayMidnight.getTime());
          const end = p.resumed_at ? new Date(p.resumed_at).getTime() : Date.now();
          return sum + Math.max(0, end - start) / 1000;
        }, 0);
        const location = [t.rack_name, t.shelf_code || t.shelf_name, t.pallet_name].filter(Boolean).join(' → ');

        return (
          <div className="mt-2 bg-gray-50 rounded-xl border border-gray-200 p-4 animate-[fadeIn_0.2s_ease-out]"
               style={{ animation: 'fadeIn 0.2s ease-out' }}>
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${taskTypeBg(t.task_type)}`}>{taskTypeLabel(t.task_type)}</span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex items-center gap-1 ${st.bg}`}><StIcon size={10} /> {st.label}</span>
                </div>
                <p className="text-sm font-semibold text-gray-900">{t.title}</p>
                {location && <p className="text-[11px] text-gray-400">{location}</p>}
              </div>
              <button onClick={() => setPopupTask(null)} className="p-1 rounded-lg text-gray-300 hover:text-gray-500 hover:bg-gray-200 transition-colors">✕</button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="bg-white rounded-lg px-3 py-2">
                <p className="text-[9px] text-gray-400 uppercase font-bold">Время</p>
                <p className="font-semibold text-gray-800">{fmtTime(t.started_at)} → {t.completed_at ? fmtTime(t.completed_at) : 'сейчас'}</p>
              </div>
              <div className="bg-white rounded-lg px-3 py-2">
                <p className="text-[9px] text-gray-400 uppercase font-bold">Длит.</p>
                <p className="font-semibold text-gray-800">{fmtDuration(durationSec)}</p>
              </div>
              <div className="bg-white rounded-lg px-3 py-2">
                <p className="text-[9px] text-gray-400 uppercase font-bold">Сканов</p>
                <p className="font-semibold text-gray-800">{fmtNum(t.scan_count)}</p>
              </div>
              <div className="bg-white rounded-lg px-3 py-2">
                <p className="text-[9px] text-gray-400 uppercase font-bold">GRA</p>
                <p className="font-semibold text-green-700">{fmtNum(Math.round(parseFloat(t.earned)))}</p>
              </div>
            </div>
            {pauses.length > 0 && (
              <div className="mt-2 pt-2 border-t border-gray-200">
                <p className="text-[10px] font-bold text-red-400 mb-1">⏸ Паузы ({pauses.length}) — всего {fmtDuration(totalPauseSec)}</p>
                <div className="flex flex-wrap gap-1">
                  {pauses.map((p, idx) => (
                    <span key={idx} className="text-[10px] bg-red-50 text-red-500 rounded px-1.5 py-0.5">
                      {fmtTime(p.paused_at)} → {p.resumed_at ? fmtTime(p.resumed_at) : 'сейчас'}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

// ─── Employee Detail View ───────────────────────────────────────────────────

function EmployeeDetailView({ employeeId, employees, onBack, thresholds }) {
  const navigate = useNavigate();
  const [timeline, setTimeline] = useState(null);
  const [loading, setLoading] = useState(true);
  const [breakLoading, setBreakLoading] = useState(false);

  const emp = useMemo(() => employees.find(e => e.employee_id === employeeId), [employees, employeeId]);

  const loadTimeline = useCallback(async () => {
    try {
      const res = await api.get(`/tasks/analytics/live/${employeeId}/timeline`);
      setTimeline(res.data);
      setLoading(false);
    } catch { setLoading(false); }
  }, [employeeId]);

  useEffect(() => {
    loadTimeline();
    const id = setInterval(loadTimeline, POLL_MS);
    return () => clearInterval(id);
  }, [loadTimeline]);

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
        <button
          onClick={() => setShowBreakForm(v => !v)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all flex-shrink-0 bg-gray-100 text-gray-500 hover:bg-orange-50 hover:text-orange-600"
        >
          <Pause size={14} />
          Техн. пауза
        </button>
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

                  return (
                    <div key={t.id} onClick={() => navigate(`/admin/tasks?id=${t.id}`)} className="bg-white rounded-xl border border-gray-100 p-4 hover:border-primary-200 hover:shadow-sm transition-colors cursor-pointer">
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const selectedId = searchParams.get('emp') ? parseInt(searchParams.get('emp')) : null;
  const setSelectedId = (id) => id ? setSearchParams({ emp: id }) : setSearchParams({});
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
        thresholds={thresholds}
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

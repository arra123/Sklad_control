import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../../api/client';
import Spinner from '../../../components/ui/Spinner';
import { ArrowLeft, RefreshCw, Zap, TrendingUp, Clock, Package, ScanLine, Award, CheckCircle2, Play, Pause, Timer, ChevronDown } from 'lucide-react';
import { WorkerAvatar } from '../../../components/ui/WarehouseIcons';
import { timeAgo, fmtNum, fmtCompact, fmtDuration, fmtTime, taskTypeLabel, taskTypeBg, taskTypeBarColor, taskTypeActiveBarColor, statusBadge } from './liveMonitorUtils';

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
  const [expandedBreak, setExpandedBreak] = useState(null);
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

  // Build break bucket sets per type for coloring
  const breakBuckets = new Set();
  const lunchBuckets = new Set();
  const restBuckets = new Set();
  const techBuckets = new Set();
  for (const br of breaks) {
    const bStart = Math.max(minBucket, Math.floor((new Date(br.started_at) - todayStart) / 300000));
    const bEnd = br.ended_at
      ? Math.min(maxBucket, Math.floor((new Date(br.ended_at) - todayStart) / 300000))
      : Math.min(maxBucket, nowBucket);
    const typeSet = br.break_type === 'lunch' ? lunchBuckets : br.break_type === 'rest' ? restBuckets : techBuckets;
    for (let i = bStart; i <= bEnd; i++) { breakBuckets.add(i); typeSet.add(i); }
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

  // Build bucket map for fast lookup
  const bucketMap = {};
  let maxScans = 1;
  for (const b of buckets) {
    const num = parseInt(b.bucket);
    bucketMap[num] = parseInt(b.scan_count);
    if (bucketMap[num] > maxScans) maxScans = bucketMap[num];
  }

  // Map bucket → active task info for richer tooltips and coloring
  const bucketTaskMap = {};
  const bucketTaskType = {};
  for (const t of tasks) {
    if (!t.started_at) continue;
    const tStart = Math.floor((new Date(t.started_at) - todayStart) / 300000);
    const tEnd = t.completed_at ? Math.floor((new Date(t.completed_at) - todayStart) / 300000) : nowBucket;
    for (let i = Math.max(minBucket, tStart); i <= Math.min(maxBucket, tEnd); i++) {
      bucketTaskMap[i] = taskTypeLabel(t.task_type);
      bucketTaskType[i] = t.task_type;
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

  // Calculate active/idle/break time — only up to current time
  const countUpTo = Math.min(nowBucket, maxBucket);
  let activeBuckets = 0;
  let breakBucketCount = 0;
  let lunchBucketCount = 0;
  let restBucketCount = 0;
  let techBucketCount = 0;
  let taskPauseCount = 0;
  for (let i = minBucket; i < countUpTo; i++) {
    if (breakBuckets.has(i)) {
      breakBucketCount++;
      if (lunchBuckets.has(i)) lunchBucketCount++;
      else if (restBuckets.has(i)) restBucketCount++;
      else techBucketCount++;
    }
    else if (taskPauseBuckets.has(i) && !bucketMap[i]) taskPauseCount++;
    else if (bucketMap[i]) activeBuckets++;
  }
  const elapsedBuckets = Math.max(0, countUpTo - minBucket);
  const activeMinutes = activeBuckets * 5;
  const breakMinutes = breakBucketCount * 5;
  const lunchMinutes = lunchBucketCount * 5;
  const restMinutes = restBucketCount * 5;
  const techMinutes = techBucketCount * 5;
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
          {lunchMinutes > 0 && (
            <span className="text-gray-500">Обед: <b className="text-pink-600">{fmtDuration(lunchMinutes * 60)}</b></span>
          )}
          {restMinutes > 0 && (
            <span className="text-gray-500">Отдых: <b className="text-blue-600">{fmtDuration(restMinutes * 60)}</b></span>
          )}
          {techMinutes > 0 && (
            <span className="text-gray-500">Тех. пауза: <b className="text-amber-600">{fmtDuration(techMinutes * 60)}</b></span>
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
            // Green intensity scale for activity bars
            const colorClass = isBreak
              ? lunchBuckets.has(bNum) ? (isHovered ? 'bg-pink-400' : 'bg-pink-300')
              : restBuckets.has(bNum) ? (isHovered ? 'bg-blue-400' : 'bg-blue-300')
              : (isHovered ? 'bg-amber-400' : 'bg-amber-300')
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
                {/* Tooltip rendered outside overflow container below */}
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

        {/* Floating tooltip — rendered below the timeline bar */}
        {hoveredBucket !== null && (() => {
          const bNum = hoveredBucket;
          const scans = bucketMap[bNum] || 0;
          const isBreak = breakBuckets.has(bNum);
          const isLunch = lunchBuckets.has(bNum);
          const isRest = restBuckets.has(bNum);
          const isTaskPause = taskPauseBuckets.has(bNum) && !(bucketMap[bNum] > 0);
          const leftPct = ((bNum - minBucket + 0.5) / totalBuckets) * 100;
          return (
            <div className="relative" style={{ height: 0 }}>
              <div className="absolute z-30 px-3 py-2 bg-gray-900 text-white rounded-lg text-[10px] whitespace-nowrap shadow-lg pointer-events-none -translate-x-1/2"
                style={{ left: `${leftPct}%`, top: 4 }}>
                <p className="font-bold text-[11px]">{bucketToTime(bNum)} – {bucketToTime(bNum + 1)}</p>
                {isBreak ? (
                  <p className={`mt-0.5 ${isLunch ? 'text-pink-300' : isRest ? 'text-blue-300' : 'text-amber-300'}`}>
                    {isLunch ? '🍽 Обед' : isRest ? '☕ Отдых' : '⏸ Тех. пауза'}
                  </p>
                ) : isTaskPause ? (
                  <p className="text-red-300 mt-0.5">⏸ Пауза задачи</p>
                ) : scans > 0 ? (
                  <>
                    <p className="text-green-300 mt-0.5">{bucketTaskMap[bNum] || 'Работа'}</p>
                    <p className="mt-0.5">{scans} {scans === 1 ? 'скан' : scans < 5 ? 'скана' : 'сканов'}</p>
                  </>
                ) : (
                  <p className="text-gray-400 mt-0.5">Простой</p>
                )}
              </div>
            </div>
          );
        })()}

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

        {/* Color legend */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 pt-2 border-t border-gray-100">
          <span className="flex items-center gap-1 text-[10px] text-gray-400"><span className="w-3 h-3 rounded-sm bg-green-400" />Работа</span>
          <span className="flex items-center gap-1 text-[10px] text-gray-400"><span className="w-3 h-3 rounded-sm bg-gray-200" />Простой</span>
          <span className="flex items-center gap-1 text-[10px] text-gray-400"><span className="w-3 h-3 rounded-sm bg-pink-300" />Обед</span>
          <span className="flex items-center gap-1 text-[10px] text-gray-400"><span className="w-3 h-3 rounded-sm bg-blue-300" />Отдых</span>
          <span className="flex items-center gap-1 text-[10px] text-gray-400"><span className="w-3 h-3 rounded-sm bg-amber-300" />Тех. пауза</span>
          <span className="flex items-center gap-1 text-[10px] text-gray-400"><span className="w-3 h-3 rounded-sm bg-red-200" />Пауза задачи</span>
          <span className="flex items-center gap-1 text-[10px] text-gray-400"><span className="w-1 h-3 rounded-sm bg-red-500" />Сейчас</span>
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
              const colors = t.status === 'in_progress' ? taskTypeActiveBarColor(t.task_type) : taskTypeBarColor(t.task_type);
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

      {/* Break bars */}
      {breaks.length > 0 && (
        <div className="mt-1 space-y-1">
          <div className="relative h-6">
            {breaks.map((br, idx) => {
              const bStart = Math.max(minBucket, Math.floor((new Date(br.started_at) - todayStart) / 300000));
              const bEnd = br.ended_at
                ? Math.min(maxBucket, Math.floor((new Date(br.ended_at) - todayStart) / 300000))
                : Math.min(maxBucket, nowBucket);
              if (bEnd <= minBucket || bStart >= maxBucket) return null;
              const leftPct = ((bStart - minBucket) / totalBuckets) * 100;
              const widthPct = Math.max(2, ((bEnd - bStart + 1) / totalBuckets) * 100);
              const isExpanded = expandedBreak === idx;
              return (
                <div key={idx}
                  className={`absolute h-5 rounded-md flex items-center overflow-hidden px-1.5 border cursor-pointer transition-all ${
                    br.break_type === 'lunch' ? 'bg-pink-100 border-pink-300 hover:bg-pink-200' :
                    br.break_type === 'rest' ? 'bg-blue-100 border-blue-300 hover:bg-blue-200' :
                    'bg-amber-100 border-amber-300 hover:bg-amber-200'
                  } ${isExpanded ? 'ring-2 ring-offset-1 ' + (br.break_type === 'lunch' ? 'ring-pink-400' : br.break_type === 'rest' ? 'ring-blue-400' : 'ring-amber-400') : ''}`}
                  style={{ left: `${leftPct}%`, width: `${widthPct}%`, top: 0 }}
                  onClick={() => setExpandedBreak(isExpanded ? null : idx)}
                >
                  <span className={`text-[8px] font-semibold truncate ${
                    br.break_type === 'lunch' ? 'text-pink-600' :
                    br.break_type === 'rest' ? 'text-blue-600' :
                    'text-amber-600'
                  }`}>
                    {br.break_type === 'lunch' ? '🍽 Обед' : br.break_type === 'rest' ? '☕ Отдых' : '⏸ Тех. пауза'}
                  </span>
                </div>
              );
            })}
          </div>
          {/* Expanded break detail */}
          {expandedBreak !== null && breaks[expandedBreak] && (() => {
            const br = breaks[expandedBreak];
            const startTime = fmtTime(br.started_at);
            const endTime = br.ended_at ? fmtTime(br.ended_at) : 'сейчас';
            const durationMs = (br.ended_at ? new Date(br.ended_at) : new Date()) - new Date(br.started_at);
            const durationMin = Math.round(durationMs / 60000);
            const typeLabel = br.break_type === 'lunch' ? '🍽 Обед' : br.break_type === 'rest' ? '☕ Отдых' : '⏸ Тех. пауза';
            const colors = br.break_type === 'lunch' ? 'bg-pink-50 border-pink-200 text-pink-700'
              : br.break_type === 'rest' ? 'bg-blue-50 border-blue-200 text-blue-700'
              : 'bg-amber-50 border-amber-200 text-amber-700';
            return (
              <div className={`rounded-xl border px-4 py-2.5 flex items-center gap-4 ${colors}`}>
                <span className="text-sm font-semibold">{typeLabel}</span>
                <span className="text-xs font-mono">{startTime} → {endTime}</span>
                <span className="text-xs font-bold">{durationMin} мин</span>
                <button onClick={() => setExpandedBreak(null)} className="ml-auto text-xs opacity-50 hover:opacity-100">✕</button>
              </div>
            );
          })()}
        </div>
      )}

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

export default ActivityTimeline;

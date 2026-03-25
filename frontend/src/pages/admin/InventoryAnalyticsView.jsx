import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, AlertTriangle, Clock, ChevronRight, ChevronDown, Search, Warehouse, Package, Box, ArrowLeft, Users, Activity, Zap, BarChart3, FileText } from 'lucide-react';
import { WarehouseIcon, RackIcon, ShelfIcon, PalletIcon, RowIcon, BoxIcon, ShelfBoxIcon, EmployeeIcon } from '../../components/ui/WarehouseIcons';
import api from '../../api/client';
import Spinner from '../../components/ui/Spinner';
import Badge from '../../components/ui/Badge';
import { useAppSettings } from '../../context/AppSettingsContext';

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function fmtDuration(seconds) {
  if (!seconds) return '—';
  const s = Math.round(Number(seconds));
  const m = Math.floor(s / 60);
  const remainder = s % 60;
  if (m === 0) return `${remainder}с`;
  return `${m}м ${remainder}с`;
}

function timeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}д назад`;
  if (hours > 0) return `${hours}ч назад`;
  return 'только что';
}

function hexToBgBorder(hex) {
  return { bg: hex + '18', border: hex + '60', text: hex };
}

function statusColor(node, settings = {}) {
  const freshH = settings.inventory_fresh_hours || 24;
  const staleH = settings.inventory_stale_hours || 72;
  const cFresh = settings.inventory_color_fresh || '#047857';
  const cWarn = settings.inventory_color_warn || '#a16207';
  const cStale = settings.inventory_color_stale || '#b91c1c';
  const cNone = settings.inventory_color_none || '#b91c1c';

  if (!node.last_inventory_at) return { ...hexToBgBorder(cNone), label: 'Не было' };
  const hours = (Date.now() - new Date(node.last_inventory_at).getTime()) / 3600000;
  if (hours < freshH) return { ...hexToBgBorder(cFresh), label: 'Свежий' };
  if (hours < staleH) return { ...hexToBgBorder(cWarn), label: 'Давно' };
  return { ...hexToBgBorder(cStale), label: 'Устарел' };
}

function fmtQty(val) {
  return Number(val || 0).toLocaleString('ru-RU');
}

// ═══ Stat Box ═══
function StatBox({ label, value, accent }) {
  const colors = accent === 'green' ? 'text-green-600' : accent === 'red' ? 'text-red-600' : accent === 'amber' ? 'text-amber-600' : 'text-gray-900 dark:text-white';
  return (
    <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
      <p className="text-[11px] text-gray-400 uppercase font-semibold">{label}</p>
      <p className={`text-lg font-black ${colors}`}>{value}</p>
    </div>
  );
}

// ═══ Inventory Card (row in list) ═══
function InventoryCard({ node, type, onDrill, settings }) {
  const st = statusColor(node, settings);
  const hasInventory = !!node.last_inventory_at;
  const delta = Number(node.delta_vs_current || 0);
  const invQty = Number(node.last_inventory_qty || 0);
  const dur = Number(node.last_inventory_duration_seconds || 0);
  const avgPick = invQty > 0 && dur > 0 ? (dur / invQty).toFixed(1) : null;

  return (
    <div
      className="rounded-2xl border p-4 cursor-pointer hover:shadow-lg transition-all group"
      style={{ borderColor: st.border, background: 'white' }}
      onClick={() => onDrill?.(node)}
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: st.bg }}>
          {type === 'warehouse' ? <WarehouseIcon size={24} /> :
           type === 'rack' ? <RackIcon size={24} /> :
           type === 'shelf' ? <ShelfIcon size={24} /> :
           type === 'pallet' ? <PalletIcon size={24} /> :
           type === 'row' ? <RowIcon size={24} /> :
           type === 'pallet_box' ? <BoxIcon size={24} /> :
           type === 'shelf_box' ? <BoxIcon size={24} /> :
           <ShelfIcon size={24} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-gray-900 dark:text-white truncate">{node.label || node.name || node.code || '—'}</span>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-lg" style={{ background: st.bg, color: st.text }}>
              {st.label}
            </span>
            {node.coverage_complete === false && node.total_leaf_count > 0 && (
              <span className="text-[10px] text-gray-400">{node.covered_leaf_count}/{node.total_leaf_count}</span>
            )}
          </div>
          {hasInventory ? (
            <div className="mt-1.5 grid grid-cols-3 gap-2 text-xs">
              <div>
                <span className="text-gray-400">По инвенту</span>
                <p className="font-bold text-gray-900 dark:text-white">{fmtQty(invQty)} шт.</p>
              </div>
              <div>
                <span className="text-gray-400">Сейчас</span>
                <p className="font-bold text-gray-900 dark:text-white">{fmtQty(node.current_qty)} шт.</p>
              </div>
              <div>
                <span className="text-gray-400">Разница</span>
                <p className={`font-bold ${delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                  {delta > 0 ? '+' : ''}{delta}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-400 mt-1">Инвентаризация не проводилась</p>
          )}
          {hasInventory && (
            <div className="mt-2 flex items-center gap-3 text-[11px] text-gray-400">
              <span className="flex items-center gap-1"><Clock size={10} /> {timeAgo(node.last_inventory_at)}</span>
              {dur > 0 && <span>{fmtDuration(dur)}</span>}
              {avgPick && <span className="text-primary-500 font-semibold">{avgPick}с/шт</span>}
              {node.last_inventory_by && <span>{node.last_inventory_by}</span>}
            </div>
          )}
        </div>
        {onDrill && <ChevronRight size={16} className="text-gray-300 group-hover:text-primary-400 flex-shrink-0 mt-2" />}
      </div>
    </div>
  );
}

// ═══ Children list for drill-down ═══
function getChildren(node) {
  if (node.racks?.length) return { items: node.racks, label: 'Стеллажи' };
  if (node.rows?.length) return { items: node.rows, label: 'Ряды' };
  if (node.shelves?.length) return { items: node.shelves, label: 'Полки' };
  if (node.pallets?.length) return { items: node.pallets, label: 'Паллеты' };
  if (node.boxes?.length) return { items: node.boxes, label: 'Коробки' };
  if (node.children?.length) return { items: node.children, label: 'Элементы' };
  return null;
}

function getChildType(child) {
  if (child.kind === 'shelf_box' || child.kind === 'pallet_box') return 'box';
  if (child.shelves || child.pallets || child.boxes || child.children) return 'group';
  return 'box';
}

// ═══ Inventory Task Scans (expandable per task) ═══
function TaskScansPanel({ taskId }) {
  const [scans, setScans] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/tasks/${taskId}/analytics`)
      .then(r => setScans(r.data?.scans || []))
      .catch(() => setScans([]))
      .finally(() => setLoading(false));
  }, [taskId]);

  if (loading) return <div className="py-3 text-center"><Spinner size="sm" /></div>;
  if (!scans?.length) return <p className="py-3 text-center text-xs text-gray-300">Нет сканов</p>;

  // Compute avg seconds
  const gaps = scans.slice(1).map(s => Number(s.seconds_since_prev)).filter(s => !isNaN(s) && s > 0);
  const avgSec = gaps.length > 0 ? (gaps.reduce((a, b) => a + b, 0) / gaps.length).toFixed(1) : null;

  return (
    <div>
      <div className="flex items-center gap-4 px-3 py-2 text-[11px] text-gray-400 border-b border-gray-100">
        <span>{scans.length} сканов</span>
        {avgSec && <span>Ср. время: {avgSec}с</span>}
        {gaps.length > 0 && <span>Мин: {Math.min(...gaps)}с / Макс: {Math.max(...gaps)}с</span>}
      </div>
      <div className="divide-y divide-gray-50 max-h-[400px] overflow-y-auto">
        {scans.map((sc, i) => (
          <div key={sc.id} className="flex items-center gap-2.5 px-3 py-1.5">
            <span className="text-[11px] font-mono text-gray-300 w-5 text-right flex-shrink-0">{i + 1}</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-800 truncate">{sc.product_name || 'Неизвестный'}</p>
              {sc.product_code && <p className="text-[10px] text-gray-400">{sc.product_code}</p>}
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-[11px] font-mono text-gray-600">{fmtTime(sc.created_at)}</p>
              {sc.seconds_since_prev != null ? (
                <p className={`text-[10px] ${Number(sc.seconds_since_prev) > 10 ? 'text-amber-500' : 'text-gray-300'}`}>+{sc.seconds_since_prev}с</p>
              ) : (
                <p className="text-[10px] text-primary-400">старт</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function fmtTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ═══ Inventory History List for a leaf node ═══
function InventoryHistorySection({ node }) {
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedTask, setExpandedTask] = useState(null);

  const kind = node.kind;
  const locationType = kind === 'shelf_box' ? 'shelf_box' : kind === 'pallet_box' ? 'pallet_box' : kind;

  useEffect(() => {
    api.get('/tasks/analytics/inventory-history', { params: { location_type: locationType, id: node.id } })
      .then(r => setHistory(r.data?.history || []))
      .catch(() => setHistory([]))
      .finally(() => setLoading(false));
  }, [node.id, locationType]);

  if (loading) return <div className="py-6 text-center"><Spinner size="sm" /></div>;
  if (!history?.length) return <p className="text-sm text-gray-400 italic py-4">Нет завершённых инвентаризаций</p>;

  return (
    <div className="space-y-3">
      {history.map((ev, i) => {
        const isExpanded = expandedTask === ev.task_id;
        const isLatest = i === 0;
        const counted = Number(ev.counted_qty || 0);
        const dur = Number(ev.duration_seconds || 0);
        const avgPick = counted > 0 && dur > 0 ? (dur / counted).toFixed(1) : null;
        const picksPerMin = counted > 0 && dur > 0 ? (counted / (dur / 60)).toFixed(1) : null;
        return (
          <div key={ev.task_id} className={`rounded-2xl border overflow-hidden ${isLatest ? 'border-primary-200 bg-primary-50/30' : 'border-gray-200 bg-white'}`}>
            <button
              onClick={() => setExpandedTask(isExpanded ? null : ev.task_id)}
              className="w-full text-left px-4 py-3 hover:opacity-80 transition-opacity"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <svg className={`w-3 h-3 text-gray-400 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 18l6-6-6-6"/></svg>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {ev.task_title || `Задача #${ev.task_id}`}
                      {isLatest && <span className="ml-2 text-[10px] text-primary-500 font-medium">последняя</span>}
                    </p>
                    <div className="flex items-center gap-3 text-[11px] text-gray-400 mt-0.5">
                      <span>{fmtDate(ev.completed_at)}</span>
                      {ev.employee_name && <span>{ev.employee_name}</span>}
                      {dur > 0 && <span>{fmtDuration(dur)}</span>}
                    </div>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-lg font-black text-gray-900">{counted}<span className="text-xs font-medium text-gray-400 ml-0.5">шт</span></p>
                  <div className="flex items-center gap-2 justify-end">
                    {avgPick && <span className="text-[10px] text-primary-500 font-semibold">{avgPick}с/шт</span>}
                    {picksPerMin && <span className="text-[10px] text-gray-400">{picksPerMin}/мин</span>}
                  </div>
                </div>
              </div>
            </button>
            {isExpanded && <TaskScansPanel taskId={ev.task_id} />}
          </div>
        );
      })}
    </div>
  );
}

// ═══ Detail Panel with drill-down ═══
function DetailPanel({ node, breadcrumbs, onDrill, onBack, settings }) {
  const st = statusColor(node, settings);
  const delta = Number(node.delta_vs_current || 0);
  const deltaPrev = Number(node.delta_vs_previous || 0);
  const hasInventory = !!node.last_inventory_at;
  const childrenData = getChildren(node);
  const isLeaf = !childrenData;

  return (
    <div>
      {/* Breadcrumbs */}
      <div className="flex items-center gap-1.5 mb-4 flex-wrap">
        <button onClick={() => onBack(0)} className="text-sm text-primary-500 hover:text-primary-700 font-medium">Обзор</button>
        {breadcrumbs.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1.5">
            <ChevronRight size={12} className="text-gray-300" />
            <button
              onClick={() => onBack(i + 1)}
              className={`text-sm font-medium ${i === breadcrumbs.length - 1 ? 'text-gray-900 dark:text-white' : 'text-primary-500 hover:text-primary-700'}`}
            >
              {crumb.label || crumb.name || crumb.code || '—'}
            </button>
          </span>
        ))}
      </div>

      {/* Header card */}
      <div className="card p-5 mb-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: st.bg }}>
            <Package size={22} style={{ color: st.text }} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">{node.label || node.name || node.code || '—'}</h3>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs font-semibold px-2 py-0.5 rounded-lg" style={{ background: st.bg, color: st.text }}>{st.label}</span>
              {node.total_leaf_count > 1 && (
                <span className="text-xs text-gray-400">Покрытие: {node.covered_leaf_count}/{node.total_leaf_count}</span>
              )}
            </div>
          </div>
        </div>

        {hasInventory ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
              <StatBox label="По инвенту" value={fmtQty(node.last_inventory_qty)} />
              <StatBox label="Сейчас" value={fmtQty(node.current_qty)} />
              <StatBox
                label="Разница"
                value={`${delta > 0 ? '+' : ''}${delta}`}
                accent={delta > 0 ? 'green' : delta < 0 ? 'red' : null}
              />
              {node.previous_inventory_qty != null && (
                <StatBox
                  label="Пред. инвент"
                  value={fmtQty(node.previous_inventory_qty)}
                />
              )}
            </div>

            {node.previous_inventory_qty != null && (
              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl px-4 py-2.5 mb-3 flex items-center gap-4 text-xs">
                <span className="text-gray-400">Между инвентами:</span>
                <span className={`font-bold ${deltaPrev > 0 ? 'text-green-600' : deltaPrev < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                  {deltaPrev > 0 ? '+' : ''}{deltaPrev} шт.
                </span>
                {node.previous_inventory_at && (
                  <span className="text-gray-400">пред: {fmtDate(node.previous_inventory_at)}</span>
                )}
              </div>
            )}

            <div className="flex items-center gap-4 text-xs text-gray-500">
              <span>Дата: {fmtDate(node.last_inventory_at)}</span>
              {node.last_inventory_by && <span>{node.last_inventory_by}</span>}
              {node.last_inventory_duration_seconds > 0 && <span>{fmtDuration(node.last_inventory_duration_seconds)}</span>}
            </div>
          </>
        ) : (
          <p className="text-sm text-gray-400">Инвентаризация не проводилась</p>
        )}
      </div>

      {/* Children — drill-down */}
      {childrenData && childrenData.items.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            {childrenData.label} ({childrenData.items.length})
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {childrenData.items.map((child, i) => (
              <InventoryCard
                key={child.id || i}
                node={child}
                type={getChildType(child)}
                onDrill={onDrill}
                settings={settings}
              />
            ))}
          </div>
        </div>
      )}

      {/* Inventory history with scans — for leaf nodes */}
      {isLeaf && hasInventory && (
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            История инвентаризаций
          </p>
          <InventoryHistorySection node={node} />
        </div>
      )}
    </div>
  );
}

// ═══ Audit Report: Progress Bar ═══
function ProgressBar({ value, max, className = '' }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className={`w-full h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden ${className}`}>
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${pct}%`, background: pct >= 100 ? '#10b981' : pct > 50 ? '#3b82f6' : '#f59e0b' }}
      />
    </div>
  );
}

// ═══ Audit Report: Box Row ═══
function AuditBoxRow({ box }) {
  const statusLabels = { completed: 'Готово', in_progress: 'В работе', pending: 'Ожидает' };
  const statusColors = { completed: 'text-green-600 bg-green-50', in_progress: 'text-blue-600 bg-blue-50', pending: 'text-gray-400 bg-gray-50' };
  const label = statusLabels[box.status] || box.status;
  const colorCls = statusColors[box.status] || statusColors.pending;
  return (
    <div className="flex items-center gap-3 px-4 py-2 text-xs">
      <BoxIcon size={14} className="text-gray-300 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-700 dark:text-gray-200 truncate">{box.box_name || '—'}</p>
        {box.box_barcode && <p className="text-[10px] text-gray-400 font-mono">{box.box_barcode}</p>}
      </div>
      {box.box_size > 0 && (
        <div className="w-24 flex items-center gap-1.5">
          <ProgressBar value={box.scans_count} max={box.box_size} />
          <span className="text-[10px] text-gray-400 whitespace-nowrap">{box.scans_count}/{box.box_size}</span>
        </div>
      )}
      {!box.box_size && <span className="text-[10px] text-gray-400">{box.scans_count} скан.</span>}
      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-lg ${colorCls}`}>{label}</span>
    </div>
  );
}

// ═══ Audit Report: Task Row ═══
function AuditTaskRow({ task }) {
  const [expanded, setExpanded] = useState(false);
  const location = [task.rack_name, task.shelf_name, task.pallet_name, task.row_name].filter(Boolean).join(' → ') || '—';
  const hasBoxes = task.boxes && task.boxes.length > 0;

  return (
    <div className="border-b border-gray-50 dark:border-gray-700 last:border-b-0">
      <button
        onClick={() => hasBoxes && setExpanded(!expanded)}
        className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors ${hasBoxes ? 'cursor-pointer' : 'cursor-default'}`}
      >
        {hasBoxes && (
          <svg className={`w-3 h-3 text-gray-300 flex-shrink-0 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 18l6-6-6-6"/></svg>
        )}
        {!hasBoxes && <span className="w-3 flex-shrink-0" />}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{task.title || `Задача #${task.task_id}`}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">{location} · {fmtDate(task.completed_at)}</p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 flex-nowrap text-xs">
          <span className="font-bold text-gray-800 dark:text-white whitespace-nowrap">{task.scans_count} скан.</span>
          {task.duration_seconds > 0 && (
            <span className="text-gray-500 whitespace-nowrap">{fmtDuration(task.duration_seconds)}</span>
          )}
          {task.avg_scan_gap != null && (
            <span className="font-bold text-primary-600 whitespace-nowrap">{task.avg_scan_gap}с</span>
          )}
          {task.errors_count > 0 && (
            <span className="font-bold text-red-500 whitespace-nowrap">{task.errors_count} ош.</span>
          )}
        </div>
      </button>
      {expanded && hasBoxes && (
        <div className="bg-gray-50/50 dark:bg-gray-800/30 border-t border-gray-100 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
          {task.boxes.map(box => <AuditBoxRow key={box.id} box={box} />)}
        </div>
      )}
    </div>
  );
}

// ═══ Audit Report: Employee Row ═══
function AuditEmployeeRow({ emp }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-5 py-4 flex items-center gap-4 hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer"
      >
        <div className="w-10 h-10 rounded-xl bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
          <EmployeeIcon size={20} className="text-primary-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-900 dark:text-white truncate">{emp.full_name}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Последняя задача: {emp.last_task_at ? fmtDate(emp.last_task_at) : '—'}
          </p>
        </div>
        <div className="flex items-center gap-3 sm:gap-5 flex-shrink-0 flex-nowrap text-xs">
          <span className="font-bold text-gray-800 dark:text-white whitespace-nowrap">{emp.tasks_count} <span className="font-normal text-gray-400">зад.</span></span>
          <span className="font-bold text-gray-800 dark:text-white whitespace-nowrap">{emp.total_scans} <span className="font-normal text-gray-400">скан.</span></span>
          {emp.total_errors > 0 && (
            <span className="font-bold text-red-500 whitespace-nowrap">{emp.total_errors} <span className="font-normal text-gray-400">ош.</span></span>
          )}
          {emp.avg_scan_gap != null && (
            <span className="font-bold text-primary-600 whitespace-nowrap">{emp.avg_scan_gap}с</span>
          )}
          <svg className={`w-4 h-4 text-gray-300 transition-transform duration-200 flex-shrink-0 ${expanded ? 'rotate-90' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 18l6-6-6-6"/></svg>
        </div>
      </button>
      {expanded && (
        <div className="border-t border-gray-100 dark:border-gray-700">
          {emp.tasks.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-4">Нет задач</p>
          ) : (
            emp.tasks.map(task => <AuditTaskRow key={task.task_id} task={task} />)
          )}
        </div>
      )}
    </div>
  );
}

// ═══ Audit Report Section ═══
function AuditReportSection() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/tasks/analytics/audit-report')
      .then(res => setData(res.data))
      .catch(err => setError(err?.response?.data?.error || 'Ошибка загрузки'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-8"><Spinner size="lg" /></div>;
  if (error) return <p className="text-center text-red-400 py-6">{error}</p>;
  if (!data) return null;

  const { summary, employees } = data;

  return (
    <div>
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-50 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
            <CheckCircle2 size={18} className="text-green-600" />
          </div>
          <div>
            <p className="text-2xl font-black text-gray-900 dark:text-white">{summary.total_tasks}</p>
            <p className="text-[11px] text-gray-400 uppercase font-semibold">Задач завершено</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
            <Activity size={18} className="text-blue-600" />
          </div>
          <div>
            <p className="text-2xl font-black text-gray-900 dark:text-white">{summary.total_scans.toLocaleString('ru-RU')}</p>
            <p className="text-[11px] text-gray-400 uppercase font-semibold">Всего сканов</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
            <AlertTriangle size={18} className="text-red-500" />
          </div>
          <div>
            <p className="text-2xl font-black text-red-600">{summary.total_errors}</p>
            <p className="text-[11px] text-gray-400 uppercase font-semibold">Ошибок</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
            <Zap size={18} className="text-amber-600" />
          </div>
          <div>
            <p className="text-2xl font-black text-gray-900 dark:text-white">{summary.avg_scan_gap != null ? `${summary.avg_scan_gap}с` : '—'}</p>
            <p className="text-[11px] text-gray-400 uppercase font-semibold">Ср. скорость</p>
          </div>
        </div>
      </div>

      {/* Employees list */}
      {employees.length === 0 ? (
        <p className="text-center text-gray-400 py-6">Нет данных по сотрудникам</p>
      ) : (
        <div className="space-y-3">
          {employees.map(emp => <AuditEmployeeRow key={emp.employee_id} emp={emp} />)}
        </div>
      )}
    </div>
  );
}

// ═══ Main Component ═══
export default function InventoryAnalyticsView() {
  const { settings: s } = useAppSettings();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedWarehouse, setSelectedWarehouse] = useState(null);
  const [drillStack, setDrillStack] = useState([]);
  const activeTab = searchParams.get('view') || 'inventory';
  const setActiveTab = (v) => {
    const next = new URLSearchParams(searchParams);
    if (v === 'inventory') { next.delete('view'); } else { next.set('view', v); }
    setSearchParams(next);
  };

  useEffect(() => {
    setLoading(true);
    api.get('/tasks/analytics/inventory-overview')
      .then(res => setData(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleDrill = (node) => {
    setDrillStack(prev => [...prev, node]);
  };

  const handleBack = (toIndex) => {
    setDrillStack(prev => prev.slice(0, toIndex));
  };

  if (loading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>;
  if (!data) return <p className="text-center text-gray-400 py-12">Нет данных</p>;

  const warehouses = data.warehouses || data || [];

  // Drill-down view (only in inventory tab)
  if (activeTab === 'inventory' && drillStack.length > 0) {
    const currentNode = drillStack[drillStack.length - 1];
    return (
      <div>
        {/* Tab switcher */}
        <div className="flex items-center gap-2 mb-5">
          <button
            onClick={() => { setActiveTab('inventory'); setDrillStack([]); }}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-all bg-primary-600 text-white flex items-center gap-1.5"
          >
            <Package size={14} /> Инвентаризация
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-all bg-white border border-gray-200 text-gray-600 hover:border-primary-300 flex items-center gap-1.5"
          >
            <FileText size={14} /> Аудит-отчёт
          </button>
        </div>
        <DetailPanel
          node={currentNode}
          breadcrumbs={drillStack}
          onDrill={handleDrill}
          onBack={handleBack}
          settings={s}
        />
      </div>
    );
  }

  const filteredWarehouses = selectedWarehouse
    ? warehouses.filter(w => String(w.id) === String(selectedWarehouse))
    : warehouses;

  // Flatten nodes for selected warehouses (for stats + search)
  function collectNodesFrom(sources, path = '') {
    const result = [];
    for (const n of (sources || [])) {
      result.push({ ...n, _path: path });
      if (n.racks) result.push(...collectNodesFrom(n.racks, path + (path ? ' → ' : '') + (n.name || '')));
      if (n.rows) result.push(...collectNodesFrom(n.rows, path + (path ? ' → ' : '') + (n.name || '')));
      if (n.shelves) result.push(...collectNodesFrom(n.shelves, path + (path ? ' → ' : '') + (n.name || n.code || '')));
      if (n.pallets) result.push(...collectNodesFrom(n.pallets, path + (path ? ' → ' : '') + (n.name || '')));
      if (n.boxes) result.push(...collectNodesFrom(n.boxes, path + (path ? ' → ' : '') + (n.label || n.name || n.code || '')));
      if (n.children) result.push(...collectNodesFrom(n.children, path + (path ? ' → ' : '') + (n.name || '')));
    }
    return result;
  }
  const filteredNodes = collectNodesFrom(filteredWarehouses);

  const searchResults = search.length >= 2
    ? filteredNodes.filter(n => {
        const hay = [n.name, n.code, n.label, n.barcode_value].filter(Boolean).join(' ').toLowerCase();
        return hay.includes(search.toLowerCase());
      })
    : [];

  // Stats — based on selected warehouse + settings thresholds
  const freshH = s.inventory_fresh_hours || 24;
  const staleH = s.inventory_stale_hours || 72;
  const statsNodes = filteredNodes;
  const inventoried = statsNodes.filter(n => !!n.last_inventory_at).length;
  const notInventoried = statsNodes.length - inventoried;
  const freshCount = statsNodes.filter(n => {
    if (!n.last_inventory_at) return false;
    return (Date.now() - new Date(n.last_inventory_at).getTime()) < freshH * 3600000;
  }).length;
  const staleCount = statsNodes.filter(n => {
    if (!n.last_inventory_at) return false;
    return (Date.now() - new Date(n.last_inventory_at).getTime()) > staleH * 3600000;
  }).length;

  return (
    <div>
      {/* Tab switcher */}
      <div className="flex items-center gap-2 mb-5">
        <button
          onClick={() => setActiveTab('inventory')}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-1.5 ${activeTab === 'inventory' ? 'bg-primary-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-primary-300'}`}
        >
          <Package size={14} /> Инвентаризация
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-1.5 ${activeTab === 'audit' ? 'bg-primary-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-primary-300'}`}
        >
          <FileText size={14} /> Аудит-отчёт
        </button>
      </div>

      {/* Audit report tab */}
      {activeTab === 'audit' && <AuditReportSection />}

      {/* Inventory tab */}
      {activeTab === 'inventory' && <>
      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="card p-4 flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-primary-50 flex items-center justify-center flex-shrink-0">
            <WarehouseIcon size={28} />
          </div>
          <div>
            <p className="text-2xl font-black text-gray-900 dark:text-white">{selectedWarehouse ? 1 : warehouses.length}</p>
            <p className="text-xs text-gray-400 uppercase font-semibold">{selectedWarehouse ? 'Склад' : 'Складов'}</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: (s.inventory_color_fresh || '#047857') + '18' }}>
            <CheckCircle2 size={22} style={{ color: s.inventory_color_fresh || '#047857' }} />
          </div>
          <div>
            <p className="text-2xl font-black" style={{ color: s.inventory_color_fresh || '#047857' }}>{freshCount}</p>
            <p className="text-xs text-gray-400 uppercase font-semibold">Свежих ({freshH}ч)</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: (s.inventory_color_stale || '#b91c1c') + '18' }}>
            <AlertTriangle size={22} style={{ color: s.inventory_color_stale || '#b91c1c' }} />
          </div>
          <div>
            <p className="text-2xl font-black" style={{ color: s.inventory_color_stale || '#b91c1c' }}>{notInventoried}</p>
            <p className="text-xs text-gray-400 uppercase font-semibold">Без инвента</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: (s.inventory_color_warn || '#a16207') + '18' }}>
            <Clock size={22} style={{ color: s.inventory_color_warn || '#a16207' }} />
          </div>
          <div>
            <p className="text-2xl font-black" style={{ color: s.inventory_color_warn || '#a16207' }}>{staleCount}</p>
            <p className="text-xs text-gray-400 uppercase font-semibold">Устарели ({staleH}ч+)</p>
          </div>
        </div>
      </div>

      {/* Warehouse filter + search */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <button
          onClick={() => setSelectedWarehouse(null)}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${!selectedWarehouse ? 'bg-primary-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-primary-300'}`}
        >
          Все склады
        </button>
        {warehouses.map(w => (
          <button key={w.id}
            onClick={() => setSelectedWarehouse(w.id)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-1.5 ${String(selectedWarehouse) === String(w.id) ? 'bg-primary-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-primary-300'}`}
          >
            <Warehouse size={14} /> {w.name}
          </button>
        ))}
        <div className="flex-1 min-w-[200px]">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Поиск по названию, коду, штрих-коду..."
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm placeholder-gray-400 focus:outline-none focus:border-primary-400"
            />
          </div>
        </div>
      </div>

      {/* Search results */}
      {search.length >= 2 && (
        <div className="card p-0 mb-5 overflow-hidden">
          {searchResults.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-6">Ничего не найдено</p>
          ) : (
            <div className="divide-y divide-gray-50 dark:divide-gray-700 max-h-64 overflow-y-auto">
              {searchResults.slice(0, 20).map((n, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                  onClick={() => handleDrill(n)}>
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: statusColor(n, s).text }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{n.label || n.name || n.code}</p>
                    {n._path && <p className="text-xs text-gray-400 truncate">{n._path}</p>}
                  </div>
                  {n.last_inventory_at && <span className="text-xs text-gray-400 flex-shrink-0">{fmtQty(n.last_inventory_qty)} шт.</span>}
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-lg flex-shrink-0" style={{ background: statusColor(n, s).bg, color: statusColor(n, s).text }}>
                    {statusColor(n, s).label}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Warehouse map */}
      {filteredWarehouses.map(wh => {
        const racks = (wh.racks || []).map(r => ({ ...r, _type: 'rack' }));
        const rows = (wh.rows || []).map(r => ({ ...r, _type: 'row' }));
        const locations = [...racks, ...rows];
        const whInventoried = locations.filter(n => !!n.last_inventory_at).length;
        const whTotal = locations.length;
        const whPct = whTotal > 0 ? Math.round((whInventoried / whTotal) * 100) : 0;

        return (
          <div key={wh.id} className="mb-6">
            <div className="flex items-center gap-3 mb-3">
              <WarehouseIcon size={22} />
              <h3 className="font-bold text-gray-900 dark:text-white">{wh.name}</h3>
              <span className="text-xs text-gray-400">{wh.warehouse_type === 'fbo' ? 'Паллетный' : 'Стеллажный'}</span>
              <div className="flex-1" />
              <div className="flex items-center gap-2">
                <div className="w-24 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${whPct}%`, background: whPct === 100 ? '#10b981' : whPct > 50 ? '#f59e0b' : '#ef4444' }} />
                </div>
                <span className="text-xs font-bold text-gray-600">{whPct}%</span>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {locations.map((loc, i) => (
                <InventoryCard key={loc.id || i} node={loc} type={loc._type || 'shelf'} onDrill={handleDrill} settings={s} />
              ))}
            </div>
          </div>
        );
      })}
      </>}
    </div>
  );
}

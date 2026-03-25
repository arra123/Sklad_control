import { useState, useEffect, useCallback } from 'react';
import { BarChart3, ChevronRight, Clock, CheckCircle2, AlertTriangle, Search } from 'lucide-react';
import { WarehouseIcon, RackIcon, ShelfIcon, PalletIcon, RowIcon, BoxIcon, ProductIcon, EmployeeIcon } from '../../components/ui/WarehouseIcons';
import api from '../../api/client';
import Spinner from '../../components/ui/Spinner';
import Badge from '../../components/ui/Badge';
import { useAppSettings } from '../../context/AppSettingsContext';
import { cn } from '../../utils/cn';

/* ═══════════════════ Helpers ═══════════════════ */

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

function fmtQty(val) {
  return Number(val || 0).toLocaleString('ru-RU');
}

function fmtTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
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

function getChildren(node) {
  if (node.racks?.length) return { items: node.racks.map(r => ({ ...r, _type: 'rack' })), label: 'Стеллажи' };
  if (node.rows?.length) return { items: node.rows.map(r => ({ ...r, _type: 'row' })), label: 'Ряды' };
  if (node.shelves?.length) return { items: node.shelves.map(s => ({ ...s, _type: 'shelf' })), label: 'Полки' };
  if (node.pallets?.length) return { items: node.pallets.map(p => ({ ...p, _type: 'pallet' })), label: 'Паллеты' };
  if (node.boxes?.length) return { items: node.boxes.map(b => ({ ...b, _type: 'pallet_box' })), label: 'Коробки' };
  if (node.children?.length) return { items: node.children, label: 'Элементы' };
  return null;
}

function getChildType(child) {
  if (child._type) return child._type;
  if (child.kind === 'shelf_box') return 'shelf_box';
  if (child.kind === 'pallet_box') return 'pallet_box';
  if (child.racks) return 'warehouse';
  if (child.shelves) return 'rack';
  if (child.pallets) return 'row';
  if (child.boxes) return 'pallet';
  return 'shelf';
}

function nodeId(node, type) {
  return `${type || node._type || 'node'}-${node.id}`;
}

function getNodeLabel(node) {
  // For rows: show "Ряд X" instead of just "РX"
  if (node.kind === 'row' || node._type === 'row') {
    return node.name || `Ряд ${node.number || ''}`;
  }
  // For pallets: show "Паллет X" or full label
  if (node.kind === 'pallet' || node._type === 'pallet') {
    return node.name || node.label || `Паллет ${node.number || ''}`;
  }
  return node.label || node.name || node.code || '—';
}

function getNodeIcon(type, size = 18) {
  switch (type) {
    case 'warehouse': return <WarehouseIcon size={size} />;
    case 'rack': return <RackIcon size={size} />;
    case 'row': return <RowIcon size={size} />;
    case 'shelf': return <ShelfIcon size={size} />;
    case 'pallet': return <PalletIcon size={size} />;
    case 'pallet_box':
    case 'shelf_box':
    case 'box': return <BoxIcon size={size} />;
    default: return <ShelfIcon size={size} />;
  }
}

/* ═══════════════════ Folder SVG icons ═══════════════════ */

function FolderClosedIcon({ color = '#7c3aed', size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M2 6a2 2 0 012-2h5l2 2h9a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" fill={color} opacity="0.85"/>
    </svg>
  );
}

function FolderOpenIcon({ color = '#7c3aed', size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M2 6a2 2 0 012-2h5l2 2h9a2 2 0 012 2v1H7.5a2 2 0 00-1.9 1.37L2 20V6z" fill={color} opacity="0.7"/>
      <path d="M5.5 11h16a1 1 0 01.97 1.24l-2.1 8.4A1 1 0 0119.4 21.5H3.6L5.5 11z" fill={color} opacity="0.9"/>
    </svg>
  );
}

function FileIcon({ color = '#a78bfa', size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M6 2a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6H6z" fill={color} opacity="0.8"/>
      <path d="M14 2v4a2 2 0 002 2h4" fill="none" stroke={color} strokeWidth="1.5"/>
    </svg>
  );
}

/* ═══════════════════ Tree Node ═══════════════════ */

function TreeNode({ node, type, depth = 0, expandedNodes, selectedNodeId, onToggle, onSelect }) {
  const nid = nodeId(node, type);
  const childrenData = getChildren(node);
  const hasChildren = !!childrenData;
  const isExpanded = expandedNodes.has(nid);
  const isSelected = selectedNodeId === nid;
  const childCount = childrenData ? childrenData.items.length : 0;

  const isWarehouse = type === 'warehouse';
  const isRackOrRow = type === 'rack' || type === 'row';
  const isBox = type === 'pallet_box' || type === 'shelf_box' || type === 'box';

  // Warehouse colors — each warehouse gets a unique accent
  const warehouseColors = ['#7c3aed', '#2563eb', '#059669', '#dc2626', '#d97706', '#0891b2', '#7c3aed'];
  const whIdx = type === 'warehouse' ? (node.id || 0) % warehouseColors.length : 0;

  const getFolderIcon = () => {
    if (isBox) return <BoxIcon size={16} />;
    if (type === 'warehouse') return <WarehouseIcon size={18} />;
    if (type === 'rack') return <RackIcon size={16} />;
    if (type === 'row') return <RowIcon size={16} />;
    if (type === 'shelf') return <ShelfIcon size={16} />;
    if (type === 'pallet') return <PalletIcon size={16} />;
    if (!hasChildren) return <ShelfIcon size={16} />;
    return <ShelfIcon size={16} />;
  };

  return (
    <div>
      <button
        onClick={() => {
          onSelect(node, type, nid);
          if (hasChildren) onToggle(nid);
        }}
        className={cn(
          'w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors rounded-r-lg',
          isSelected
            ? 'bg-[#f5f3ff] text-[#7c3aed] font-semibold border-l-[3px] border-[#7c3aed]'
            : 'text-gray-700 hover:bg-gray-50 border-l-[3px] border-transparent'
        )}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
      >
        {hasChildren && (
          <ChevronRight
            size={12}
            className={cn('flex-shrink-0 text-gray-400 transition-transform', isExpanded && 'rotate-90')}
          />
        )}
        {!hasChildren && <span className="w-3 flex-shrink-0" />}
        <span className="flex-shrink-0">{getFolderIcon()}</span>
        <span className="truncate flex-1">{getNodeLabel(node)}</span>
        {type === 'warehouse' && (
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: warehouseColors[whIdx] }} />
        )}
        {hasChildren && childCount > 0 && (
          <span className="text-[10px] bg-gray-100 text-gray-500 rounded-full px-1.5 py-0.5 flex-shrink-0 font-medium">
            {childCount}
          </span>
        )}
      </button>
      {hasChildren && isExpanded && (
        <div>
          {childrenData.items.map((child, i) => {
            const cType = getChildType(child);
            return (
              <TreeNode
                key={child.id || i}
                node={child}
                type={cType}
                depth={depth + 1}
                expandedNodes={expandedNodes}
                selectedNodeId={selectedNodeId}
                onToggle={onToggle}
                onSelect={onSelect}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════ Task Scans Panel ═══════════════════ */

function TaskScansPanel({ taskId, boxId, boxType }) {
  const [scans, setScans] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/tasks/${taskId}/analytics`)
      .then(r => {
        let allScans = r.data?.scans || [];
        if (boxId && allScans.length > 0) {
          const taskBoxes = r.data?.task_boxes || [];
          const matchField = boxType === 'shelf_box' ? 'shelf_box_id' : 'box_id';
          const taskBox = taskBoxes.find(tb => String(tb[matchField]) === String(boxId));
          if (taskBox) {
            allScans = allScans.filter(sc => String(sc.task_box_id) === String(taskBox.id));
            allScans = allScans.map((sc, i) => ({
              ...sc,
              seconds_since_prev: i > 0
                ? ((new Date(sc.created_at).getTime() - new Date(allScans[i - 1].created_at).getTime()) / 1000).toFixed(1)
                : null,
            }));
          }
        }
        setScans(allScans);
      })
      .catch(() => setScans([]))
      .finally(() => setLoading(false));
  }, [taskId, boxId, boxType]);

  if (loading) return <div className="py-3 text-center"><Spinner size="sm" /></div>;
  if (!scans?.length) return <p className="py-3 text-center text-xs text-gray-300">Нет сканов</p>;

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
        {scans.map((sc, i) => {
          const secSince = Number(sc.seconds_since_prev);
          const speedClass = sc.seconds_since_prev == null
            ? 'text-purple-400'
            : secSince <= 5 ? 'text-green-500' : secSince <= 10 ? 'text-amber-500' : 'text-red-500';
          return (
            <div key={sc.id} className="flex items-center gap-2.5 px-3 py-1.5">
              <span className="text-[11px] font-mono text-gray-300 w-5 text-right flex-shrink-0">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-800 truncate">{sc.product_name || 'Неизвестный'}</p>
                {sc.product_code && <p className="text-[10px] text-gray-400">{sc.product_code}</p>}
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-[11px] font-mono text-gray-600">{fmtTime(sc.created_at)}</p>
                {sc.seconds_since_prev != null ? (
                  <p className={`text-[10px] ${speedClass}`}>+{sc.seconds_since_prev}с</p>
                ) : (
                  <p className="text-[10px] text-purple-400">старт</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════ Inventory History Section ═══════════════════ */

function InventoryHistorySection({ node }) {
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedTask, setExpandedTask] = useState(null);

  const kind = node.kind || node._type;
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
          <div key={ev.task_id} className={cn('rounded-2xl border overflow-hidden', isLatest ? 'border-purple-200 bg-purple-50/30' : 'border-gray-200 bg-white')}>
            <button
              onClick={() => setExpandedTask(isExpanded ? null : ev.task_id)}
              className="w-full text-left px-4 py-3 hover:opacity-80 transition-opacity"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <svg className={cn('w-3 h-3 text-gray-400 flex-shrink-0 transition-transform', isExpanded && 'rotate-90')} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 18l6-6-6-6"/></svg>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {ev.task_title || `Задача #${ev.task_id}`}
                      {isLatest && <span className="ml-2 text-[10px] text-purple-500 font-medium">последняя</span>}
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
                    {avgPick && <span className="text-[10px] text-purple-500 font-semibold">{avgPick}с/шт</span>}
                    {picksPerMin && <span className="text-[10px] text-gray-400">{picksPerMin}/мин</span>}
                  </div>
                </div>
              </div>
            </button>
            {isExpanded && <TaskScansPanel taskId={ev.task_id} boxId={node.id} boxType={locationType} />}
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════ Overview Panel (no selection or warehouse) ═══════════════════ */

function OverviewPanel({ data, settings }) {
  const warehouses = data.warehouses || data || [];

  function collectAll(sources) {
    const result = [];
    for (const n of (sources || [])) {
      result.push(n);
      if (n.racks) result.push(...collectAll(n.racks));
      if (n.rows) result.push(...collectAll(n.rows));
      if (n.shelves) result.push(...collectAll(n.shelves));
      if (n.pallets) result.push(...collectAll(n.pallets));
      if (n.boxes) result.push(...collectAll(n.boxes));
      if (n.children) result.push(...collectAll(n.children));
    }
    return result;
  }

  const allNodes = collectAll(warehouses);
  const freshH = settings.inventory_fresh_hours || 24;
  const staleH = settings.inventory_stale_hours || 72;
  const totalQty = allNodes.reduce((s, n) => s + Number(n.current_qty || 0), 0);
  const inventoried = allNodes.filter(n => !!n.last_inventory_at).length;
  const coverage = allNodes.length > 0 ? Math.round((inventoried / allNodes.length) * 100) : 0;
  const freshCount = allNodes.filter(n => n.last_inventory_at && (Date.now() - new Date(n.last_inventory_at).getTime()) < freshH * 3600000).length;
  const staleCount = allNodes.filter(n => n.last_inventory_at && (Date.now() - new Date(n.last_inventory_at).getTime()) > staleH * 3600000).length;
  const notInventoried = allNodes.length - inventoried;

  // Find best employee (most inventory scans)
  const employeeCounts = {};
  allNodes.forEach(n => {
    if (n.last_inventory_by) {
      employeeCounts[n.last_inventory_by] = (employeeCounts[n.last_inventory_by] || 0) + 1;
    }
  });
  const bestEmployee = Object.entries(employeeCounts).sort((a, b) => b[1] - a[1])[0];

  // Average speed
  const speeds = allNodes
    .filter(n => n.last_inventory_duration_seconds > 0 && n.last_inventory_qty > 0)
    .map(n => Number(n.last_inventory_duration_seconds) / Number(n.last_inventory_qty));
  const avgSpeed = speeds.length > 0 ? (speeds.reduce((a, b) => a + b, 0) / speeds.length).toFixed(1) : null;

  // Last check
  const lastChecks = allNodes.filter(n => n.last_inventory_at).map(n => new Date(n.last_inventory_at).getTime());
  const lastCheck = lastChecks.length > 0 ? new Date(Math.max(...lastChecks)) : null;

  return (
    <div className="animate-fade-up">
      {/* Hero card */}
      <div className="rounded-2xl p-6 mb-6 text-white" style={{ background: 'linear-gradient(135deg, #7c3aed, #a78bfa)' }}>
        <p className="text-lg font-bold mb-1">
          Всего {fmtQty(totalQty)} позиций на складах
        </p>
        <p className="text-sm opacity-80 mb-3">{coverage}% локаций проинвентаризировано</p>
        <div className="flex items-center gap-6 text-sm opacity-90">
          <span className="flex items-center gap-1.5"><WarehouseIcon size={16} /> {warehouses.length} {warehouses.length === 1 ? 'склад' : 'складов'}</span>
          <span className="flex items-center gap-1.5"><CheckCircle2 size={16} /> {freshCount} проверено недавно</span>
          <span className="flex items-center gap-1.5"><AlertTriangle size={16} /> {notInventoried} не проверено</span>
        </div>
      </div>

      {/* Metric tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <MetricTile
          icon={<CheckCircle2 size={20} />}
          iconBg="#dcfce7"
          iconColor="#16a34a"
          value={freshCount}
          label={`Проверено за последние ${freshH}ч`}
          bar={allNodes.length > 0 ? (freshCount / allNodes.length) * 100 : 0}
          barColor="#16a34a"
        />
        <MetricTile
          icon={<AlertTriangle size={20} />}
          iconBg="#fee2e2"
          iconColor="#dc2626"
          value={staleCount}
          label={`Давно не проверялись (>${staleH}ч)`}
          bar={allNodes.length > 0 ? (staleCount / allNodes.length) * 100 : 0}
          barColor="#dc2626"
        />
        <MetricTile
          icon={<Clock size={20} />}
          iconBg="#fef3c7"
          iconColor="#d97706"
          value={notInventoried}
          label="Ни разу не инвентаризировались"
          bar={allNodes.length > 0 ? (notInventoried / allNodes.length) * 100 : 0}
          barColor="#d97706"
        />
        <MetricTile
          icon={<BarChart3 size={20} />}
          iconBg="#ede9fe"
          iconColor="#7c3aed"
          value={avgSpeed ? `${avgSpeed}с` : '—'}
          label="Среднее время на 1 товар"
        />
        <MetricTile
          icon={<EmployeeIcon size={20} />}
          iconBg="#dbeafe"
          iconColor="#2563eb"
          value={bestEmployee ? bestEmployee[0] : '—'}
          label={bestEmployee ? `${bestEmployee[1]} проверок выполнено` : 'Лучший сотрудник'}
          small
        />
        <MetricTile
          icon={<Clock size={20} />}
          iconBg="#f0fdf4"
          iconColor="#16a34a"
          value={lastCheck ? timeAgo(lastCheck.toISOString()) : '—'}
          label="Когда была последняя проверка"
        />
      </div>
    </div>
  );
}

function MetricTile({ icon, iconBg, iconColor, value, label, bar, barColor, small }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 flex items-start gap-3">
      <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: iconBg, color: iconColor }}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn('font-black text-gray-900 truncate', small ? 'text-sm' : 'text-xl')}>{value}</p>
        <p className="text-xs text-gray-400 mt-0.5">{label}</p>
        {bar != null && (
          <div className="mt-2 w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(bar, 100)}%`, background: barColor }} />
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════ Rack / Row Detail ═══════════════════ */

function RackRowDetail({ node, type, settings }) {
  const childrenData = getChildren(node);
  const items = childrenData?.items || [];
  const st = statusColor(node, settings);
  const totalQty = Number(node.current_qty || 0);
  const invQty = Number(node.last_inventory_qty || 0);
  const coverage = node.total_leaf_count > 0
    ? Math.round((node.covered_leaf_count || 0) / node.total_leaf_count * 100)
    : 0;

  return (
    <div className="animate-fade-up">
      {/* Header tile */}
      <div className="rounded-2xl p-5 mb-6 text-white" style={{ background: 'linear-gradient(135deg, #7c3aed, #a78bfa)' }}>
        <div className="flex items-center gap-3 mb-2">
          {getNodeIcon(type, 24)}
          <h3 className="text-lg font-bold">{getNodeLabel(node)}</h3>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm opacity-90">
          <span>{items.length} {childrenData?.label?.toLowerCase() || 'элементов'}</span>
          <span>{fmtQty(totalQty)} позиций</span>
          {node.last_inventory_duration_seconds > 0 && <span>Время: {fmtDuration(node.last_inventory_duration_seconds)}</span>}
          {invQty > 0 && Number(node.last_inventory_duration_seconds || 0) > 0 && (
            <span>{(Number(node.last_inventory_duration_seconds) / invQty).toFixed(1)}с/шт</span>
          )}
          {node.last_inventory_by && <span>{node.last_inventory_by}</span>}
        </div>
      </div>

      {/* Child cards */}
      <div className="space-y-3">
        {items.map((child, i) => {
          const cst = statusColor(child, settings);
          const cInv = Number(child.last_inventory_qty || 0);
          const cCur = Number(child.current_qty || 0);
          const cDelta = cInv - cCur;
          const cDur = Number(child.last_inventory_duration_seconds || 0);
          const cAvgPick = cInv > 0 && cDur > 0 ? (cDur / cInv).toFixed(1) : null;
          return (
            <div key={child.id || i} className="bg-white rounded-xl border border-gray-100 p-4 hover:shadow-md transition-shadow" style={{ borderLeft: `4px solid ${cst.text}` }}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {getNodeIcon(getChildType(child), 18)}
                  <span className="font-semibold text-gray-900">{getNodeLabel(child)}</span>
                </div>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-lg" style={{ background: cst.bg, color: cst.text }}>{cst.label}</span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center bg-gray-50 rounded-lg p-2 mb-2">
                <div>
                  <p className="text-sm font-black text-gray-900">{fmtQty(cInv)}</p>
                  <p className="text-[10px] text-gray-400">по инвенту</p>
                </div>
                <div>
                  <p className="text-sm font-black text-gray-900">{fmtQty(cCur)}</p>
                  <p className="text-[10px] text-gray-400">сейчас</p>
                </div>
                <div>
                  <p className={cn('text-sm font-black', cDelta > 0 ? 'text-green-600' : cDelta < 0 ? 'text-red-600' : 'text-gray-400')}>
                    {cDelta > 0 ? '+' : ''}{cDelta}
                  </p>
                  <p className="text-[10px] text-gray-400">разница</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-400">
                {child.last_inventory_at && (
                  <span className="flex items-center gap-1"><Clock size={10} />{timeAgo(child.last_inventory_at)}</span>
                )}
                {cDur > 0 && (
                  <span className="flex items-center gap-1">Время: <strong className="text-gray-600">{fmtDuration(cDur)}</strong></span>
                )}
                {cAvgPick && (
                  <span className="text-purple-500 font-semibold">{cAvgPick}с/шт</span>
                )}
                {child.last_inventory_by && (
                  <span className="flex items-center gap-1"><EmployeeIcon size={10} />{child.last_inventory_by}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════ Shelf / Pallet Detail ═══════════════════ */

function ShelfPalletDetail({ node, type, settings }) {
  const childrenData = getChildren(node);
  const hasBoxes = !!childrenData && childrenData.items.length > 0;
  const st = statusColor(node, settings);
  const invQty = Number(node.last_inventory_qty || 0);
  const curQty = Number(node.current_qty || 0);

  // Product distribution from node.products if available
  const products = node.products || [];

  return (
    <div className="animate-fade-up">
      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 mb-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: st.bg }}>
            {getNodeIcon(type, 24)}
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-gray-900">{getNodeLabel(node)}</h3>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs font-semibold px-2 py-0.5 rounded-lg" style={{ background: st.bg, color: st.text }}>{st.label}</span>
              {node.last_inventory_at && <span className="text-xs text-gray-400">{timeAgo(node.last_inventory_at)}</span>}
              {node.last_inventory_by && <span className="text-xs text-gray-400 flex items-center gap-1"><EmployeeIcon size={11} />{node.last_inventory_by}</span>}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 text-center">
          <div className="bg-gray-50 rounded-lg p-2">
            <p className="text-lg font-black text-gray-900">{fmtQty(invQty)}</p>
            <p className="text-[10px] text-gray-400 uppercase">По инвенту</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-2">
            <p className="text-lg font-black text-gray-900">{fmtQty(curQty)}</p>
            <p className="text-[10px] text-gray-400 uppercase">Сейчас</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-2">
            <p className={cn('text-lg font-black', (invQty - curQty) > 0 ? 'text-green-600' : (invQty - curQty) < 0 ? 'text-red-600' : 'text-gray-400')}>
              {(invQty - curQty) > 0 ? '+' : ''}{invQty - curQty}
            </p>
            <p className="text-[10px] text-gray-400 uppercase">Разница</p>
          </div>
          {Number(node.last_inventory_duration_seconds || 0) > 0 && (
            <div className="bg-gray-50 rounded-lg p-2">
              <p className="text-lg font-black text-gray-900">{fmtDuration(node.last_inventory_duration_seconds)}</p>
              <p className="text-[10px] text-gray-400 uppercase">Время</p>
            </div>
          )}
          {invQty > 0 && Number(node.last_inventory_duration_seconds || 0) > 0 && (
            <div className="bg-purple-50 rounded-lg p-2">
              <p className="text-lg font-black text-purple-600">{(Number(node.last_inventory_duration_seconds) / invQty).toFixed(1)}с</p>
              <p className="text-[10px] text-gray-400 uppercase">На 1 товар</p>
            </div>
          )}
          </div>
        </div>

      {/* Boxes tile grid */}
      {hasBoxes && (
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">{childrenData.label} ({childrenData.items.length})</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {childrenData.items.map((box, i) => {
              const bst = statusColor(box, settings);
              const bQty = Number(box.last_inventory_qty || box.current_qty || 0);
              const bDur = Number(box.last_inventory_duration_seconds || 0);
              const bAvg = bQty > 0 && bDur > 0 ? (bDur / bQty).toFixed(1) : null;
              return (
                <div key={box.id || i} className="bg-white rounded-xl border border-gray-100 p-3 hover:shadow-md transition-shadow" style={{ borderBottom: `3px solid ${bst.text}` }}>
                  <div className="flex items-center gap-2 mb-1">
                    <BoxIcon size={14} />
                    <span className="font-semibold text-sm text-gray-900 truncate flex-1">{getNodeLabel(box)}</span>
                    <span className="text-xs font-black text-gray-900">{fmtQty(bQty)}<span className="text-[10px] text-gray-400 ml-0.5">шт</span></span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-gray-400">
                    {bDur > 0 && <span>Время: <strong className="text-gray-600">{fmtDuration(bDur)}</strong></span>}
                    {bAvg && <span className="text-purple-500 font-semibold">{bAvg}с/шт</span>}
                    {box.last_inventory_at && <span>{timeAgo(box.last_inventory_at)}</span>}
                    {box.last_inventory_by && <span>{box.last_inventory_by}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* If no boxes — show history + product distribution */}
      {!hasBoxes && (
        <>
          {/* Product distribution bar */}
          {products.length > 0 && (
            <div className="mb-5">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Распределение товаров</p>
              <div className="bg-white rounded-xl border border-gray-100 p-4">
                <div className="h-6 rounded-full overflow-hidden flex">
                  {products.map((p, idx) => {
                    const pQty = Number(p.qty || p.quantity || 0);
                    const total = products.reduce((s, pp) => s + Number(pp.qty || pp.quantity || 0), 0);
                    const pct = total > 0 ? (pQty / total) * 100 : 0;
                    const colors = ['#7c3aed', '#2563eb', '#16a34a', '#d97706', '#dc2626', '#0891b2', '#4f46e5'];
                    return (
                      <div
                        key={idx}
                        className="h-full"
                        style={{ width: `${pct}%`, background: colors[idx % colors.length], minWidth: pct > 0 ? '4px' : 0 }}
                        title={`${p.name || p.product_name}: ${pQty}`}
                      />
                    );
                  })}
                </div>
                <div className="flex flex-wrap gap-3 mt-3">
                  {products.slice(0, 6).map((p, idx) => {
                    const colors = ['#7c3aed', '#2563eb', '#16a34a', '#d97706', '#dc2626', '#0891b2'];
                    return (
                      <span key={idx} className="flex items-center gap-1 text-[11px] text-gray-600">
                        <span className="w-2 h-2 rounded-full inline-block" style={{ background: colors[idx % colors.length] }} />
                        {p.name || p.product_name}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {node.last_inventory_at && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">История инвентаризаций</p>
              <InventoryHistorySection node={node} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ═══════════════════ Box Detail (leaf) ═══════════════════ */

function BoxDetail({ node, type, settings }) {
  const st = statusColor(node, settings);
  const invQty = Number(node.last_inventory_qty || 0);
  const curQty = Number(node.current_qty || 0);
  const delta = invQty - curQty;

  return (
    <div className="animate-fade-up">
      {/* Hero card */}
      <div className="rounded-2xl p-5 mb-5 text-white" style={{ background: 'linear-gradient(135deg, #7c3aed, #a78bfa)' }}>
        <div className="flex items-center gap-3 mb-3">
          <BoxIcon size={24} />
          <div>
            <h3 className="text-lg font-bold">{getNodeLabel(node)}</h3>
            {node.barcode_value && <p className="text-sm opacity-80 font-mono">{node.barcode_value}</p>}
          </div>
        </div>
        <p className="text-4xl font-black">{fmtQty(invQty)} <span className="text-base font-medium opacity-80">шт</span></p>
        <div className="flex items-center gap-4 mt-2 text-sm opacity-90">
          <span>Текущее: {fmtQty(curQty)}</span>
          <span className={delta !== 0 ? 'font-bold' : ''}>Дельта: {delta > 0 ? '+' : ''}{delta}</span>
          {node.last_inventory_at && <span>{timeAgo(node.last_inventory_at)}</span>}
        </div>
      </div>

      {/* History section — no tabs, history only */}
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">История инвентаризаций</p>
      {(
        <InventoryHistorySection node={node} />
      )}
    </div>
  );
}

/* ═══════════════════ Right Panel Content Router ═══════════════════ */

function RightPanelContent({ selectedNode, selectedType, data, settings }) {
  if (!selectedNode) {
    return <OverviewPanel data={data} settings={settings} />;
  }

  if (selectedType === 'warehouse') {
    return <OverviewPanel data={{ warehouses: [selectedNode] }} settings={settings} />;
  }

  if (selectedType === 'rack' || selectedType === 'row') {
    return <RackRowDetail node={selectedNode} type={selectedType} settings={settings} />;
  }

  if (selectedType === 'shelf' || selectedType === 'pallet') {
    return <ShelfPalletDetail node={selectedNode} type={selectedType} settings={settings} />;
  }

  if (selectedType === 'pallet_box' || selectedType === 'shelf_box' || selectedType === 'box') {
    return <BoxDetail node={selectedNode} type={selectedType} settings={settings} />;
  }

  // Fallback: treat as shelf
  return <ShelfPalletDetail node={selectedNode} type={selectedType} settings={settings} />;
}

/* ═══════════════════ Main Component ═══════════════════ */

export default function InventoryAnalyticsV2() {
  const { settings: s } = useAppSettings();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedNodes, setExpandedNodes] = useState(new Set());
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedType, setSelectedType] = useState(null);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [selectedPath, setSelectedPath] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get('/tasks/analytics/inventory-overview')
      .then(res => setData(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleToggle = useCallback((nid) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nid)) next.delete(nid);
      else next.add(nid);
      return next;
    });
  }, []);

  const buildPath = useCallback((node, type, warehouses) => {
    // Build breadcrumb path by searching through the tree
    const path = [];

    function search(items, parentType, trail) {
      for (const item of items) {
        const iType = item._type || parentType;
        const currentTrail = [...trail, { node: item, type: iType, label: getNodeLabel(item) }];

        if (item === node || (item.id && item.id === node.id && iType === type)) {
          return currentTrail;
        }

        // Search children
        const childArrays = [
          { arr: item.racks, type: 'rack' },
          { arr: item.rows, type: 'row' },
          { arr: item.shelves, type: 'shelf' },
          { arr: item.pallets, type: 'pallet' },
          { arr: item.boxes, type: 'pallet_box' },
          { arr: item.children, type: null },
        ];

        for (const { arr, type: cType } of childArrays) {
          if (arr?.length) {
            const tagged = arr.map(c => ({ ...c, _type: c._type || cType || getChildType(c) }));
            const found = search(tagged, cType, currentTrail);
            if (found) return found;
          }
        }
      }
      return null;
    }

    const whs = (warehouses || []).map(w => ({ ...w, _type: 'warehouse' }));
    const result = search(whs, 'warehouse', []);
    return result || [{ node, type, label: getNodeLabel(node) }];
  }, []);

  const handleSelect = useCallback((node, type, nid) => {
    setSelectedNode(node);
    setSelectedType(type);
    setSelectedNodeId(nid);

    if (data) {
      const warehouses = data.warehouses || data || [];
      const path = buildPath(node, type, warehouses);
      setSelectedPath(path);
    }
  }, [data, buildPath]);

  const handleBreadcrumbClick = useCallback((index) => {
    if (index < 0) {
      // Click on "Overview"
      setSelectedNode(null);
      setSelectedType(null);
      setSelectedNodeId(null);
      setSelectedPath([]);
      return;
    }
    const pathItem = selectedPath[index];
    if (pathItem) {
      setSelectedNode(pathItem.node);
      setSelectedType(pathItem.type);
      setSelectedNodeId(nodeId(pathItem.node, pathItem.type));
      setSelectedPath(selectedPath.slice(0, index + 1));
    }
  }, [selectedPath]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!data) {
    return <p className="text-center text-gray-400 py-12">Нет данных</p>;
  }

  const warehouses = data.warehouses || data || [];

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden rounded-2xl border border-gray-200 bg-gray-50">
      {/* Mobile sidebar toggle */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="md:hidden fixed top-20 left-4 z-50 bg-white border border-gray-200 rounded-lg p-2 shadow-lg"
      >
        <BarChart3 size={20} className="text-purple-600" />
      </button>

      {/* ═══ LEFT SIDEBAR ═══ */}
      <aside className={cn(
        'bg-white border-r border-gray-200 flex-shrink-0 flex flex-col overflow-hidden transition-all duration-300',
        sidebarOpen ? 'w-[270px]' : 'w-0 md:w-[270px]',
        'max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-40 max-md:shadow-xl',
        !sidebarOpen && 'max-md:-translate-x-full'
      )}>
        {/* Sidebar header */}
        <div className="px-4 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
              <BarChart3 size={18} className="text-purple-600" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900">GRAсклад</h2>
              <p className="text-[10px] text-gray-400">Аналитика инвентаризации</p>
            </div>
          </div>
        </div>

        {/* Section label */}
        <div className="px-4 pt-4 pb-2">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">ИЕРАРХИЯ СКЛАДА</p>
        </div>

        {/* Tree */}
        <div className="flex-1 overflow-y-auto px-1 pb-4">
          {/* Overview node */}
          <button
            onClick={() => {
              setSelectedNode(null);
              setSelectedType(null);
              setSelectedNodeId(null);
              setSelectedPath([]);
            }}
            className={cn(
              'w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors rounded-r-lg mb-1',
              !selectedNode
                ? 'bg-[#f5f3ff] text-[#7c3aed] font-semibold border-l-[3px] border-[#7c3aed]'
                : 'text-gray-700 hover:bg-gray-50 border-l-[3px] border-transparent'
            )}
          >
            <BarChart3 size={14} className="flex-shrink-0" />
            <span>Обзор</span>
          </button>

          {/* Warehouse nodes */}
          {warehouses.map((wh, i) => (
            <TreeNode
              key={wh.id || i}
              node={wh}
              type="warehouse"
              depth={0}
              expandedNodes={expandedNodes}
              selectedNodeId={selectedNodeId}
              onToggle={handleToggle}
              onSelect={handleSelect}
            />
          ))}
        </div>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/20 z-30"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ═══ RIGHT PANEL ═══ */}
      <main className="flex-1 overflow-y-auto p-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 mb-5 flex-wrap">
          <button
            onClick={() => handleBreadcrumbClick(-1)}
            className={cn('text-sm font-medium', selectedPath.length > 0 ? 'text-purple-500 hover:text-purple-700' : 'text-gray-900')}
          >
            Обзор
          </button>
          {selectedPath.map((crumb, i) => (
            <span key={i} className="flex items-center gap-1.5">
              <ChevronRight size={12} className="text-gray-300" />
              <button
                onClick={() => handleBreadcrumbClick(i)}
                className={cn('text-sm font-medium',
                  i === selectedPath.length - 1 ? 'text-gray-900' : 'text-purple-500 hover:text-purple-700'
                )}
              >
                {crumb.label}
              </button>
            </span>
          ))}
        </div>

        {/* Content */}
        <RightPanelContent
          selectedNode={selectedNode}
          selectedType={selectedType}
          data={data}
          settings={s}
        />
      </main>
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { BarChart3, ChevronRight, Clock, CheckCircle2, AlertTriangle, Search } from 'lucide-react';
import { WarehouseIcon, RackIcon, ShelfIcon, PalletIcon, RowIcon, BoxIcon, ProductIcon } from '../../components/ui/WarehouseIcons';
import api from '../../api/client';
import Spinner from '../../components/ui/Spinner';
import Badge from '../../components/ui/Badge';
import { useAppSettings } from '../../context/AppSettingsContext';
import { cn } from '../../utils/cn';

/* ═══════════════════ Helpers ═══════════════════ */

function fmtDate(iso) {
  if (!iso) return '\u2014';
  return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function fmtDuration(seconds) {
  if (!seconds) return '\u2014';
  const s = Math.round(Number(seconds));
  const m = Math.floor(s / 60);
  const remainder = s % 60;
  if (m === 0) return `${remainder}\u0441`;
  return `${m}\u043C ${remainder}\u0441`;
}

function timeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}\u0434 \u043D\u0430\u0437\u0430\u0434`;
  if (hours > 0) return `${hours}\u0447 \u043D\u0430\u0437\u0430\u0434`;
  return '\u0442\u043E\u043B\u044C\u043A\u043E \u0447\u0442\u043E';
}

function fmtQty(val) {
  return Number(val || 0).toLocaleString('ru-RU');
}

function fmtTime(iso) {
  if (!iso) return '\u2014';
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

  if (!node.last_inventory_at) return { ...hexToBgBorder(cNone), label: '\u041D\u0435 \u0431\u044B\u043B\u043E' };
  const hours = (Date.now() - new Date(node.last_inventory_at).getTime()) / 3600000;
  if (hours < freshH) return { ...hexToBgBorder(cFresh), label: '\u0421\u0432\u0435\u0436\u0438\u0439' };
  if (hours < staleH) return { ...hexToBgBorder(cWarn), label: '\u0414\u0430\u0432\u043D\u043E' };
  return { ...hexToBgBorder(cStale), label: '\u0423\u0441\u0442\u0430\u0440\u0435\u043B' };
}

function getChildren(node) {
  if (node.racks?.length) return { items: node.racks.map(r => ({ ...r, _type: 'rack' })), label: '\u0421\u0442\u0435\u043B\u043B\u0430\u0436\u0438' };
  if (node.rows?.length) return { items: node.rows.map(r => ({ ...r, _type: 'row' })), label: '\u0420\u044F\u0434\u044B' };
  if (node.shelves?.length) return { items: node.shelves.map(s => ({ ...s, _type: 'shelf' })), label: '\u041F\u043E\u043B\u043A\u0438' };
  if (node.pallets?.length) return { items: node.pallets.map(p => ({ ...p, _type: 'pallet' })), label: '\u041F\u0430\u043B\u043B\u0435\u0442\u044B' };
  if (node.boxes?.length) return { items: node.boxes.map(b => ({ ...b, _type: 'pallet_box' })), label: '\u041A\u043E\u0440\u043E\u0431\u043A\u0438' };
  if (node.children?.length) return { items: node.children, label: '\u042D\u043B\u0435\u043C\u0435\u043D\u0442\u044B' };
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
  return node.label || node.name || node.code || '\u2014';
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

  const getFolderIcon = () => {
    if (isBox) return <BoxIcon size={16} />;
    if (!hasChildren) return <FileIcon color="#a78bfa" size={16} />;
    if (isWarehouse) {
      return isExpanded ? <FolderOpenIcon color="#7c3aed" size={16} /> : <FolderClosedIcon color="#7c3aed" size={16} />;
    }
    if (isRackOrRow) {
      return isExpanded ? <FolderOpenIcon color="#a78bfa" size={16} /> : <FolderClosedIcon color="#a78bfa" size={16} />;
    }
    return <FileIcon color="#a78bfa" size={16} />;
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
  if (!scans?.length) return <p className="py-3 text-center text-xs text-gray-300">\u041D\u0435\u0442 \u0441\u043A\u0430\u043D\u043E\u0432</p>;

  const gaps = scans.slice(1).map(s => Number(s.seconds_since_prev)).filter(s => !isNaN(s) && s > 0);
  const avgSec = gaps.length > 0 ? (gaps.reduce((a, b) => a + b, 0) / gaps.length).toFixed(1) : null;

  return (
    <div>
      <div className="flex items-center gap-4 px-3 py-2 text-[11px] text-gray-400 border-b border-gray-100">
        <span>{scans.length} \u0441\u043A\u0430\u043D\u043E\u0432</span>
        {avgSec && <span>\u0421\u0440. \u0432\u0440\u0435\u043C\u044F: {avgSec}\u0441</span>}
        {gaps.length > 0 && <span>\u041C\u0438\u043D: {Math.min(...gaps)}\u0441 / \u041C\u0430\u043A\u0441: {Math.max(...gaps)}\u0441</span>}
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
                <p className="text-xs font-medium text-gray-800 truncate">{sc.product_name || '\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u044B\u0439'}</p>
                {sc.product_code && <p className="text-[10px] text-gray-400">{sc.product_code}</p>}
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-[11px] font-mono text-gray-600">{fmtTime(sc.created_at)}</p>
                {sc.seconds_since_prev != null ? (
                  <p className={`text-[10px] ${speedClass}`}>+{sc.seconds_since_prev}\u0441</p>
                ) : (
                  <p className="text-[10px] text-purple-400">\u0441\u0442\u0430\u0440\u0442</p>
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
  if (!history?.length) return <p className="text-sm text-gray-400 italic py-4">\u041D\u0435\u0442 \u0437\u0430\u0432\u0435\u0440\u0448\u0451\u043D\u043D\u044B\u0445 \u0438\u043D\u0432\u0435\u043D\u0442\u0430\u0440\u0438\u0437\u0430\u0446\u0438\u0439</p>;

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
                      {ev.task_title || `\u0417\u0430\u0434\u0430\u0447\u0430 #${ev.task_id}`}
                      {isLatest && <span className="ml-2 text-[10px] text-purple-500 font-medium">\u043F\u043E\u0441\u043B\u0435\u0434\u043D\u044F\u044F</span>}
                    </p>
                    <div className="flex items-center gap-3 text-[11px] text-gray-400 mt-0.5">
                      <span>{fmtDate(ev.completed_at)}</span>
                      {ev.employee_name && <span>{ev.employee_name}</span>}
                      {dur > 0 && <span>{fmtDuration(dur)}</span>}
                    </div>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-lg font-black text-gray-900">{counted}<span className="text-xs font-medium text-gray-400 ml-0.5">\u0448\u0442</span></p>
                  <div className="flex items-center gap-2 justify-end">
                    {avgPick && <span className="text-[10px] text-purple-500 font-semibold">{avgPick}\u0441/\u0448\u0442</span>}
                    {picksPerMin && <span className="text-[10px] text-gray-400">{picksPerMin}/\u043C\u0438\u043D</span>}
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
          \u0412\u0441\u0435\u0433\u043E {fmtQty(totalQty)} \u043F\u043E\u0437\u0438\u0446\u0438\u0439 | {coverage}% \u043F\u043E\u043A\u0440\u044B\u0442\u0438\u0435
        </p>
        <div className="flex items-center gap-6 text-sm opacity-90 mt-2">
          <span className="flex items-center gap-1.5"><WarehouseIcon size={16} /> {warehouses.length} \u0441\u043A\u043B\u0430\u0434\u043E\u0432</span>
          <span className="flex items-center gap-1.5"><CheckCircle2 size={16} /> {freshCount} \u0441\u0432\u0435\u0436\u0438\u0445</span>
          <span className="flex items-center gap-1.5"><AlertTriangle size={16} /> {staleCount} \u0443\u0441\u0442\u0430\u0440\u0435\u043B\u044B\u0445</span>
        </div>
      </div>

      {/* Metric tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <MetricTile
          icon={<CheckCircle2 size={20} />}
          iconBg="#dcfce7"
          iconColor="#16a34a"
          value={freshCount}
          label={`\u0421\u0432\u0435\u0436\u0438\u0445 (<${freshH}\u0447)`}
          bar={allNodes.length > 0 ? (freshCount / allNodes.length) * 100 : 0}
          barColor="#16a34a"
        />
        <MetricTile
          icon={<AlertTriangle size={20} />}
          iconBg="#fee2e2"
          iconColor="#dc2626"
          value={staleCount}
          label={`\u0423\u0441\u0442\u0430\u0440\u0435\u043B\u044B\u0445 (>${staleH}\u0447)`}
          bar={allNodes.length > 0 ? (staleCount / allNodes.length) * 100 : 0}
          barColor="#dc2626"
        />
        <MetricTile
          icon={<Clock size={20} />}
          iconBg="#fef3c7"
          iconColor="#d97706"
          value={notInventoried}
          label="\u0411\u0435\u0437 \u0438\u043D\u0432\u0435\u043D\u0442\u0430\u0440\u0438\u0437\u0430\u0446\u0438\u0438"
          bar={allNodes.length > 0 ? (notInventoried / allNodes.length) * 100 : 0}
          barColor="#d97706"
        />
        <MetricTile
          icon={<BarChart3 size={20} />}
          iconBg="#ede9fe"
          iconColor="#7c3aed"
          value={avgSpeed ? `${avgSpeed}\u0441` : '\u2014'}
          label="\u0421\u0440. \u0441\u043A\u043E\u0440\u043E\u0441\u0442\u044C / \u0448\u0442"
        />
        <MetricTile
          icon={<ProductIcon size={20} />}
          iconBg="#dbeafe"
          iconColor="#2563eb"
          value={bestEmployee ? bestEmployee[0] : '\u2014'}
          label={bestEmployee ? `${bestEmployee[1]} \u043F\u0440\u043E\u0432\u0435\u0440\u043E\u043A` : '\u041B\u0443\u0447\u0448\u0438\u0439 \u0441\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A'}
          small
        />
        <MetricTile
          icon={<Clock size={20} />}
          iconBg="#f0fdf4"
          iconColor="#16a34a"
          value={lastCheck ? timeAgo(lastCheck.toISOString()) : '\u2014'}
          label="\u041F\u043E\u0441\u043B\u0435\u0434\u043D\u044F\u044F \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430"
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
        <div className="flex items-center gap-6 text-sm opacity-90">
          <span>{items.length} {childrenData?.label?.toLowerCase() || '\u044D\u043B\u0435\u043C\u0435\u043D\u0442\u043E\u0432'}</span>
          <span>{fmtQty(totalQty)} \u043F\u043E\u0437\u0438\u0446\u0438\u0439</span>
          <span>{coverage}% \u043F\u043E\u043A\u0440\u044B\u0442\u0438\u0435</span>
        </div>
      </div>

      {/* Child comparison cards */}
      <div className="space-y-3">
        {items.map((child, i) => {
          const cst = statusColor(child, settings);
          const cInv = Number(child.last_inventory_qty || 0);
          const cCur = Number(child.current_qty || 0);
          const maxBar = Math.max(cInv, cCur, 1);
          return (
            <div key={child.id || i} className="bg-white rounded-xl border border-gray-100 p-4" style={{ borderLeft: `4px solid ${cst.text}` }}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {getNodeIcon(getChildType(child), 16)}
                  <span className="font-semibold text-gray-900 text-sm">{getNodeLabel(child)}</span>
                </div>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-lg" style={{ background: cst.bg, color: cst.text }}>{cst.label}</span>
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-500 mb-2">
                <span>\u0418\u043D\u0432\u0435\u043D\u0442: <strong className="text-gray-900">{fmtQty(cInv)}</strong></span>
                <span>\u0421\u0435\u0439\u0447\u0430\u0441: <strong className="text-gray-900">{fmtQty(cCur)}</strong></span>
                {child.last_inventory_at && <span className="text-gray-400">{timeAgo(child.last_inventory_at)}</span>}
              </div>
              {/* Mini comparison bar */}
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden flex">
                  <div className="h-full bg-purple-400 rounded-l-full" style={{ width: `${(cInv / maxBar) * 100}%` }} />
                </div>
                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden flex">
                  <div className="h-full bg-blue-400 rounded-l-full" style={{ width: `${(cCur / maxBar) * 100}%` }} />
                </div>
              </div>
              <div className="flex items-center gap-4 mt-1 text-[10px] text-gray-400">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-400 inline-block" />\u0418\u043D\u0432\u0435\u043D\u0442</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />\u0422\u0435\u043A\u0443\u0449\u0435\u0435</span>
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
          <div>
            <h3 className="text-lg font-bold text-gray-900">{getNodeLabel(node)}</h3>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs font-semibold px-2 py-0.5 rounded-lg" style={{ background: st.bg, color: st.text }}>{st.label}</span>
              {node.last_inventory_at && <span className="text-xs text-gray-400">{timeAgo(node.last_inventory_at)}</span>}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="bg-gray-50 rounded-lg p-2">
            <p className="text-lg font-black text-gray-900">{fmtQty(invQty)}</p>
            <p className="text-[10px] text-gray-400 uppercase">\u041F\u043E \u0438\u043D\u0432\u0435\u043D\u0442\u0443</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-2">
            <p className="text-lg font-black text-gray-900">{fmtQty(curQty)}</p>
            <p className="text-[10px] text-gray-400 uppercase">\u0421\u0435\u0439\u0447\u0430\u0441</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-2">
            <p className={cn('text-lg font-black', (invQty - curQty) > 0 ? 'text-green-600' : (invQty - curQty) < 0 ? 'text-red-600' : 'text-gray-400')}>
              {(invQty - curQty) > 0 ? '+' : ''}{invQty - curQty}
            </p>
            <p className="text-[10px] text-gray-400 uppercase">\u0420\u0430\u0437\u043D\u0438\u0446\u0430</p>
          </div>
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
              return (
                <div key={box.id || i} className="bg-white rounded-xl border border-gray-100 p-4 hover:shadow-md transition-shadow" style={{ borderBottom: `4px solid ${bst.text}` }}>
                  <div className="flex items-center gap-2 mb-2">
                    <BoxIcon size={16} />
                    <span className="font-semibold text-sm text-gray-900 truncate">{getNodeLabel(box)}</span>
                  </div>
                  <p className="text-3xl font-black text-gray-900">{fmtQty(bQty)}</p>
                  <p className="text-[10px] text-gray-400 mt-1">\u0448\u0442\u0443\u043A</p>
                  {box.last_inventory_at && (
                    <p className="text-[10px] text-gray-400 mt-2 flex items-center gap-1"><Clock size={10} />{timeAgo(box.last_inventory_at)}</p>
                  )}
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
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">\u0420\u0430\u0441\u043F\u0440\u0435\u0434\u0435\u043B\u0435\u043D\u0438\u0435 \u0442\u043E\u0432\u0430\u0440\u043E\u0432</p>
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
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">\u0418\u0441\u0442\u043E\u0440\u0438\u044F \u0438\u043D\u0432\u0435\u043D\u0442\u0430\u0440\u0438\u0437\u0430\u0446\u0438\u0439</p>
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
  const [activeTab, setActiveTab] = useState('products');
  const st = statusColor(node, settings);
  const invQty = Number(node.last_inventory_qty || 0);
  const curQty = Number(node.current_qty || 0);
  const delta = invQty - curQty;
  const products = node.products || [];

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
        <p className="text-4xl font-black">{fmtQty(invQty)} <span className="text-base font-medium opacity-80">\u0448\u0442</span></p>
        <div className="flex items-center gap-4 mt-2 text-sm opacity-90">
          <span>\u0422\u0435\u043A\u0443\u0449\u0435\u0435: {fmtQty(curQty)}</span>
          <span className={delta !== 0 ? 'font-bold' : ''}>\u0414\u0435\u043B\u044C\u0442\u0430: {delta > 0 ? '+' : ''}{delta}</span>
          {node.last_inventory_at && <span>{timeAgo(node.last_inventory_at)}</span>}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-5">
        <button
          onClick={() => setActiveTab('products')}
          className={cn('flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all',
            activeTab === 'products' ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500 hover:text-gray-700')}
        >
          \u0422\u043E\u0432\u0430\u0440\u044B
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={cn('flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all',
            activeTab === 'history' ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500 hover:text-gray-700')}
        >
          \u0418\u0441\u0442\u043E\u0440\u0438\u044F
        </button>
      </div>

      {/* Products tab */}
      {activeTab === 'products' && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          {products.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-8">\u041D\u0435\u0442 \u0434\u0430\u043D\u043D\u044B\u0445 \u043E \u0442\u043E\u0432\u0430\u0440\u0430\u0445</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left">
                  <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase">\u0422\u043E\u0432\u0430\u0440</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase">\u041A\u043E\u0434</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase text-right">\u0418\u043D\u0432\u0435\u043D\u0442</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase text-right">\u0422\u0435\u043A\u0443\u0449\u0435\u0435</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase text-right">\u0414\u0435\u043B\u044C\u0442\u0430</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {products.map((p, i) => {
                  const pInv = Number(p.inventory_qty || p.qty || 0);
                  const pCur = Number(p.current_qty || 0);
                  const pDelta = pInv - pCur;
                  return (
                    <tr key={i} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <ProductIcon size={16} />
                          <span className="font-medium text-gray-900">{p.name || p.product_name || '\u2014'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">{p.code || p.product_code || '\u2014'}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">{fmtQty(pInv)}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{fmtQty(pCur)}</td>
                      <td className={cn('px-4 py-3 text-right font-bold', pDelta > 0 ? 'text-green-600' : pDelta < 0 ? 'text-red-600' : 'text-gray-400')}>
                        {pDelta > 0 ? '+' : ''}{pDelta}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* History tab */}
      {activeTab === 'history' && (
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
    return <p className="text-center text-gray-400 py-12">\u041D\u0435\u0442 \u0434\u0430\u043D\u043D\u044B\u0445</p>;
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
              <h2 className="text-sm font-bold text-gray-900">GRA\u0441\u043A\u043B\u0430\u0434</h2>
              <p className="text-[10px] text-gray-400">\u0410\u043D\u0430\u043B\u0438\u0442\u0438\u043A\u0430 \u0438\u043D\u0432\u0435\u043D\u0442\u0430\u0440\u0438\u0437\u0430\u0446\u0438\u0438</p>
            </div>
          </div>
        </div>

        {/* Section label */}
        <div className="px-4 pt-4 pb-2">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">\u0418\u0415\u0420\u0410\u0420\u0425\u0418\u042F \u0421\u041A\u041B\u0410\u0414\u0410</p>
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
            <span>\u041E\u0431\u0437\u043E\u0440</span>
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
            \u041E\u0431\u0437\u043E\u0440
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

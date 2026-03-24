import { useState, useEffect, useCallback } from 'react';
import { CheckCircle2, AlertTriangle, Clock, ChevronRight, ChevronDown, Search, Warehouse, Package, Box, ArrowLeft } from 'lucide-react';
import api from '../../api/client';
import Spinner from '../../components/ui/Spinner';
import Badge from '../../components/ui/Badge';

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

function statusColor(node) {
  if (!node.last_inventory_at) return { bg: '#fee2e2', border: '#fca5a5', text: '#b91c1c', label: 'Не было' };
  const hours = (Date.now() - new Date(node.last_inventory_at).getTime()) / 3600000;
  if (hours < 24) return { bg: '#d1fae5', border: '#6ee7b7', text: '#047857', label: 'Свежий' };
  if (hours < 72) return { bg: '#fef9c3', border: '#fde047', text: '#a16207', label: 'Давно' };
  return { bg: '#fee2e2', border: '#fca5a5', text: '#b91c1c', label: 'Устарел' };
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
function InventoryCard({ node, type, onDrill }) {
  const st = statusColor(node);
  const hasInventory = !!node.last_inventory_at;
  const delta = Number(node.delta_vs_current || 0);

  return (
    <div
      className="rounded-2xl border p-4 cursor-pointer hover:shadow-lg transition-all group"
      style={{ borderColor: st.border, background: 'white' }}
      onClick={() => onDrill?.(node)}
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: st.bg }}>
          {type === 'warehouse' ? <Warehouse size={18} style={{ color: st.text }} /> :
           type === 'box' ? <Box size={18} style={{ color: st.text }} /> :
           <Package size={18} style={{ color: st.text }} />}
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
                <p className="font-bold text-gray-900 dark:text-white">{fmtQty(node.last_inventory_qty)} шт.</p>
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
              {node.last_inventory_by && <span>{node.last_inventory_by}</span>}
              {node.last_inventory_duration_seconds > 0 && <span>{fmtDuration(node.last_inventory_duration_seconds)}</span>}
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

// ═══ Detail Panel with drill-down ═══
function DetailPanel({ node, breadcrumbs, onDrill, onBack }) {
  const st = statusColor(node);
  const delta = Number(node.delta_vs_current || 0);
  const deltaPrev = Number(node.delta_vs_previous || 0);
  const hasInventory = !!node.last_inventory_at;
  const childrenData = getChildren(node);

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

            {/* Delta between inventories */}
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
        <div>
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
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══ Main Component ═══
export default function InventoryAnalyticsView() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedWarehouse, setSelectedWarehouse] = useState(null);
  // Drill-down stack: [{node, label}]
  const [drillStack, setDrillStack] = useState([]);

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

  // Drill-down view
  if (drillStack.length > 0) {
    const currentNode = drillStack[drillStack.length - 1];
    return (
      <DetailPanel
        node={currentNode}
        breadcrumbs={drillStack}
        onDrill={handleDrill}
        onBack={handleBack}
      />
    );
  }

  const filteredWarehouses = selectedWarehouse
    ? warehouses.filter(w => String(w.id) === String(selectedWarehouse))
    : warehouses;

  // Flatten all nodes for search
  const allNodes = [];
  function collectNodes(nodes, path = '') {
    for (const n of (nodes || [])) {
      allNodes.push({ ...n, _path: path });
      if (n.racks) collectNodes(n.racks, path + (path ? ' → ' : '') + (n.name || ''));
      if (n.rows) collectNodes(n.rows, path + (path ? ' → ' : '') + (n.name || ''));
      if (n.shelves) collectNodes(n.shelves, path + (path ? ' → ' : '') + (n.name || n.code || ''));
      if (n.pallets) collectNodes(n.pallets, path + (path ? ' → ' : '') + (n.name || ''));
      if (n.boxes) collectNodes(n.boxes, path + (path ? ' → ' : '') + (n.label || n.name || n.code || ''));
      if (n.children) collectNodes(n.children, path + (path ? ' → ' : '') + (n.name || ''));
    }
  }
  collectNodes(warehouses);

  const searchResults = search.length >= 2
    ? allNodes.filter(n => {
        const hay = [n.name, n.code, n.label, n.barcode_value].filter(Boolean).join(' ').toLowerCase();
        return hay.includes(search.toLowerCase());
      })
    : [];

  // Stats
  const inventoried = allNodes.filter(n => !!n.last_inventory_at).length;
  const notInventoried = allNodes.length - inventoried;
  const freshCount = allNodes.filter(n => {
    if (!n.last_inventory_at) return false;
    return (Date.now() - new Date(n.last_inventory_at).getTime()) < 24 * 3600000;
  }).length;
  const staleCount = allNodes.filter(n => {
    if (!n.last_inventory_at) return false;
    return (Date.now() - new Date(n.last_inventory_at).getTime()) > 72 * 3600000;
  }).length;

  return (
    <div>
      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="card p-4 text-center">
          <p className="text-3xl font-black text-gray-900 dark:text-white">{warehouses.length}</p>
          <p className="text-xs text-gray-400 mt-1 uppercase font-semibold">Складов</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-3xl font-black text-green-600">{freshCount}</p>
          <p className="text-xs text-gray-400 mt-1 uppercase font-semibold">Свежих (24ч)</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-3xl font-black text-red-600">{notInventoried}</p>
          <p className="text-xs text-gray-400 mt-1 uppercase font-semibold">Без инвента</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-3xl font-black text-amber-600">{staleCount}</p>
          <p className="text-xs text-gray-400 mt-1 uppercase font-semibold">Устарели (72ч+)</p>
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
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: statusColor(n).text }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{n.label || n.name || n.code}</p>
                    {n._path && <p className="text-xs text-gray-400 truncate">{n._path}</p>}
                  </div>
                  {n.last_inventory_at && <span className="text-xs text-gray-400 flex-shrink-0">{fmtQty(n.last_inventory_qty)} шт.</span>}
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-lg flex-shrink-0" style={{ background: statusColor(n).bg, color: statusColor(n).text }}>
                    {statusColor(n).label}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Warehouse map */}
      {filteredWarehouses.map(wh => {
        const locations = [...(wh.racks || []), ...(wh.rows || [])];
        const whInventoried = locations.filter(n => !!n.last_inventory_at).length;
        const whTotal = locations.length;
        const whPct = whTotal > 0 ? Math.round((whInventoried / whTotal) * 100) : 0;

        return (
          <div key={wh.id} className="mb-6">
            <div className="flex items-center gap-3 mb-3">
              <Warehouse size={18} className="text-primary-500" />
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
                <InventoryCard key={loc.id || i} node={loc} type="group" onDrill={handleDrill} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

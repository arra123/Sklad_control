import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Plus, ClipboardList, Clock, CheckCircle2, XCircle, X,
  AlertTriangle, ScanLine, RefreshCw, Package, Box, MapPin
} from 'lucide-react';
import api from '../../api/client';
import { qty } from '../../utils/fmt';
import { ShelfIcon, PalletIcon, BoxIcon, InventoryIcon, PackagingIcon, TransferIcon } from '../../components/ui/WarehouseIcons';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import SearchSelect from '../../components/ui/SearchSelect';
import Spinner from '../../components/ui/Spinner';
import CopyBadge from '../../components/ui/CopyBadge';
import { useToast } from '../../components/ui/Toast';

const STATUS_MAP = {
  new: { label: 'Новая', variant: 'default', icon: Clock },
  in_progress: { label: 'В работе', variant: 'warning', icon: Clock },
  completed: { label: 'Выполнена', variant: 'success', icon: CheckCircle2 },
  cancelled: { label: 'Отменена', variant: 'danger', icon: XCircle },
};

const TASK_TYPE_ICON = {
  inventory: { Icon: InventoryIcon, bg: 'bg-blue-50', border: 'border-blue-100' },
  packaging: { Icon: PackagingIcon, bg: 'bg-purple-50', border: 'border-purple-100' },
  production_transfer: { Icon: TransferIcon, bg: 'bg-amber-50', border: 'border-amber-100' },
};

function fmtTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ─── Task Detail Slide Panel ───────────────────────────────────────────────────
function TaskDetailPanel({ task, onClose, onReload }) {
  const toast = useToast();
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('scans');
  const [boxes, setBoxes] = useState(null);
  const [boxesLoading, setBoxesLoading] = useState(false);
  const intervalRef = useRef(null);
  const isPackaging = task.task_type === 'packaging';

  const loadAnalytics = useCallback(() => {
    api.get(`/tasks/${task.id}/analytics`)
      .then(r => setAnalytics(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [task.id]);

  useEffect(() => {
    loadAnalytics();
    // Auto-refresh every 5s if task is in_progress
    if (task.status === 'in_progress') {
      intervalRef.current = setInterval(loadAnalytics, 5000);
    }
    return () => clearInterval(intervalRef.current);
  }, [loadAnalytics, task.status]);

  useEffect(() => {
    if (!isPackaging) return;
    setBoxesLoading(true);
    api.get(`/packing/${task.id}/boxes`)
      .then(r => setBoxes(r.data))
      .catch(console.error)
      .finally(() => setBoxesLoading(false));
  }, [task.id, isPackaging]);

  const handleCancel = async () => {
    try {
      await api.put(`/tasks/${task.id}`, { status: 'cancelled' });
      toast.success('Задача отменена');
      onClose();
      onReload();
    } catch { toast.error('Ошибка'); }
  };

  const handleDelete = async () => {
    if (!confirm('Удалить задачу?')) return;
    try {
      await api.delete(`/tasks/${task.id}`);
      toast.success('Задача удалена');
      onClose();
      onReload();
    } catch { toast.error('Ошибка'); }
  };

  const status = STATUS_MAP[task.status] || STATUS_MAP.new;
  const scans = analytics?.scans || [];
  const errors = analytics?.errors || [];
  const taskBoxes = analytics?.task_boxes || [];
  const hasBoxes = taskBoxes.length > 0;
  const [groupByBox, setGroupByBox] = useState(false);
  const [openBoxIds, setOpenBoxIds] = useState(new Set());
  const toggleBox = (id) => setOpenBoxIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 z-30 bg-black/30" onClick={onClose} />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-40 w-full max-w-md bg-white dark:bg-gray-900 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-start gap-3 px-5 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800">
          {/* Task type icon */}
          {(() => {
            const ti = TASK_TYPE_ICON[task.task_type] || TASK_TYPE_ICON.inventory;
            return (
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 border ${ti.bg} ${ti.border}`}>
                <ti.Icon size={28} />
              </div>
            );
          })()}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant={status.variant}>{status.label}</Badge>
              {task.status === 'in_progress' && (
                <span className="flex items-center gap-1 text-xs text-amber-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  Live
                </span>
              )}
            </div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white leading-tight">{task.title}</h2>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-xs text-gray-400">
              {task.employee_name && <span>{task.employee_name}</span>}
              {task.rack_name && <span>{task.rack_name}{task.shelf_name ? ` · ${task.shelf_name}` : ''}</span>}
              {!task.rack_name && task.pallet_name && <span>{task.pallet_row_name || 'Ряд'} · {task.pallet_name}</span>}
              {Number(task.task_boxes_total || 0) > 0 && <span>Коробки {Number(task.task_boxes_completed || 0)} / {Number(task.task_boxes_total || 0)}</span>}
              {task.box_barcode && <span>Коробка {task.box_barcode}</span>}
              <span>{fmtDate(task.created_at)}</span>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 flex-shrink-0">
            <X size={18} />
          </button>
        </div>

        {/* Stats row */}
        {analytics && (
          <div className="grid grid-cols-3 divide-x divide-gray-100 dark:divide-gray-800 border-b border-gray-100 dark:border-gray-800">
            <div className="px-4 py-3 text-center">
              <p className="text-xs text-gray-400 mb-0.5">Сканов</p>
              <p className="text-lg font-bold text-gray-900 dark:text-white">{scans.length}</p>
            </div>
            <div className="px-4 py-3 text-center">
              <p className="text-xs text-gray-400 mb-0.5">Ошибок</p>
              <p className={`text-lg font-bold ${errors.length > 0 ? 'text-red-500' : 'text-gray-400'}`}>{errors.length}</p>
            </div>
            <div className="px-4 py-3 text-center">
              <p className="text-xs text-gray-400 mb-0.5">Начато</p>
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">{fmtTime(task.started_at)}</p>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mx-4 mt-3 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
          <button
            onClick={() => setTab('scans')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${tab === 'scans' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-400'}`}
          >
            Хронология{scans.length > 0 ? ` (${scans.length})` : ''}
          </button>
          <button
            onClick={() => setTab('errors')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              tab === 'errors'
                ? errors.length > 0 ? 'bg-red-500 text-white shadow-sm' : 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : errors.length > 0 ? 'text-red-400' : 'text-gray-400'
            }`}
          >
            Ошибки{errors.length > 0 ? ` (${errors.length})` : ''}
          </button>
          {isPackaging && (
            <button
              onClick={() => setTab('boxes')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${tab === 'boxes' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-400'}`}
            >
              Коробки{boxes?.length > 0 ? ` (${boxes.length})` : ''}
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {tab === 'boxes' ? (
            boxesLoading ? (
              <div className="flex items-center justify-center h-32"><Spinner size="lg" /></div>
            ) : !boxes?.length ? (
              <div className="flex flex-col items-center justify-center h-32 text-gray-300">
                <Box size={32} className="mb-2 opacity-40" />
                <p className="text-sm">Коробок нет</p>
              </div>
            ) : (
              <div className="space-y-2">
                {boxes.map((box, i) => {
                  const isFbo = !box.is_remainder && box.pallet_name;
                  const isFbs = box.is_remainder && box.shelf_code;
                  return (
                    <div key={box.id} className={`rounded-xl border px-3 py-3 ${
                      box.is_remainder
                        ? 'bg-amber-50 border-amber-200'
                        : 'bg-green-50 border-green-200'
                    }`}>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400 font-mono">#{i + 1}</span>
                          <Box size={14} className={box.is_remainder ? 'text-amber-500' : 'text-green-600'} />
                          <span className="text-sm font-semibold text-gray-800">
                            {qty(box.quantity)} шт.
                            {box.box_size ? <span className="font-normal text-gray-400"> / {box.box_size}</span> : ''}
                          </span>
                          {box.is_remainder && (
                            <span className="text-xs bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded-md font-medium">остаток</span>
                          )}
                        </div>
                        <CopyBadge value={box.barcode_value} />
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-gray-500">
                        <MapPin size={12} className="flex-shrink-0" />
                        {isFbo && (
                          <span>
                            <span className="font-medium text-green-700">
                              Паллет {box.row_name ? `Р${box.row_number}` : ''}П{box.pallet_number}
                            </span>
                            {box.fbo_warehouse_name && <span className="text-gray-400"> · {box.fbo_warehouse_name}</span>}
                          </span>
                        )}
                        {isFbs && (
                          <span>
                            <span className="font-medium text-amber-700">Полка {box.shelf_code}</span>
                            {box.rack_name && <span className="text-gray-400"> · {box.rack_name}</span>}
                            {box.fbs_warehouse_name && <span className="text-gray-400"> · {box.fbs_warehouse_name}</span>}
                          </span>
                        )}
                        {!isFbo && !isFbs && (
                          <span className="text-gray-300 italic">—</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : loading ? (
            <div className="flex items-center justify-center h-32"><Spinner size="lg" /></div>
          ) : tab === 'scans' ? (
            scans.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-gray-300">
                <ScanLine size={32} className="mb-2 opacity-40" />
                <p className="text-sm">Сканирований нет</p>
              </div>
            ) : (
              <div>
                {/* Toggle: All / By boxes */}
                {hasBoxes && (
                  <div className="flex items-center gap-2 mb-3">
                    <button
                      onClick={() => setGroupByBox(false)}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${!groupByBox ? 'bg-primary-600 text-white shadow-sm' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}
                    >
                      Все ({scans.length})
                    </button>
                    <button
                      onClick={() => setGroupByBox(true)}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${groupByBox ? 'bg-primary-600 text-white shadow-sm' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}
                    >
                      По коробкам ({taskBoxes.length})
                    </button>
                  </div>
                )}

                {groupByBox && hasBoxes ? (
                  /* Grouped by boxes view */
                  <div className="space-y-3">
                    {taskBoxes.map((box, bi) => {
                      const boxScans = scans.filter(sc => Number(sc.task_box_id) === Number(box.id));
                      const statusColor = box.status === 'completed' ? 'border-green-200 bg-green-50' : box.status === 'in_progress' ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-gray-50';
                      const statusLabel = box.status === 'completed' ? 'Готово' : box.status === 'in_progress' ? 'В работе' : 'Ожидает';
                      const statusBadge = box.status === 'completed' ? 'success' : box.status === 'in_progress' ? 'warning' : 'default';
                      const isOpen = openBoxIds.has(box.id);
                      const boxGaps = boxScans.slice(1).map(s => Number(s.seconds_since_prev)).filter(s => !isNaN(s) && s > 0);
                      const boxAvgPick = boxGaps.length > 0 ? (boxGaps.reduce((a, b) => a + b, 0) / boxGaps.length).toFixed(1) : null;
                      return (
                        <div key={box.id} className={`rounded-2xl border ${statusColor} overflow-hidden`}>
                          {/* Box header — clickable */}
                          <button
                            onClick={() => toggleBox(box.id)}
                            className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:opacity-80 transition-opacity"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <svg className={`w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 18l6-6-6-6"/></svg>
                              <Box size={14} className="text-gray-500 flex-shrink-0" />
                              <span className="text-sm font-semibold text-gray-800 truncate">
                                {box.box_name || box.box_barcode || `Коробка ${bi + 1}`}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {boxAvgPick && <span className="text-[10px] text-primary-500 font-semibold">{boxAvgPick}с/шт</span>}
                              <span className="text-xs text-gray-400">{boxScans.length}</span>
                              <Badge variant={statusBadge}>{statusLabel}</Badge>
                            </div>
                          </button>
                          {/* Box scans — collapsible */}
                          {isOpen && (
                            boxScans.length === 0 ? (
                              <div className="px-3 py-3 text-center text-xs text-gray-300 border-t border-inherit">Нет сканирований</div>
                            ) : (
                              <div className="divide-y divide-gray-100/50 border-t border-inherit">
                                {boxScans.map((sc, i) => (
                                  <div key={sc.id} className="flex items-center gap-2.5 px-3 py-2">
                                    <span className="text-xs font-mono text-gray-300 w-5 text-right flex-shrink-0">{i + 1}</span>
                                    <div className="flex-1 min-w-0">
                                      {sc.product_name ? (
                                        <>
                                          <p className="text-sm font-medium text-gray-900 leading-tight truncate">{sc.product_name}</p>
                                          {sc.product_code && <p className="text-xs text-gray-400">{sc.product_code}</p>}
                                        </>
                                      ) : (
                                        <p className="text-sm text-red-400 italic">Неизвестный товар</p>
                                      )}
                                    </div>
                                    <div className="text-right flex-shrink-0">
                                      <p className="text-xs font-mono text-gray-700">{fmtTime(sc.created_at)}</p>
                                      {sc.seconds_since_prev != null ? (
                                        <p className="text-xs text-gray-300">+{sc.seconds_since_prev}с</p>
                                      ) : (
                                        <p className="text-xs text-primary-400">старт</p>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )
                          )}
                        </div>
                      );
                    })}
                    {/* Scans without a box */}
                    {(() => {
                      const orphanScans = scans.filter(sc => !sc.task_box_id);
                      if (orphanScans.length === 0) return null;
                      return (
                        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
                          <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-100">
                            <span className="text-sm font-semibold text-gray-500">Без коробки</span>
                            <span className="text-xs text-gray-400">{orphanScans.length} сканов</span>
                          </div>
                          <div className="divide-y divide-gray-50">
                            {orphanScans.map((sc, i) => (
                              <div key={sc.id} className="flex items-center gap-2.5 px-3 py-2">
                                <span className="text-xs font-mono text-gray-300 w-5 text-right flex-shrink-0">{i + 1}</span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-900 leading-tight truncate">{sc.product_name || 'Неизвестный товар'}</p>
                                </div>
                                <p className="text-xs font-mono text-gray-700 flex-shrink-0">{fmtTime(sc.created_at)}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  /* Flat chronology view */
                  <div className="space-y-0 -mx-1">
                    {scans.map((sc, i) => (
                      <div key={sc.id} className="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                        {/* Index + connector */}
                        <div className="flex flex-col items-center flex-shrink-0 w-6">
                          <span className="text-xs font-mono text-gray-300 leading-none">{i + 1}</span>
                          {i < scans.length - 1 && <div className="w-px h-4 bg-gray-100 mt-0.5" />}
                        </div>

                        {/* Product info */}
                        <div className="flex-1 min-w-0">
                          {sc.product_name ? (
                            <>
                              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 leading-tight truncate">{sc.product_name}</p>
                              {sc.product_code && <p className="text-xs text-gray-400">{sc.product_code}</p>}
                            </>
                          ) : (
                            <p className="text-sm text-red-400 italic">Неизвестный товар</p>
                          )}
                          <CopyBadge value={sc.scanned_value} className="mt-0.5" />
                        </div>

                        {/* Timestamp + gap */}
                        <div className="text-right flex-shrink-0">
                          <p className="text-xs font-mono text-gray-700 dark:text-gray-300">{fmtTime(sc.created_at)}</p>
                          {sc.seconds_since_prev !== null && sc.seconds_since_prev !== undefined ? (
                            <p className="text-xs text-gray-300">+{sc.seconds_since_prev}с</p>
                          ) : (
                            <p className="text-xs text-primary-400">старт</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          ) : (
            errors.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-gray-300">
                <AlertTriangle size={32} className="mb-2 opacity-40" />
                <p className="text-sm">Ошибок нет</p>
              </div>
            ) : (
              <div className="space-y-2">
                {errors.map(err => (
                  <div key={err.id} className="rounded-xl border border-red-100 bg-red-50 px-4 py-3">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-mono font-medium text-red-700">{err.scanned_value}</p>
                        <CopyBadge value={err.scanned_value} />
                      </div>
                      <p className="text-xs text-gray-400">{fmtTime(err.created_at)}</p>
                    </div>
                    {err.employee_note && (
                      <p className="text-xs text-gray-600 bg-white rounded-lg px-2.5 py-1.5 mt-1">{err.employee_note}</p>
                    )}
                  </div>
                ))}
              </div>
            )
          )}
        </div>

        {/* Footer actions */}
        {(task.status === 'new' || task.status === 'in_progress') && (
          <div className="flex gap-2 px-4 py-4 border-t border-gray-100 dark:border-gray-800">
            <Button variant="ghost" size="sm" onClick={handleCancel}>Отменить задачу</Button>
            <Button variant="danger" size="sm" onClick={handleDelete}>Удалить</Button>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Create Task Modal ─────────────────────────────────────────────────────────
function CreateTaskModal({ open, onClose, onSuccess }) {
  const toast = useToast();
  const [taskType, setTaskType] = useState('inventory'); // 'inventory' | 'packaging'
  const [employees, setEmployees] = useState([]);
  // Inventory fields
  const [warehouses, setWarehouses] = useState([]);
  const [racks, setRacks] = useState([]);
  const [shelves, setShelves] = useState([]);
  const [inventoryShelfDetails, setInventoryShelfDetails] = useState(null);
  const [selectedShelfBoxIds, setSelectedShelfBoxIds] = useState([]);
  const [inventoryRows, setInventoryRows] = useState([]);
  const [inventoryPallets, setInventoryPallets] = useState([]);
  const [inventoryPalletDetails, setInventoryPalletDetails] = useState(null);
  const [selectedBoxIds, setSelectedBoxIds] = useState([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [selectedRack, setSelectedRack] = useState('');
  const [selectedRow, setSelectedRow] = useState('');
  const [inventoryMode, setInventoryMode] = useState('shelf');
  const [form, setForm] = useState({ title: '', employee_id: '', shelf_id: '', target_pallet_id: '', notes: '' });
  // Packaging fields
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  // Production transfer fields
  const [transferForm, setTransferForm] = useState({ employee_id: '', notes: '' });
  const [transferProductSearch, setTransferProductSearch] = useState('');
  const [transferProductResults, setTransferProductResults] = useState([]);
  const [selectedTransferProduct, setSelectedTransferProduct] = useState(null);
  const [fboWarehouses, setFboWarehouses] = useState([]);
  const [pallets, setPallets] = useState([]);
  const [selectedFboWarehouse, setSelectedFboWarehouse] = useState('');
  const [packForm, setPackForm] = useState({ employee_id: '', box_size: '50', target_pallet_id: '', notes: '' });
  const [loading, setLoading] = useState(false);
  const [busyTargets, setBusyTargets] = useState({ shelves: {}, pallets: {}, pallet_boxes: {}, shelf_boxes: {} });
  const selectedWarehouseData = warehouses.find(w => String(w.id) === String(selectedWarehouse));
  const selectedInventoryShelf = shelves.find(s => String(s.id) === String(form.shelf_id));
  const selectedInventoryRow = inventoryRows.find(row => String(row.id) === String(selectedRow));
  const selectedInventoryPallet = inventoryPallets.find(p => String(p.id) === String(form.target_pallet_id));
  const isInventoryFbo = selectedWarehouseData?.warehouse_type === 'fbo';
  const isInventoryBoth = selectedWarehouseData?.warehouse_type === 'both';
  const inventoryUsesPallets = isInventoryFbo || (isInventoryBoth && inventoryMode === 'pallet');
  const inventoryUsesBoxes = inventoryUsesPallets
    ? (selectedInventoryPallet?.uses_boxes || inventoryPalletDetails?.uses_boxes)
    : (selectedInventoryShelf?.uses_boxes || inventoryShelfDetails?.uses_boxes);

  useEffect(() => {
    if (!open) return;
    Promise.all([
      api.get('/staff/employees'),
      api.get('/warehouse/warehouses'),
      api.get('/fbo/warehouses'),
      api.get('/tasks/busy-targets').catch(() => ({ data: { shelves: {}, pallets: {}, pallet_boxes: {}, shelf_boxes: {} } })),
    ]).then(([emp, wh, fbo, busy]) => {
      setEmployees(emp.data);
      setWarehouses(wh.data);
      setFboWarehouses(fbo.data);
      setBusyTargets(busy.data || { shelves: {}, pallets: {}, pallet_boxes: {}, shelf_boxes: {} });
    }).catch(console.error);
  }, [open]);

  useEffect(() => {
    if (!selectedWarehouseData) {
      setRacks([]);
      setShelves([]);
      setInventoryShelfDetails(null);
      setSelectedShelfBoxIds([]);
      setInventoryRows([]);
      setInventoryPallets([]);
      setInventoryPalletDetails(null);
      setSelectedBoxIds([]);
      return;
    }

    if (selectedWarehouseData.warehouse_type === 'fbo') {
      api.get(`/fbo/warehouses/${selectedWarehouse}`)
        .then(res => setInventoryRows(res.data.rows || []))
        .catch(console.error);
      setRacks([]);
      setShelves([]);
      setInventoryShelfDetails(null);
      setSelectedShelfBoxIds([]);
      setSelectedRack('');
      setSelectedRow('');
      setInventoryPallets([]);
      setInventoryPalletDetails(null);
      setSelectedBoxIds([]);
      setForm(f => ({ ...f, shelf_id: '', target_pallet_id: '' }));
      return;
    }

    api.get('/warehouse/racks', { params: { warehouse_id: selectedWarehouse } })
      .then(res => setRacks(res.data)).catch(console.error);
    setSelectedRack('');
    setShelves([]);
    setInventoryShelfDetails(null);
    setSelectedShelfBoxIds([]);
    setInventoryRows([]);
    setInventoryPallets([]);
    setInventoryPalletDetails(null);
    setSelectedBoxIds([]);
    setSelectedRow('');
    setForm(f => ({ ...f, shelf_id: '', target_pallet_id: '' }));
  }, [selectedWarehouse, selectedWarehouseData]);

  useEffect(() => {
    if (!selectedRack) { setShelves([]); return; }
    api.get(`/warehouse/racks/${selectedRack}`)
      .then(res => setShelves(res.data.shelves || [])).catch(console.error);
    setInventoryShelfDetails(null);
    setSelectedShelfBoxIds([]);
    setForm(f => ({ ...f, shelf_id: '' }));
  }, [selectedRack]);

  useEffect(() => {
    if (inventoryUsesPallets || !form.shelf_id) {
      setInventoryShelfDetails(null);
      setSelectedShelfBoxIds([]);
      return;
    }
    api.get(`/warehouse/shelves/${form.shelf_id}`)
      .then(res => {
        setInventoryShelfDetails(res.data);
        setSelectedShelfBoxIds([]);
      })
      .catch(console.error);
  }, [form.shelf_id, inventoryUsesPallets]);

  useEffect(() => {
    if (!selectedRow) { setInventoryPallets([]); setInventoryPalletDetails(null); setSelectedBoxIds([]); return; }
    api.get(`/fbo/rows/${selectedRow}`)
      .then(res => setInventoryPallets(res.data.pallets || []))
      .catch(console.error);
    setForm(f => ({ ...f, target_pallet_id: '' }));
  }, [selectedRow]);

  useEffect(() => {
    if (!inventoryUsesPallets || !form.target_pallet_id) {
      setInventoryPalletDetails(null);
      setSelectedBoxIds([]);
      return;
    }
    api.get(`/fbo/pallets/${form.target_pallet_id}`)
      .then(res => {
        setInventoryPalletDetails(res.data);
        setSelectedBoxIds([]);
      })
      .catch(console.error);
  }, [form.target_pallet_id, inventoryUsesPallets]);

  useEffect(() => {
    if (!isInventoryBoth) return;
    setSelectedRack('');
    setShelves([]);
    setInventoryShelfDetails(null);
    setSelectedShelfBoxIds([]);
    setSelectedRow('');
    setInventoryPallets([]);
    setInventoryPalletDetails(null);
    setSelectedBoxIds([]);
    setForm(f => ({ ...f, shelf_id: '', target_pallet_id: '' }));
  }, [inventoryMode, isInventoryBoth]);

  useEffect(() => {
    if (!selectedFboWarehouse) { setPallets([]); setPackForm(f => ({ ...f, target_pallet_id: '' })); return; }
    api.get('/fbo/pallets-list', { params: { warehouse_id: selectedFboWarehouse } })
      .then(res => setPallets(res.data)).catch(console.error);
  }, [selectedFboWarehouse]);

  // Product search debounce
  useEffect(() => {
    if (!productSearch.trim() || productSearch.length < 2) { setProductResults([]); return; }
    const t = setTimeout(() => {
      api.get('/products', { params: { search: productSearch, entity_type: 'product', limit: 8 } })
        .then(r => setProductResults(r.data.items || [])).catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [productSearch]);

  // Transfer product search
  useEffect(() => {
    if (!transferProductSearch.trim() || transferProductSearch.length < 2) { setTransferProductResults([]); return; }
    const t = setTimeout(() => {
      api.get('/products', { params: { search: transferProductSearch, entity_type: 'product', limit: 8 } })
        .then(r => setTransferProductResults(r.data.items || [])).catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [transferProductSearch]);

  const handleClose = () => {
    onClose();
    setTaskType('inventory');
    setForm({ title: '', employee_id: '', shelf_id: '', target_pallet_id: '', notes: '' });
    setSelectedWarehouse(''); setSelectedRack(''); setSelectedRow('');
    setInventoryMode('shelf');
    setInventoryShelfDetails(null); setSelectedShelfBoxIds([]);
    setInventoryRows([]); setInventoryPallets([]); setInventoryPalletDetails(null); setSelectedBoxIds([]);
    setSelectedProduct(null); setProductSearch(''); setProductResults([]);
    setPackForm({ employee_id: '', box_size: '50', target_pallet_id: '', notes: '' });
    setSelectedFboWarehouse('');
    setTransferForm({ employee_id: '', notes: '' });
    setSelectedTransferProduct(null); setTransferProductSearch(''); setTransferProductResults([]);
  };

  const handleSubmitTransfer = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const title = selectedTransferProduct
        ? `Перенос с производства: ${selectedTransferProduct.name}`
        : 'Перенос с производства';
      await api.post('/tasks', {
        title,
        task_type: 'production_transfer',
        product_id: selectedTransferProduct?.id || null,
        employee_id: transferForm.employee_id || null,
        notes: transferForm.notes || null,
      });
      toast.success('Задача переноса создана');
      onSuccess(); handleClose();
    } catch (err) { toast.error(err.response?.data?.error || 'Ошибка'); }
    finally { setLoading(false); }
  };

  const handleSubmitInventory = async (e) => {
    e.preventDefault();
    if (inventoryUsesPallets && !form.target_pallet_id) return toast.error('Выберите паллет');
    if (!inventoryUsesPallets && !form.shelf_id) return toast.error('Выберите полку');
    if (inventoryUsesBoxes && !inventoryUsesPallets && selectedShelfBoxIds.length === 0) return toast.error('Выберите хотя бы одну коробку');
    setLoading(true);
    try {
      // Shelf with boxes
      if (inventoryUsesBoxes && !inventoryUsesPallets && selectedShelfBoxIds.length > 0) {
        const freeShelfBoxIds = selectedShelfBoxIds.filter(id => !busyTargets.shelf_boxes[id]);
        if (freeShelfBoxIds.length === 0) { toast.error('Все выбранные коробки уже в работе'); setLoading(false); return; }
        await api.post('/tasks', {
          ...form,
          employee_id: form.employee_id || null,
          shelf_id: parseInt(form.shelf_id, 10),
          target_pallet_id: null,
          target_box_ids: [],
          target_shelf_box_ids: freeShelfBoxIds,
        });
        toast.success(`Задача создана на ${freeShelfBoxIds.length} коробок`);
      }
      // Pallet with specific boxes selected
      else if (inventoryUsesPallets && inventoryUsesBoxes && selectedBoxIds.length > 0) {
        const freeBoxIds = selectedBoxIds.filter(id => !busyTargets.pallet_boxes[id]);
        if (freeBoxIds.length === 0) { toast.error('Все выбранные коробки уже в работе'); setLoading(false); return; }
        await api.post('/tasks', {
          ...form,
          employee_id: form.employee_id || null,
          shelf_id: null,
          target_pallet_id: parseInt(form.target_pallet_id, 10),
          target_box_ids: freeBoxIds,
          target_shelf_box_ids: [],
        });
        toast.success(`Задача создана на ${freeBoxIds.length} коробок`);
      }
      // Pallet — all boxes (employee scans them)
      else {
        await api.post('/tasks', {
          ...form,
          employee_id: form.employee_id || null,
          shelf_id: inventoryUsesPallets ? null : (form.shelf_id || null),
          target_pallet_id: inventoryUsesPallets ? parseInt(form.target_pallet_id, 10) : null,
        });
        toast.success('Задача создана');
      }
      onSuccess(); handleClose();
    } catch (err) { toast.error(err.response?.data?.error || 'Ошибка'); }
    finally { setLoading(false); }
  };

  const handleSubmitPackaging = async (e) => {
    e.preventDefault();
    if (!selectedProduct) return toast.error('Выберите товар');
    if (!packForm.target_pallet_id) return toast.error('Выберите паллет');
    setLoading(true);
    try {
      await api.post('/tasks', {
        title: `Оприходование: ${selectedProduct.name}`,
        task_type: 'packaging',
        product_id: selectedProduct.id,
        box_size: parseInt(packForm.box_size) || 50,
        target_pallet_id: parseInt(packForm.target_pallet_id),
        employee_id: packForm.employee_id || null,
        notes: packForm.notes || null,
      });
      toast.success('Задача оприходования создана');
      onSuccess(); handleClose();
    } catch (err) { toast.error(err.response?.data?.error || 'Ошибка'); }
    finally { setLoading(false); }
  };

  const modalTitle = taskType === 'packaging' ? 'Создать задачу оприходования'
    : taskType === 'bundle_assembly' ? 'Создать задачу сборки комплектов'
    : 'Создать задачу инвентаризации';

  // Bundle assembly state
  const [bundles, setBundles] = useState([]);
  const [selectedBundle, setSelectedBundle] = useState(null);
  const [bundleQty, setBundleQty] = useState('10');
  const [bundleEmployee, setBundleEmployee] = useState('');
  const [bundleComponents, setBundleComponents] = useState([]);
  const [bundleSourcePaths, setBundleSourcePaths] = useState([]); // [{warehouse_id, pallet_id, label}]
  const [bundleEmployeeChoice, setBundleEmployeeChoice] = useState(false); // на усмотрение сотрудника
  const [bundleNotes, setBundleNotes] = useState('');
  const [bundleDestWh, setBundleDestWh] = useState('');
  const [bundleSourceWh, setBundleSourceWh] = useState('');
  const [bundleSourcePallets, setBundleSourcePallets] = useState([]);
  const [bundleSourcePallet, setBundleSourcePallet] = useState('');

  // Load all bundles
  useEffect(() => {
    if (taskType !== 'bundle_assembly' || !open) return;
    api.get('/products?type=bundle&limit=200')
      .then(r => setBundles(r.data.items || []))
      .catch(() => {});
  }, [taskType, open]);

  // Load components when bundle selected
  useEffect(() => {
    if (!selectedBundle) { setBundleComponents([]); return; }
    api.get(`/products/${selectedBundle.id}`)
      .then(r => setBundleComponents(r.data.components || []))
      .catch(() => {});
  }, [selectedBundle]);

  // Load pallets when warehouse selected for source
  useEffect(() => {
    if (!bundleSourceWh) { setBundleSourcePallets([]); return; }
    api.get(`/fbo/warehouses/${bundleSourceWh}`)
      .then(r => {
        const allPallets = (r.data.rows || []).flatMap(row => (row.pallets || []).map(p => ({ ...p, row_name: row.name })));
        setBundleSourcePallets(allPallets);
      }).catch(() => {});
  }, [bundleSourceWh]);

  const addSourcePath = () => {
    if (!bundleSourcePallet) return;
    const p = bundleSourcePallets.find(x => String(x.id) === bundleSourcePallet);
    const wh = fboWarehouses.find(w => String(w.id) === bundleSourceWh);
    if (!p) return;
    setBundleSourcePaths(prev => [...prev, {
      pallet_id: p.id,
      label: `${wh?.name || ''} · ${p.row_name || ''} · ${p.name}`,
    }]);
    setBundleSourcePallet('');
  };

  const removeSourcePath = (idx) => setBundleSourcePaths(prev => prev.filter((_, i) => i !== idx));

  const handleSubmitAssembly = async (e) => {
    e.preventDefault();
    if (!selectedBundle) { toast.error('Выберите комплект'); return; }
    if (!bundleQty || Number(bundleQty) < 1) { toast.error('Укажите количество'); return; }
    setLoading(true);
    try {
      await api.post('/assembly', {
        bundle_product_id: selectedBundle.id,
        bundle_qty: Number(bundleQty),
        employee_id: bundleEmployee || null,
        source_boxes: bundleEmployeeChoice ? null : bundleSourcePaths.length > 0 ? bundleSourcePaths : null,
        notes: bundleNotes || null,
      });
      toast.success('Задача сборки создана');
      onSuccess();
      handleClose();
    } catch (err) { toast.error(err.response?.data?.error || 'Ошибка'); }
    finally { setLoading(false); }
  };

  return (
    <Modal open={open} onClose={handleClose}
      title={modalTitle}
      footer={<>
        <Button variant="ghost" onClick={handleClose}>Отмена</Button>
        <Button form="task-form" type="submit" loading={loading}>Создать</Button>
      </>}
    >
      {/* Type selector */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {[
          { value: 'inventory', label: '📋 Инвентаризация' },
          { value: 'packaging', label: '📦 Оприходование' },
          { value: 'bundle_assembly', label: '🔧 Сборка комплектов' },
        ].map(({ value, label }) => (
          <button key={value} type="button"
            onClick={() => setTaskType(value)}
            className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-all ${
              taskType === value ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-600 border-gray-200 hover:border-primary-300'
            }`}
          >{label}</button>
        ))}
      </div>

      {taskType === 'inventory' ? (
        <form id="task-form" onSubmit={handleSubmitInventory} className="space-y-4">
          <Input label="Название задачи" placeholder="Инвентаризация стеллажа С5"
            value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required />
          <SearchSelect label="Сотрудник" value={form.employee_id} placeholder="Поиск сотрудника..."
            onChange={v => setForm(f => ({ ...f, employee_id: v }))}
            options={[{ value: '', label: 'Не назначен' }, ...employees.map(emp => ({ value: String(emp.id), label: emp.full_name }))]}
          />
          <SearchSelect label="Склад" value={selectedWarehouse} placeholder="Поиск склада..."
            onChange={v => setSelectedWarehouse(v)}
            options={warehouses.map(w => ({ value: String(w.id), label: w.name }))}
          />
          {isInventoryBoth && (
            <SearchSelect label="Тип адресации" value={inventoryMode}
              onChange={v => setInventoryMode(v)}
              options={[{ value: 'shelf', label: 'Стеллажи и полки' }, { value: 'pallet', label: 'Ряды и паллеты' }]}
            />
          )}
          {selectedWarehouse && !inventoryUsesPallets && (
            <SearchSelect label="Стеллаж" value={selectedRack} placeholder="Поиск стеллажа..."
              onChange={v => setSelectedRack(v)}
              options={racks.map(r => ({ value: String(r.id), label: r.name }))}
            />
          )}
          {selectedRack && !inventoryUsesPallets && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Полка</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto rounded-xl border border-gray-200 bg-gray-50 p-2">
                {shelves.map(s => {
                  const busy = busyTargets.shelves[s.id];
                  const selected = String(form.shelf_id) === String(s.id);
                  return (
                    <button key={s.id} type="button" disabled={!!busy}
                      onClick={() => setForm(f => ({ ...f, shelf_id: String(s.id) }))}
                      className={`text-left rounded-xl border px-3 py-2 text-sm transition-all ${
                        busy ? 'opacity-40 cursor-not-allowed border-gray-200 bg-gray-100' :
                        selected ? 'border-primary-400 bg-primary-50 ring-1 ring-primary-200' :
                        'border-gray-200 bg-white hover:border-primary-300 cursor-pointer'
                      }`}
                    >
                      <p className="font-medium text-gray-900 truncate">{s.name}</p>
                      <p className="text-xs text-gray-400 truncate">{s.code}{s.uses_boxes ? ' · коробки' : ''}</p>
                      {busy && <p className="text-[10px] text-red-400 mt-0.5 truncate">В задаче #{busy.task_id}</p>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {!inventoryUsesPallets && selectedInventoryShelf && (
            <div className={`rounded-xl border px-3 py-3 text-sm ${selectedInventoryShelf.uses_boxes ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-green-200 bg-green-50 text-green-800'}`}>
              {selectedInventoryShelf.uses_boxes
                ? 'На этой полке товар хранится в коробках. Для инвентаризации выбери нужные коробки.'
                : 'На этой полке товар хранится без коробок. Инвентаризация пройдёт по полке целиком.'}
            </div>
          )}
          {selectedWarehouse && inventoryUsesPallets && (
            <SearchSelect label="Ряд" value={selectedRow} placeholder="Поиск ряда..."
              onChange={v => setSelectedRow(v)}
              options={inventoryRows.map(row => ({ value: String(row.id), label: `Ряд ${row.number} — ${row.name}` }))}
            />
          )}
          {selectedRow && inventoryUsesPallets && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Паллет</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto rounded-xl border border-gray-200 bg-gray-50 p-2">
                {inventoryPallets.map(p => {
                  const selected = String(form.target_pallet_id) === String(p.id);
                  const busyBoxCount = inventoryPalletDetails?.boxes?.filter(b => busyTargets.pallet_boxes[b.id])?.length || 0;
                  return (
                    <button key={p.id} type="button"
                      onClick={() => setForm(f => ({ ...f, target_pallet_id: String(p.id) }))}
                      className={`text-left rounded-xl border px-3 py-2 text-sm transition-all ${
                        selected ? 'border-primary-400 bg-primary-50 ring-1 ring-primary-200' :
                        'border-gray-200 bg-white hover:border-primary-300 cursor-pointer'
                      }`}
                    >
                      <p className="font-medium text-gray-900">Р{selectedInventoryRow?.number ?? ''}П{p.number}</p>
                      <p className="text-xs text-gray-400 truncate">{p.name}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {inventoryUsesPallets && selectedInventoryPallet && !selectedInventoryPallet.uses_boxes && (
            <div className="rounded-xl border border-green-200 bg-green-50 px-3 py-3 text-sm text-green-800">
              На этом паллете товар хранится без коробок. Инвентаризация пройдёт по паллету целиком.
            </div>
          )}
          {inventoryUsesPallets && selectedInventoryPallet && selectedInventoryPallet.uses_boxes && inventoryPalletDetails && (
            <div className="space-y-3">
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
                Паллет с коробками ({inventoryPalletDetails.boxes?.length || 0} шт.)
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="boxMode" checked={selectedBoxIds.length === 0} onChange={() => setSelectedBoxIds([])}
                    className="w-4 h-4 text-primary-600" />
                  <span className="text-sm font-medium text-gray-700">Все коробки</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="boxMode" checked={selectedBoxIds.length > 0} onChange={() => setSelectedBoxIds(inventoryPalletDetails.boxes?.filter(b => !busyTargets.pallet_boxes[b.id]).map(b => b.id) || [])}
                    className="w-4 h-4 text-primary-600" />
                  <span className="text-sm font-medium text-gray-700">Выбрать конкретные</span>
                </label>
              </div>
              {selectedBoxIds.length > 0 && inventoryPalletDetails.boxes?.length > 0 && (
                <div className="max-h-56 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-xl border border-gray-200 bg-gray-50 p-2">
                  {inventoryPalletDetails.boxes.map(box => {
                    const busy = busyTargets.pallet_boxes[box.id];
                    const checked = !busy && selectedBoxIds.includes(box.id);
                    return (
                      <label key={box.id} className={`flex items-start gap-2.5 rounded-xl border px-3 py-2 text-sm transition-all ${
                        busy ? 'opacity-40 cursor-not-allowed border-gray-200 bg-gray-100' :
                        checked ? 'bg-white border-primary-200 cursor-pointer' :
                        'border-transparent hover:bg-white cursor-pointer'
                      }`}>
                        <input type="checkbox" checked={checked} disabled={!!busy}
                          onChange={() => !busy && setSelectedBoxIds(prev => checked ? prev.filter(id => id !== box.id) : [...prev, box.id])}
                          className="w-4 h-4 rounded text-primary-600 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-gray-800 truncate">{box.product_name || 'Пустая коробка'}</p>
                          <p className="text-xs text-gray-400">{box.barcode_value} · {Number(box.quantity || 0)} шт.</p>
                          {busy && <p className="text-[10px] text-red-400 mt-0.5">В задаче #{busy.task_id}</p>}
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          {!inventoryUsesPallets && inventoryUsesBoxes && inventoryShelfDetails && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-gray-700">Коробки на полке</label>
                {inventoryShelfDetails.boxes?.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const available = inventoryShelfDetails.boxes.filter(b => !busyTargets.shelf_boxes[b.id]).map(b => b.id);
                      setSelectedShelfBoxIds(selectedShelfBoxIds.length === available.length ? [] : available);
                    }}
                    className="text-xs text-primary-600 hover:text-primary-700 font-medium"
                  >
                    {selectedShelfBoxIds.length === inventoryShelfDetails.boxes.filter(b => !busyTargets.shelf_boxes[b.id]).length ? 'Снять выбор' : 'Выбрать все'}
                  </button>
                )}
              </div>
              {inventoryShelfDetails.boxes?.length > 0 ? (
                <div className="max-h-56 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-xl border border-gray-200 bg-gray-50 p-2">
                  {inventoryShelfDetails.boxes.map(box => {
                    const busy = busyTargets.shelf_boxes[box.id];
                    const checked = !busy && selectedShelfBoxIds.includes(box.id);
                    return (
                      <label key={box.id} className={`flex items-start gap-3 rounded-xl border px-3 py-2 text-sm transition-all ${
                        busy ? 'opacity-40 cursor-not-allowed border-gray-200 bg-gray-100' :
                        checked ? 'border-primary-300 bg-white cursor-pointer' :
                        'border-transparent bg-transparent hover:bg-white cursor-pointer'
                      }`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!!busy}
                          onChange={() => !busy && setSelectedShelfBoxIds(prev => checked ? prev.filter(id => id !== box.id) : [...prev, box.id])}
                          className="mt-1"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-gray-900 truncate">
                            {box.name || 'Коробка'}
                          </p>
                          <p className="text-xs text-gray-500">
                            {box.barcode_value} · {Number(box.quantity || 0)} шт. · {Number(box.products_count || 0) > 1 ? `${Number(box.products_count)} товара` : (box.product_name || 'Пустая коробка')}
                          </p>
                          {busy && <p className="text-[10px] text-red-400 mt-0.5">В задаче #{busy.task_id}</p>}
                        </div>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-gray-300 px-3 py-4 text-sm text-gray-500">
                  На полке пока нет коробок. Сначала создай их в разделе склада.
                </div>
              )}
            </div>
          )}
          <Input label="Примечание" placeholder="Дополнительные инструкции..."
            value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
        </form>
      ) : taskType === 'packaging' ? (
        <form id="task-form" onSubmit={handleSubmitPackaging} className="space-y-4">
          {/* Product selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Товар *</label>
            {selectedProduct ? (
              <div className="flex items-center gap-3 p-3 bg-primary-50 rounded-xl border border-primary-100">
                <Package size={16} className="text-primary-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{selectedProduct.name}</p>
                  <p className="text-xs text-gray-400">{selectedProduct.code}</p>
                </div>
                <button type="button" onClick={() => { setSelectedProduct(null); setProductSearch(''); }}
                  className="text-gray-400 hover:text-red-500 flex-shrink-0 text-xs">✕</button>
              </div>
            ) : (
              <div className="relative">
                <Input placeholder="Поиск товара..." value={productSearch}
                  onChange={e => setProductSearch(e.target.value)} autoFocus />
                {productResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                    {productResults.map(p => (
                      <button key={p.id} type="button" onClick={() => { setSelectedProduct(p); setProductSearch(''); setProductResults([]); }}
                        className="w-full text-left px-3 py-2.5 hover:bg-gray-50 text-sm">
                        <p className="font-medium truncate">{p.name}</p>
                        <p className="text-xs text-gray-400">{p.code}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <Input label="Штук в коробке" type="number" min="1" max="1000"
            value={packForm.box_size} onChange={e => setPackForm(f => ({ ...f, box_size: e.target.value }))} required />
          <SearchSelect label="Паллетный склад" value={selectedFboWarehouse} placeholder="Поиск паллетного склада..."
            onChange={v => setSelectedFboWarehouse(v)}
            options={fboWarehouses.map(w => ({ value: String(w.id), label: w.name }))}
          />
          {selectedFboWarehouse && (
            <SearchSelect label="Паллет" value={packForm.target_pallet_id} placeholder="Поиск паллета..."
              onChange={v => setPackForm(f => ({ ...f, target_pallet_id: v }))}
              options={pallets.map(p => ({ value: String(p.id), label: `Р${p.row_number}П${p.number} — ${p.name}` }))}
            />
          )}
          <SearchSelect label="Сотрудник" value={packForm.employee_id} placeholder="Поиск сотрудника..."
            onChange={v => setPackForm(f => ({ ...f, employee_id: v }))}
            options={[{ value: '', label: 'Не назначен' }, ...employees.map(emp => ({ value: String(emp.id), label: emp.full_name }))]}
          />
          <Input label="Примечание" placeholder="Дополнительные инструкции..."
            value={packForm.notes} onChange={e => setPackForm(f => ({ ...f, notes: e.target.value }))} />
        </form>
      ) : taskType === 'bundle_assembly' ? (
        <form id="task-form" onSubmit={handleSubmitAssembly} className="space-y-4">
          {/* 1. Комплект */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Комплект *</label>
            <select value={selectedBundle ? String(selectedBundle.id) : ''}
              onChange={e => setSelectedBundle(bundles.find(x => String(x.id) === e.target.value) || null)}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-primary-400 focus:ring-2 focus:ring-primary-100 focus:outline-none bg-white">
              <option value="">Выберите комплект...</option>
              {bundles.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>

          {bundleComponents.length > 0 && (
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Состав:</p>
              {bundleComponents.map(c => (
                <div key={c.id || c.bc_id} className="flex justify-between py-1 text-sm">
                  <span className="text-gray-800 truncate">{c.name}</span>
                  <span className="font-bold text-gray-600 flex-shrink-0">× {Number(c.quantity) || 1}</span>
                </div>
              ))}
            </div>
          )}

          {/* 2. Количество */}
          <Input label="Количество комплектов *" type="number" min="1" value={bundleQty}
            onChange={e => setBundleQty(e.target.value)} required />

          {/* 3. Откуда брать */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Откуда брать</label>
            <label className="flex items-center gap-2 mb-2 cursor-pointer">
              <input type="checkbox" checked={bundleEmployeeChoice} onChange={e => setBundleEmployeeChoice(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-primary-500 focus:ring-primary-400" />
              <span className="text-sm text-gray-600">На усмотрение сотрудника</span>
            </label>
            {!bundleEmployeeChoice && (
              <SearchSelect value={bundleSourceWh} placeholder="Выберите склад..."
                onChange={v => setBundleSourceWh(v)}
                options={warehouses.filter(w => w.active !== false).map(w => ({ value: String(w.id), label: w.name }))} />
            )}
          </div>

          {/* 4. Сотрудник */}
          <SearchSelect label="Сотрудник" value={bundleEmployee} placeholder="Выберите сотрудника..."
            onChange={v => setBundleEmployee(v)}
            options={employees.map(e => ({ value: String(e.id), label: e.full_name }))} />

          {/* 5. Куда положить */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Куда положить</label>
            <SearchSelect value={bundleDestWh} placeholder="Выберите склад..."
              onChange={v => setBundleDestWh(v)}
              options={warehouses.filter(w => w.active !== false).map(w => ({ value: String(w.id), label: w.name }))} />
          </div>

          {/* 6. Примечание */}
          <Input label="Примечание" placeholder="Инструкции для сотрудника..."
            value={bundleNotes} onChange={e => setBundleNotes(e.target.value)} />
        </form>
      ) : null}
    </Modal>
  );
}

// ─── Task Card ─────────────────────────────────────────────────────────────────
function TaskCard({ task, onClick }) {
  const status = STATUS_MAP[task.status] || STATUS_MAP.new;
  const typeInfo = TASK_TYPE_ICON[task.task_type] || TASK_TYPE_ICON.inventory;
  const TypeIcon = typeInfo.Icon;

  return (
    <button
      onClick={() => onClick(task)}
      className="w-full text-left card p-4 hover:shadow-md hover:border-primary-200 transition-all group"
    >
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border ${typeInfo.bg} ${typeInfo.border}`}>
          <TypeIcon size={26} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-medium text-gray-900 text-sm leading-tight group-hover:text-primary-700 transition-colors">{task.title}</h3>
            <Badge variant={status.variant} className="flex-shrink-0">{status.label}</Badge>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-gray-500">
            {task.task_type === 'packaging' && (
              <span className="font-semibold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded-lg">Оприходование</span>
            )}
            {task.task_type === 'production_transfer' && (
              <span className="font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-lg">Перенос</span>
            )}
            {task.task_type === 'inventory' && (
              <span className="font-semibold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-lg">Инвентаризация</span>
            )}
            {task.employee_name && <span>{task.employee_name}</span>}
            {task.shelf_code && <span className="inline-flex items-center gap-1"><ShelfIcon size={12} />{task.rack_name} · {task.shelf_name}</span>}
            {!task.shelf_code && task.pallet_name && <span className="inline-flex items-center gap-1"><PalletIcon size={12} />{task.pallet_row_name || 'Ряд'} · {task.pallet_name}</span>}
            {task.box_barcode && <span className="inline-flex items-center gap-1"><BoxIcon size={12} />Коробка {task.box_barcode}</span>}
            {Number(task.task_boxes_total || 0) > 0 && (
              <span>Коробки {Number(task.task_boxes_completed || 0)} / {Number(task.task_boxes_total || 0)}</span>
            )}
            {Number(task.scans_count) > 0 && <span>{task.scans_count} сканов</span>}
            <span className="text-gray-300">{new Date(task.created_at).toLocaleDateString('ru-RU')}</span>
          </div>

          {task.notes && (
            <p className="text-xs text-gray-400 mt-1.5 line-clamp-1">{task.notes}</p>
          )}
        </div>

        {task.status === 'in_progress' && (
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse flex-shrink-0 mt-1" />
        )}
      </div>
    </button>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function TasksPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  // URL-backed state
  const selectedTaskId = searchParams.get('id');
  const filterEmployee = searchParams.get('employee') || '';
  const filterStatus = searchParams.get('status') || '';

  const selectedTask = useMemo(
    () => (selectedTaskId ? items.find(t => String(t.id) === selectedTaskId) || null : null),
    [selectedTaskId, items]
  );

  const setSelectedTask = useCallback((task) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (task) { next.set('id', String(task.id)); } else { next.delete('id'); }
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const setFilterEmployee = useCallback((val) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (val) { next.set('employee', val); } else { next.delete('employee'); }
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const setFilterStatus = useCallback((val) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (val) { next.set('status', val); } else { next.delete('status'); }
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  // Inline filters (client-side)
  const [searchText, setSearchText] = useState('');
  const [filterLocation, setFilterLocation] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/tasks', { params: { limit: 100 } });
      setItems(res.data.items);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Derive unique employees, statuses, locations for dropdown options
  const uniqueEmployees = [...new Set(items.map(t => t.employee_name).filter(Boolean))].sort();
  const uniqueLocations = [...new Set(items.flatMap(t => [t.rack_name, t.pallet_row_name].filter(Boolean)))].sort();

  // Client-side filtering
  const filtered = items.filter(task => {
    if (searchText) {
      const q = searchText.toLowerCase();
      if (!(task.title || '').toLowerCase().includes(q)) return false;
    }
    if (filterEmployee && task.employee_name !== filterEmployee) return false;
    if (filterStatus && task.status !== filterStatus) return false;
    if (filterLocation) {
      const loc = task.rack_name || task.pallet_row_name || '';
      if (loc !== filterLocation) return false;
    }
    return true;
  });

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Задачи</h1>
          <p className="text-gray-500 text-sm mt-1">Задачи инвентаризации · нажмите для деталей</p>
        </div>
        <Button icon={<Plus size={15} />} size="sm" onClick={() => setShowCreate(true)}>
          Создать задачу
        </Button>
      </div>

      {/* Inline filters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <input
          type="text"
          placeholder="Поиск по названию..."
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          className="px-3 py-2 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-200 transition-colors"
        />
        <select
          value={filterEmployee}
          onChange={e => setFilterEmployee(e.target.value)}
          className="px-3 py-2 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-200 transition-colors text-gray-600"
        >
          <option value="">Все сотрудники</option>
          {uniqueEmployees.map(name => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-2 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-200 transition-colors text-gray-600"
        >
          <option value="">Все статусы</option>
          <option value="new">Новые</option>
          <option value="in_progress">В работе</option>
          <option value="completed">Выполненные</option>
          <option value="cancelled">Отменённые</option>
        </select>
        <select
          value={filterLocation}
          onChange={e => setFilterLocation(e.target.value)}
          className="px-3 py-2 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-200 transition-colors text-gray-600"
        >
          <option value="">Все локации</option>
          {uniqueLocations.map(loc => (
            <option key={loc} value={loc}>{loc}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48"><Spinner size="lg" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-gray-400">
          <ClipboardList size={40} className="mb-2 opacity-30" />
          <p className="text-sm">{items.length === 0 ? 'Нет задач' : 'Ничего не найдено'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(task => (
            <TaskCard key={task.id} task={task} onClick={setSelectedTask} />
          ))}
        </div>
      )}

      <CreateTaskModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSuccess={load}
      />

      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onReload={load}
        />
      )}
    </div>
  );
}

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Package, ChevronRight, CheckCircle2, ScanLine, Printer, MapPin, ArrowLeft, Box, AlertCircle } from 'lucide-react';
import api from '../../api/client';
import Spinner from '../../components/ui/Spinner';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { useToast } from '../../components/ui/Toast';
import JsBarcode from 'jsbarcode';

function fmtQty(v) { const n = parseFloat(v || 0); return Number.isInteger(n) ? String(n) : n.toFixed(0); }

// ─── Barcode Print Component ─────────────────────────────────────────────────
function BarcodePrint({ barcode, productName, onPrinted }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (canvasRef.current && barcode) {
      try {
        JsBarcode(canvasRef.current, barcode, {
          format: 'CODE128', width: 2, height: 60, displayValue: true,
          fontSize: 14, margin: 10, background: '#fff',
        });
      } catch { /* fallback: just show text */ }
    }
  }, [barcode]);

  return (
    <div className="text-center space-y-3">
      <p className="text-sm font-bold text-gray-900">{productName}</p>
      <div className="bg-white border border-gray-200 rounded-xl p-4 inline-block">
        <canvas ref={canvasRef} />
      </div>
      <p className="text-xs text-gray-400">Наклейте штрих-код и отсканируйте его</p>
      <div className="flex gap-2 justify-center">
        <Button icon={<Printer size={14} />} onClick={() => {
          const w = window.open('', '_blank', 'width=400,height=300');
          w.document.write(`<html><body style="text-align:center;padding:20px;font-family:Arial">
            <h3>${productName}</h3>
            <canvas id="bc"></canvas>
            <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3/dist/JsBarcode.all.min.js"><\/script>
            <script>JsBarcode('#bc','${barcode}',{format:'CODE128',width:2,height:60,displayValue:true});window.print();<\/script>
          </body></html>`);
          w.document.close();
          if (onPrinted) onPrinted();
        }}>Печать</Button>
      </div>
    </div>
  );
}

// ─── Scan Input ──────────────────────────────────────────────────────────────
function ScanInput({ onScan, placeholder = 'Сканируйте штрих-код...', disabled }) {
  const [value, setValue] = useState('');
  const ref = useRef(null);

  useEffect(() => { if (ref.current && !disabled) ref.current.focus(); }, [disabled]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (value.trim() && !disabled) { onScan(value.trim()); setValue(''); }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input ref={ref} value={value} onChange={e => setValue(e.target.value)} disabled={disabled}
        placeholder={placeholder}
        className="flex-1 px-4 py-3 rounded-xl border border-gray-200 text-sm focus:border-primary-400 focus:ring-2 focus:ring-primary-100 focus:outline-none disabled:opacity-50"
        autoComplete="off" />
      <Button type="submit" disabled={disabled || !value.trim()} icon={<ScanLine size={14} />}>Ввод</Button>
    </form>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function AssemblyPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sourceBoxes, setSourceBoxes] = useState([]);
  const [actionLoading, setActionLoading] = useState(false);
  const [componentStatus, setComponentStatus] = useState([]);
  const [printBarcode, setPrintBarcode] = useState(null);
  const [placeDest, setPlaceDest] = useState(null); // {shelf_id} or {pallet_id}

  const loadTask = useCallback(async () => {
    try {
      const res = await api.get(`/assembly/${id}`);
      setTask(res.data);
    } catch (err) {
      toast.error('Не удалось загрузить задачу');
    } finally { setLoading(false); }
  }, [id, toast]);

  const loadSourceBoxes = useCallback(async () => {
    try {
      const res = await api.get(`/assembly/${id}/source-boxes`);
      setSourceBoxes(res.data);
    } catch {}
  }, [id]);

  useEffect(() => { loadTask(); }, [loadTask]);
  useEffect(() => { if (task?.assembly_phase === 'picking') loadSourceBoxes(); }, [task?.assembly_phase, loadSourceBoxes]);

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>;
  if (!task) return <div className="p-6 text-center text-gray-400">Задача не найдена</div>;

  const phase = task.assembly_phase || 'picking';
  const components = task.components || [];
  const pickedMap = {};
  (task.picked_summary || []).forEach(p => { pickedMap[p.product_id] = Number(p.picked_count); });

  const totalNeeded = components.reduce((s, c) => s + Number(c.quantity) * task.bundle_qty, 0);
  const totalPicked = Object.values(pickedMap).reduce((s, v) => s + v, 0);
  const allPicked = components.every(c => (pickedMap[c.component_id] || 0) >= Number(c.quantity) * task.bundle_qty);

  // ─── PHASE: PICKING ────────────────────────────────────────────────────────
  const handleStartPicking = async () => {
    setActionLoading(true);
    try {
      await api.post(`/assembly/${id}/start-picking`);
      await loadTask();
    } catch (err) { toast.error(err.response?.data?.error || 'Ошибка'); }
    finally { setActionLoading(false); }
  };

  const handleScanPick = async (barcode) => {
    setActionLoading(true);
    try {
      // Try to find which box to pick from (first available)
      const availableBox = sourceBoxes.find(b => {
        const product = components.find(c => c.component_id === b.product_id);
        if (!product) return false;
        const needed = Number(product.quantity) * task.bundle_qty;
        const have = pickedMap[b.product_id] || 0;
        return have < needed && b.quantity > 0;
      });

      const res = await api.post(`/assembly/${id}/scan-pick`, {
        barcode, box_id: availableBox?.box_id || null
      });
      toast.success(`✓ ${res.data.product}`);
      await loadTask();
      await loadSourceBoxes();
    } catch (err) { toast.error(err.response?.data?.error || 'Ошибка сканирования'); }
    finally { setActionLoading(false); }
  };

  const handleStartAssembly = async () => {
    setActionLoading(true);
    try {
      await api.post(`/assembly/${id}/start-assembling`);
      await loadTask();
    } catch (err) { toast.error(err.response?.data?.error || 'Ошибка'); }
    finally { setActionLoading(false); }
  };

  // ─── PHASE: ASSEMBLING ─────────────────────────────────────────────────────
  const currentBundle = (task.assembled_count || 0) + 1;

  const handleScanComponent = async (barcode) => {
    setActionLoading(true);
    try {
      const res = await api.post(`/assembly/${id}/scan-component`, { barcode });
      toast.success(`✓ ${res.data.product}`);
      setComponentStatus(res.data.components_status || []);

      if (res.data.all_components_scanned) {
        // Show barcode for printing
        const bc = (task.bundle_barcodes || '').split(';').filter(Boolean)[0] || task.bundle_barcode || '';
        setPrintBarcode(bc);
      }
      await loadTask();
    } catch (err) { toast.error(err.response?.data?.error || 'Ошибка'); }
    finally { setActionLoading(false); }
  };

  const handleConfirmBundle = async (barcode) => {
    setActionLoading(true);
    try {
      const res = await api.post(`/assembly/${id}/confirm-bundle`, { barcode });
      toast.success(`Комплект ${res.data.assembled_count}/${res.data.total} готов!`);
      setPrintBarcode(null);
      setComponentStatus([]);
      await loadTask();
    } catch (err) { toast.error(err.response?.data?.error || 'Ошибка'); }
    finally { setActionLoading(false); }
  };

  // ─── PHASE: PLACING ────────────────────────────────────────────────────────
  const handleScanDestination = async (barcode) => {
    // Resolve barcode to shelf or pallet
    try {
      const res = await api.post('/movements/scan', { barcode });
      if (res.data.type === 'shelf') {
        setPlaceDest({ shelf_id: res.data.shelf.id, name: `${res.data.shelf.warehouse_name} · ${res.data.shelf.rack_name} · ${res.data.shelf.code}` });
        toast.success(`Полка: ${res.data.shelf.code}`);
      } else if (res.data.type === 'pallet') {
        setPlaceDest({ pallet_id: res.data.pallet.id, name: `${res.data.pallet.warehouse_name} · ${res.data.pallet.row_name} · ${res.data.pallet.name}` });
        toast.success(`Паллет: ${res.data.pallet.name}`);
      } else {
        toast.error('Отсканируйте полку или паллет');
      }
    } catch (err) { toast.error('Место не найдено'); }
  };

  const handleScanPlace = async (barcode) => {
    if (!placeDest) { toast.error('Сначала отсканируйте место назначения'); return; }
    setActionLoading(true);
    try {
      const res = await api.post(`/assembly/${id}/scan-place`, placeDest);
      toast.success(`Размещено ${res.data.placed_count}/${res.data.total}`);
      if (res.data.phase === 'completed') {
        toast.success('Задача завершена!');
      }
      await loadTask();
    } catch (err) { toast.error(err.response?.data?.error || 'Ошибка'); }
    finally { setActionLoading(false); }
  };

  const handleChangeDest = () => { setPlaceDest(null); };

  // ─── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => navigate('/employee/tasks')} className="p-2 rounded-xl hover:bg-gray-100">
          <ArrowLeft size={18} className="text-gray-500" />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-gray-900">Сборка комплектов</h1>
          <p className="text-xs text-gray-400">{task.bundle_name} × {task.bundle_qty}</p>
        </div>
        <Badge variant={phase === 'completed' ? 'success' : 'primary'}>
          {phase === 'picking' ? 'Забор' : phase === 'assembling' ? 'Сборка' : phase === 'placing' ? 'Размещение' : 'Готово'}
        </Badge>
      </div>

      {/* Phase indicators */}
      <div className="flex items-center gap-2 mb-5">
        {['picking', 'assembling', 'placing'].map((p, i) => (
          <div key={p} className="flex items-center gap-2 flex-1">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
              phase === p ? 'bg-primary-600 text-white' :
              ['assembling','placing','completed'].indexOf(phase) > ['picking','assembling','placing'].indexOf(p) ? 'bg-green-500 text-white' :
              'bg-gray-200 text-gray-500'
            }`}>{i + 1}</div>
            <span className={`text-xs font-medium ${phase === p ? 'text-primary-600' : 'text-gray-400'}`}>
              {p === 'picking' ? 'Забор' : p === 'assembling' ? 'Сборка' : 'Размещение'}
            </span>
            {i < 2 && <ChevronRight size={12} className="text-gray-300" />}
          </div>
        ))}
      </div>

      {/* ═══ NOT STARTED ═══ */}
      {task.status === 'new' && (
        <div className="text-center space-y-4 py-8">
          <Package size={48} className="text-primary-300 mx-auto" />
          <div>
            <h2 className="text-lg font-bold text-gray-900">Собрать {task.bundle_qty} комплектов</h2>
            <p className="text-sm text-gray-500 mt-1">{task.bundle_name}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-4 text-left">
            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Состав комплекта:</p>
            {components.map(c => (
              <div key={c.component_id} className="flex justify-between py-1 text-sm">
                <span className="text-gray-800">{c.name}</span>
                <span className="font-bold text-gray-600">× {fmtQty(c.quantity)}</span>
              </div>
            ))}
          </div>
          <Button onClick={handleStartPicking} loading={actionLoading} size="lg" className="w-full">
            Начать забор товара
          </Button>
        </div>
      )}

      {/* ═══ PICKING ═══ */}
      {phase === 'picking' && task.status === 'in_progress' && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
            <p className="text-sm font-bold text-blue-800">Заберите товар с паллетов</p>
            <p className="text-xs text-blue-600 mt-1">Сканируйте каждую баночку</p>
          </div>

          {/* Progress per component */}
          <div className="space-y-2">
            {components.map(c => {
              const needed = Number(c.quantity) * task.bundle_qty;
              const have = pickedMap[c.component_id] || 0;
              const pct = Math.min(100, (have / needed) * 100);
              return (
                <div key={c.component_id} className="bg-white border border-gray-100 rounded-xl p-3">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium text-gray-800">{c.name}</span>
                    <span className={`font-bold ${have >= needed ? 'text-green-600' : 'text-gray-600'}`}>
                      {have >= needed && <CheckCircle2 size={14} className="inline mr-1" />}
                      {have}/{needed}
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${have >= needed ? 'bg-green-500' : 'bg-primary-500'}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Source boxes info */}
          {sourceBoxes.length > 0 && (
            <details className="bg-gray-50 rounded-xl">
              <summary className="px-4 py-2 text-xs font-semibold text-gray-500 cursor-pointer">Где взять ({sourceBoxes.length} коробок)</summary>
              <div className="px-4 pb-3 space-y-1">
                {sourceBoxes.slice(0, 10).map((b, i) => (
                  <div key={i} className="flex justify-between text-xs">
                    <span className="text-gray-600">{b.product_name?.slice(0, 25)} · {b.pallet_name}</span>
                    <span className="text-gray-400">{fmtQty(b.quantity)} шт</span>
                  </div>
                ))}
              </div>
            </details>
          )}

          <ScanInput onScan={handleScanPick} disabled={actionLoading} placeholder="Сканируйте баночку..." />

          {allPicked && (
            <Button onClick={handleStartAssembly} loading={actionLoading} size="lg" className="w-full" variant="success">
              Все забрано — начать сборку
            </Button>
          )}
        </div>
      )}

      {/* ═══ ASSEMBLING ═══ */}
      {phase === 'assembling' && (
        <div className="space-y-4">
          <div className="bg-purple-50 border border-purple-100 rounded-xl p-4 text-center">
            <p className="text-xl font-black text-primary-700">Комплект {currentBundle} из {task.bundle_qty}</p>
            <p className="text-xs text-primary-500 mt-1">Собрано: {task.assembled_count || 0}</p>
          </div>

          {!printBarcode ? (
            <>
              {/* Components checklist */}
              <div className="space-y-2">
                {components.map(c => {
                  const status = componentStatus.find(s => s.product_id === c.component_id);
                  const done = status?.done || false;
                  return (
                    <div key={c.component_id} className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${done ? 'bg-green-50 border-green-200' : 'bg-white border-gray-100'}`}>
                      {done ? <CheckCircle2 size={18} className="text-green-500" /> : <Box size={18} className="text-gray-300" />}
                      <span className={`text-sm font-medium ${done ? 'text-green-700' : 'text-gray-800'}`}>{c.name}</span>
                      <span className="text-xs text-gray-400 ml-auto">× {fmtQty(c.quantity)}</span>
                    </div>
                  );
                })}
              </div>
              <ScanInput onScan={handleScanComponent} disabled={actionLoading} placeholder="Сканируйте компонент..." />
            </>
          ) : (
            /* Print barcode */
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <BarcodePrint barcode={printBarcode} productName={task.bundle_name} />
              <div className="mt-4">
                <ScanInput onScan={handleConfirmBundle} disabled={actionLoading} placeholder="Сканируйте наклеенный ШК..." />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ PLACING ═══ */}
      {phase === 'placing' && (
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-100 rounded-xl p-4 text-center">
            <p className="text-lg font-bold text-green-800">Размещение комплектов</p>
            <p className="text-sm text-green-600">{task.placed_count || 0} / {task.bundle_qty} размещено</p>
            <div className="h-2 bg-green-100 rounded-full mt-2 overflow-hidden">
              <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${((task.placed_count || 0) / task.bundle_qty) * 100}%` }} />
            </div>
          </div>

          {!placeDest ? (
            <div className="space-y-3">
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                <p className="text-sm font-medium text-amber-800">Отсканируйте место назначения</p>
                <p className="text-xs text-amber-600 mt-0.5">Полку или паллет, куда положить комплекты</p>
              </div>
              <ScanInput onScan={handleScanDestination} disabled={actionLoading} placeholder="Сканируйте полку или паллет..." />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 px-4 py-3 bg-blue-50 border border-blue-100 rounded-xl">
                <MapPin size={16} className="text-blue-500" />
                <span className="text-sm font-medium text-blue-800 flex-1">{placeDest.name}</span>
                <button onClick={handleChangeDest} className="text-xs text-blue-500 hover:text-blue-700">Сменить</button>
              </div>
              <ScanInput onScan={handleScanPlace} disabled={actionLoading} placeholder="Сканируйте комплект для размещения..." />
            </div>
          )}
        </div>
      )}

      {/* ═══ COMPLETED ═══ */}
      {phase === 'completed' && (
        <div className="text-center py-12 space-y-4">
          <CheckCircle2 size={64} className="text-green-500 mx-auto" />
          <h2 className="text-xl font-bold text-gray-900">Задача завершена!</h2>
          <p className="text-sm text-gray-500">
            Собрано {task.assembled_count} комплектов · Размещено {task.placed_count}
          </p>
          <Button onClick={() => navigate('/employee/tasks')} variant="ghost">К задачам</Button>
        </div>
      )}
    </div>
  );
}

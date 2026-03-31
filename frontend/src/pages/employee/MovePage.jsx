import { useState, useRef, useEffect } from 'react';
import {
  ArrowRight, ScanLine, Package, Check, X, ArrowRightLeft,
  RotateCcw, Plus, Minus, ArrowLeft, Box, MapPin, User,
  ChevronRight, ShoppingCart, Send, Layers, Scan
} from 'lucide-react';
import api from '../../api/client';
import { ProductIcon, PalletIcon, ShelfIcon, BoxIcon, EmployeeIcon, RackIcon } from '../../components/ui/WarehouseIcons';
import { qty } from '../../utils/fmt';
import Spinner from '../../components/ui/Spinner';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';

/*
  Flow for "take" mode:
  MODE → COLLECT → SCAN_PRODUCT → COLLECT → ... → DONE (auto-dest = employee)

  COLLECT step: scan a location (shelf/pallet) → see products → tap product → SCAN_PRODUCT
  After scanning product, return to COLLECT. Can scan another location to get more products.
  When done collecting, press "Забрать X шт." → auto-confirm.

  Flow for "location" mode:
  MODE → COLLECT → ... → DELIVER → SCAN_DEST → DELIVER → ... → DONE

  DELIVER step: scan destination → select which products go there → confirm.
  Can deliver to multiple destinations.
*/

const STEP = { MODE: 0, COLLECT: 1, SCAN_PRODUCT: 1.5, DELIVER: 2, SCAN_DEST: 2.5, DONE: 3 };

const MODE_OPTIONS = [
  { key: 'take', label: 'Взять себе', desc: 'Забрать товар с полки/паллета', icon: ShoppingCart, color: 'bg-gradient-to-br from-blue-500 to-blue-600', shadow: 'shadow-blue-200' },
  { key: 'return', label: 'Сдать обратно', desc: 'Вернуть товар на место', icon: Send, color: 'bg-gradient-to-br from-emerald-500 to-emerald-600', shadow: 'shadow-emerald-200' },
  { key: 'location', label: 'Между местами', desc: 'С нескольких мест на несколько мест', icon: ArrowRightLeft, color: 'bg-gradient-to-br from-purple-500 to-purple-600', shadow: 'shadow-purple-200' },
];

const TYPE_LABEL = { pallet: 'Паллет', shelf: 'Полка', box: 'Коробка', product: 'Товар', employee: 'Сотрудник' };
const TYPE_COLOR = {
  pallet: 'bg-amber-50 text-amber-700 border-amber-200',
  shelf: 'bg-blue-50 text-blue-700 border-blue-200',
  box: 'bg-purple-50 text-purple-700 border-purple-200',
  product: 'bg-green-50 text-green-700 border-green-200',
  employee: 'bg-primary-50 text-primary-700 border-primary-200',
};
const TYPE_SVG_ICON = { pallet: PalletIcon, shelf: ShelfIcon, box: BoxIcon, product: ProductIcon, employee: EmployeeIcon };

function LocationCard({ data }) {
  if (!data) return null;
  const SvgIcon = TYPE_SVG_ICON[data.type];
  const colorCls = TYPE_COLOR[data.type] || 'bg-gray-50 text-gray-600 border-gray-200';
  return (
    <div className={`rounded-2xl border p-3.5 ${colorCls}`}>
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-white/60 flex items-center justify-center flex-shrink-0 shadow-sm">
          {SvgIcon ? <SvgIcon size={28} /> : <Package size={20} />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider opacity-60">{TYPE_LABEL[data.type]}</p>
          <p className="text-base font-bold text-gray-900">{data.name}</p>
        </div>
      </div>
    </div>
  );
}

function playBeep(ok = true) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = ok ? 880 : 440; osc.type = 'sine';
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (ok ? 0.15 : 0.4));
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + (ok ? 0.15 : 0.4));
    if (!ok) {
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2); gain2.connect(ctx.destination);
      osc2.frequency.value = 330; osc2.type = 'sine';
      gain2.gain.setValueAtTime(0, ctx.currentTime + 0.25);
      gain2.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.27);
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.65);
      osc2.start(ctx.currentTime + 0.25); osc2.stop(ctx.currentTime + 0.65);
    }
  } catch {}
}

export default function MovePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(STEP.MODE);
  const [mode, setMode] = useState(null);
  // cart: [{ product_id, product_name, quantity, source_type, source_id, source_name, source_item_source, source_item_id }]
  const [cart, setCart] = useState([]);
  // Current source being browsed
  const [currentSource, setCurrentSource] = useState(null);
  // Scanning product
  const [scanningProduct, setScanningProduct] = useState(null);
  const [scanCount, setScanCount] = useState(0);
  // Deliver step
  const [delivered, setDelivered] = useState([]); // [{dest, items: [{product_id, quantity}]}]
  const [currentDest, setCurrentDest] = useState(null);

  const [barcode, setBarcode] = useState('');
  const [scanning, setScanning] = useState(false);
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loadingInventory, setLoadingInventory] = useState(false);
  const inputRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 200); }, [step, scanningProduct]);

  const scanBarcode = async (bc) => {
    if (!bc.trim()) return null;
    setScanning(true); setError('');
    try { return (await api.post('/movements/scan', { barcode: bc.trim() })).data; }
    catch (err) { setError(err.response?.data?.error || 'Не найдено'); return null; }
    finally { setScanning(false); }
  };

  const handleBarcodeChange = (e) => {
    const val = e.target.value;
    setBarcode(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (val.trim().length >= 4) {
      timerRef.current = setTimeout(() => handleAutoScan(val.trim()), 400);
    }
  };

  const handleBarcodeKeyDown = (e) => {
    if (e.key === 'Enter') { if (timerRef.current) clearTimeout(timerRef.current); handleAutoScan(barcode.trim()); }
  };

  const handleAutoScan = (val) => {
    if (step === STEP.COLLECT && !currentSource) handleScanLocation(val);
    else if (step === STEP.SCAN_PRODUCT) handleProductScan(val);
    else if (step === STEP.DELIVER || step === STEP.SCAN_DEST) handleScanDest(val);
  };

  // ─── Mode selection ─────────────────────────────────────────────────────
  const handleSelectMode = (m) => {
    setMode(m);
    if (m === 'return') {
      setLoadingInventory(true);
      api.get('/movements/my-inventory').then(res => {
        const src = {
          type: 'employee', id: user.employee_id, name: user.employee_name || user.username,
          contents: res.data.map(i => ({ product_id: i.product_id, product_name: i.product_name, quantity: Number(i.quantity), source: 'employee_item', id: i.id })),
        };
        setCurrentSource(src);
        setStep(STEP.COLLECT);
      }).catch(() => setError('Не удалось загрузить инвентарь')).finally(() => setLoadingInventory(false));
    } else {
      setStep(STEP.COLLECT);
    }
  };

  // ─── Scan location (source) ─────────────────────────────────────────────
  const handleScanLocation = async (val) => {
    const data = await scanBarcode(val || barcode);
    if (!data) return;
    setCurrentSource(data);
    setBarcode('');
  };

  // ─── Start scanning a product ──────────────────────────────────────────
  const startScanProduct = (item) => {
    const existing = cart.find(c => c.product_id === item.product_id && c.source_id === currentSource.id);
    setScanningProduct({ ...item, sourceData: currentSource });
    setScanCount(existing ? existing.quantity : 0);
    setBarcode('');
    setStep(STEP.SCAN_PRODUCT);
  };

  const handleProductScan = () => {
    setBarcode('');
    const maxQ = Math.round(Number(scanningProduct.quantity));
    setScanCount(prev => {
      if (prev + 1 > maxQ && maxQ < 999999) { playBeep(false); setError(`Максимум ${maxQ} шт.`); return prev; }
      playBeep(true); setError('');
      return prev + 1;
    });
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const finishProductScan = () => {
    if (scanCount > 0 && scanningProduct) {
      const src = scanningProduct.sourceData;
      setCart(prev => {
        const key = `${scanningProduct.product_id}_${src.id}`;
        const exists = prev.find(c => `${c.product_id}_${c.source_id}` === key);
        if (exists) return prev.map(c => `${c.product_id}_${c.source_id}` === key ? { ...c, quantity: scanCount } : c);
        return [...prev, {
          product_id: scanningProduct.product_id, product_name: scanningProduct.product_name,
          quantity: scanCount, maxQty: Math.round(Number(scanningProduct.quantity)),
          source_type: src.type, source_id: src.id, source_name: src.name,
          source_item_source: scanningProduct.source, source_item_id: scanningProduct.id,
        }];
      });
    }
    setScanningProduct(null); setScanCount(0); setBarcode(''); setError('');
    setStep(STEP.COLLECT);
  };

  const removeFromCart = (idx) => setCart(prev => prev.filter((_, i) => i !== idx));

  // ─── Scan destination ───────────────────────────────────────────────────
  const handleScanDest = async (val) => {
    const data = await scanBarcode(val || barcode);
    if (!data) return;
    if (data.type === 'product') { setError('Отсканируйте место, не товар'); return; }
    setCurrentDest(data);
    setBarcode('');
    setStep(STEP.SCAN_DEST);
  };

  // ─── Execute moves ─────────────────────────────────────────────────────
  const handleMove = async () => {
    setMoving(true); setError('');
    try {
      for (const item of cart) {
        const body = { product_id: item.product_id, quantity: item.quantity };
        if (mode === 'take') {
          body.dest_type = 'employee'; body.dest_id = user.employee_id;
          if (item.source_item_source === 'box' && item.source_item_id) { body.source_type = 'box'; body.source_id = item.source_item_id; }
          else if (item.source_item_source === 'pallet_item') { body.source_type = 'pallet'; body.source_id = item.source_id; }
          else { body.source_type = item.source_type; body.source_id = item.source_id; }
        } else if (mode === 'return') {
          body.source_type = 'employee'; body.source_id = user.employee_id;
          body.dest_type = currentDest.type; body.dest_id = currentDest.id;
        } else {
          if (item.source_item_source === 'box' && item.source_item_id) { body.source_type = 'box'; body.source_id = item.source_item_id; }
          else if (item.source_item_source === 'pallet_item') { body.source_type = 'pallet'; body.source_id = item.source_id; }
          else { body.source_type = item.source_type; body.source_id = item.source_id; }
          body.dest_type = currentDest.type; body.dest_id = currentDest.id;
        }
        await api.post('/movements/move', body);
      }
      const totalQ = cart.reduce((s, c) => s + c.quantity, 0);
      setSuccess(`Перемещено ${cart.length} позиций — ${totalQ} шт.`);
      setTimeout(reset, 2500);
    } catch (err) { setError(err.response?.data?.error || 'Ошибка перемещения'); }
    finally { setMoving(false); }
  };

  const reset = () => {
    setStep(STEP.MODE); setMode(null); setCart([]); setCurrentSource(null);
    setScanningProduct(null); setScanCount(0); setCurrentDest(null); setDelivered([]);
    setBarcode(''); setError(''); setSuccess('');
  };

  const goBack = () => {
    if (step === STEP.SCAN_PRODUCT) { finishProductScan(); return; }
    if (step === STEP.SCAN_DEST) { setCurrentDest(null); setStep(STEP.DELIVER); return; }
    if (step === STEP.DELIVER) { setStep(STEP.COLLECT); return; }
    if (step === STEP.DONE) { setStep(STEP.DELIVER); return; }
    if (step === STEP.COLLECT && currentSource) { setCurrentSource(null); return; }
    if (step === STEP.COLLECT) { setMode(null); setStep(STEP.MODE); return; }
    navigate('/employee/tasks');
  };

  const totalItems = cart.reduce((s, c) => s + c.quantity, 0);
  const undelivered = cart; // simplified: all items in cart not yet delivered

  return (
    <div className="p-4 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <button onClick={goBack} className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all">
          <ArrowLeft size={20} />
        </button>
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-200">
          <ArrowRightLeft size={20} className="text-white" />
        </div>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-gray-900">Перемещение</h1>
          <p className="text-xs text-gray-400">{mode ? MODE_OPTIONS.find(m => m.key === mode)?.label : 'Выберите действие'}</p>
        </div>
        {step > STEP.MODE && (
          <button onClick={reset} className="p-2 rounded-xl text-gray-400 hover:bg-gray-100" title="Начать заново">
            <RotateCcw size={18} />
          </button>
        )}
      </div>

      {/* ═══ Mode selection ═══ */}
      {step === STEP.MODE && (
        <div className="space-y-3">
          {MODE_OPTIONS.map(m => (
            <button key={m.key} onClick={() => handleSelectMode(m.key)}
              className="w-full flex items-center gap-4 p-4 bg-white rounded-2xl border border-gray-100 hover:border-primary-300 hover:shadow-md transition-all active:scale-[0.98]">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg ${m.color} ${m.shadow}`}>
                <m.icon size={22} />
              </div>
              <div className="text-left flex-1">
                <p className="font-bold text-gray-900">{m.label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{m.desc}</p>
              </div>
              <ChevronRight size={18} className="text-gray-300" />
            </button>
          ))}
        </div>
      )}

      {loadingInventory && <div className="flex items-center justify-center py-12"><Spinner size="lg" /></div>}

      {/* ═══ COLLECT: scan locations + pick products ═══ */}
      {step === STEP.COLLECT && (
        <div className="space-y-4">
          {/* Already collected items */}
          {cart.length > 0 && (
            <div className="bg-green-50 rounded-2xl p-3 border border-green-100">
              <p className="text-xs font-bold text-green-700 uppercase tracking-wider mb-2">
                Набрано: {cart.length} товаров · {totalItems} шт.
              </p>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {cart.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-white rounded-xl px-3 py-2">
                    <Check size={14} className="text-green-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-800 truncate">{item.product_name}</p>
                      <p className="text-xs text-gray-400">{item.source_name}</p>
                    </div>
                    <span className="text-xs font-bold text-green-700">{item.quantity}</span>
                    <button onClick={() => removeFromCart(idx)} className="p-1 text-red-300 hover:text-red-500"><X size={12} /></button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Current source or scan new one */}
          {currentSource ? (
            <>
              <LocationCard data={currentSource} />
              {/* Products list */}
              {currentSource.contents?.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Выберите товар</p>
                  <div className="space-y-1.5 max-h-52 overflow-y-auto">
                    {currentSource.contents.map((item, i) => {
                      const inCart = cart.find(c => c.product_id === item.product_id && c.source_id === currentSource.id);
                      return (
                        <button key={i} onClick={() => startScanProduct(item)}
                          className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all active:scale-[0.98] ${
                            inCart ? 'bg-green-50 border-green-200' : 'bg-white border-gray-100 hover:border-primary-300'
                          }`}>
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${inCart ? 'bg-green-200' : 'bg-gray-100'}`}>
                            {inCart ? <Check size={16} className="text-green-700" /> : <ProductIcon size={18} />}
                          </div>
                          <div className="flex-1 min-w-0 text-left">
                            <p className="text-sm font-medium text-gray-800 truncate">{item.product_name}</p>
                          </div>
                          {inCart && <span className="text-xs font-bold text-green-700">{inCart.quantity} шт.</span>}
                          <span className="text-xs text-gray-400 flex-shrink-0">{qty(item.quantity)} дост.</span>
                          <Scan size={14} className="text-primary-400 flex-shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {/* Scan another location */}
              {mode !== 'return' && (
                <button onClick={() => setCurrentSource(null)}
                  className="w-full py-3 border-2 border-dashed border-gray-200 rounded-2xl text-sm text-gray-400 font-medium hover:border-primary-300 hover:text-primary-500 transition-all flex items-center justify-center gap-2">
                  <ScanLine size={16} /> Отсканировать другое место
                </button>
              )}
            </>
          ) : (
            /* Scan source location */
            <div className="space-y-4">
              <div className="bg-primary-50 rounded-2xl p-5 text-center">
                <ScanLine size={32} className="mx-auto text-primary-500 mb-3" />
                <p className="font-bold text-gray-900">{cart.length > 0 ? 'Отсканируйте ещё одно место' : 'Отсканируйте источник'}</p>
                <p className="text-xs text-gray-400 mt-1">Полка, паллет или коробка</p>
              </div>
              <div className="relative">
                <ScanLine size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                <input ref={inputRef} value={barcode} onChange={handleBarcodeChange} onKeyDown={handleBarcodeKeyDown}
                  placeholder="Наведите сканер..." autoFocus autoComplete="off"
                  className="w-full pl-11 pr-4 py-4 border-2 border-gray-200 rounded-2xl text-center text-lg font-mono tracking-widest focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none" />
                {scanning && <div className="absolute right-4 top-1/2 -translate-y-1/2"><Spinner size="sm" /></div>}
              </div>
            </div>
          )}

          {/* Next step */}
          {cart.length > 0 && (
            <button onClick={() => {
              if (mode === 'take') { handleMove(); }
              else { setStep(STEP.DELIVER); setCurrentSource(null); setBarcode(''); }
            }}
              className="w-full py-4 bg-primary-600 text-white rounded-2xl font-bold text-base flex items-center justify-center gap-2 active:scale-[0.98] transition-transform">
              {mode === 'take' ? (
                <><ShoppingCart size={18} /> Забрать {totalItems} шт.</>
              ) : (
                <>Куда нести ({totalItems} шт.) <ArrowRight size={18} /></>
              )}
            </button>
          )}
        </div>
      )}

      {/* ═══ SCAN_PRODUCT: scan to count ═══ */}
      {step === STEP.SCAN_PRODUCT && scanningProduct && (
        <div className="space-y-4">
          <div className="bg-primary-50 rounded-2xl p-4 border border-primary-100">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-primary-200 flex items-center justify-center flex-shrink-0">
                <ProductIcon size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900 truncate">{scanningProduct.product_name}</p>
                <p className="text-xs text-gray-400">Доступно: {qty(scanningProduct.quantity)} шт.</p>
              </div>
            </div>
            <div className="bg-white rounded-2xl p-5 text-center">
              <p className="text-xs text-gray-400 mb-2">Отсканировано</p>
              <p className="text-5xl font-black text-primary-700">{scanCount}</p>
              <p className="text-sm text-gray-400 mt-1">шт.</p>
            </div>
          </div>
          <div className="relative">
            <ScanLine size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-primary-400" />
            <input ref={inputRef} value={barcode} onChange={handleBarcodeChange} onKeyDown={handleBarcodeKeyDown}
              placeholder="Сканируйте товар..." autoFocus autoComplete="off"
              className="w-full pl-11 pr-4 py-4 border-2 border-primary-200 rounded-2xl text-center text-lg font-mono tracking-widest focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none bg-primary-50/30" />
          </div>
          <div className="flex items-center justify-center gap-3">
            <button onClick={() => setScanCount(prev => Math.max(0, prev - 1))}
              className="w-12 h-12 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-gray-500 active:scale-95">
              <Minus size={18} />
            </button>
            <span className="text-sm text-gray-400">или вручную</span>
            <button onClick={() => { const maxQ = Math.round(Number(scanningProduct.quantity)); if (scanCount < maxQ || maxQ >= 999999) { setScanCount(p => p + 1); playBeep(true); } else { playBeep(false); setError(`Макс ${maxQ}`); } }}
              className="w-12 h-12 rounded-xl bg-primary-600 text-white flex items-center justify-center active:scale-95">
              <Plus size={18} />
            </button>
          </div>
          <button onClick={finishProductScan}
            className="w-full py-4 bg-green-600 text-white rounded-2xl font-bold text-base flex items-center justify-center gap-2 active:scale-[0.98] shadow-lg shadow-green-200">
            <Check size={20} /> {scanCount > 0 ? `Готово · ${scanCount} шт.` : 'Назад'}
          </button>
        </div>
      )}

      {/* ═══ DELIVER: scan destination ═══ */}
      {step === STEP.DELIVER && (
        <div className="space-y-4">
          <div className="bg-green-50 rounded-2xl p-3 border border-green-100">
            <p className="text-xs font-bold text-green-700 uppercase tracking-wider mb-1">Набрано</p>
            {cart.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2 py-1">
                <ProductIcon size={16} />
                <span className="text-xs text-gray-700 flex-1 truncate">{item.product_name}</span>
                <span className="text-xs font-bold text-green-700">{item.quantity}</span>
              </div>
            ))}
            <div className="border-t border-green-200 mt-1 pt-1 text-right">
              <span className="text-sm font-black text-green-700">{totalItems} шт.</span>
            </div>
          </div>

          <div className="bg-blue-50 rounded-2xl p-5 text-center">
            <ScanLine size={32} className="mx-auto text-blue-500 mb-3" />
            <p className="font-bold text-gray-900">Отсканируйте куда</p>
            <p className="text-xs text-gray-400 mt-1">Полка, паллет или коробка</p>
          </div>
          <div className="relative">
            <ScanLine size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input ref={inputRef} value={barcode} onChange={handleBarcodeChange} onKeyDown={handleBarcodeKeyDown}
              placeholder="Наведите сканер..." autoFocus autoComplete="off"
              className="w-full pl-11 pr-4 py-4 border-2 border-gray-200 rounded-2xl text-center text-lg font-mono tracking-widest focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none" />
            {scanning && <div className="absolute right-4 top-1/2 -translate-y-1/2"><Spinner size="sm" /></div>}
          </div>
        </div>
      )}

      {/* ═══ SCAN_DEST: confirm destination ═══ */}
      {step === STEP.SCAN_DEST && currentDest && (
        <div className="space-y-4">
          <LocationCard data={currentDest} />
          <div className="bg-green-50 rounded-2xl p-4 border border-green-100">
            <p className="text-xs font-bold text-green-700 uppercase tracking-wider mb-3">Перемещается</p>
            {cart.map((item, idx) => (
              <div key={idx} className="flex items-center gap-3 py-2 border-b border-green-100 last:border-0">
                <ProductIcon size={18} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 truncate">{item.product_name}</p>
                  <p className="text-xs text-gray-400">{item.source_name}</p>
                </div>
                <span className="text-sm font-bold text-green-700">{item.quantity} шт.</span>
              </div>
            ))}
            <div className="border-t border-green-200 mt-2 pt-3 flex justify-between items-center">
              <span className="text-xs font-bold text-gray-500">Итого</span>
              <span className="text-xl font-black text-green-700">{totalItems} шт.</span>
            </div>
          </div>
          <button onClick={handleMove} disabled={moving}
            className="w-full py-4 bg-green-600 text-white rounded-2xl font-bold text-base flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] shadow-lg shadow-green-200">
            {moving ? <Spinner size="sm" /> : <Check size={20} />}
            {moving ? 'Перемещение...' : 'Подтвердить'}
          </button>
        </div>
      )}

      {/* Errors & success */}
      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-2xl text-sm text-red-700 font-medium flex items-center gap-2">
          <X size={16} className="flex-shrink-0" /> {error}
        </div>
      )}
      {success && (
        <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-2xl text-sm text-green-700 font-medium flex items-center gap-2">
          <Check size={16} className="flex-shrink-0" /> {success}
        </div>
      )}
    </div>
  );
}

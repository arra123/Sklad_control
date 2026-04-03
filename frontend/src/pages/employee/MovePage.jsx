import { useState, useRef, useEffect, useCallback } from 'react';
import { Package, Check, X, RotateCcw, ArrowLeft, ScanLine, Layers, Box as BoxIcon2 } from 'lucide-react';
import api from '../../api/client';
import { ProductIcon, PalletIcon, ShelfIcon, BoxIcon, EmployeeIcon } from '../../components/ui/WarehouseIcons';
import { qty } from '../../utils/fmt';
import Spinner from '../../components/ui/Spinner';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/ui/Toast';

// ─── Helpers ────────────────────────────────────────────────────────────────

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

function ScanInput({ onScan, placeholder, disabled, autoFocus = true }) {
  const [value, setValue] = useState('');
  const inputRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => { if (autoFocus && inputRef.current) inputRef.current.focus(); }, [autoFocus]);

  const submit = () => {
    const v = value.trim();
    if (v) { onScan(v); setValue(''); }
  };

  const handleChange = (e) => {
    const v = e.target.value;
    setValue(v);
    clearTimeout(timerRef.current);
    if (v.length >= 4) timerRef.current = setTimeout(() => { const s = v.trim(); if (s) { onScan(s); setValue(''); } }, 400);
  };

  return (
    <input
      ref={inputRef}
      value={value}
      onChange={handleChange}
      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
      placeholder={placeholder}
      disabled={disabled}
      className="scan-input w-full px-4 py-3 rounded-2xl border-2 border-dashed border-gray-300 focus:border-primary-400 focus:border-solid bg-white text-center text-lg font-mono transition-colors outline-none"
    />
  );
}

function StatusCard({ icon: Icon, title, subtitle, color = 'bg-gray-50', children }) {
  return (
    <div className={`${color} rounded-2xl p-4 mb-4`}>
      <div className="flex items-center gap-3 mb-1">
        {Icon && <Icon size={20} className="opacity-60" />}
        <div>
          <p className="text-sm font-bold text-gray-900">{title}</p>
          {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function MovePage() {
  const { user } = useAuth();
  const toast = useToast();
  const [mode, setMode] = useState(null); // 'piece' | 'whole'
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Shared state
  const [sourceBox, setSourceBox] = useState(null); // scanned source box data
  const [sourcePallet, setSourcePallet] = useState(null);
  const [cart, setCart] = useState([]); // items picked (for piece mode)
  const [scanCount, setScanCount] = useState(0);
  const [scanningProduct, setScanningProduct] = useState(null);

  const reset = () => {
    setMode(null); setStep(0); setLoading(false);
    setError(''); setSuccess('');
    setSourceBox(null); setSourcePallet(null);
    setCart([]); setScanCount(0); setScanningProduct(null);
  };

  // ─── Scan barcode helper ──────────────────────────────────────────────
  const scanBarcode = async (barcode) => {
    setError('');
    try {
      const res = await api.post('/movements/scan', { barcode });
      return res.data;
    } catch {
      playBeep(false); setError('Не найдено'); return null;
    }
  };

  // ═══════════════════════════════════════════════════════════════════════
  // MODE SELECTION
  // ═══════════════════════════════════════════════════════════════════════
  if (!mode) {
    return (
      <div className="p-4 max-w-md mx-auto">
        <h1 className="text-lg font-bold text-gray-900 mb-1">Перемещение</h1>
        <p className="text-xs text-gray-400 mb-5">Выберите тип перемещения</p>
        <div className="space-y-3">
          <button onClick={() => { setMode('piece'); setStep(1); }}
            className="w-full bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-2xl p-5 text-left shadow-lg shadow-blue-200 hover:shadow-xl transition-all">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
                <ScanLine size={24} />
              </div>
              <div>
                <p className="font-bold text-base">Поштучно</p>
                <p className="text-xs text-blue-100 mt-0.5">Сканировать каждую банку отдельно</p>
              </div>
            </div>
          </button>

          <button onClick={() => { setMode('whole'); setStep(1); }}
            className="w-full bg-gradient-to-br from-purple-500 to-purple-600 text-white rounded-2xl p-5 text-left shadow-lg shadow-purple-200 hover:shadow-xl transition-all">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
                <Layers size={24} />
              </div>
              <div>
                <p className="font-bold text-base">Целая коробка</p>
                <p className="text-xs text-purple-100 mt-0.5">Пересыпать весь товар из коробки</p>
              </div>
            </div>
          </button>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PIECE MODE — поштучный перенос
  // ═══════════════════════════════════════════════════════════════════════
  if (mode === 'piece') {
    // Step 1: Scan source box
    if (step === 1) {
      return (
        <div className="p-4 max-w-md mx-auto">
          <button onClick={reset} className="flex items-center gap-1 text-sm text-gray-400 mb-4"><ArrowLeft size={16} /> Назад</button>
          <StatusCard icon={BoxIcon} title="Шаг 1 из 4" subtitle="Откуда берём" color="bg-blue-50">
            <p className="text-xs text-gray-600 mt-2">Сканируйте коробку откуда хотите взять товар</p>
          </StatusCard>
          {error && <p className="text-red-500 text-xs mb-3">{error}</p>}
          <ScanInput placeholder="Сканируйте коробку..." onScan={async (bc) => {
            const data = await scanBarcode(bc);
            if (!data) return;
            if (data.type !== 'box') { playBeep(false); setError('Сканируйте коробку, не ' + data.type); return; }
            if (!data.contents?.length) { playBeep(false); setError('Коробка пуста'); return; }
            setSourceBox(data);
            playBeep(true);
            setStep(2);
          }} />
        </div>
      );
    }

    // Step 2: Scan individual items from the box
    if (step === 2) {
      const handleProductScan = async (bc) => {
        const data = await scanBarcode(bc);
        if (!data || data.type !== 'product') { playBeep(false); setError('Сканируйте товар (банку)'); return; }
        // Check product is in source box
        const boxItem = sourceBox.contents.find(c => c.product_id === data.id);
        if (!boxItem) { playBeep(false); setError('Этого товара нет в коробке'); return; }
        // Add to cart or increment
        setCart(prev => {
          const existing = prev.find(c => c.product_id === data.id);
          if (existing) {
            if (existing.quantity >= parseFloat(boxItem.quantity)) { playBeep(false); setError('Больше нет в коробке'); return prev; }
            return prev.map(c => c.product_id === data.id ? { ...c, quantity: c.quantity + 1 } : c);
          }
          return [...prev, { product_id: data.id, product_name: data.name, quantity: 1, maxQty: parseFloat(boxItem.quantity) }];
        });
        playBeep(true);
        setError('');
      };

      const totalItems = cart.reduce((s, c) => s + c.quantity, 0);

      return (
        <div className="p-4 max-w-md mx-auto">
          <button onClick={() => { setStep(1); setCart([]); setSourceBox(null); setError(''); }}
            className="flex items-center gap-1 text-sm text-gray-400 mb-4"><ArrowLeft size={16} /> Назад</button>
          <StatusCard icon={BoxIcon} title="Шаг 2 из 4" subtitle={`Забираем из: ${sourceBox?.name}`} color="bg-blue-50">
            <p className="text-xs text-gray-600 mt-2">Сканируйте каждую банку которую берёте</p>
          </StatusCard>
          {error && <p className="text-red-500 text-xs mb-3">{error}</p>}
          <ScanInput placeholder="Сканируйте банку..." onScan={handleProductScan} />
          {cart.length > 0 && (
            <div className="mt-4 space-y-2">
              {cart.map(item => (
                <div key={item.product_id} className="flex items-center justify-between bg-white rounded-xl border border-gray-100 px-3 py-2">
                  <p className="text-sm text-gray-900 truncate flex-1">{item.product_name}</p>
                  <span className="text-sm font-bold text-blue-600 ml-2">{item.quantity} шт</span>
                </div>
              ))}
              <button onClick={async () => {
                setLoading(true);
                try {
                  for (const item of cart) {
                    await api.post('/movements/move', {
                      product_id: item.product_id, quantity: item.quantity,
                      source_type: 'box', source_id: sourceBox.id,
                      dest_type: 'employee', dest_id: user.employee_id,
                    });
                  }
                  playBeep(true);
                  toast.success(`Забрали ${totalItems} шт.`);
                  setStep(3);
                } catch (err) {
                  playBeep(false); setError(err.response?.data?.error || 'Ошибка');
                } finally { setLoading(false); }
              }} disabled={loading}
                className="w-full py-3 rounded-2xl bg-blue-500 text-white font-bold text-sm hover:bg-blue-600 disabled:opacity-50 transition-colors">
                {loading ? 'Забираем...' : `Забрать ${totalItems} шт.`}
              </button>
            </div>
          )}
        </div>
      );
    }

    // Step 3: Scan destination box
    if (step === 3) {
      return (
        <div className="p-4 max-w-md mx-auto">
          <StatusCard icon={BoxIcon} title="Шаг 3 из 4" subtitle="Куда кладём" color="bg-green-50">
            <p className="text-xs text-gray-600 mt-2">Сканируйте коробку куда кладёте товар</p>
          </StatusCard>
          {error && <p className="text-red-500 text-xs mb-3">{error}</p>}
          <ScanInput placeholder="Сканируйте коробку назначения..." onScan={async (bc) => {
            const data = await scanBarcode(bc);
            if (!data) return;
            if (data.type !== 'box') { playBeep(false); setError('Сканируйте коробку'); return; }
            setLoading(true);
            try {
              for (const item of cart) {
                await api.post('/movements/move', {
                  product_id: item.product_id, quantity: item.quantity,
                  source_type: 'employee', source_id: user.employee_id,
                  dest_type: 'box', dest_id: data.id,
                });
              }
              playBeep(true);
              setSuccess(`Перемещено ${cart.reduce((s, c) => s + c.quantity, 0)} шт. в ${data.name}`);
              setStep(4);
            } catch (err) {
              playBeep(false); setError(err.response?.data?.error || 'Ошибка');
            } finally { setLoading(false); }
          }} />
        </div>
      );
    }

    // Step 4: Done
    if (step === 4) {
      return (
        <div className="p-4 max-w-md mx-auto text-center py-12">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <Check size={32} className="text-green-600" />
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">Готово!</h2>
          <p className="text-sm text-gray-500 mb-6">{success}</p>
          <button onClick={reset} className="px-6 py-2.5 rounded-xl bg-primary-500 text-white font-semibold text-sm hover:bg-primary-600">Новое перемещение</button>
        </div>
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // WHOLE BOX MODE — пересыпка целой коробки
  // ═══════════════════════════════════════════════════════════════════════
  if (mode === 'whole') {
    // Step 1: Scan source pallet
    if (step === 1) {
      return (
        <div className="p-4 max-w-md mx-auto">
          <button onClick={reset} className="flex items-center gap-1 text-sm text-gray-400 mb-4"><ArrowLeft size={16} /> Назад</button>
          <StatusCard icon={PalletIcon} title="Шаг 1 из 4" subtitle="Откуда берём" color="bg-purple-50">
            <p className="text-xs text-gray-600 mt-2">Сканируйте паллет где лежит коробка</p>
          </StatusCard>
          {error && <p className="text-red-500 text-xs mb-3">{error}</p>}
          <ScanInput placeholder="Сканируйте паллет..." onScan={async (bc) => {
            const data = await scanBarcode(bc);
            if (!data) return;
            if (data.type !== 'pallet') { playBeep(false); setError('Сканируйте паллет'); return; }
            setSourcePallet(data);
            playBeep(true);
            setStep(2);
          }} />
        </div>
      );
    }

    // Step 2: Scan box on that pallet → take all contents
    if (step === 2) {
      return (
        <div className="p-4 max-w-md mx-auto">
          <button onClick={() => { setStep(1); setSourcePallet(null); setError(''); }}
            className="flex items-center gap-1 text-sm text-gray-400 mb-4"><ArrowLeft size={16} /> Назад</button>
          <StatusCard icon={BoxIcon} title="Шаг 2 из 4" subtitle={`Паллет: ${sourcePallet?.name}`} color="bg-purple-50">
            <p className="text-xs text-gray-600 mt-2">Сканируйте коробку — весь товар перейдёт к вам</p>
          </StatusCard>
          {error && <p className="text-red-500 text-xs mb-3">{error}</p>}
          {loading && <div className="flex justify-center py-8"><Spinner size="lg" /></div>}
          <ScanInput placeholder="Сканируйте коробку..." disabled={loading} onScan={async (bc) => {
            const data = await scanBarcode(bc);
            if (!data) return;
            if (data.type !== 'box') { playBeep(false); setError('Сканируйте коробку'); return; }
            setLoading(true);
            try {
              const res = await api.post('/movements/take-box-contents', { box_id: data.id });
              setSourceBox({ ...data, palletName: sourcePallet?.name, palletId: sourcePallet?.id, takenQty: res.data.total_qty });
              playBeep(true);
              toast.success(`Забрали ${res.data.total_qty} шт. из коробки`);
              setStep(3);
            } catch (err) {
              playBeep(false); setError(err.response?.data?.error || 'Ошибка');
            } finally { setLoading(false); }
          }} />
        </div>
      );
    }

    // Step 3: Scan destination box → put all contents
    if (step === 3) {
      return (
        <div className="p-4 max-w-md mx-auto">
          <StatusCard icon={BoxIcon} title="Шаг 3 из 4" subtitle={`У вас ${sourceBox?.takenQty} шт.`} color="bg-green-50">
            <p className="text-xs text-gray-600 mt-2">Сканируйте коробку куда пересыпаете</p>
          </StatusCard>
          {error && <p className="text-red-500 text-xs mb-3">{error}</p>}
          {loading && <div className="flex justify-center py-8"><Spinner size="lg" /></div>}
          <ScanInput placeholder="Сканируйте коробку назначения..." disabled={loading} onScan={async (bc) => {
            const data = await scanBarcode(bc);
            if (!data) return;
            if (data.type !== 'box') { playBeep(false); setError('Сканируйте коробку'); return; }
            setLoading(true);
            try {
              await api.post('/movements/put-to-box', { box_id: data.id });
              playBeep(true);
              toast.success('Товар пересыпан в коробку');
              setStep(4);
            } catch (err) {
              playBeep(false); setError(err.response?.data?.error || 'Ошибка');
            } finally { setLoading(false); }
          }} />
        </div>
      );
    }

    // Step 4: Return empty box — instruction + scan pallet
    if (step === 4) {
      return (
        <div className="p-4 max-w-md mx-auto">
          <StatusCard icon={RotateCcw} title="Шаг 4 из 4" subtitle="Верните пустую коробку" color="bg-amber-50">
            <div className="mt-2 bg-white rounded-xl p-3 border border-amber-200">
              <p className="text-xs text-gray-600">Верните коробку <b>{sourceBox?.name}</b> на паллет <b>{sourceBox?.palletName}</b></p>
            </div>
            <p className="text-xs text-gray-500 mt-2">Сканируйте паллет куда вернули коробку</p>
          </StatusCard>
          {error && <p className="text-red-500 text-xs mb-3">{error}</p>}
          {loading && <div className="flex justify-center py-8"><Spinner size="lg" /></div>}
          <ScanInput placeholder="Сканируйте паллет..." disabled={loading} onScan={async (bc) => {
            const data = await scanBarcode(bc);
            if (!data) return;
            if (data.type !== 'pallet') { playBeep(false); setError('Сканируйте паллет'); return; }
            // Move empty box to scanned pallet
            setLoading(true);
            try {
              await api.post('/movements/move-box', { box_id: sourceBox.id, dest_pallet_id: data.id });
              playBeep(true);
              setSuccess('Коробка возвращена');
              setStep(5);
            } catch (err) {
              // Box might already be on this pallet — that's OK
              if (err.response?.data?.error?.includes('уже на этом')) {
                playBeep(true);
                setSuccess('Коробка на месте');
                setStep(5);
              } else {
                playBeep(false); setError(err.response?.data?.error || 'Ошибка');
              }
            } finally { setLoading(false); }
          }} />
          <button onClick={() => { setSuccess('Коробка оставлена'); setStep(5); }}
            className="w-full mt-3 py-2 rounded-xl border border-gray-200 text-gray-500 text-xs font-medium hover:bg-gray-50">
            Пропустить (коробка осталась)
          </button>
        </div>
      );
    }

    // Step 5: Done
    if (step === 5) {
      return (
        <div className="p-4 max-w-md mx-auto text-center py-12">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <Check size={32} className="text-green-600" />
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">Готово!</h2>
          <p className="text-sm text-gray-500 mb-6">{success || 'Перемещение завершено'}</p>
          <button onClick={reset} className="px-6 py-2.5 rounded-xl bg-primary-500 text-white font-semibold text-sm hover:bg-primary-600">Новое перемещение</button>
        </div>
      );
    }
  }

  return null;
}

import { useState, useRef, useEffect } from 'react';
import { Check, ArrowLeft, ScanLine, Layers, Box as BoxIcon2, ArrowRightLeft, Package } from 'lucide-react';
import api from '../../api/client';
import { PalletIcon, BoxIcon } from '../../components/ui/WarehouseIcons';
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

// ─── Animated Scan Input ────────────────────────────────────────────────────

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
    <div className="relative">
      <div className="absolute inset-0 rounded-2xl bg-primary-400/20 animate-pulse-slow pointer-events-none" />
      <input
        ref={inputRef}
        value={value}
        onChange={handleChange}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
        placeholder={placeholder}
        disabled={disabled}
        className="scan-input relative w-full px-4 py-4 rounded-2xl border-2 border-dashed border-primary-300 focus:border-primary-500 focus:border-solid bg-white text-center text-lg font-mono transition-all outline-none disabled:opacity-40"
      />
    </div>
  );
}

// ─── Step Progress Bar ──────────────────────────────────────────────────────

function StepProgress({ current, total, color = 'bg-blue-500' }) {
  return (
    <div className="flex gap-1.5 mb-5">
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${
          i < current ? color : i === current ? color + ' animate-pulse' : 'bg-gray-200'
        }`} />
      ))}
    </div>
  );
}

// ─── Big Visual Hint ────────────────────────────────────────────────────────

function ScanHint({ icon: Icon, title, subtitle, color = 'blue', animateIcon = true }) {
  const colorMap = {
    blue: { bg: 'bg-blue-50', icon: 'bg-blue-100 text-blue-600', ring: 'ring-blue-200' },
    purple: { bg: 'bg-purple-50', icon: 'bg-purple-100 text-purple-600', ring: 'ring-purple-200' },
    green: { bg: 'bg-green-50', icon: 'bg-green-100 text-green-600', ring: 'ring-green-200' },
    amber: { bg: 'bg-amber-50', icon: 'bg-amber-100 text-amber-600', ring: 'ring-amber-200' },
    indigo: { bg: 'bg-indigo-50', icon: 'bg-indigo-100 text-indigo-600', ring: 'ring-indigo-200' },
  };
  const c = colorMap[color] || colorMap.blue;
  return (
    <div className={`${c.bg} rounded-2xl p-6 mb-5 text-center animate-fade-in`}>
      <div className={`w-20 h-20 rounded-2xl ${c.icon} ring-4 ${c.ring} flex items-center justify-center mx-auto mb-4 ${animateIcon ? 'animate-bounce-gentle' : ''}`}>
        <Icon size={36} />
      </div>
      <h2 className="text-lg font-bold text-gray-900 mb-1">{title}</h2>
      <p className="text-sm text-gray-500">{subtitle}</p>
    </div>
  );
}

// ─── Error Banner ───────────────────────────────────────────────────────────

function ErrorBanner({ message }) {
  if (!message) return null;
  return (
    <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4 flex items-center gap-3 animate-shake">
      <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0">
        <span className="text-red-500 text-lg font-bold">!</span>
      </div>
      <p className="text-sm text-red-700 font-medium">{message}</p>
    </div>
  );
}

// ─── Info Tag ───────────────────────────────────────────────────────────────

function InfoTag({ label, value, color = 'blue' }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  };
  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium ${colors[color] || colors.blue}`}>
      <span className="opacity-60">{label}:</span> <span className="font-bold">{value}</span>
    </div>
  );
}

// ─── Success Screen ─────────────────────────────────────────────────────────

function SuccessScreen({ message, onReset }) {
  return (
    <div className="p-4 max-w-md mx-auto text-center py-16 animate-fade-in">
      <div className="w-20 h-20 rounded-full bg-green-100 ring-4 ring-green-200 flex items-center justify-center mx-auto mb-5 animate-bounce-in">
        <Check size={40} className="text-green-600" />
      </div>
      <h2 className="text-xl font-bold text-gray-900 mb-2">Готово!</h2>
      <p className="text-sm text-gray-500 mb-8">{message || 'Перемещение завершено'}</p>
      <button onClick={onReset} className="px-8 py-3 rounded-2xl bg-primary-500 text-white font-bold text-sm hover:bg-primary-600 shadow-lg shadow-primary-200 transition-all active:scale-95">
        Новое перемещение
      </button>
    </div>
  );
}

// ─── CSS Animations (injected once) ─────────────────────────────────────────

const styleId = 'move-page-animations';
if (typeof document !== 'undefined' && !document.getElementById(styleId)) {
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    @keyframes fade-in { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes bounce-gentle { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
    @keyframes bounce-in { 0% { transform: scale(0.3); opacity: 0; } 50% { transform: scale(1.1); } 100% { transform: scale(1); opacity: 1; } }
    @keyframes shake { 0%, 100% { transform: translateX(0); } 15%, 45%, 75% { transform: translateX(-4px); } 30%, 60%, 90% { transform: translateX(4px); } }
    @keyframes pulse-slow { 0%, 100% { opacity: 0; } 50% { opacity: 1; } }
    .animate-fade-in { animation: fade-in 0.4s ease-out; }
    .animate-bounce-gentle { animation: bounce-gentle 2s ease-in-out infinite; }
    .animate-bounce-in { animation: bounce-in 0.5s ease-out; }
    .animate-shake { animation: shake 0.4s ease-in-out; }
    .animate-pulse-slow { animation: pulse-slow 2.5s ease-in-out infinite; }
  `;
  document.head.appendChild(style);
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function MovePage() {
  const { user } = useAuth();
  const toast = useToast();
  const [mode, setMode] = useState(null); // 'piece' | 'whole' | 'box_transfer'
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Shared state
  const [sourceBox, setSourceBox] = useState(null);
  const [sourcePallet, setSourcePallet] = useState(null);
  const [cart, setCart] = useState([]);

  const reset = () => {
    setMode(null); setStep(0); setLoading(false);
    setError(''); setSuccess('');
    setSourceBox(null); setSourcePallet(null);
    setCart([]);
  };

  const scanBarcode = async (barcode) => {
    setError('');
    try {
      const res = await api.post('/movements/scan', { barcode });
      return res.data;
    } catch {
      playBeep(false); setError('Не найдено по этому штрих-коду'); return null;
    }
  };

  // ═══════════════════════════════════════════════════════════════════════
  // MODE SELECTION
  // ═══════════════════════════════════════════════════════════════════════
  if (!mode) {
    return (
      <div className="p-4 max-w-md mx-auto animate-fade-in">
        <h1 className="text-xl font-bold text-gray-900 mb-1">Перемещение</h1>
        <p className="text-sm text-gray-400 mb-6">Выберите тип перемещения</p>
        <div className="space-y-3">
          <button onClick={() => { setMode('piece'); setStep(1); }}
            className="w-full bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-2xl p-5 text-left shadow-lg shadow-blue-200 hover:shadow-xl hover:scale-[1.02] transition-all active:scale-[0.98]">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-white/20 flex items-center justify-center">
                <ScanLine size={28} />
              </div>
              <div>
                <p className="font-bold text-base">Поштучно</p>
                <p className="text-xs text-blue-100 mt-0.5">Сканировать каждую банку отдельно</p>
              </div>
            </div>
          </button>

          <button onClick={() => { setMode('whole'); setStep(1); }}
            className="w-full bg-gradient-to-br from-purple-500 to-purple-600 text-white rounded-2xl p-5 text-left shadow-lg shadow-purple-200 hover:shadow-xl hover:scale-[1.02] transition-all active:scale-[0.98]">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-white/20 flex items-center justify-center">
                <Layers size={28} />
              </div>
              <div>
                <p className="font-bold text-base">Целая коробка</p>
                <p className="text-xs text-purple-100 mt-0.5">Пересыпать весь товар из коробки в другую</p>
              </div>
            </div>
          </button>

          <button onClick={() => { setMode('box_transfer'); setStep(1); }}
            className="w-full bg-gradient-to-br from-indigo-500 to-indigo-600 text-white rounded-2xl p-5 text-left shadow-lg shadow-indigo-200 hover:shadow-xl hover:scale-[1.02] transition-all active:scale-[0.98]">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-white/20 flex items-center justify-center">
                <ArrowRightLeft size={28} />
              </div>
              <div>
                <p className="font-bold text-base">Перенести коробку</p>
                <p className="text-xs text-indigo-100 mt-0.5">Переместить коробку целиком на другой паллет</p>
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
    const totalSteps = 4;

    // Step 1: Scan source box
    if (step === 1) {
      return (
        <div className="p-4 max-w-md mx-auto animate-fade-in" key="piece-1">
          <button onClick={reset} className="flex items-center gap-1 text-sm text-gray-400 mb-3"><ArrowLeft size={16} /> Назад</button>
          <StepProgress current={0} total={totalSteps} color="bg-blue-500" />
          <ScanHint icon={BoxIcon} title="Сканируйте коробку" subtitle="Коробка, откуда хотите взять товар" color="blue" />
          <ErrorBanner message={error} />
          <ScanInput placeholder="Наведите сканер на коробку..." onScan={async (bc) => {
            const data = await scanBarcode(bc);
            if (!data) return;
            if (data.type !== 'box') { playBeep(false); setError(`Это ${data.type === 'pallet' ? 'паллет' : data.type === 'shelf' ? 'полка' : 'товар'}, а нужна коробка`); return; }
            if (!data.contents?.length) { playBeep(false); setError('Коробка пуста — выберите другую'); return; }
            setSourceBox(data);
            playBeep(true);
            setStep(2);
          }} />
        </div>
      );
    }

    // Step 2: Scan products
    if (step === 2) {
      const handleProductScan = async (bc) => {
        const data = await scanBarcode(bc);
        if (!data || data.type !== 'product') { playBeep(false); setError('Сканируйте товар (банку), а не коробку или паллет'); return; }
        const boxItem = sourceBox.contents.find(c => c.product_id === data.id);
        if (!boxItem) { playBeep(false); setError('Этого товара нет в данной коробке'); return; }
        setCart(prev => {
          const existing = prev.find(c => c.product_id === data.id);
          if (existing) {
            if (existing.quantity >= parseFloat(boxItem.quantity)) { playBeep(false); setError('Всё количество уже набрано'); return prev; }
            return prev.map(c => c.product_id === data.id ? { ...c, quantity: c.quantity + 1 } : c);
          }
          return [...prev, { product_id: data.id, product_name: data.name, quantity: 1, maxQty: parseFloat(boxItem.quantity) }];
        });
        playBeep(true);
        setError('');
      };

      const totalItems = cart.reduce((s, c) => s + c.quantity, 0);

      return (
        <div className="p-4 max-w-md mx-auto animate-fade-in" key="piece-2">
          <button onClick={() => { setStep(1); setCart([]); setSourceBox(null); setError(''); }}
            className="flex items-center gap-1 text-sm text-gray-400 mb-3"><ArrowLeft size={16} /> Назад</button>
          <StepProgress current={1} total={totalSteps} color="bg-blue-500" />
          <ScanHint icon={Package} title="Сканируйте банки" subtitle="Каждую банку, которую забираете из коробки" color="blue" />
          <div className="mb-4">
            <InfoTag label="Из коробки" value={sourceBox?.name} color="blue" />
          </div>
          <ErrorBanner message={error} />
          <ScanInput placeholder="Наведите сканер на банку..." onScan={handleProductScan} />
          {cart.length > 0 && (
            <div className="mt-4 space-y-2 animate-fade-in">
              {cart.map(item => (
                <div key={item.product_id} className="flex items-center justify-between bg-white rounded-xl border border-gray-100 px-4 py-3 shadow-sm">
                  <p className="text-sm text-gray-900 truncate flex-1">{item.product_name}</p>
                  <span className="text-sm font-bold text-blue-600 ml-2 bg-blue-50 px-2 py-0.5 rounded-lg">{item.quantity} / {item.maxQty}</span>
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
                  playBeep(false); setError(err.response?.data?.error || 'Ошибка при перемещении');
                } finally { setLoading(false); }
              }} disabled={loading}
                className="w-full py-3.5 rounded-2xl bg-blue-500 text-white font-bold text-sm hover:bg-blue-600 disabled:opacity-50 transition-all shadow-lg shadow-blue-200 active:scale-[0.98]">
                {loading ? <Spinner size="sm" className="mx-auto" /> : `Забрать ${totalItems} шт.`}
              </button>
            </div>
          )}
        </div>
      );
    }

    // Step 3: Scan destination box
    if (step === 3) {
      return (
        <div className="p-4 max-w-md mx-auto animate-fade-in" key="piece-3">
          <StepProgress current={2} total={totalSteps} color="bg-blue-500" />
          <ScanHint icon={BoxIcon} title="Куда кладём?" subtitle="Сканируйте коробку назначения" color="green" />
          <ErrorBanner message={error} />
          <ScanInput placeholder="Наведите сканер на коробку..." onScan={async (bc) => {
            const data = await scanBarcode(bc);
            if (!data) return;
            if (data.type !== 'box') { playBeep(false); setError(`Это ${data.type === 'pallet' ? 'паллет' : 'не коробка'} — сканируйте коробку`); return; }
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
              playBeep(false); setError(err.response?.data?.error || 'Ошибка при перемещении');
            } finally { setLoading(false); }
          }} />
          {loading && <div className="flex justify-center py-6"><Spinner size="lg" /></div>}
        </div>
      );
    }

    // Step 4: Done
    if (step === 4) return <SuccessScreen message={success} onReset={reset} />;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // WHOLE BOX MODE — пересыпка целой коробки
  // ═══════════════════════════════════════════════════════════════════════
  if (mode === 'whole') {
    const totalSteps = 4;

    // Step 1: Scan source pallet
    if (step === 1) {
      return (
        <div className="p-4 max-w-md mx-auto animate-fade-in" key="whole-1">
          <button onClick={reset} className="flex items-center gap-1 text-sm text-gray-400 mb-3"><ArrowLeft size={16} /> Назад</button>
          <StepProgress current={0} total={totalSteps} color="bg-purple-500" />
          <ScanHint icon={PalletIcon} title="Сканируйте паллет" subtitle="Паллет, на котором стоит нужная коробка" color="purple" />
          <ErrorBanner message={error} />
          <ScanInput placeholder="Наведите сканер на паллет..." onScan={async (bc) => {
            const data = await scanBarcode(bc);
            if (!data) return;
            if (data.type !== 'pallet') { playBeep(false); setError(`Это ${data.type === 'box' ? 'коробка' : 'не паллет'} — нужен паллет`); return; }
            setSourcePallet(data);
            playBeep(true);
            setStep(2);
          }} />
        </div>
      );
    }

    // Step 2: Scan box → take all contents
    if (step === 2) {
      return (
        <div className="p-4 max-w-md mx-auto animate-fade-in" key="whole-2">
          <button onClick={() => { setStep(1); setSourcePallet(null); setError(''); }}
            className="flex items-center gap-1 text-sm text-gray-400 mb-3"><ArrowLeft size={16} /> Назад</button>
          <StepProgress current={1} total={totalSteps} color="bg-purple-500" />
          <ScanHint icon={BoxIcon} title="Сканируйте коробку" subtitle="Весь товар из неё перейдёт к вам" color="purple" />
          <div className="mb-4">
            <InfoTag label="Паллет" value={sourcePallet?.name} color="purple" />
          </div>
          <ErrorBanner message={error} />
          {loading && <div className="flex justify-center py-6"><Spinner size="lg" /></div>}
          <ScanInput placeholder="Наведите сканер на коробку..." disabled={loading} onScan={async (bc) => {
            const data = await scanBarcode(bc);
            if (!data) return;
            if (data.type !== 'box') { playBeep(false); setError(`Это не коробка — сканируйте коробку на паллете`); return; }
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
        <div className="p-4 max-w-md mx-auto animate-fade-in" key="whole-3">
          <StepProgress current={2} total={totalSteps} color="bg-purple-500" />
          <ScanHint icon={BoxIcon} title="Куда пересыпаем?" subtitle="Сканируйте коробку назначения" color="green" />
          <div className="flex gap-2 mb-4 flex-wrap">
            <InfoTag label="У вас" value={`${sourceBox?.takenQty} шт.`} color="purple" />
            <InfoTag label="Из" value={sourceBox?.name} color="purple" />
          </div>
          <ErrorBanner message={error} />
          {loading && <div className="flex justify-center py-6"><Spinner size="lg" /></div>}
          <ScanInput placeholder="Наведите сканер на коробку..." disabled={loading} onScan={async (bc) => {
            const data = await scanBarcode(bc);
            if (!data) return;
            if (data.type !== 'box') { playBeep(false); setError('Сканируйте коробку'); return; }
            setLoading(true);
            try {
              await api.post('/movements/put-to-box', { box_id: data.id });
              playBeep(true);
              toast.success('Товар пересыпан');
              // Ask to return empty box
              setStep(4);
            } catch (err) {
              playBeep(false); setError(err.response?.data?.error || 'Ошибка');
            } finally { setLoading(false); }
          }} />
        </div>
      );
    }

    // Step 4: Return empty box
    if (step === 4) {
      return (
        <div className="p-4 max-w-md mx-auto animate-fade-in" key="whole-4">
          <StepProgress current={3} total={totalSteps} color="bg-purple-500" />
          <ScanHint icon={PalletIcon} title="Верните коробку" subtitle={`Поставьте ${sourceBox?.name} обратно на паллет`} color="amber" />
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4">
            <p className="text-sm text-amber-800 font-medium text-center">
              Верните коробку <b>{sourceBox?.name}</b> на паллет <b>{sourceBox?.palletName}</b>
            </p>
          </div>
          <ErrorBanner message={error} />
          {loading && <div className="flex justify-center py-6"><Spinner size="lg" /></div>}
          <ScanInput placeholder="Сканируйте паллет куда вернули..." disabled={loading} onScan={async (bc) => {
            const data = await scanBarcode(bc);
            if (!data) return;
            if (data.type !== 'pallet') { playBeep(false); setError('Сканируйте паллет, а не коробку'); return; }
            setLoading(true);
            try {
              await api.post('/movements/move-box', { box_id: sourceBox.id, dest_pallet_id: data.id });
              playBeep(true);
              setSuccess('Коробка возвращена на паллет');
              setStep(5);
            } catch (err) {
              if (err.response?.data?.error?.includes('уже на этом')) {
                playBeep(true);
                setSuccess('Коробка на месте');
                setStep(5);
              } else {
                playBeep(false); setError(err.response?.data?.error || 'Ошибка');
              }
            } finally { setLoading(false); }
          }} />
          <button onClick={() => { setSuccess('Перемещение завершено'); setStep(5); }}
            className="w-full mt-3 py-2.5 rounded-xl border border-gray-200 text-gray-500 text-sm font-medium hover:bg-gray-50 transition-colors">
            Пропустить
          </button>
        </div>
      );
    }

    // Step 5: Done
    if (step === 5) return <SuccessScreen message={success} onReset={reset} />;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // BOX TRANSFER MODE — перенос коробки целиком на другой паллет
  // ═══════════════════════════════════════════════════════════════════════
  if (mode === 'box_transfer') {
    const totalSteps = 3;

    // Step 1: Scan source pallet
    if (step === 1) {
      return (
        <div className="p-4 max-w-md mx-auto animate-fade-in" key="bt-1">
          <button onClick={reset} className="flex items-center gap-1 text-sm text-gray-400 mb-3"><ArrowLeft size={16} /> Назад</button>
          <StepProgress current={0} total={totalSteps} color="bg-indigo-500" />
          <ScanHint icon={PalletIcon} title="Откуда берём коробку?" subtitle="Сканируйте паллет, на котором стоит коробка" color="indigo" />
          <ErrorBanner message={error} />
          <ScanInput placeholder="Наведите сканер на паллет..." onScan={async (bc) => {
            const data = await scanBarcode(bc);
            if (!data) return;
            if (data.type !== 'pallet') { playBeep(false); setError(`Это не паллет — сканируйте паллет`); return; }
            setSourcePallet(data);
            playBeep(true);
            setStep(2);
          }} />
        </div>
      );
    }

    // Step 2: Scan box on that pallet
    if (step === 2) {
      return (
        <div className="p-4 max-w-md mx-auto animate-fade-in" key="bt-2">
          <button onClick={() => { setStep(1); setSourcePallet(null); setError(''); }}
            className="flex items-center gap-1 text-sm text-gray-400 mb-3"><ArrowLeft size={16} /> Назад</button>
          <StepProgress current={1} total={totalSteps} color="bg-indigo-500" />
          <ScanHint icon={BoxIcon} title="Какую коробку переносим?" subtitle="Сканируйте коробку, которую хотите переставить" color="indigo" />
          <div className="mb-4">
            <InfoTag label="Паллет" value={sourcePallet?.name} color="indigo" />
          </div>
          <ErrorBanner message={error} />
          <ScanInput placeholder="Наведите сканер на коробку..." onScan={async (bc) => {
            const data = await scanBarcode(bc);
            if (!data) return;
            if (data.type !== 'box') { playBeep(false); setError('Это не коробка — сканируйте коробку'); return; }
            setSourceBox(data);
            playBeep(true);
            setStep(3);
          }} />
        </div>
      );
    }

    // Step 3: Scan destination pallet
    if (step === 3) {
      return (
        <div className="p-4 max-w-md mx-auto animate-fade-in" key="bt-3">
          <StepProgress current={2} total={totalSteps} color="bg-indigo-500" />
          <ScanHint icon={PalletIcon} title="Куда ставим коробку?" subtitle="Сканируйте паллет назначения" color="green" />
          <div className="flex gap-2 mb-4 flex-wrap">
            <InfoTag label="Коробка" value={sourceBox?.name} color="indigo" />
            <InfoTag label="С паллета" value={sourcePallet?.name} color="indigo" />
          </div>
          <ErrorBanner message={error} />
          {loading && <div className="flex justify-center py-6"><Spinner size="lg" /></div>}
          <ScanInput placeholder="Наведите сканер на паллет..." disabled={loading} onScan={async (bc) => {
            const data = await scanBarcode(bc);
            if (!data) return;
            if (data.type !== 'pallet') { playBeep(false); setError('Сканируйте паллет, а не коробку'); return; }
            setLoading(true);
            try {
              await api.post('/movements/move-box', { box_id: sourceBox.id, dest_pallet_id: data.id });
              playBeep(true);
              setSuccess(`Коробка ${sourceBox?.name} перенесена на ${data.name}`);
              setStep(4);
            } catch (err) {
              playBeep(false); setError(err.response?.data?.error || 'Ошибка');
            } finally { setLoading(false); }
          }} />
        </div>
      );
    }

    // Step 4: Done
    if (step === 4) return <SuccessScreen message={success} onReset={reset} />;
  }

  return null;
}

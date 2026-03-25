import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Package, Box, CheckCircle2, Printer,
  RefreshCw, ScanLine, AlertCircle, ChevronRight
} from 'lucide-react';
import { ProductIcon } from '../../components/ui/WarehouseIcons';
import { printBarcode } from '../../utils/printBarcode';
import api from '../../api/client';
import { qty } from '../../utils/fmt';
import Spinner from '../../components/ui/Spinner';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Barcode from '../../components/ui/Barcode';
import CopyBadge from '../../components/ui/CopyBadge';
import { useToast } from '../../components/ui/Toast';
import { useAppSettings } from '../../context/AppSettingsContext';

// playBeep создаётся с параметрами из настроек
function makePlayBeep(s) {
  return function playBeep(ok = true) {
    if (!s.scan_sound_enabled) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = ok ? s.scan_sound_freq_ok : s.scan_sound_freq_err;
      osc.type = 'sine';
      const dur = (ok ? s.scan_sound_dur_ok : s.scan_sound_dur_err) / 1000;
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + dur);
    } catch (e) {}
  };
}

function makeSpeedColor(fast, slow) {
  return (s) => s < fast ? 'text-green-500' : s < slow ? 'text-amber-500' : 'text-red-400';
}

// ─── Шаг 1: Сканировать паллет для начала ─────────────────────────────────────
function StepScanPallet({ task, onSuccess }) {
  const toast = useToast();
  const { settings } = useAppSettings();
  const playBeep = makePlayBeep(settings);
  const inputRef = useRef(null);
  const timerRef = useRef(null);
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const palletLabel = task.row_number && task.pallet_number
    ? `Р${task.row_number}П${task.pallet_number}`
    : task.pallet_name || '—';

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 100); }, []);

  const doScan = useCallback(async (val) => {
    if (!val.trim() || loading) return;
    setLoading(true); setError('');
    try {
      await api.post(`/packing/${task.id}/start`, { pallet_barcode: val.trim() });
      playBeep(true);
      onSuccess();
    } catch (err) {
      playBeep(false);
      setError(err.response?.data?.error || 'Ошибка');
      setValue('');
      setTimeout(() => inputRef.current?.focus(), 100);
    } finally { setLoading(false); }
  }, [task.id, loading]);

  const handleChange = (e) => {
    const v = e.target.value; setValue(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (v.trim().length >= 4) timerRef.current = setTimeout(() => doScan(v), 350);
  };

  return (
    <div className="space-y-6">
      {/* Инструкция */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-primary-50 flex items-center justify-center flex-shrink-0">
            <ProductIcon size={24} />
          </div>
          <div>
            <p className="text-xs text-gray-400 font-medium">Задание</p>
            <p className="font-bold text-gray-900 leading-tight">{task.title}</p>
          </div>
        </div>
        {task.product_name && (
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-xs text-gray-400 mb-0.5">Товар</p>
            <p className="font-semibold text-gray-900">{task.product_name}</p>
            {task.box_size && <p className="text-xs text-gray-500 mt-0.5">{task.box_size} шт. в коробке</p>}
          </div>
        )}
      </div>

      {/* Шаги */}
      <div className="card p-5 space-y-4">
        <p className="text-sm font-bold text-gray-700 uppercase tracking-wide">Что делать</p>
        <Step num={1} active text={`Подойдите к паллету`} sub={<span className="font-bold text-primary-700">{palletLabel}</span>} />
        <Step num={2} text="Найдите штрих-код на паллете" />
        <Step num={3} text="Отсканируйте штрих-код паллета" />
      </div>

      {/* Скан */}
      <div className="card p-5 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <ScanLine size={18} className="text-primary-500" />
          <p className="font-semibold text-gray-800">Сканируйте паллет</p>
        </div>
        <input
          ref={inputRef}
          type="text" value={value}
          onChange={handleChange}
          onKeyDown={e => { if (e.key === 'Enter') { if (timerRef.current) clearTimeout(timerRef.current); doScan(value); } }}
          placeholder="Поднесите сканер к паллету..."
          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-base
            placeholder:text-gray-400 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 focus:outline-none"
          disabled={loading} autoComplete="off"
        />
        {error && (
          <div className="flex items-start gap-2 p-3 bg-red-50 rounded-xl text-sm text-red-700">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            <p>{error}</p>
          </div>
        )}
        <Button variant="primary" size="lg" className="w-full" loading={loading} onClick={() => doScan(value)}>
          Подтвердить
        </Button>
      </div>
    </div>
  );
}

// ─── Шаг 2: Открыть новую коробку ─────────────────────────────────────────────
function StepOpenBox({ task, stats, onOpen }) {
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const palletLabel = task.row_number && task.pallet_number
    ? `Р${task.row_number}П${task.pallet_number}` : task.pallet_name || '—';

  const handleOpen = async () => {
    setLoading(true);
    try { await onOpen(); }
    catch (err) { toast.error(err.response?.data?.error || 'Ошибка'); setLoading(false); }
  };

  return (
    <div className="space-y-5">
      {stats && parseInt(stats.closed_boxes) > 0 && (
        <div className="card p-4 flex items-center gap-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-green-600">{stats.closed_boxes}</p>
            <p className="text-xs text-gray-400">коробок</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-primary-600">{stats.closed_qty}</p>
            <p className="text-xs text-gray-400">штук</p>
          </div>
        </div>
      )}

      <div className="card p-5 space-y-4">
        <p className="text-sm font-bold text-gray-700 uppercase tracking-wide">Что делать</p>
        <Step num={1} active text="Возьмите пустую коробку" />
        <Step num={2} text="Нажмите кнопку ниже — система создаст этикетку" />
        <Step num={3} text="Распечатайте этикетку, наклейте на коробку" />
        <Step num={4} text="Отсканируйте этикетку на коробке" />
      </div>

      <Button variant="primary" size="xl" className="w-full" loading={loading} onClick={handleOpen}>
        <Box size={20} />
        Открыть новую коробку
      </Button>

      <Button variant="success" size="lg" className="w-full" onClick={() => {
        if (confirm('Завершить задачу? Все коробки будут закрыты.')) {
          api.post(`/packing/${task.id}/complete`).then(() => window.location.reload()).catch(e => toast.error(e.response?.data?.error || 'Ошибка'));
        }
      }}>
        <CheckCircle2 size={18} />
        Завершить задание
      </Button>
    </div>
  );
}

// ─── Шаг 3: Распечатать и отсканировать этикетку коробки ──────────────────────
function StepConfirmBox({ task, box, onConfirmed }) {
  const toast = useToast();
  const { settings } = useAppSettings();
  const playBeep = makePlayBeep(settings);
  const inputRef = useRef(null);
  const timerRef = useRef(null);

  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 200); }, []);

  const printLabel = () => {
    printBarcode(box.barcode_value, 'Коробка', task.title || '');
  };

  const doScan = useCallback(async (val) => {
    if (!val.trim() || loading) return;
    setLoading(true); setError('');
    try {
      await api.post(`/packing/${task.id}/confirm-box`, { scanned_barcode: val.trim() });
      playBeep(true);
      onConfirmed();
    } catch (err) {
      playBeep(false);
      setError(err.response?.data?.error || 'Ошибка');
      setValue('');
      setTimeout(() => inputRef.current?.focus(), 100);
    } finally { setLoading(false); }
  }, [task.id, loading]);

  const handleChange = (e) => {
    const v = e.target.value; setValue(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (v.trim().length >= 4) timerRef.current = setTimeout(() => doScan(v), 350);
  };

  return (
    <div className="space-y-5">
      <div className="card p-5 space-y-4">
        <p className="text-sm font-bold text-gray-700 uppercase tracking-wide">Что делать</p>
        <Step num={1} done text="Коробка открыта — этикетка готова" />
        <Step num={2} active text="Нажмите «Печать», распечатайте этикетку" />
        <Step num={3} text="Наклейте этикетку на коробку" />
        <Step num={4} text="Отсканируйте этикетку на коробке для подтверждения" />
      </div>

      {/* Штрихкод */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400">Штрих-код коробки</p>
            <div className="flex items-center gap-2 mt-1">
              <p className="font-mono font-bold text-gray-900">{box.barcode_value}</p>
              <CopyBadge value={box.barcode_value} label="Копировать" />
            </div>
          </div>
          <button onClick={printLabel}
            className="flex items-center gap-1.5 bg-primary-50 text-primary-700 font-semibold text-sm px-4 py-2.5 rounded-xl hover:bg-primary-100 transition-all">
            <Printer size={16} /> Печать
          </button>
        </div>
        <div className="flex justify-center py-2">
          <Barcode value={box.barcode_value} height={55} />
        </div>
      </div>

      {/* Скан */}
      <div className="card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <ScanLine size={18} className="text-primary-500" />
          <p className="font-semibold text-gray-800">Отсканируйте наклейку на коробке</p>
        </div>
        <input
          ref={inputRef}
          type="text" value={value}
          onChange={handleChange}
          onKeyDown={e => { if (e.key === 'Enter') { if (timerRef.current) clearTimeout(timerRef.current); doScan(value); } }}
          placeholder="Поднесите сканер к наклейке..."
          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-base
            placeholder:text-gray-400 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 focus:outline-none"
          disabled={loading} autoComplete="off"
        />
        {error && (
          <div className="flex items-start gap-2 p-3 bg-red-50 rounded-xl text-sm text-red-700">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            <p>{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Шаг 4: Сканировать товары в коробку ──────────────────────────────────────
function StepFillBox({ task, box, onRefresh, onDone, onRemainder }) {
  const { settings } = useAppSettings();
  const playBeep = makePlayBeep(settings);
  const speedColor = makeSpeedColor(settings.scan_fast_threshold, settings.scan_slow_threshold);

  const inputRef = useRef(null);
  const timerRef = useRef(null);
  const prevScanAt = useRef(null);
  const [value, setValue] = useState('');
  const [scanning, setScanning] = useState(false);
  const [lastScan, setLastScan] = useState(null);
  const [flash, setFlash] = useState(false);
  const [scanTimes, setScanTimes] = useState([]); // последние 10 интервалов в секундах

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 100); }, []);

  const doScan = useCallback(async (val) => {
    if (!val.trim() || scanning) return;
    // считаем интервал с предыдущего скана
    const now = Date.now();
    const delta = prevScanAt.current ? (now - prevScanAt.current) / 1000 : null;
    prevScanAt.current = now;

    setScanning(true); setValue('');
    try {
      const res = await api.post(`/packing/${task.id}/scan`, { scanned_value: val.trim() });
      if (res.data.ok) {
        playBeep(true);
        setFlash(true); setTimeout(() => setFlash(false), 400);
        if (delta !== null) {
          setScanTimes(prev => [...prev.slice(-9), delta]);
        }
        setLastScan({ ok: true, message: res.data.product_name, box_qty: res.data.box_qty, box_size: res.data.box_size, delta });
        onRefresh();
      } else {
        playBeep(false);
        setLastScan({ ok: false, message: res.data.error, delta: null });
      }
    } catch (err) {
      playBeep(false);
      setLastScan({ ok: false, message: err.response?.data?.error || 'Ошибка', delta: null });
    } finally {
      setScanning(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [task.id, scanning]);

  const handleChange = (e) => {
    const v = e.target.value; setValue(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (v.trim().length >= settings.scan_min_length) {
      timerRef.current = setTimeout(() => doScan(v), settings.scan_auto_delay);
    }
  };

  const pct = box.box_size > 0 ? Math.min(100, Math.round((box.quantity / box.box_size) * 100)) : 0;
  const isFull = box.quantity >= box.box_size;

  const avgTime = scanTimes.length >= 2
    ? (scanTimes.reduce((a, b) => a + b, 0) / scanTimes.length).toFixed(1)
    : null;



  return (
    <div className="space-y-4">
      {/* Прогресс */}
      <div className={`card p-4 space-y-3 transition-all duration-200 ${flash ? 'ring-2 ring-green-400 bg-green-50' : ''}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Box size={16} className="text-primary-500" />
            <span className="text-sm font-semibold text-gray-700">Текущая коробка</span>
          </div>
          <div className="flex items-center gap-3">
            {/* Среднее время — показываем после 2+ сканов */}
            {avgTime && (
              <span className={`text-xs font-medium ${speedColor(parseFloat(avgTime))}`}>
                ⌀ {avgTime}с
              </span>
            )}
            <span className={`text-lg font-bold ${isFull ? 'text-green-600' : 'text-gray-900'}`}>
              {qty(box.quantity)} / {qty(box.box_size)} шт.
            </span>
          </div>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-3">
          <div
            className={`h-3 rounded-full transition-all duration-300 ${isFull ? 'bg-green-500' : 'bg-primary-500'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        {/* Мини-лента последних сканов */}
        {scanTimes.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            {scanTimes.map((t, i) => (
              <span
                key={i}
                className={`text-xs px-1.5 py-0.5 rounded-md font-mono ${
                  t < 3 ? 'bg-green-100 text-green-700' :
                  t < 6 ? 'bg-amber-100 text-amber-700' :
                  'bg-red-100 text-red-600'
                }`}
              >
                {t.toFixed(1)}с
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Скан */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <ScanLine size={18} className="text-primary-500" />
          <p className="font-semibold text-gray-800">Сканируйте товар</p>
        </div>
        <input
          ref={inputRef}
          type="text" value={value}
          onChange={handleChange}
          onKeyDown={e => { if (e.key === 'Enter') { if (timerRef.current) clearTimeout(timerRef.current); doScan(value); } }}
          placeholder="Поднесите сканер к товару..."
          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-base
            placeholder:text-gray-400 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 focus:outline-none"
          disabled={scanning} autoComplete="off" autoFocus
        />
        {lastScan && (
          <div className={`flex items-start justify-between gap-2 p-3 rounded-xl text-sm font-medium
            ${lastScan.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            <div className="flex items-start gap-2">
              {lastScan.ok ? <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5" /> : <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />}
              <div>
                <p>{lastScan.message}</p>
                {lastScan.ok && <p className="text-xs mt-0.5 opacity-75">В коробке: {lastScan.box_qty} / {lastScan.box_size} шт.</p>}
              </div>
            </div>
            {/* Время скана */}
            {lastScan.ok && lastScan.delta != null && (
              <span className={`text-xs font-mono font-semibold flex-shrink-0 ${speedColor(lastScan.delta)}`}>
                {lastScan.delta.toFixed(1)}с
              </span>
            )}
          </div>
        )}
      </div>

      {/* Кнопка "Коробка заполнена" — только при достижении нормы */}
      {isFull && (
        <Button variant="primary" size="xl" className="w-full" onClick={onDone}>
          <ChevronRight size={20} />
          Коробка заполнена → Перенести на паллет
        </Button>
      )}

      {/* Кнопка остатка — всегда видна внизу */}
      <div className="card p-4 space-y-3 border-amber-200 bg-amber-50">
        <div className="flex items-start gap-2">
          <AlertCircle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Товар закончился раньше?</p>
            <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
              Если в коробке {qty(box.quantity)} шт. и больше товара нет — это остаток.
              Его нельзя отправить на паллет ФБО, нужно отнести на полку склада ФБС,
              где уже хранится этот товар.
            </p>
          </div>
        </div>
        <Button variant="outline" size="md" className="w-full border-amber-300 text-amber-700 hover:bg-amber-100"
          onClick={onRemainder}>
          Это остаток — отнести на склад ФБС
        </Button>
      </div>
    </div>
  );
}

// ─── Шаг 5: Перенести коробку на паллет (скан паллета) ────────────────────────
function StepTransferBox({ task, box, onSuccess }) {
  const toast = useToast();
  const { settings } = useAppSettings();
  const playBeep = makePlayBeep(settings);
  const inputRef = useRef(null);
  const timerRef = useRef(null);
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const palletLabel = task.row_number && task.pallet_number
    ? `Р${task.row_number}П${task.pallet_number}` : task.pallet_name || '—';

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 100); }, []);

  const doScan = useCallback(async (val) => {
    if (!val.trim() || loading) return;
    setLoading(true); setError('');
    try {
      await api.post(`/packing/${task.id}/close-box`, { pallet_barcode: val.trim() });
      playBeep(true);
      onSuccess();
    } catch (err) {
      playBeep(false);
      setError(err.response?.data?.error || 'Ошибка');
      setValue('');
      setTimeout(() => inputRef.current?.focus(), 100);
    } finally { setLoading(false); }
  }, [task.id, loading]);

  const handleChange = (e) => {
    const v = e.target.value; setValue(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (v.trim().length >= 4) timerRef.current = setTimeout(() => doScan(v), 350);
  };

  return (
    <div className="space-y-5">
      <div className="card p-5 space-y-4">
        <p className="text-sm font-bold text-gray-700 uppercase tracking-wide">Что делать</p>
        <Step num={1} done text="Коробка заполнена" sub={<span className="text-xs font-mono">{qty(box.quantity)} шт. / {box.barcode_value}</span>} />
        <Step num={2} active text={<>Отнесите коробку к паллету <span className="font-bold text-primary-700">{palletLabel}</span></>} />
        <Step num={3} text="Отсканируйте штрих-код паллета для подтверждения" />
        <Step num={4} text="Система запишет коробку на паллет" />
      </div>

      <div className="card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <ScanLine size={18} className="text-primary-500" />
          <p className="font-semibold text-gray-800">Сканируйте паллет</p>
        </div>
        <input
          ref={inputRef}
          type="text" value={value}
          onChange={handleChange}
          onKeyDown={e => { if (e.key === 'Enter') { if (timerRef.current) clearTimeout(timerRef.current); doScan(value); } }}
          placeholder="Поднесите сканер к паллету..."
          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-base
            placeholder:text-gray-400 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 focus:outline-none"
          disabled={loading} autoComplete="off"
        />
        {error && (
          <div className="flex items-start gap-2 p-3 bg-red-50 rounded-xl text-sm text-red-700">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            <p>{error}</p>
          </div>
        )}
        <Button variant="primary" size="lg" className="w-full" loading={loading} onClick={() => doScan(value)}>
          Подтвердить размещение
        </Button>
      </div>
    </div>
  );
}

// ─── Шаг 6а: Информация об остатке ───────────────────────────────────────────
function StepRemainderInfo({ task, box, onConfirmShelf, onBack }) {
  const toast = useToast();
  const { settings } = useAppSettings();
  const playBeep = makePlayBeep(settings);
  const inputRef = useRef(null);
  const timerRef = useRef(null);
  const [shelf, setShelf] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scanValue, setScanValue] = useState('');
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/packing/${task.id}/remainder-shelf`)
      .then(r => setShelf(r.data.shelf))
      .catch(() => {})
      .finally(() => setLoading(false));
    setTimeout(() => inputRef.current?.focus(), 150);
  }, [task.id]);

  const doScan = async (val) => {
    if (!val.trim() || scanning) return;
    setScanning(true); setError('');
    try {
      const res = await api.post(`/packing/${task.id}/close-remainder`, { shelf_barcode: val.trim() });
      playBeep(true);
      toast.success(`Остаток ${res.data.qty} шт. записан на полку ${res.data.shelf_code}`);
      onConfirmShelf();
    } catch (err) {
      playBeep(false);
      setError(err.response?.data?.error || 'Ошибка');
      setScanValue('');
      setTimeout(() => inputRef.current?.focus(), 100);
    } finally { setScanning(false); }
  };

  const handleChange = (e) => {
    const v = e.target.value; setScanValue(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (v.trim().length >= 4) timerRef.current = setTimeout(() => doScan(v), 350);
  };

  const confirmRecommended = async () => {
    if (!shelf) return;
    setScanning(true); setError('');
    try {
      const res = await api.post(`/packing/${task.id}/close-remainder`, { shelf_barcode: shelf.barcode_value });
      playBeep(true);
      toast.success(`Остаток ${res.data.qty} шт. записан на полку ${res.data.shelf_code}`);
      onConfirmShelf();
    } catch (err) {
      playBeep(false);
      setError(err.response?.data?.error || 'Ошибка');
    } finally { setScanning(false); }
  };

  return (
    <div className="space-y-5">
      <div className="card p-5 space-y-4 border-amber-200 bg-amber-50">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-100 flex items-center justify-center flex-shrink-0">
            <AlertCircle size={20} className="text-amber-600" />
          </div>
          <div>
            <p className="font-bold text-amber-900">Остаток: {qty(box.quantity)} шт.</p>
            <p className="text-sm text-amber-800 mt-1 leading-relaxed">
              Эти {qty(box.quantity)} шт. не помещаются в полную коробку для ФБО паллета.
              Их нужно отнести на склад ФБС на рекомендуемую полку.
            </p>
          </div>
        </div>
      </div>

      {/* Сканировать полку — основное действие */}
      <div className="card p-5 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <ScanLine size={18} className="text-primary-500" />
          <p className="font-semibold text-gray-800">Отсканируйте полку ФБС</p>
        </div>
        <input
          ref={inputRef}
          type="text" value={scanValue}
          onChange={handleChange}
          onKeyDown={e => { if (e.key === 'Enter') { if (timerRef.current) clearTimeout(timerRef.current); doScan(scanValue); } }}
          placeholder="Поднесите сканер к полке..."
          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-base placeholder:text-gray-400 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 focus:outline-none"
          disabled={scanning} autoComplete="off"
        />
        {error && (
          <div className="flex items-start gap-2 p-3 bg-red-50 rounded-xl text-sm text-red-700">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            <p>{error}</p>
          </div>
        )}
        <Button variant="primary" size="lg" className="w-full" loading={scanning} onClick={() => doScan(scanValue)}>
          Подтвердить полку
        </Button>
      </div>

      {/* Рекомендуемая полка — подсказка */}
      {loading ? (
        <div className="card p-4 flex items-center justify-center h-16"><Spinner size="sm" /></div>
      ) : shelf ? (
        <button
          onClick={confirmRecommended}
          disabled={scanning}
          className="w-full card p-4 flex items-center gap-3 bg-primary-50 border-primary-200 hover:bg-primary-100 active:scale-[0.99] transition-all text-left"
        >
          <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center flex-shrink-0">
            <ProductIcon size={20} />
          </div>
          <div className="flex-1">
            <p className="text-xs text-primary-500 font-medium">Рекомендуемая полка — нажмите для быстрого подтверждения</p>
            <p className="font-bold text-primary-900 text-lg">{shelf.shelf_code}</p>
            <p className="text-xs text-primary-600">{shelf.rack_name} · {shelf.warehouse_name}</p>
          </div>
          <ChevronRight size={20} className="text-primary-400 flex-shrink-0" />
        </button>
      ) : null}

      <button onClick={onBack} className="w-full text-center text-sm text-gray-400 py-2">
        ← Вернуться к сканированию
      </button>
    </div>
  );
}

// ─── Шаг 6б: Сканировать полку ФБС для остатка ────────────────────────────────
function StepRemainderShelf({ task, box, onSuccess }) {
  const toast = useToast();
  const { settings } = useAppSettings();
  const playBeep = makePlayBeep(settings);
  const inputRef = useRef(null);
  const timerRef = useRef(null);
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 100); }, []);

  const doScan = useCallback(async (val) => {
    if (!val.trim() || loading) return;
    setLoading(true); setError('');
    try {
      const res = await api.post(`/packing/${task.id}/close-remainder`, { shelf_barcode: val.trim() });
      playBeep(true);
      toast.success(`Остаток ${res.data.qty} шт. записан на полку ${res.data.shelf_code}`);
      onSuccess();
    } catch (err) {
      playBeep(false);
      setError(err.response?.data?.error || 'Ошибка');
      setValue('');
      setTimeout(() => inputRef.current?.focus(), 100);
    } finally { setLoading(false); }
  }, [task.id, loading]);

  const handleChange = (e) => {
    const v = e.target.value; setValue(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (v.trim().length >= 4) timerRef.current = setTimeout(() => doScan(v), 350);
  };

  return (
    <div className="space-y-5">
      <div className="card p-5 space-y-4">
        <p className="text-sm font-bold text-gray-700 uppercase tracking-wide">Что делать</p>
        <Step num={1} done text={`Возьмите ${qty(box.quantity)} шт. остатка`} />
        <Step num={2} done text="Пришли на склад ФБС" />
        <Step num={3} active text="Положите товар на полку и отсканируйте её штрих-код" />
      </div>

      <div className="card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <ScanLine size={18} className="text-primary-500" />
          <p className="font-semibold text-gray-800">Сканируйте полку ФБС</p>
        </div>
        <input
          ref={inputRef}
          type="text" value={value}
          onChange={handleChange}
          onKeyDown={e => { if (e.key === 'Enter') { if (timerRef.current) clearTimeout(timerRef.current); doScan(value); } }}
          placeholder="Поднесите сканер к полке..."
          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-base
            placeholder:text-gray-400 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 focus:outline-none"
          disabled={loading} autoComplete="off"
        />
        {error && (
          <div className="flex items-start gap-2 p-3 bg-red-50 rounded-xl text-sm text-red-700">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            <p>{error}</p>
          </div>
        )}
        <Button variant="primary" size="lg" className="w-full" loading={loading} onClick={() => doScan(value)}>
          Подтвердить размещение на ФБС
        </Button>
      </div>
    </div>
  );
}

// ─── Завершено ────────────────────────────────────────────────────────────────
function StepCompleted({ task, stats, onBack }) {
  return (
    <div className="space-y-6 text-center">
      <div className="flex flex-col items-center gap-4 py-8">
        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
          <CheckCircle2 size={40} className="text-green-500" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Задание выполнено!</h2>
          <p className="text-sm text-gray-500 mt-1">{task.title}</p>
        </div>
      </div>
      <div className="card p-5 grid grid-cols-2 gap-4 text-left">
        <div className="bg-green-50 rounded-xl p-3">
          <p className="text-xs text-gray-400 font-medium mb-0.5">Закрыто коробок</p>
          <p className="text-2xl font-bold text-green-700">{stats?.closed_boxes ?? 0}</p>
        </div>
        <div className="bg-primary-50 rounded-xl p-3">
          <p className="text-xs text-gray-400 font-medium mb-0.5">Всего принято</p>
          <p className="text-2xl font-bold text-primary-700">{stats?.closed_qty ?? 0} шт.</p>
        </div>
      </div>
      <Button variant="outline" size="lg" className="w-full" onClick={onBack}>
        <ArrowLeft size={16} /> Назад к задачам
      </Button>
    </div>
  );
}

// ─── Вспомогательный компонент: шаг инструкции ────────────────────────────────
function Step({ num, active, done, text, sub }) {
  return (
    <div className="flex items-start gap-3">
      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold
        ${done ? 'bg-green-100 text-green-600' : active ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-400'}`}>
        {done ? <CheckCircle2 size={14} /> : num}
      </div>
      <div className="pt-0.5">
        <p className={`text-sm leading-snug ${active ? 'font-semibold text-gray-900' : done ? 'text-gray-400 line-through' : 'text-gray-600'}`}>
          {text}
        </p>
        {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Главная страница ──────────────────────────────────────────────────────────
export default function PackagingPage() {
  const { id: taskId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  // шаг 5: скан паллета для закрытия коробки
  const [transferring, setTransferring] = useState(false);
  // шаг 6: остаток на ФБС
  const [remainder, setRemainder] = useState(false); // 'info' | 'shelf' | false

  const fetchData = useCallback(async () => {
    try {
      const res = await api.get(`/packing/${taskId}`);
      setData(res.data);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleOpenBox = async () => {
    await api.post(`/packing/${taskId}/open-box`);
    await fetchData();
  };

  const { task, open_box, stats } = data || {};

  // Определяем текущий шаг
  const getStep = () => {
    if (!task) return null;
    if (task.status === 'completed') return 'completed';
    if (task.status === 'new') return 'scan_pallet';
    // in_progress:
    if (!open_box) return 'open_box';
    if (!open_box.confirmed) return 'confirm_box';
    if (remainder === 'info') return 'remainder_info';
    if (transferring) return 'transfer_box';
    return 'fill_box';
  };

  const step = getStep();

  const stepTitle = {
    scan_pallet: 'Шаг 1: Подтвердить паллет',
    open_box: 'Шаг 2: Открыть коробку',
    confirm_box: 'Шаг 3: Подтвердить коробку',
    fill_box: 'Шаг 4: Заполнить коробку',
    transfer_box: 'Шаг 5: Перенести на паллет',
    remainder_info: 'Шаг 6: Остаток → склад ФБС',
    completed: 'Выполнено',
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Шапка */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => navigate(-1)}
          className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold text-gray-900 truncate">
            {task?.title || 'Оприходование'}
          </h1>
          {step && stepTitle[step] && (
            <p className="text-xs text-gray-400">{stepTitle[step]}</p>
          )}
        </div>
        <button onClick={fetchData} className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all">
          <RefreshCw size={16} />
        </button>
        {task?.status === 'completed' && <Badge variant="success" dot>Выполнено</Badge>}
        {task?.status === 'in_progress' && <Badge variant="warning" dot>В работе</Badge>}
        {task?.status === 'new' && <Badge variant="default" dot>Новая</Badge>}
      </div>

      {/* Контент */}
      <div className="max-w-lg mx-auto px-4 py-5">
        {loading ? (
          <div className="flex items-center justify-center h-48"><Spinner size="lg" /></div>
        ) : !task ? (
          <div className="card p-6 text-center text-gray-400">
            <AlertCircle size={32} className="mx-auto mb-2 opacity-50" />
            <p>Задача не найдена</p>
          </div>
        ) : step === 'scan_pallet' ? (
          <StepScanPallet task={task} onSuccess={fetchData} />
        ) : step === 'open_box' ? (
          <StepOpenBox task={task} stats={stats} onOpen={handleOpenBox} />
        ) : step === 'confirm_box' ? (
          <StepConfirmBox task={task} box={open_box} onConfirmed={fetchData} />
        ) : step === 'fill_box' ? (
          <StepFillBox
            task={task} box={open_box} onRefresh={fetchData}
            onDone={() => setTransferring(true)}
            onRemainder={() => setRemainder('info')}
          />
        ) : step === 'transfer_box' ? (
          <StepTransferBox task={task} box={open_box} onSuccess={() => { setTransferring(false); fetchData(); }} />
        ) : step === 'remainder_info' ? (
          <StepRemainderInfo
            task={task} box={open_box}
            onConfirmShelf={() => { setRemainder(false); fetchData(); }}
            onBack={() => setRemainder(false)}
          />
        ) : step === 'completed' ? (
          <StepCompleted task={task} stats={stats} onBack={() => navigate(-1)} />
        ) : null}
      </div>
    </div>
  );
}

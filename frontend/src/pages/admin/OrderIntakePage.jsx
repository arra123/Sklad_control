import { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, Loader2, Check, AlertTriangle, X, ImageIcon, Package, Truck, Printer, MapPin, Search, ScanLine } from 'lucide-react';
import api from '../../api/client';
import { useToast } from '../../components/ui/Toast';

// Сжать изображение на клиенте: макс. сторона 1600px, JPEG 0.85 → лёгкий payload и дешевле AI.
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const MAX = 1600;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          const k = Math.min(MAX / width, MAX / height);
          width = Math.round(width * k);
          height = Math.round(height * k);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function OrderIntakePage() {
  const toast = useToast();
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const fileInputRef = useRef(null);

  const handleImage = useCallback(async (file) => {
    if (!file || !file.type.startsWith('image/')) {
      toast.error('Нужен файл изображения');
      return;
    }
    try {
      setResult(null);
      const dataUrl = await compressImage(file);
      setPreview(dataUrl);
      setLoading(true);
      const { data } = await api.post('/orders/parse-screenshot', { image: dataUrl }, { timeout: 90000 });
      setResult(data);
      if (data.unmatched > 0) toast.error(`Не распознано позиций: ${data.unmatched}`);
      else if (data.bundle_warnings > 0) toast.error('Набор без состава в каталоге — проверьте количество');
      else toast.success(`Распознано: ${data.total_bottles} баночек`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка распознавания');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    const onPaste = (e) => {
      const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
      if (item) handleImage(item.getAsFile());
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [handleImage]);

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleImage(file);
  };

  const reset = () => { setPreview(null); setResult(null); };

  return (
    <div className="w-full max-w-5xl mx-auto p-3 sm:p-6 overflow-x-hidden">
      <div className="mb-4">
        <h1 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">Приём заказа по фото</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          Перетащите скриншот, вставьте (Ctrl+V) или выберите файл — AI распознает состав и развернёт наборы в баночки.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── Загрузка ── */}
        <div className="min-w-0">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            className={
              'relative rounded-2xl border-2 border-dashed cursor-pointer transition-all overflow-hidden ' +
              (dragOver
                ? 'border-primary-500 bg-primary-50/60 dark:bg-primary-900/20'
                : 'border-gray-200 dark:border-gray-700 hover:border-primary-400 bg-white dark:bg-gray-900')
            }
            style={{ minHeight: 220 }}
          >
            {preview ? (
              <>
                <img src={preview} alt="Скриншот заказа" className="w-full max-h-[360px] object-contain bg-gray-50 dark:bg-gray-800" />
                <button
                  onClick={(e) => { e.stopPropagation(); reset(); }}
                  className="absolute top-2 right-2 w-8 h-8 rounded-lg bg-black/50 text-white flex items-center justify-center hover:bg-black/70"
                >
                  <X className="w-4 h-4" />
                </button>
                {loading && (
                  <div className="absolute inset-0 bg-white/70 dark:bg-gray-900/70 flex flex-col items-center justify-center gap-2">
                    <Loader2 className="w-7 h-7 text-primary-600 animate-spin" />
                    <span className="text-sm text-gray-600 dark:text-gray-300">Распознаю заказ…</span>
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center text-center px-6 py-12">
                <div className="w-14 h-14 rounded-2xl bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center mb-3">
                  <Upload className="w-7 h-7 text-primary-600" />
                </div>
                <p className="font-medium text-gray-700 dark:text-gray-200">Перетащите скриншот сюда</p>
                <p className="text-sm text-gray-400 mt-1">или нажмите, чтобы выбрать · Ctrl+V</p>
              </div>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImage(f); e.target.value = ''; }} />
          </div>

          {/* Получатель (только нужное) */}
          {result && (
            <div className="mt-3 rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 text-sm space-y-1.5">
              {result.recipient && <Row label="Получатель" value={result.recipient} />}
              {result.phone && <Row label="Телефон" value={result.phone} />}
              {result.address && <Row label="Куда" value={result.address} />}
            </div>
          )}
        </div>

        {/* ── Сборка ── */}
        <div className="min-w-0">
          {!result && !loading && (
            <div className="h-full rounded-2xl border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/40 flex flex-col items-center justify-center text-center p-8 text-gray-400" style={{ minHeight: 220 }}>
              <ImageIcon className="w-8 h-8 mb-2 opacity-50" />
              <p className="text-sm">Здесь появится список баночек для сборки</p>
            </div>
          )}

          {result && (
            <>
              <AssemblyChecklist result={result} />

              {/* Распознанные позиции — с числом баночек и предупреждением о наборах */}
              <div className="mt-3 rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-800 font-semibold text-gray-900 dark:text-white text-sm">
                  Позиции заказа ({result.recognized.length})
                </div>
                <div className="divide-y divide-gray-50 dark:divide-gray-800">
                  {result.recognized.map((r, i) => (
                    <div key={i} className="flex items-start gap-2.5 px-4 py-2.5">
                      {r.bundle_empty ? <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-500" />
                        : r.matched ? <Check className="w-4 h-4 flex-shrink-0 mt-0.5 text-emerald-500" />
                        : <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-500" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800 dark:text-gray-100 break-words">
                          {r.raw_name} <span className="text-gray-400 whitespace-nowrap">× {r.quantity}</span>
                        </p>
                        {r.matched ? (
                          <p className="text-[11px] text-gray-400 break-words">
                            → {r.bottles} баночек{r.is_bundle ? ' (набор)' : ''} · {r.confidence}%
                            {r.bundle_empty && <span className="text-rose-500"> · состав набора не заполнен в каталоге!</span>}
                          </p>
                        ) : (
                          <p className="text-[11px] text-amber-500">не найдено в каталоге</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Оформление СДЭК ── */}
      {result && result.picklist.length > 0 && <CdekPanel result={result} />}
    </div>
  );
}

// ─── Чек-лист сборки: сканер + ручной тап, прогресс N/total ──────────────────
function AssemblyChecklist({ result }) {
  const toast = useToast();
  const [collected, setCollected] = useState({}); // product_id → собрано
  const [scan, setScan] = useState('');
  const scanRef = useRef(null);

  const total = result.total_bottles;
  const done = Object.values(collected).reduce((s, n) => s + n, 0);
  const complete = done >= total && total > 0;

  const inc = (p, delta) => {
    setCollected((c) => {
      const cur = c[p.product_id] || 0;
      const next = Math.min(p.qty, Math.max(0, cur + delta));
      return { ...c, [p.product_id]: next };
    });
  };

  const onScan = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const code = scan.trim();
    setScan('');
    if (!code) return;
    const item = result.picklist.find((p) => p.barcode && String(p.barcode) === code);
    if (!item) { toast.error('ШК не из этого заказа'); return; }
    const cur = collected[item.product_id] || 0;
    if (cur >= item.qty) { toast.error(`«${item.name}» уже собрана полностью`); return; }
    inc(item, +1);
  };

  return (
    <div className={'rounded-2xl border overflow-hidden ' + (complete ? 'border-emerald-300 dark:border-emerald-700' : 'border-gray-100 dark:border-gray-800') + ' bg-white dark:bg-gray-900'}>
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-2 min-w-0">
          <Package className="w-4.5 h-4.5 flex-shrink-0 text-primary-600" />
          <span className="font-semibold text-gray-900 dark:text-white truncate">Сборка</span>
        </div>
        <span className={'px-2.5 py-1 rounded-lg text-sm font-bold flex-shrink-0 ' + (complete ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300')}>
          {done} / {total}
        </span>
      </div>

      {/* Поле сканера */}
      <div className="px-3 pt-3">
        <div className="flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3">
          <ScanLine className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <input
            ref={scanRef}
            value={scan}
            onChange={(e) => setScan(e.target.value)}
            onKeyDown={onScan}
            placeholder="Сканируйте ШК баночки…"
            autoFocus
            className="flex-1 min-w-0 bg-transparent py-2 text-sm outline-none"
          />
        </div>
      </div>

      <div className="p-3 space-y-1.5">
        {result.picklist.map((p) => {
          const c = collected[p.product_id] || 0;
          const full = c >= p.qty;
          return (
            <div key={p.product_id}
              className={'flex items-center gap-2.5 rounded-xl px-3 py-2 ' + (full ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-gray-50 dark:bg-gray-800/60')}>
              <button onClick={() => inc(p, +1)}
                className={'w-9 h-9 flex-shrink-0 rounded-lg flex items-center justify-center text-sm font-bold ' + (full ? 'bg-emerald-500 text-white' : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600')}>
                {full ? <Check className="w-4 h-4" /> : `${c}/${p.qty}`}
              </button>
              <div className="flex-1 min-w-0" onClick={() => inc(p, +1)}>
                <p className="text-sm text-gray-800 dark:text-gray-100 break-words leading-tight">{p.name}</p>
                {p.barcode && <p className="text-[11px] text-gray-400 font-mono break-all">{p.barcode}</p>}
              </div>
              {c > 0 && (
                <button onClick={() => inc(p, -1)} className="w-7 h-7 flex-shrink-0 rounded-lg text-gray-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 flex items-center justify-center">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {complete && (
        <div className="px-4 py-2.5 bg-emerald-50 dark:bg-emerald-900/20 border-t border-emerald-100 dark:border-emerald-800 text-sm font-medium text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
          <Check className="w-4 h-4" /> Заказ собран — можно оформлять СДЭК
        </div>
      )}
    </div>
  );
}

// ─── нормализация для локального поиска ──────────────────────────────────────
function norm(s) {
  return String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/gi, ' ').trim();
}

// ─── Панель оформления доставки СДЭК ─────────────────────────────────────────
function CdekPanel({ result }) {
  const toast = useToast();
  const bottles = result.total_bottles;
  const [cfg, setCfg] = useState(null);
  const [shipmentPoint, setShipmentPoint] = useState('');
  const [name, setName] = useState(result.recipient || '');
  const [phone, setPhone] = useState(result.phone || '');

  const [cityQuery, setCityQuery] = useState('');
  const [cities, setCities] = useState([]);
  const [city, setCity] = useState(null);
  const [pvzQuery, setPvzQuery] = useState('');
  const [pvzList, setPvzList] = useState([]);
  const [pvz, setPvz] = useState(null);

  const [tariffs, setTariffs] = useState(null);
  const [tariff, setTariff] = useState(null);
  const [busy, setBusy] = useState('');
  const [order, setOrder] = useState(null);
  const [labelUrl, setLabelUrl] = useState(null);

  // Разобрать адрес получателя: город, улица, дом
  const parseAddr = () => {
    const parts = String(result.address || '').split(',').map((s) => s.trim()).filter(Boolean);
    const cityName = (parts[0] || '').replace(/^(г\.?|город)\s*/i, '').trim();
    const streetPart = parts.slice(1).find((p) => /[а-я]{4,}/i.test(p)) || '';
    const street = streetPart.replace(/^(ул\.?|улица|пр\.?|проспект|пер\.?|ш\.?|шоссе|б-р|бульвар)\s*/i, '').trim();
    const house = (parts.find((p) => /^\d+[а-я]?$/i.test(p.trim())) || '').trim();
    return { cityName, street, house };
  };

  useEffect(() => {
    api.get('/orders/cdek/config').then(({ data }) => {
      setCfg(data);
      setShipmentPoint(data.default_shipment_point);
    }).catch(() => {});
  }, []);

  // Автоподстановка города + ПВЗ из адреса заказа
  useEffect(() => {
    if (!cfg) return;
    const { cityName, street, house } = parseAddr();
    if (!cityName) return;
    setCityQuery(cityName);
    (async () => {
      setBusy('auto');
      try {
        const { data: cs } = await api.get('/orders/cdek/cities', { params: { name: cityName } });
        if (!cs.length) return;
        const c = cs[0];
        setCity(c); setCities([]);
        const { data: pv } = await api.get('/orders/cdek/pvz', { params: { city_code: c.code, query: street } });
        setPvzList(pv);
        setPvzQuery(street);
        // авто-выбор ПВЗ, если адрес совпал по улице и дому
        const best = pv.find((p) => norm(p.address).includes(norm(street)) && (!house || norm(p.address).includes(norm(house))));
        if (best) setPvz(best);
      } catch { /* оставим ручной ввод */ }
      finally { setBusy(''); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg]);

  const searchCity = async () => {
    if (!cityQuery.trim()) return;
    setBusy('city');
    try {
      const { data } = await api.get('/orders/cdek/cities', { params: { name: cityQuery.trim() } });
      setCities(data);
      if (data.length === 1) selectCity(data[0]);
    } catch { toast.error('Ошибка поиска города'); }
    finally { setBusy(''); }
  };

  const selectCity = async (c) => {
    setCity(c); setCities([]); setPvz(null); setTariffs(null); setTariff(null);
    setBusy('pvz');
    try {
      const { data } = await api.get('/orders/cdek/pvz', { params: { city_code: c.code, query: pvzQuery } });
      setPvzList(data);
    } catch { toast.error('Ошибка загрузки ПВЗ'); }
    finally { setBusy(''); }
  };

  const filterPvz = async () => {
    if (!city) return;
    setBusy('pvz');
    try {
      const { data } = await api.get('/orders/cdek/pvz', { params: { city_code: city.code, query: pvzQuery } });
      setPvzList(data);
    } catch { toast.error('Ошибка загрузки ПВЗ'); }
    finally { setBusy(''); }
  };

  const calculate = async () => {
    if (!city) { toast.error('Выберите город получателя'); return; }
    setBusy('calc'); setTariffs(null); setTariff(null);
    try {
      const { data } = await api.post('/orders/cdek/calculate', { shipment_point: shipmentPoint, to_city_code: city.code, bottles });
      setTariffs(data.tariffs);
      if (!data.tariffs.length) toast.error('Нет доступных тарифов');
    } catch (e) { toast.error(e.response?.data?.error || 'Ошибка расчёта'); }
    finally { setBusy(''); }
  };

  const createOrder = async () => {
    if (!tariff) { toast.error('Выберите тариф'); return; }
    if (!name.trim() || !phone.trim()) { toast.error('Заполните ФИО и телефон'); return; }
    const isPvzMode = tariff.delivery_mode === 4 || tariff.delivery_mode === 7;
    if (isPvzMode && !pvz) { toast.error('Выберите ПВЗ получения'); return; }
    setBusy('create');
    try {
      const body = {
        number: result.order_number || undefined,
        tariff_code: tariff.tariff_code,
        shipment_point: shipmentPoint,
        recipient: { name: name.trim(), phone: phone.trim() },
        picklist: result.picklist,
        bottles,
      };
      if (isPvzMode) body.delivery_point = pvz.code;
      else body.to_location = { address: result.address || city.city };
      const { data } = await api.post('/orders/cdek/create', body);
      setOrder({ uuid: data.uuid, number: data.number, cdek_number: null });
      toast.success('Заказ создан в СДЭК');
      pollOrder(data.uuid);
    } catch (e) { toast.error(e.response?.data?.error || 'Ошибка создания заказа'); }
    finally { setBusy(''); }
  };

  const pollOrder = async (uuid, tries = 0) => {
    try {
      const { data } = await api.get(`/orders/cdek/order/${uuid}`);
      if (data.cdek_number) { setOrder((o) => ({ ...o, cdek_number: data.cdek_number })); return; }
      if (data.errors?.length) { toast.error('СДЭК: ' + data.errors[0].message); return; }
    } catch { /* retry */ }
    if (tries < 8) setTimeout(() => pollOrder(uuid, tries + 1), 2500);
  };

  const printLabel = async () => {
    if (!order?.uuid) return;
    setBusy('print');
    try {
      const { data } = await api.post(`/orders/cdek/print/${order.uuid}`);
      if (data.url) { setLabelUrl(data.url); window.open(data.url, '_blank'); return; }
      pollLabel(data.print_uuid);
    } catch (e) { toast.error(e.response?.data?.error || 'Ошибка печати'); }
    finally { setBusy(''); }
  };

  const pollLabel = async (printUuid, tries = 0) => {
    try {
      const { data } = await api.get(`/orders/cdek/print/${printUuid}`);
      if (data.url) { setLabelUrl(data.url); window.open(data.url, '_blank'); return; }
    } catch { /* retry */ }
    if (tries < 8) setTimeout(() => pollLabel(printUuid, tries + 1), 2500);
  };

  const modeLabel = (m) => (m === 4 ? 'ПВЗ' : m === 7 ? 'постамат' : m === 3 ? 'курьер' : '');

  return (
    <div className="mt-4 rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
      <div className="flex items-center gap-2 flex-wrap px-4 py-2.5 border-b border-gray-100 dark:border-gray-800">
        <Truck className="w-4.5 h-4.5 flex-shrink-0 text-primary-600" />
        <span className="font-semibold text-gray-900 dark:text-white">Оформление СДЭК</span>
        <span className="text-xs text-gray-400">интернет-магазин · {bottles} баночек</span>
      </div>

      <div className="p-4 grid gap-5 lg:grid-cols-2">
        {/* Отправитель + получатель */}
        <div className="space-y-4 min-w-0">
          <div>
            <label className="text-xs font-medium text-gray-500">Отправляем из</label>
            <select value={shipmentPoint} onChange={(e) => setShipmentPoint(e.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm">
              {(cfg?.shipment_points || []).map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
            </select>
            {cfg?.sender && <p className="text-[11px] text-gray-400 mt-1 break-words">Отправитель: {cfg.sender.name} · {cfg.sender.phone}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="min-w-0">
              <label className="text-xs font-medium text-gray-500">ФИО получателя</label>
              <input value={name} onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm" />
            </div>
            <div className="min-w-0">
              <label className="text-xs font-medium text-gray-500">Телефон</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm" />
            </div>
          </div>

          {/* Город */}
          <div>
            <label className="text-xs font-medium text-gray-500">Город получателя {busy === 'auto' && <span className="text-gray-400">· ищу…</span>}</label>
            <div className="flex gap-2 mt-1">
              <input value={cityQuery} onChange={(e) => setCityQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && searchCity()}
                placeholder="Москва" className="flex-1 min-w-0 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm" />
              <button onClick={searchCity} disabled={busy === 'city'}
                className="px-3 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 text-gray-600 flex items-center flex-shrink-0">
                {busy === 'city' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </button>
            </div>
            {city && <p className="text-[11px] text-emerald-600 mt-1 break-words">✓ {city.city}{city.region ? `, ${city.region}` : ''} (код {city.code})</p>}
            {cities.length > 0 && (
              <div className="mt-1 rounded-xl border border-gray-100 dark:border-gray-800 divide-y divide-gray-50 dark:divide-gray-800 max-h-40 overflow-y-auto">
                {cities.map((c) => (
                  <button key={c.code} onClick={() => selectCity(c)} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 break-words">
                    {c.city}{c.region ? <span className="text-gray-400">, {c.region}</span> : ''}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ПВЗ */}
          {city && (
            <div>
              <label className="text-xs font-medium text-gray-500">ПВЗ получения</label>
              <div className="flex gap-2 mt-1">
                <input value={pvzQuery} onChange={(e) => setPvzQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && filterPvz()}
                  placeholder="улица / фильтр" className="flex-1 min-w-0 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm" />
                <button onClick={filterPvz} disabled={busy === 'pvz'}
                  className="px-3 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 text-gray-600 flex items-center flex-shrink-0">
                  {busy === 'pvz' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                </button>
              </div>
              {pvz && (
                <p className="text-[11px] text-emerald-600 mt-1 flex items-start gap-1 break-words">
                  <MapPin className="w-3 h-3 flex-shrink-0 mt-0.5" /> <span>{pvz.code} · {pvz.address}</span>
                </p>
              )}
              {!pvz && pvzList.length > 0 && (
                <div className="mt-1 rounded-xl border border-gray-100 dark:border-gray-800 divide-y divide-gray-50 dark:divide-gray-800 max-h-48 overflow-y-auto">
                  {pvzList.map((p) => (
                    <button key={p.code} onClick={() => setPvz(p)} className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 dark:hover:bg-gray-800 break-words">
                      <span className="font-mono text-gray-500">{p.code}</span> · {p.address}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Тарифы + действия */}
        <div className="space-y-3 min-w-0">
          <button onClick={calculate} disabled={busy === 'calc' || !city}
            className="w-full py-2.5 rounded-xl bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-40 flex items-center justify-center gap-2">
            {busy === 'calc' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Рассчитать тарифы
          </button>
          {!city && <p className="text-[11px] text-gray-400 text-center -mt-1">Сначала выберите город получателя</p>}

          {tariffs && (
            <div className="rounded-xl border border-gray-100 dark:border-gray-800 divide-y divide-gray-50 dark:divide-gray-800 max-h-64 overflow-y-auto">
              {tariffs.map((t) => (
                <label key={t.tariff_code}
                  className={'flex items-center gap-3 px-3 py-2.5 cursor-pointer text-sm ' + (tariff?.tariff_code === t.tariff_code ? 'bg-primary-50 dark:bg-primary-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800')}>
                  <input type="radio" name="tariff" checked={tariff?.tariff_code === t.tariff_code} onChange={() => setTariff(t)} className="accent-primary-600 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-800 dark:text-gray-100 break-words">{t.tariff_name} <span className="text-[11px] text-gray-400">· {modeLabel(t.delivery_mode)}</span></p>
                    <p className="text-[11px] text-gray-400">{t.period_min}–{t.period_max} дн</p>
                  </div>
                  <span className="font-semibold text-gray-900 dark:text-white flex-shrink-0">{t.delivery_sum} ₽</span>
                </label>
              ))}
            </div>
          )}

          {tariff && !order && (
            <button onClick={createOrder} disabled={busy === 'create'}
              className="w-full py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-40 flex items-center justify-center gap-2">
              {busy === 'create' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Truck className="w-4 h-4" />}
              Оформить в СДЭК
            </button>
          )}

          {order && (
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-900/20 p-3 text-sm space-y-1">
              <p className="font-medium text-emerald-700 dark:text-emerald-300">Заказ создан</p>
              <p className="text-gray-600 dark:text-gray-300 break-all">№ ИМ: <span className="font-mono">{order.number}</span></p>
              <p className="text-gray-600 dark:text-gray-300">
                Трек СДЭК: {order.cdek_number
                  ? <span className="font-mono font-semibold">{order.cdek_number}</span>
                  : <span className="text-gray-400 inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> формируется…</span>}
              </p>
              <button onClick={printLabel} disabled={busy === 'print'}
                className="mt-1 w-full py-2 rounded-xl bg-gray-900 dark:bg-gray-700 text-white text-sm font-medium hover:opacity-90 flex items-center justify-center gap-2">
                {busy === 'print' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                Печать этикетки
              </button>
              {labelUrl && <a href={labelUrl} target="_blank" rel="noreferrer" className="block text-center text-xs text-primary-600 hover:underline">Открыть PDF этикетки</a>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex gap-2">
      <span className="text-gray-400 w-20 flex-shrink-0">{label}</span>
      <span className="text-gray-800 dark:text-gray-100 break-words min-w-0">{value}</span>
    </div>
  );
}

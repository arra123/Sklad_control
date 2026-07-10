import { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, Loader2, Check, AlertTriangle, X, ImageIcon, Package, Truck, Printer, MapPin, Search } from 'lucide-react';
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
      if (data.unmatched > 0) {
        toast.error(`Не распознано позиций: ${data.unmatched} — проверьте вручную`);
      } else {
        toast.success(`Распознано: ${data.total_bottles} баночек`);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка распознавания');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Вставка из буфера (Ctrl+V) — удобно для скриншотов
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
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Приём заказа по фото</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          Перетащите скриншот заказа, вставьте из буфера (Ctrl+V) или выберите файл — AI распознает состав и развернёт наборы в баночки.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ── Левая колонка: загрузка ── */}
        <div>
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
            style={{ minHeight: 260 }}
          >
            {preview ? (
              <>
                <img src={preview} alt="Скриншот заказа" className="w-full max-h-[420px] object-contain bg-gray-50 dark:bg-gray-800" />
                <button
                  onClick={(e) => { e.stopPropagation(); reset(); }}
                  className="absolute top-2 right-2 w-8 h-8 rounded-lg bg-black/50 text-white flex items-center justify-center hover:bg-black/70"
                  title="Убрать"
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
              <div className="flex flex-col items-center justify-center text-center px-6 py-14">
                <div className="w-14 h-14 rounded-2xl bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center mb-3">
                  <Upload className="w-7 h-7 text-primary-600" />
                </div>
                <p className="font-medium text-gray-700 dark:text-gray-200">Перетащите скриншот сюда</p>
                <p className="text-sm text-gray-400 mt-1">или нажмите, чтобы выбрать · Ctrl+V из буфера</p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImage(f); e.target.value = ''; }}
            />
          </div>

          {/* Данные получателя */}
          {result && (
            <div className="mt-4 rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 text-sm space-y-1.5">
              {result.recipient && <Row label="Получатель" value={result.recipient} />}
              {result.phone && <Row label="Телефон" value={result.phone} />}
              {result.address && <Row label="Адрес" value={result.address} />}
              {result.delivery && <Row label="Доставка" value={result.delivery} />}
              {result.track && <Row label="Трек" value={result.track} />}
              {result.order_number && <Row label="№ заказа" value={result.order_number} />}
              {result.total != null && <Row label="Итого" value={`${result.total} ₽`} />}
            </div>
          )}
        </div>

        {/* ── Правая колонка: результат ── */}
        <div>
          {!result && !loading && (
            <div className="h-full rounded-2xl border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/40 flex flex-col items-center justify-center text-center p-8 text-gray-400" style={{ minHeight: 260 }}>
              <ImageIcon className="w-8 h-8 mb-2 opacity-50" />
              <p className="text-sm">Здесь появится список баночек для сборки</p>
            </div>
          )}

          {result && (
            <>
              {/* Пик-лист — баночки */}
              <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                  <div className="flex items-center gap-2">
                    <Package className="w-4.5 h-4.5 text-primary-600" />
                    <span className="font-semibold text-gray-900 dark:text-white">К сборке</span>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-sm font-bold">
                    {result.total_bottles} баночек
                  </span>
                </div>
                <div className="divide-y divide-gray-50 dark:divide-gray-800">
                  {result.picklist.map((p) => (
                    <div key={p.product_id} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="w-9 h-9 flex-shrink-0 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-sm font-bold text-gray-700 dark:text-gray-200">
                        {p.qty}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800 dark:text-gray-100 truncate">{p.name}</p>
                        {p.barcode && <p className="text-[11px] text-gray-400 font-mono">{p.barcode}</p>}
                      </div>
                    </div>
                  ))}
                  {result.picklist.length === 0 && (
                    <div className="px-4 py-6 text-center text-sm text-gray-400">Ничего не сопоставлено с каталогом</div>
                  )}
                </div>
              </div>

              {/* Распознанные позиции заказа */}
              <div className="mt-4 rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 font-semibold text-gray-900 dark:text-white text-sm">
                  Позиции заказа ({result.recognized.length})
                </div>
                <div className="divide-y divide-gray-50 dark:divide-gray-800">
                  {result.recognized.map((r, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                      {r.matched ? (
                        <Check className="w-4 h-4 flex-shrink-0 text-emerald-500" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-500" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800 dark:text-gray-100 truncate">
                          {r.raw_name} <span className="text-gray-400">× {r.quantity}</span>
                        </p>
                        {r.matched ? (
                          <p className="text-[11px] text-gray-400 truncate">
                            → {r.product_name}{r.is_bundle && <span className="text-primary-500"> · набор</span>} · {r.confidence}%
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
      {result && result.picklist.length > 0 && (
        <CdekPanel result={result} />
      )}
    </div>
  );
}

// ─── Панель оформления доставки СДЭК ─────────────────────────────────────────
function CdekPanel({ result }) {
  const toast = useToast();
  const bottles = result.total_bottles;
  const [cfg, setCfg] = useState(null);
  const [shipmentPoint, setShipmentPoint] = useState('');
  const [name, setName] = useState(result.recipient || '');
  const [phone, setPhone] = useState(result.phone || '');

  // выбор города/ПВЗ получателя
  const [cityQuery, setCityQuery] = useState((result.address || '').split(',')[0].trim());
  const [cities, setCities] = useState([]);
  const [city, setCity] = useState(null);
  const [pvzQuery, setPvzQuery] = useState('');
  const [pvzList, setPvzList] = useState([]);
  const [pvz, setPvz] = useState(null);

  // тарифы / создание
  const [tariffs, setTariffs] = useState(null);
  const [tariff, setTariff] = useState(null);
  const [busy, setBusy] = useState('');
  const [order, setOrder] = useState(null); // { uuid, number, cdek_number }
  const [labelUrl, setLabelUrl] = useState(null);

  useEffect(() => {
    api.get('/orders/cdek/config').then(({ data }) => {
      setCfg(data);
      setShipmentPoint(data.default_shipment_point);
    }).catch(() => {});
  }, []);

  const searchCity = async () => {
    if (!cityQuery.trim()) return;
    setBusy('city');
    try {
      const { data } = await api.get('/orders/cdek/cities', { params: { name: cityQuery.trim() } });
      setCities(data);
      if (data.length === 1) selectCity(data[0]);
    } catch (e) { toast.error('Ошибка поиска города'); }
    finally { setBusy(''); }
  };

  const selectCity = async (c) => {
    setCity(c); setCities([]); setPvz(null); setTariffs(null); setTariff(null);
    setBusy('pvz');
    try {
      const { data } = await api.get('/orders/cdek/pvz', { params: { city_code: c.code, query: pvzQuery } });
      setPvzList(data);
    } catch (e) { toast.error('Ошибка загрузки ПВЗ'); }
    finally { setBusy(''); }
  };

  const filterPvz = async () => {
    if (!city) return;
    setBusy('pvz');
    try {
      const { data } = await api.get('/orders/cdek/pvz', { params: { city_code: city.code, query: pvzQuery } });
      setPvzList(data);
    } catch (e) { toast.error('Ошибка загрузки ПВЗ'); }
    finally { setBusy(''); }
  };

  const calculate = async () => {
    if (!city) { toast.error('Выберите город получателя'); return; }
    setBusy('calc'); setTariffs(null); setTariff(null);
    try {
      const { data } = await api.post('/orders/cdek/calculate', {
        shipment_point: shipmentPoint, to_city_code: city.code, bottles,
      });
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
      else body.to_location = { address: result.address || `${city.city}` };
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
    <div className="mt-5 rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-800">
        <Truck className="w-4.5 h-4.5 text-primary-600" />
        <span className="font-semibold text-gray-900 dark:text-white">Оформление СДЭК</span>
        <span className="text-xs text-gray-400">· тип: интернет-магазин · {bottles} баночек</span>
      </div>

      <div className="p-4 grid gap-5 lg:grid-cols-2">
        {/* Отправитель + получатель */}
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-500">Отправляем из</label>
            <select
              value={shipmentPoint}
              onChange={(e) => setShipmentPoint(e.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
            >
              {(cfg?.shipment_points || []).map((p) => (
                <option key={p.code} value={p.code}>{p.name}</option>
              ))}
            </select>
            {cfg?.sender && (
              <p className="text-[11px] text-gray-400 mt-1">
                Отправитель: {cfg.sender.name} · {cfg.sender.phone}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium text-gray-500">ФИО получателя</label>
              <input value={name} onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500">Телефон</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm" />
            </div>
          </div>

          {/* Город */}
          <div>
            <label className="text-xs font-medium text-gray-500">Город получателя</label>
            <div className="flex gap-2 mt-1">
              <input value={cityQuery} onChange={(e) => setCityQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchCity()}
                placeholder="Москва"
                className="flex-1 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm" />
              <button onClick={searchCity} disabled={busy === 'city'}
                className="px-3 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 text-gray-600 flex items-center">
                {busy === 'city' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </button>
            </div>
            {city && <p className="text-[11px] text-emerald-600 mt-1">✓ {city.city}{city.region ? `, ${city.region}` : ''} (код {city.code})</p>}
            {cities.length > 0 && (
              <div className="mt-1 rounded-xl border border-gray-100 dark:border-gray-800 divide-y divide-gray-50 dark:divide-gray-800 max-h-40 overflow-y-auto">
                {cities.map((c) => (
                  <button key={c.code} onClick={() => selectCity(c)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800">
                    {c.city}{c.region ? <span className="text-gray-400">, {c.region}</span> : ''}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ПВЗ */}
          {city && (
            <div>
              <label className="text-xs font-medium text-gray-500">ПВЗ получения (для склад-склад)</label>
              <div className="flex gap-2 mt-1">
                <input value={pvzQuery} onChange={(e) => setPvzQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && filterPvz()}
                  placeholder="улица / фильтр"
                  className="flex-1 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm" />
                <button onClick={filterPvz} disabled={busy === 'pvz'}
                  className="px-3 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 text-gray-600 flex items-center">
                  {busy === 'pvz' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                </button>
              </div>
              {pvz && <p className="text-[11px] text-emerald-600 mt-1 flex items-center gap-1"><MapPin className="w-3 h-3" /> {pvz.code} · {pvz.address}</p>}
              {!pvz && pvzList.length > 0 && (
                <div className="mt-1 rounded-xl border border-gray-100 dark:border-gray-800 divide-y divide-gray-50 dark:divide-gray-800 max-h-48 overflow-y-auto">
                  {pvzList.map((p) => (
                    <button key={p.code} onClick={() => setPvz(p)}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 dark:hover:bg-gray-800">
                      <span className="font-mono text-gray-500">{p.code}</span> · {p.address}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Тарифы + действия */}
        <div className="space-y-3">
          <button onClick={calculate} disabled={busy === 'calc' || !city}
            className="w-full py-2.5 rounded-xl bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-40 flex items-center justify-center gap-2">
            {busy === 'calc' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Рассчитать тарифы
          </button>

          {tariffs && (
            <div className="rounded-xl border border-gray-100 dark:border-gray-800 divide-y divide-gray-50 dark:divide-gray-800 max-h-64 overflow-y-auto">
              {tariffs.map((t) => (
                <label key={t.tariff_code}
                  className={'flex items-center gap-3 px-3 py-2.5 cursor-pointer text-sm ' + (tariff?.tariff_code === t.tariff_code ? 'bg-primary-50 dark:bg-primary-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800')}>
                  <input type="radio" name="tariff" checked={tariff?.tariff_code === t.tariff_code} onChange={() => setTariff(t)} className="accent-primary-600" />
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-800 dark:text-gray-100 truncate">{t.tariff_name} <span className="text-[11px] text-gray-400">· {modeLabel(t.delivery_mode)}</span></p>
                    <p className="text-[11px] text-gray-400">{t.period_min}–{t.period_max} дн</p>
                  </div>
                  <span className="font-semibold text-gray-900 dark:text-white">{t.delivery_sum} ₽</span>
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
              <p className="text-gray-600 dark:text-gray-300">№ ИМ: <span className="font-mono">{order.number}</span></p>
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
      <span className="text-gray-400 w-24 flex-shrink-0">{label}</span>
      <span className="text-gray-800 dark:text-gray-100 break-words">{value}</span>
    </div>
  );
}

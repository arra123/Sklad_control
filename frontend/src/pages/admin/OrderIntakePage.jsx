import { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, Loader2, Check, AlertTriangle, X, ImageIcon, Package, Truck, Printer, MapPin, Search, ScanLine, Map as MapIcon, ClipboardList, Trash2, Clock, User, RefreshCw } from 'lucide-react';
import api from '../../api/client';
import { useToast } from '../../components/ui/Toast';
import CdekMapPicker from '../../components/CdekMapPicker';
import { playBeep } from '../../utils/audio';

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
  const [tab, setTab] = useState('photo'); // 'photo' | 'manual'
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const fileInputRef = useRef(null);

  const switchTab = (t) => { setTab(t); setResult(null); setPreview(null); };

  // Сохранить заказ в БД (общий список) и открыть его в работе
  const persistOrder = useCallback(async (data) => {
    try {
      const { data: saved } = await api.post('/orders', {
        source: data.manual ? 'manual' : 'photo',
        recipient: data.recipient, phone: data.phone, city: data.city, city_code: data.city_code,
        address: data.address, pvz_address: data.pvz_address,
        total_bottles: data.total_bottles, recognized: data.recognized, picklist: data.picklist,
      });
      setResult({ ...data, id: saved.id, status: saved.status, collected: saved.collected || {} });
    } catch (e) {
      // Не смогли сохранить в общий список — работаем локально, но предупредим
      toast.error('Заказ не сохранён в список: ' + (e.response?.data?.error || 'ошибка сервера'));
      setResult(data);
    }
  }, [toast]);

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
      await persistOrder(data);
      if (data.unmatched > 0) toast.error(`Не распознано позиций: ${data.unmatched}`);
      else if (data.bundle_warnings > 0) toast.error('Набор без состава в каталоге — проверьте количество');
      else toast.success(`Распознано: ${data.total_bottles} баночек`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка распознавания');
    } finally {
      setLoading(false);
    }
  }, [toast, persistOrder]);

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

  const openOrder = useCallback(async (id) => {
    try { const { data } = await api.get(`/orders/${id}`); setResult(orderToResult(data)); }
    catch { toast.error('Не удалось открыть заказ'); }
  }, [toast]);

  return (
    <div className="w-full max-w-[1500px] mx-auto p-3 sm:p-6 lg:p-8 overflow-x-hidden">
      <h1 className="text-2xl lg:text-4xl font-bold text-gray-900 dark:text-white mb-4 lg:mb-6">Заказы</h1>

      {/* Вкладки */}
      <div className="flex gap-2 mb-4 lg:mb-6 p-1 lg:p-1.5 bg-gray-100 dark:bg-gray-800 rounded-2xl max-w-lg lg:max-w-xl">
        {[['photo', 'По фото', ImageIcon], ['manual', 'Вручную', Package], ['orders', 'Заказы', ClipboardList]].map(([k, label, Icon]) => (
          <button key={k} onClick={() => switchTab(k)}
            className={'flex-1 py-2.5 lg:py-3 rounded-xl text-sm lg:text-base font-semibold transition-all flex items-center justify-center gap-2 ' +
              (tab === k ? 'bg-white dark:bg-gray-900 text-primary-600 shadow-sm' : 'text-gray-500')}>
            <Icon className="w-4 h-4 lg:w-5 lg:h-5" /> {label}
          </button>
        ))}
      </div>

      {tab === 'orders' && !result && <OrdersList onOpen={openOrder} />}

      {!(tab === 'orders' && !result) && (
      <>
      <div className="grid gap-4 lg:gap-6 lg:grid-cols-2">
        {/* ── Загрузка / ручной подбор / открытый заказ ── */}
        <div className="min-w-0">
          {result?.isSaved ? (
            <OrderSummaryCard result={result} onBack={reset} onDeleted={reset} />
          ) : tab === 'manual' ? (
            <ManualPicker onResult={(d) => { setPreview(null); persistOrder(d); }} hasResult={!!result} onReset={() => setResult(null)} />
          ) : (
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
          )}

          {/* Получатель (только нужное) */}
          {result && (result.recipient || result.phone || result.address) && (
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
              {result.recognized.length > 0 && (
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
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Оформление СДЭК ── */}
      {result && result.picklist.length > 0 && <CdekPanel result={result} />}

      {/* История заказа */}
      {result?.id && <OrderHistory orderId={result.id} />}
      </>
      )}
    </div>
  );
}

// ─── Список заказов (активные сверху, завершённые снизу) ──────────────────────
function OrderRow({ o, onOpen, onDel, dim }) {
  return (
    <div onClick={() => onOpen(o.id)}
      className={'flex items-center gap-3 lg:gap-4 px-4 lg:px-6 py-3.5 lg:py-5 hover:bg-gray-50 dark:hover:bg-gray-800/60 cursor-pointer ' + (dim ? 'opacity-70' : '')}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm lg:text-lg font-medium text-gray-900 dark:text-gray-100 truncate">{o.recipient_name || 'Без получателя'}</span>
          <StatusBadge status={o.status} />
          <span className="text-[11px] lg:text-xs text-gray-400">{o.source === 'manual' ? 'вручную' : 'фото'}</span>
        </div>
        <p className="text-[11px] lg:text-sm text-gray-400 break-words mt-0.5">
          {o.pvz_address || o.city || '—'} · {o.collected_total || 0}/{o.total_bottles} бан.{o.order_value ? ` · ${Math.round(o.order_value)}₽` : ''}
          {o.cdek_number ? ` · трек ${o.cdek_number}` : ''}
        </p>
        <p className="text-[10px] lg:text-xs text-gray-400 flex items-center gap-1 mt-0.5 flex-wrap">
          <User className="w-3 h-3 lg:w-3.5 lg:h-3.5" /> {o.created_by_label || '—'} · <Clock className="w-3 h-3 lg:w-3.5 lg:h-3.5" /> {fmtDate(o.created_at)}
        </p>
      </div>
      <button onClick={(e) => onDel(e, o.id)} className="w-9 h-9 lg:w-11 lg:h-11 flex-shrink-0 rounded-lg text-gray-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 flex items-center justify-center"><Trash2 className="w-4 h-4 lg:w-5 lg:h-5" /></button>
    </div>
  );
}

function OrdersList({ onOpen }) {
  const toast = useToast();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    api.get('/orders').then(({ data }) => setOrders(data)).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, []); // eslint-disable-line

  const del = async (e, id) => {
    e.stopPropagation();
    if (!window.confirm('Удалить заказ?')) return;
    try { await api.delete(`/orders/${id}`); setOrders((o) => o.filter((x) => x.id !== id)); }
    catch { toast.error('Не удалось удалить'); }
  };

  const isActive = (o) => o.status !== 'shipped' && o.status !== 'cancelled';
  const active = orders.filter(isActive);
  const done = orders.filter((o) => !isActive(o));

  return (
    <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden max-w-4xl">
      <div className="flex items-center justify-between gap-2 px-4 lg:px-6 py-3.5 lg:py-4 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-2 min-w-0">
          <ClipboardList className="w-5 h-5 flex-shrink-0 text-primary-600" />
          <span className="font-semibold text-gray-900 dark:text-white lg:text-lg">Все заказы</span>
          <span className="text-xs lg:text-sm text-gray-400">{active.length} активных</span>
        </div>
        <button onClick={load} className="w-9 h-9 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center flex-shrink-0"><RefreshCw className="w-4 h-4 lg:w-5 lg:h-5" /></button>
      </div>
      {loading && orders.length === 0 ? (
        <div className="py-16 flex justify-center"><Loader2 className="w-7 h-7 text-primary-500 animate-spin" /></div>
      ) : orders.length === 0 ? (
        <div className="py-16 text-center text-sm lg:text-base text-gray-400">Заказов нет</div>
      ) : (
        <div className="divide-y divide-gray-50 dark:divide-gray-800">
          {active.map((o) => <OrderRow key={o.id} o={o} onOpen={onOpen} onDel={del} />)}
          {done.length > 0 && (
            <div className="px-4 lg:px-6 py-2 bg-gray-50/70 dark:bg-gray-800/40 text-[11px] lg:text-xs font-semibold uppercase tracking-wider text-gray-400">
              Завершённые
            </div>
          )}
          {done.map((o) => <OrderRow key={o.id} o={o} onOpen={onOpen} onDel={del} dim />)}
        </div>
      )}
    </div>
  );
}

// ─── Сводка открытого заказа (левая колонка) ─────────────────────────────────
function OrderSummaryCard({ result, onBack, onDeleted }) {
  const toast = useToast();
  const del = async () => {
    if (!window.confirm('Удалить заказ?')) return;
    try { await api.delete(`/orders/${result.id}`); toast.success('Заказ удалён'); onDeleted(); }
    catch { toast.error('Не удалось удалить'); }
  };
  return (
    <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
      <button onClick={onBack} className="text-sm text-primary-600 hover:underline mb-3">← К заказам</button>
      <div className="flex items-center gap-2 mb-1">
        <span className="font-semibold text-gray-900 dark:text-white">Заказ #{result.id}</span>
        <StatusBadge status={result.status} />
      </div>
      <p className="text-sm text-gray-600 dark:text-gray-300">{result.total_bottles} баночек · {result.source === 'manual' ? 'вручную' : 'по фото'}</p>
      {result.cdek_number && <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">Трек СДЭК: <span className="font-mono font-semibold">{result.cdek_number}</span></p>}
      <button onClick={del} className="mt-3 w-full py-2 rounded-xl border border-rose-200 dark:border-rose-800 text-rose-600 text-sm font-medium hover:bg-rose-50 dark:hover:bg-rose-900/20 flex items-center justify-center gap-2">
        <Trash2 className="w-4 h-4" /> Удалить заказ
      </button>
    </div>
  );
}

// ─── История заказа (кто, когда, что) ────────────────────────────────────────
function OrderHistory({ orderId }) {
  const [events, setEvents] = useState([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    api.get(`/orders/${orderId}/events`).then(({ data }) => setEvents(data)).catch(() => {});
  }, [open, orderId]);
  const labelFor = (e) => {
    if (e.event_type === 'created') return 'создал заказ';
    if (e.event_type === 'pick') return `пикнул +${e.qty || 1}${e.product_name ? ' · ' + e.product_name : ''}`;
    if (e.event_type === 'unpick') return `убрал ${e.qty || 1}${e.product_name ? ' · ' + e.product_name : ''}`;
    if (e.event_type === 'status') return e.notes || 'сменил статус';
    return e.notes || e.event_type;
  };
  return (
    <div className="mt-4 rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white">
        <span className="flex items-center gap-2"><Clock className="w-4 h-4 text-gray-400" /> История сборки</span>
        <span className="text-gray-400 text-xs">{open ? 'скрыть' : 'показать'}</span>
      </button>
      {open && (
        <div className="px-4 pb-3 max-h-64 overflow-y-auto">
          {events.length === 0 ? <p className="text-sm text-gray-400 py-2">Событий нет</p> :
            events.map((e) => (
              <div key={e.id} className="flex items-start gap-2 py-1.5 text-xs border-t border-gray-50 dark:border-gray-800 first:border-0">
                <span className="text-gray-400 flex-shrink-0 w-20">{fmtDate(e.created_at)}</span>
                <span className="text-gray-700 dark:text-gray-200 flex-1 min-w-0 break-words"><b>{e.user_label || '—'}</b> {labelFor(e)}</span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

// ─── Ручной подбор товаров для заказа ────────────────────────────────────────
function ManualPicker({ onResult, hasResult, onReset }) {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);

  // Список всплывает сразу (без ввода) и фильтруется по мере набора
  useEffect(() => {
    const q = search.trim();
    const t = setTimeout(() => {
      api.get('/products', { params: q.length >= 2 ? { search: q, limit: 25 } : { limit: 25 } })
        .then((r) => setResults(r.data?.items || []))
        .catch(() => setResults([]));
    }, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [search]);

  const add = (p) => {
    setItems((prev) => prev.find((x) => x.product_id === p.id)
      ? prev.map((x) => x.product_id === p.id ? { ...x, qty: x.qty + 1 } : x)
      : [...prev, { product_id: p.id, name: p.name, code: p.code, entity_type: p.entity_type, qty: 1 }]);
    setSearch(''); setResults([]);
  };
  const setQty = (id, q) => setItems((prev) => prev.map((x) => x.product_id === id ? { ...x, qty: Math.max(1, q || 1) } : x));
  const remove = (id) => setItems((prev) => prev.filter((x) => x.product_id !== id));

  const build = async () => {
    if (!items.length) { toast.error('Добавьте товары'); return; }
    setBusy(true);
    try {
      const { data } = await api.post('/orders/build-picklist', { items: items.map((i) => ({ product_id: i.product_id, qty: i.qty })) });
      onResult(data);
    } catch (e) { toast.error(e.response?.data?.error || 'Ошибка'); }
    finally { setBusy(false); }
  };

  if (hasResult) {
    return (
      <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 text-center py-8">
        <Check className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
        <p className="text-sm text-gray-600 dark:text-gray-300">Состав собран — оформляйте СДЭК ниже</p>
        <button onClick={onReset} className="mt-3 text-sm text-primary-600 hover:underline">← Изменить состав</button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
      <label className="text-xs font-medium text-gray-500">Добавить товар</label>
      <div className="relative mt-1">
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Нажмите и выберите товар (или начните вводить)…"
          className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm" />
        {open && results.length > 0 && (
          <div className="absolute z-30 left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg max-h-72 overflow-y-auto">
            {results.map((p) => (
              <button key={p.id} onMouseDown={(e) => { e.preventDefault(); add(p); }} className="w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm">
                <p className="text-gray-800 dark:text-gray-100 break-words">{p.name}{p.entity_type === 'bundle' && <span className="text-primary-500 text-xs"> · набор</span>}</p>
                {p.code && <p className="text-[11px] text-gray-400">{p.code}</p>}
              </button>
            ))}
          </div>
        )}
      </div>

      {items.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {items.map((it) => (
            <div key={it.product_id} className="flex items-center gap-2 rounded-xl bg-gray-50 dark:bg-gray-800/60 px-3 py-2">
              <p className="flex-1 min-w-0 text-sm text-gray-800 dark:text-gray-100 break-words leading-tight">
                {it.name}{it.entity_type === 'bundle' && <span className="text-primary-500 text-xs"> · набор</span>}
              </p>
              <input type="number" min="1" value={it.qty} onChange={(e) => setQty(it.product_id, Number(e.target.value))}
                className="w-14 flex-shrink-0 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1 text-sm text-center" />
              <button onClick={() => remove(it.product_id)} className="flex-shrink-0 text-gray-400 hover:text-rose-500"><X className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
      )}

      <button onClick={build} disabled={busy || !items.length}
        className="w-full mt-4 py-2.5 rounded-xl bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-40 flex items-center justify-center gap-2">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />}
        Собрать заказ ({items.reduce((s, i) => s + i.qty, 0)} поз.)
      </button>
    </div>
  );
}

// ─── Чек-лист сборки: сканер + ручной тап, прогресс N/total ──────────────────
function AssemblyChecklist({ result }) {
  const toast = useToast();
  const orderId = result.id;
  const [collected, setCollected] = useState(result.collected || {});
  const [scan, setScan] = useState('');
  const scanRef = useRef(null);

  useEffect(() => { setCollected(result.collected || {}); }, [result.id]); // eslint-disable-line

  // Общий пикинг: подтягиваем прогресс других сборщиков
  useEffect(() => {
    if (!orderId) return;
    const t = setInterval(() => {
      api.get(`/orders/${orderId}`).then(({ data }) => setCollected(data.collected || {})).catch(() => {});
    }, 5000);
    return () => clearInterval(t);
  }, [orderId]);

  const total = result.total_bottles;
  const done = Object.values(collected).reduce((s, n) => s + (Number(n) || 0), 0);
  const complete = done >= total && total > 0;
  const orderValue = result.picklist.reduce((s, p) => s + (Number(p.price) || 0) * p.qty, 0);

  const inc = async (p, delta) => {
    if (orderId) {
      try {
        const { data } = await api.post(`/orders/${orderId}/collect`, { product_id: p.product_id, delta });
        setCollected(data.collected);
      } catch (e) { playBeep(false); toast.error(e.response?.data?.error || 'Ошибка'); }
    } else {
      setCollected((c) => {
        const cur = c[p.product_id] || 0;
        const next = Math.min(p.qty, Math.max(0, cur + delta));
        return { ...c, [p.product_id]: next };
      });
    }
  };

  const onScan = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const code = scan.trim();
    setScan('');
    if (!code) return;
    const item = result.picklist.find((p) => p.barcode && String(p.barcode) === code);
    if (!item) { playBeep(false); toast.error('ШК не из этого заказа'); return; }
    const cur = collected[item.product_id] || 0;
    if (cur >= item.qty) { playBeep(false); toast.error(`«${item.name}» уже собрана полностью`); return; }
    playBeep(true);
    inc(item, +1);
  };

  return (
    <div className={'rounded-2xl border overflow-hidden ' + (complete ? 'border-emerald-300 dark:border-emerald-700' : 'border-gray-100 dark:border-gray-800') + ' bg-white dark:bg-gray-900'}>
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-2 min-w-0">
          <Package className="w-4.5 h-4.5 flex-shrink-0 text-primary-600" />
          <span className="font-semibold text-gray-900 dark:text-white truncate">Сборка</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {orderValue > 0 && <span className="text-xs text-gray-400">{orderValue} ₽</span>}
          <span className={'px-2.5 py-1 rounded-lg text-sm font-bold ' + (complete ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300')}>
            {done} / {total}
          </span>
        </div>
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
            className="flex-1 min-w-0 bg-transparent py-2 lg:py-3 text-sm lg:text-base outline-none"
          />
        </div>
      </div>

      <div className="p-3 space-y-1.5">
        {result.picklist.map((p) => {
          const c = collected[p.product_id] || 0;
          const full = c >= p.qty;
          return (
            <div key={p.product_id}
              className={'flex items-center gap-2.5 lg:gap-3 rounded-xl px-3 lg:px-4 py-2 lg:py-3 ' + (full ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-gray-50 dark:bg-gray-800/60')}>
              <button onClick={() => inc(p, +1)}
                className={'w-9 h-9 lg:w-12 lg:h-12 flex-shrink-0 rounded-lg flex items-center justify-center text-sm lg:text-base font-bold ' + (full ? 'bg-emerald-500 text-white' : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600')}>
                {full ? <Check className="w-4 h-4 lg:w-5 lg:h-5" /> : `${c}/${p.qty}`}
              </button>
              <div className="flex-1 min-w-0" onClick={() => inc(p, +1)}>
                <p className="text-sm lg:text-base text-gray-800 dark:text-gray-100 break-words leading-tight">{p.name}</p>
                <p className="text-[11px] text-gray-400 flex items-center gap-2 flex-wrap">
                  {p.barcode && <span className="font-mono break-all">{p.barcode}</span>}
                  {p.price != null && <span className="text-emerald-600 font-medium">{p.price} ₽/шт</span>}
                </p>
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

// Заказ из БД → форма, которую использует рабочая область
function orderToResult(o) {
  return {
    id: o.id, status: o.status, source: o.source, isSaved: true,
    recipient: o.recipient_name, phone: o.recipient_phone,
    city: o.city, city_code: o.city_code, address: o.address, pvz_address: o.pvz_address,
    order_number: null,
    recognized: o.recognized || [], picklist: o.picklist || [], total_bottles: o.total_bottles,
    collected: o.collected || {},
    cdek_uuid: o.cdek_uuid, cdek_number: o.cdek_number, cdek_status: o.cdek_status, pkg: o.pkg,
  };
}

const STATUS_META = {
  new: { label: 'Новый', cls: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300' },
  picking: { label: 'Сборка', cls: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300' },
  assembled: { label: 'Собран', cls: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300' },
  shipped: { label: 'Оформлен', cls: 'bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-300' },
  delivered: { label: 'Доставлен', cls: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300' },
  cancelled: { label: 'Отменён', cls: 'bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-300' },
};
function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.new;
  return <span className={'px-2 py-0.5 rounded-lg text-[11px] font-semibold ' + m.cls}>{m.label}</span>;
}
function fmtDate(s) {
  if (!s) return '';
  const d = new Date(s);
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// Поле «label: value» и группа полей для сводки «как в СДЭК»
function F({ label, v }) {
  return (
    <div className="flex justify-between gap-3 py-1.5 border-b border-gray-50 dark:border-gray-800/60 last:border-0">
      <span className="text-gray-400 flex-shrink-0">{label}</span>
      <span className="text-gray-800 dark:text-gray-100 text-right break-words min-w-0">{(v ?? '') === '' ? '—' : v}</span>
    </div>
  );
}
function FieldGroup({ title, children }) {
  return (
    <div className="rounded-xl border border-gray-100 dark:border-gray-800 p-3">
      <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">{title}</p>
      {children}
    </div>
  );
}

// Габариты + вес коробки по числу баночек (таблица из конфига).
function computeDefaultPkg(bottles, cfg) {
  const n = Math.max(1, bottles || 1);
  const table = cfg?.box_table || [];
  const row = table.find((b) => n <= b.max) || table[table.length - 1] || { length: 20, width: 9, height: 9 };
  const weight = (cfg?.box_tare_g ?? 150) + n * (cfg?.bottle_weight_g ?? 50);
  return { weight, length: row.length, width: row.width, height: row.height };
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
  const [order, setOrder] = useState(result.cdek_uuid ? { uuid: result.cdek_uuid, number: result.order_number, cdek_number: result.cdek_number, cdek_status: result.cdek_status } : null);
  const [labelUrl, setLabelUrl] = useState(null);
  const [showMap, setShowMap] = useState(false);
  const [pkg, setPkg] = useState(null); // { weight, length, width, height } — авто, редактируемо
  const [pkgEdited, setPkgEdited] = useState(false);
  const [imNumber, setImNumber] = useState(result.order_number || '');
  const [showAll, setShowAll] = useState(false);

  // Город/улица/дом получателя. AI отдаёт city и pvz_address отдельными полями;
  // если их нет — аккуратный фолбэк из полного адреса.
  const parseAddr = () => {
    let cityName = (result.city || '').replace(/^(г\.?|город)\s*/i, '').trim();
    let streetSrc = result.pvz_address || '';
    if (!cityName || !streetSrc) {
      const parts = String(result.address || '').split(',').map((s) => s.trim()).filter(Boolean);
      if (!cityName) cityName = (parts.find((p) => /^(г\.?\s*)?[А-ЯЁ][а-яё-]+$/.test(p)) || parts[0] || '').replace(/^(г\.?|город)\s*/i, '').trim();
      if (!streetSrc) streetSrc = parts.find((p) => /(ул|улица|пр|просп|пер|ш|шоссе|бульвар)/i.test(p)) || '';
    }
    const street = streetSrc.replace(/^(ул\.?|улица|пр\.?|проспект|пер\.?|ш\.?|шоссе|б-р|бульвар)\s*/i, '').replace(/,?\s*\d+.*$/, '').trim();
    const house = (streetSrc.match(/\d+[а-я]?/i) || [''])[0];
    return { cityName, street, house };
  };

  useEffect(() => {
    api.get('/orders/cdek/config').then(({ data }) => {
      setCfg(data);
      setShipmentPoint(data.default_shipment_point);
      setPkg(computeDefaultPkg(bottles, data));
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Живой поиск ПВЗ по мере ввода
  useEffect(() => {
    if (!city || pvz) return;
    const t = setTimeout(() => { filterPvz(); }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pvzQuery]);

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
      const { data } = await api.post('/orders/cdek/calculate', { shipment_point: shipmentPoint, to_city_code: city.code, bottles, pkg });
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
        number: imNumber.trim() || undefined,
        tariff_code: tariff.tariff_code,
        shipment_point: shipmentPoint,
        recipient: { name: name.trim(), phone: phone.trim() },
        picklist: result.picklist,
        bottles,
        pkg,
      };
      if (isPvzMode) body.delivery_point = pvz.code;
      else body.to_location = { address: result.address || city.city };
      const { data } = await api.post('/orders/cdek/create', body);
      setOrder({ uuid: data.uuid, number: data.number, cdek_number: null });
      toast.success('Заказ создан в СДЭК');
      if (result.id) api.patch(`/orders/${result.id}`, {
        cdek_uuid: data.uuid, status: 'shipped',
        tariff_code: tariff.tariff_code, tariff_name: tariff.tariff_name,
        shipment_point: shipmentPoint,
        pvz_code: pvz?.code || null, pvz_address: pvz?.address || null,
        city: city?.city || null, city_code: city?.code || null,
        recipient_name: name.trim(), recipient_phone: phone.trim(),
      }).catch(() => {});
      pollOrder(data.uuid);
    } catch (e) { toast.error(e.response?.data?.error || 'Ошибка создания заказа'); }
    finally { setBusy(''); }
  };

  const pollOrder = async (uuid, tries = 0) => {
    try {
      const { data } = await api.get(`/orders/cdek/order/${uuid}`);
      if (data.cdek_number) {
        setOrder((o) => ({ ...o, cdek_number: data.cdek_number }));
        if (result.id) api.patch(`/orders/${result.id}`, { cdek_number: data.cdek_number }).catch(() => {});
        return;
      }
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

  // Подтянуть реальный статус из СДЭК
  const trackStatus = async () => {
    if (!result.id) return;
    setBusy('track');
    try {
      const { data } = await api.get(`/orders/${result.id}/track`);
      setOrder((o) => ({ ...o, cdek_status: data.cdek_status }));
      if (data.cancelled) toast.success('Отменён в СДЭК');
      else toast.success('Статус: ' + (data.cdek_status || '—'));
    } catch (e) { toast.error(e.response?.data?.error || 'Не удалось получить статус'); }
    finally { setBusy(''); }
  };

  const cancelOrder = async () => {
    if (!order?.uuid) return;
    if (!window.confirm('Отменить заказ в СДЭК?')) return;
    setBusy('cancel');
    // Запрос на отмену СДЭК может быть отклонён (заказ уже принят) — не считаем отменённым вслепую
    try { await api.post(`/orders/cdek/cancel/${order.uuid}`); } catch { /* проверим реальный статус ниже */ }
    try {
      const { data } = await api.get(`/orders/${result.id}/track`);
      setOrder((o) => ({ ...o, cdek_status: data.cdek_status }));
      if (data.cancelled) toast.success('Заказ отменён в СДЭК');
      else toast.error(`СДЭК не отменил (статус: ${data.cdek_status || '—'})`);
    } catch { toast.error('Не удалось получить статус отмены'); }
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
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-gray-500">ПВЗ получения</label>
                <button onClick={() => setShowMap(true)} className="text-xs text-rose-600 hover:underline flex items-center gap-1">
                  <MapIcon className="w-3.5 h-3.5" /> На карте
                </button>
              </div>
              <div className="flex gap-2 mt-1">
                <input value={pvzQuery} onChange={(e) => { setPvzQuery(e.target.value); if (pvz) setPvz(null); }} onKeyDown={(e) => e.key === 'Enter' && filterPvz()}
                  placeholder="улица / название / фильтр" className="flex-1 min-w-0 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm" />
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
          {/* Коробка — кнопки-пресеты + своя */}
          {pkg && cfg && (
            <div className="rounded-xl border border-gray-100 dark:border-gray-800 p-3">
              <span className="text-xs font-medium text-gray-500">Коробка · {bottles} бан.</span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 mt-2">
                {(cfg.box_table || []).map((row) => {
                  const active = !pkgEdited && Number(pkg.length) === row.length && Number(pkg.width) === row.width && Number(pkg.height) === row.height;
                  return (
                    <button key={row.max}
                      onClick={() => { setPkg({ weight: (cfg.box_tare_g ?? 150) + bottles * (cfg.bottle_weight_g ?? 50), length: row.length, width: row.width, height: row.height }); setPkgEdited(false); }}
                      className={'rounded-lg border px-2 py-1.5 text-left transition-all ' + (active ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-gray-200 dark:border-gray-700 hover:border-primary-300')}>
                      <p className="text-[11px] font-semibold text-gray-800 dark:text-gray-100">до {row.max} бан.</p>
                      <p className="text-[10px] text-gray-400">{row.length}×{row.width}×{row.height}</p>
                    </button>
                  );
                })}
                <button onClick={() => setPkgEdited(true)}
                  className={'rounded-lg border px-2 py-1.5 text-left transition-all ' + (pkgEdited ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-gray-200 dark:border-gray-700 hover:border-primary-300')}>
                  <p className="text-[11px] font-semibold text-gray-800 dark:text-gray-100">Своя</p>
                  <p className="text-[10px] text-gray-400">вручную</p>
                </button>
              </div>
              {pkgEdited && (
                <div className="grid grid-cols-4 gap-2 mt-2">
                  {[['weight', 'Вес, г'], ['length', 'Д, см'], ['width', 'Ш, см'], ['height', 'В, см']].map(([k, label]) => (
                    <label key={k} className="text-[10px] text-gray-400 block">
                      {label}
                      <input type="number" min="0" step={k === 'weight' ? '10' : '0.5'} value={pkg[k]}
                        onChange={(e) => { const v = e.target.value; setPkg((prev) => ({ ...prev, [k]: v === '' ? '' : Number(v) })); }}
                        className="mt-0.5 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm text-gray-800 dark:text-gray-100" />
                    </label>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-gray-400 mt-1.5">Вес {pkg.weight} г · {pkg.length}×{pkg.width}×{pkg.height} см</p>
            </div>
          )}

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
              {order.cdek_status && <p className="text-gray-600 dark:text-gray-300">Статус СДЭК: <span className="font-medium">{order.cdek_status}</span></p>}
              <button onClick={trackStatus} disabled={busy === 'track'}
                className="mt-1 w-full py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center gap-2">
                {busy === 'track' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Отследить статус СДЭК
              </button>
              <button onClick={printLabel} disabled={busy === 'print'}
                className="mt-1 w-full py-2 rounded-xl bg-gray-900 dark:bg-gray-700 text-white text-sm font-medium hover:opacity-90 flex items-center justify-center gap-2">
                {busy === 'print' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                Печать этикетки
              </button>
              {labelUrl && <a href={labelUrl} target="_blank" rel="noreferrer" className="block text-center text-xs text-primary-600 hover:underline">Открыть PDF этикетки</a>}
              <button onClick={cancelOrder} disabled={busy === 'cancel'}
                className="mt-1 w-full py-2 rounded-xl border border-rose-200 dark:border-rose-800 text-rose-600 text-sm font-medium hover:bg-rose-50 dark:hover:bg-rose-900/20 flex items-center justify-center gap-2">
                {busy === 'cancel' ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                Отменить заказ
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Все поля заказа (как в СДЭК) — скрыто, раскрывается */}
      <div className="border-t border-gray-100 dark:border-gray-800">
        <button onClick={() => setShowAll((v) => !v)} className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white">
          <span>Все поля заказа (как в СДЭК)</span>
          <span className="text-gray-400 text-xs">{showAll ? 'скрыть' : 'показать'}</span>
        </button>
        {showAll && (
          <div className="px-4 pb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4 text-sm">
            <FieldGroup title="Отправитель">
              <F label="Тип заказа" v="интернет-магазин" />
              <F label="Контрагент" v={cfg?.sender?.company} />
              <F label="ИНН" v={cfg?.sender?.inn} />
              <F label="ФИО" v={cfg?.sender?.name} />
              <F label="Телефон" v={cfg?.sender?.phone} />
              <F label="Город отправл." v={(cfg?.shipment_points || []).find((p) => p.code === shipmentPoint)?.name} />
              <F label="Истинный продавец" v={cfg?.sender?.true_seller} />
            </FieldGroup>

            <FieldGroup title="Получатель">
              <F label="ФИО" v={name} />
              <F label="Телефон" v={phone} />
              <F label="Город" v={city ? `${city.city} (код ${city.code})` : ''} />
              <F label="ПВЗ" v={pvz ? `${pvz.code}` : ''} />
              <F label="Адрес ПВЗ" v={pvz?.address} />
            </FieldGroup>

            <FieldGroup title="Грузоместо">
              <F label="Мест" v="1" />
              <F label="Баночек" v={bottles} />
              <F label="Вес" v={pkg ? `${pkg.weight} г` : ''} />
              <F label="Габариты" v={pkg ? `${pkg.length}×${pkg.width}×${pkg.height} см` : ''} />
            </FieldGroup>

            <FieldGroup title="Заказ">
              <div className="py-1.5">
                <span className="text-gray-400 block mb-0.5">№ отправления ИМ</span>
                <input value={imNumber} onChange={(e) => setImNumber(e.target.value)} placeholder="сгенерируется автоматически"
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm" />
              </div>
              <F label="Тариф" v={tariff ? `${tariff.tariff_name} · ${tariff.delivery_sum}₽` : ''} />
              <F label="Трек СДЭК" v={order?.cdek_number} />
              <F label="Статус СДЭК" v={order?.cdek_status} />
            </FieldGroup>
          </div>
        )}
      </div>

      {showMap && city && (
        <CdekMapPicker
          cityCode={city.code} cityName={city.city} selectedCode={pvz?.code}
          onSelect={(p) => { setPvz(p); setPvzQuery(''); }}
          onClose={() => setShowMap(false)}
        />
      )}
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

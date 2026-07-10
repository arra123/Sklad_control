import { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, Loader2, Check, AlertTriangle, X, ImageIcon, Package } from 'lucide-react';
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

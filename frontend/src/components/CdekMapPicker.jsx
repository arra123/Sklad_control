import { useEffect, useRef, useState } from 'react';
import { X, Loader2, MapPin } from 'lucide-react';
import api from '../api/client';

// Ленивая загрузка Leaflet с CDN (без npm-зависимости, тайлы OSM без ключей).
let leafletPromise = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    if (!document.getElementById('leaflet-css')) {
      const css = document.createElement('link');
      css.id = 'leaflet-css';
      css.rel = 'stylesheet';
      css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(css);
    }
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    s.async = true;
    s.onload = () => resolve(window.L);
    s.onerror = () => reject(new Error('Не удалось загрузить карту'));
    document.head.appendChild(s);
  });
  return leafletPromise;
}

function pinHtml(color) {
  return `<div style="width:16px;height:16px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45)"></div>`;
}

export default function CdekMapPicker({ cityCode, cityName, selectedCode, onSelect, onClose }) {
  const mapRef = useRef(null);
  const mapObj = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const L = await loadLeaflet();
        const { data: points } = await api.get('/orders/cdek/pvz', { params: { city_code: cityCode } });
        if (cancelled) return;
        const pts = (points || []).filter((p) => p.lat && p.lng);
        setCount(pts.length);

        if (!mapRef.current) return;
        const center = pts.length ? [pts[0].lat, pts[0].lng] : [55.751, 37.618];
        const map = L.map(mapRef.current, { scrollWheelZoom: true }).setView(center, 11);
        mapObj.current = map;
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19, attribution: '&copy; OpenStreetMap',
        }).addTo(map);

        const latlngs = [];
        pts.forEach((p) => {
          const isSel = p.code === selectedCode;
          const icon = L.divIcon({
            className: 'cdek-pin',
            html: pinHtml(isSel ? '#059669' : '#e11d48'),
            iconSize: [16, 16],
            iconAnchor: [8, 16],
            popupAnchor: [0, -14],
          });
          const m = L.marker([p.lat, p.lng], { icon }).addTo(map);
          m.bindTooltip(`${p.code} · ${p.address || ''}`, { direction: 'top', offset: [0, -12] });
          m.on('click', () => { onSelect(p); onClose(); });
          latlngs.push([p.lat, p.lng]);
        });
        if (latlngs.length) map.fitBounds(latlngs, { padding: [30, 30], maxZoom: 14 });

        // Leaflet иногда неверно считает размер в модалке — пересчёт после отрисовки
        setTimeout(() => map.invalidateSize(), 200);
        setLoading(false);
      } catch (e) {
        if (!cancelled) { setError(e.message || 'Ошибка карты'); setLoading(false); }
      }
    })();
    return () => {
      cancelled = true;
      if (mapObj.current) { mapObj.current.remove(); mapObj.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityCode]);

  return (
    <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-3" onClick={onClose}>
      <div className="w-full max-w-3xl bg-white dark:bg-gray-900 rounded-2xl overflow-hidden shadow-2xl flex flex-col" style={{ maxHeight: '90vh' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2 min-w-0">
            <MapPin className="w-4.5 h-4.5 flex-shrink-0 text-rose-500" />
            <span className="font-semibold text-gray-900 dark:text-white truncate">ПВЗ СДЭК{cityName ? ` · ${cityName}` : ''}</span>
            {count > 0 && <span className="text-xs text-gray-400 flex-shrink-0">{count} пунктов</span>}
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="relative flex-1" style={{ minHeight: '60vh' }}>
          <div ref={mapRef} className="absolute inset-0" />
          {loading && (
            <div className="absolute inset-0 bg-white/70 dark:bg-gray-900/70 flex flex-col items-center justify-center gap-2 z-[10]">
              <Loader2 className="w-7 h-7 text-rose-500 animate-spin" />
              <span className="text-sm text-gray-600 dark:text-gray-300">Загружаю карту и пункты…</span>
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center z-[10]">
              <p className="text-sm text-rose-600">{error}</p>
            </div>
          )}
        </div>

        <div className="px-4 py-2.5 border-t border-gray-100 dark:border-gray-800 text-xs text-gray-400">
          Нажмите на метку, чтобы выбрать пункт выдачи
        </div>
      </div>
    </div>
  );
}

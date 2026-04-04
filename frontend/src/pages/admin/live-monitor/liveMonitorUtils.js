export function timeAgo(iso) {
  if (!iso) return '—';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}с назад`;
  if (diff < 3600) return `${Math.floor(diff / 60)}м назад`;
  return `${Math.floor(diff / 3600)}ч назад`;
}

export function fmtNum(n) { return Number(n || 0).toLocaleString('ru-RU'); }
export function fmtCompact(n) { const v = Number(n || 0); return v >= 1000 ? `${(v/1000).toFixed(1)}к` : String(v); }

export function fmtDuration(seconds) {
  if (!seconds || seconds <= 0) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}ч ${m}м`;
  if (m > 0) return `${m}м ${s}с`;
  return `${s}с`;
}

export function fmtTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function taskTypeLabel(t) {
  if (t === 'bundle_assembly') return 'Сборка';
  if (t === 'packaging') return 'Оприход.';
  if (t === 'production_transfer') return 'Перенос';
  if (t === 'returns') return 'Возвраты';
  return 'Инвент.';
}

export function taskTypeBg(t) {
  if (t === 'bundle_assembly') return 'bg-green-100 text-green-700';
  if (t === 'packaging') return 'bg-purple-100 text-purple-700';
  if (t === 'production_transfer') return 'bg-amber-100 text-amber-700';
  if (t === 'returns') return 'bg-teal-100 text-teal-700';
  return 'bg-blue-100 text-blue-700';
}

export function taskTypeBarColor(t) {
  if (t === 'bundle_assembly') return '#22c55e';
  if (t === 'packaging') return '#a855f7';
  if (t === 'production_transfer') return '#f59e0b';
  return '#3b82f6';
}

export function taskTypeActiveBarColor(t) {
  if (t === 'bundle_assembly') return '#bbf7d0';
  if (t === 'packaging') return '#e9d5ff';
  if (t === 'production_transfer') return '#fef3c7';
  return '#dbeafe';
}

export function statusBadge(status) {
  if (status === 'completed') return { label: 'Готово', cls: 'bg-green-100 text-green-700' };
  if (status === 'in_progress') return { label: 'В работе', cls: 'bg-amber-100 text-amber-700' };
  if (status === 'paused') return { label: 'Пауза', cls: 'bg-gray-100 text-gray-600' };
  return { label: status, cls: 'bg-gray-100 text-gray-600' };
}

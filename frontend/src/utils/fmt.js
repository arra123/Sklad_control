/** Форматирует количество: убирает лишние нули (16.000 → 16, 1.5 → 1.5) */
export function qty(v) {
  const n = Number(v);
  if (isNaN(n)) return v ?? '';
  return n % 1 === 0 ? String(Math.round(n)) : String(n);
}

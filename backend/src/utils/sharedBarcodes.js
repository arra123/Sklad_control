// Исключения: один и тот же ШК разрешён сразу на нескольких товарах.
// Это НЕ общее правило склада — точечные случаи. Пример: новый и старый
// товар временно проводятся по одной этикетке, пока для второго нет этикеток.
// Формат: { barcode, productIds } — делить ШК могут ТОЛЬКО перечисленные товары.
const SHARED_BARCODE_EXCEPTIONS = [
  // 400000000282: старый (id 28) и новый (id 192) товар, этикетки одни на двоих
  { barcode: '400000000282', productIds: [28, 192] },
];

// Можно ли добавить barcode товару targetId, если он уже есть у товаров ownerIds:
// и целевой товар, и все текущие владельцы должны быть в списке исключения.
function isSharedBarcodeAllowed(barcode, targetId, ownerIds = []) {
  const bc = String(barcode).trim();
  const ex = SHARED_BARCODE_EXCEPTIONS.find(e => e.barcode === bc);
  if (!ex) return false;
  if (!ex.productIds.includes(Number(targetId))) return false;
  return ownerIds.every(id => ex.productIds.includes(Number(id)));
}

// Из нескольких товаров, найденных по одному ШК (shared-исключение),
// выбрать подходящего по контексту; без контекста — первый (минимальный id).
function pickPreferredProduct(rows, preferredIds = []) {
  if (!rows.length) return null;
  if (rows.length === 1) return rows[0];
  const pref = new Set((preferredIds || []).map(Number));
  return rows.find(r => pref.has(Number(r.id))) || rows[0];
}

// Идемпотентно дописывает shared-ШК в barcode_list перечисленных товаров.
// Вызывается при старте сервера (schema.js) и после импорта из МойСклад,
// который перезаписывает barcode_list значениями из МС.
async function applySharedBarcodeExceptions(db) {
  for (const ex of SHARED_BARCODE_EXCEPTIONS) {
    await db.query(
      `UPDATE products_s
       SET barcode_list = CASE
             WHEN COALESCE(barcode_list, '') = '' THEN $1
             ELSE barcode_list || ';' || $1
           END,
           updated_at = NOW()
       WHERE id = ANY($2)
         AND NOT ($1 = ANY(string_to_array(COALESCE(barcode_list, ''), ';')))
         AND production_barcode IS DISTINCT FROM $1
         AND NOT (COALESCE(marketplace_barcodes_json, '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('value', $1)))`,
      [ex.barcode, ex.productIds]
    );
  }
}

module.exports = {
  SHARED_BARCODE_EXCEPTIONS,
  isSharedBarcodeAllowed,
  pickPreferredProduct,
  applySharedBarcodeExceptions,
};

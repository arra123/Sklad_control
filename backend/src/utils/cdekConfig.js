// ─── Настройки отправителя и грузомест для СДЭК ──────────────────────────────
// Бизнес-данные GRAflab. Правятся здесь (не секреты — можно в git).

// Отправитель (договор интернет-магазина СДЭК).
const SENDER = {
  company: 'Швыдченко Евгений Николаевич',
  name: 'Швыдченко Евгений Николаевич',
  inn: '773134726805',
  phone: '+79773296448',
  true_seller: 'Франко', // истинный продавец (данные ИМ)
};

// Пункты отправки (ПВЗ СДЭК, откуда сдаём посылки). Первый — по умолчанию.
const SHIPMENT_POINTS = [
  { code: 'ODN70', name: 'Одинцово, ул. Сколковская, 1А (по умолчанию)', city_code: 520 },
];

// Отправляем всегда из ПВЗ (склад) → допустимы только режимы склад-*:
// 3 = склад-дверь (курьер), 4 = склад-склад (ПВЗ), 7 = склад-постамат.
const SENDER_DELIVERY_MODES = [3, 4, 7];
const DEFAULT_SHIPMENT_POINT = SHIPMENT_POINTS[0].code;

// Веса (граммы). Точный вес баночки уточняется — параметр.
const BOX_TARE_G = 150;      // вес пустой коробки
const BOTTLE_WEIGHT_G = 50;  // вес одной баночки (оценка, поправим фактическим)

// Реальная таблица коробок (см) по числу баночек. max — верхняя граница по числу банок.
const BOX_TABLE = [
  { max: 1, length: 9, width: 6.5, height: 6.5 },
  { max: 2, length: 12.5, width: 8, height: 6.5 },
  { max: 3, length: 19, width: 10, height: 6 },
  { max: 4, length: 11, width: 11, height: 11 },
  { max: 5, length: 17, width: 12, height: 10 },
  { max: 6, length: 20, width: 13.5, height: 11 },
  { max: 12, length: 23, width: 16, height: 10 },
];

// Габариты коробки по числу баночек: берём первую коробку, куда влезает.
function boxDimensions(bottles) {
  const n = Math.max(1, Number(bottles) || 1);
  const row = BOX_TABLE.find((b) => n <= b.max) || BOX_TABLE[BOX_TABLE.length - 1];
  return { length: row.length, width: row.width, height: row.height };
}

// Рассчитать грузоместо по числу баночек.
function computePackage(bottles) {
  const n = Math.max(1, Number(bottles) || 1);
  return {
    weight: BOX_TARE_G + n * BOTTLE_WEIGHT_G, // граммы
    ...boxDimensions(n),
  };
}

module.exports = {
  SENDER,
  SHIPMENT_POINTS,
  SENDER_DELIVERY_MODES,
  DEFAULT_SHIPMENT_POINT,
  BOX_TARE_G,
  BOTTLE_WEIGHT_G,
  BOX_TABLE,
  boxDimensions,
  computePackage,
};

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

// Габариты коробки (см) в зависимости от числа баночек.
function boxDimensions(bottles) {
  if (bottles <= 8) return { length: 20, width: 9, height: 9 };
  if (bottles <= 16) return { length: 25, width: 18, height: 9 };
  if (bottles <= 30) return { length: 33, width: 20, height: 18 };
  return { length: 40, width: 30, height: 20 };
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
  boxDimensions,
  computePackage,
};

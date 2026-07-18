// ─── Настройки отправителя и грузомест для СДЭК ──────────────────────────────
// Бизнес-данные GRAflab. Правятся здесь (не секреты — можно в git).

// Отправитель (договор интернет-магазина СДЭК). Значения по умолчанию —
// на фронте все поля редактируются перед оформлением заказа.
const SENDER = {
  company: 'Швыдченко Евгений Николаевич', // контрагент
  name: 'Гридина Кристина Александровна',  // контактное ФИО
  inn: '773134726805',
  phone: '+79999100701',                   // 8 (999) 910-07-01
  country: 'Россия',
  city: 'Одинцово',
  address: 'Россия, Московская область, Одинцово, ул. Сколковская, 1А, 1.2',
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
// 4 фактические коробки склада (банка Ø5×7: в двух младших лежит, т.к. высота < 7).
const BOX_TABLE = [
  { max: 1, length: 8.5, width: 7, height: 6.5 },
  { max: 3, length: 18.5, width: 9.5, height: 5.5 },
  { max: 7, length: 18.5, width: 13, height: 11 },
  { max: 14, length: 22.5, width: 16, height: 11 },
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

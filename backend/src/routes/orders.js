const router = require('express').Router();
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const aiProxy = require('../utils/aiProxy');
const cdek = require('../utils/cdek');
const cdekCfg = require('../utils/cdekConfig');

// ─── Сопоставление названия из скриншота с товаром в БД ──────────────────────
// Нормализация: нижний регистр, убрать пунктуацию, схлопнуть пробелы.
function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]+/gi, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

// Стоп-слова: общие для всех БАД токены, только зашумляют сопоставление.
const MATCH_STOP = new Set([
  'набор', 'наборы', 'банка', 'банки', 'банок', 'банке', 'по', 'шт', 'штук', 'штука',
  'капсул', 'капсула', 'капсулы', 'капсулах', 'мг', 'мл', 'г', 'грамм', 'гр', 'для',
  'graflab', 'граflab', 'up', 'ап', 'и', 'в',
]);

// Ядро названия: убрать стоп-слова и числа — остаются различающие термины.
function core(s) {
  return normalize(s).split(' ').filter((w) => w && !MATCH_STOP.has(w) && !/^\d+$/.test(w)).join(' ');
}

// Биграммы для коэффициента Дайса.
function bigrams(s) {
  const set = new Map();
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2);
    set.set(g, (set.get(g) || 0) + 1);
  }
  return set;
}

function diceScore(a, b) {
  const na = core(a);
  const nb = core(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ba = bigrams(na);
  const bb = bigrams(nb);
  let inter = 0;
  for (const [g, c] of ba) {
    if (bb.has(g)) inter += Math.min(c, bb.get(g));
  }
  const total = [...ba.values()].reduce((s, c) => s + c, 0) + [...bb.values()].reduce((s, c) => s + c, 0);
  return total ? (2 * inter) / total : 0;
}

// Заказ хочет НАБОР (несколько баночек)? — по слову «набор/банки» или числу капсул > 60.
function wantsBundle(raw) {
  const n = normalize(raw);
  if (/набор|банк/.test(n)) return true;
  const m = n.match(/(\d+)\s*капсул/);
  return Boolean(m && Number(m[1]) > 60);
}

const MATCH_THRESHOLD = 0.34;

// Лучшее совпадение: по ядру названия, с учётом «набор vs единичный товар».
// Среди близких кандидатов выбираем bundle, если строка про набор, иначе — product.
function bestMatch(name, catalog) {
  const scored = catalog
    .map((p) => ({ p, s: diceScore(name, p.name) }))
    .sort((a, b) => b.s - a.s);
  const best = scored[0];
  if (!best || best.s < MATCH_THRESHOLD) return { product: null, score: best?.s || 0 };
  const want = wantsBundle(name);
  const near = scored.filter((x) => x.s >= best.s - 0.12);
  const pick = near.find((x) => (want ? x.p.entity_type === 'bundle' : x.p.entity_type === 'product')) || best;
  return { product: pick.p, score: pick.s };
}

// Рекурсивный разворот товара/набора в плоский список баночек.
// Возвращает Map: product_id → { product_id, name, barcode, qty }.
async function expandProduct(client, productId, qty, acc, depth = 0, visited = new Set()) {
  if (depth > 5 || visited.has(productId)) return;
  const r = await client.query(
    `SELECT id, name, entity_type, production_barcode, barcode_list, sale_price FROM products_s WHERE id = $1`,
    [productId]
  );
  const p = r.rows[0];
  if (!p) return;

  if (p.entity_type !== 'bundle') {
    const cur = acc.get(p.id) || {
      product_id: p.id,
      name: p.name,
      barcode: p.production_barcode || (p.barcode_list ? p.barcode_list.split(';')[0] : null),
      price: p.sale_price != null ? Number(p.sale_price) : null, // цена баночки из каталога
      qty: 0,
    };
    cur.qty += qty;
    acc.set(p.id, cur);
    return;
  }

  // Набор → компоненты из bundle_components_s
  const nextVisited = new Set(visited).add(productId);
  let comps = await client.query(
    `SELECT bc.component_id, bc.quantity FROM bundle_components_s bc
     WHERE bc.bundle_id = $1 AND bc.component_id IS NOT NULL`,
    [productId]
  );

  // Fallback: source_json (как в assembly.js)
  if (comps.rows.length === 0) {
    const full = await client.query('SELECT source_json FROM products_s WHERE id = $1', [productId]);
    const rows = full.rows[0]?.source_json?.components?.rows || [];
    const extIds = rows.map((x) => x.assortmentDetails?.id).filter(Boolean);
    if (extIds.length) {
      const q = {};
      rows.forEach((x) => { if (x.assortmentDetails?.id) q[x.assortmentDetails.id] = x.quantity || 1; });
      const resolved = await client.query(
        'SELECT id, external_id FROM products_s WHERE external_id = ANY($1)', [extIds]
      );
      comps = { rows: resolved.rows.map((c) => ({ component_id: c.id, quantity: q[c.external_id] || 1 })) };
    }
  }

  if (comps.rows.length === 0) {
    // Набор без компонентов — пикаем как единицу, чтобы не потерять позицию
    const cur = acc.get(p.id) || { product_id: p.id, name: p.name + ' (набор)', barcode: p.production_barcode, qty: 0 };
    cur.qty += qty;
    acc.set(p.id, cur);
    return;
  }

  for (const c of comps.rows) {
    await expandProduct(client, c.component_id, qty * Number(c.quantity || 1), acc, depth + 1, nextVisited);
  }
}

// ─── POST /parse-screenshot — распознать заказ по фото и собрать пик-лист ─────
router.post('/parse-screenshot', requireAuth, async (req, res) => {
  const { image } = req.body || {};
  if (!image || typeof image !== 'string') {
    return res.status(400).json({ error: 'Нужно поле image (data:image/...;base64,...)' });
  }
  if (!aiProxy.isConfigured()) {
    return res.status(503).json({ error: 'AI-прокси не настроен (AI_PROXY_KEY)' });
  }

  const client = await pool.connect();
  try {
    // 1) Распознать состав через AI Vision
    const parsed = await aiProxy.parseOrderScreenshot(image);

    // 2) Каталог для сопоставления
    const cat = await client.query(
      `SELECT id, name, entity_type FROM products_s WHERE archived = false`
    );
    const catalog = cat.rows;

    // 3) Сопоставить + развернуть наборы
    const recognized = [];
    const picklistAcc = new Map();

    for (const item of parsed.items) {
      const qty = Math.max(1, Number(item.quantity) || 1);
      const { product, score } = bestMatch(item.name, catalog);
      const matched = product && score >= MATCH_THRESHOLD;
      const isBundle = matched && product.entity_type === 'bundle';

      let itemBottles = 0;
      let bundleEmpty = false;
      if (matched) {
        // Раскладываем позицию в отдельную корзину — чтобы знать вклад именно этой строки
        const tmp = new Map();
        await expandProduct(client, product.id, qty, tmp);
        itemBottles = [...tmp.values()].reduce((s, p) => s + p.qty, 0);
        // Набор без компонентов в каталоге разворачивается «сам в себя» → счёт занижен
        bundleEmpty = isBundle && tmp.size === 1 && tmp.has(product.id);
        for (const [id, v] of tmp) {
          const cur = picklistAcc.get(id) || { ...v, qty: 0 };
          cur.qty += v.qty;
          picklistAcc.set(id, cur);
        }
      }

      recognized.push({
        raw_name: item.name,
        quantity: qty,
        price: item.price ?? null,
        matched: Boolean(matched),
        confidence: Math.round(score * 100),
        product_id: matched ? product.id : null,
        product_name: matched ? product.name : null,
        is_bundle: isBundle,
        bottles: itemBottles,
        bundle_empty: bundleEmpty, // набор без состава в каталоге — счёт под вопросом
      });
    }

    const picklist = [...picklistAcc.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    const total_bottles = picklist.reduce((s, p) => s + p.qty, 0);
    const unmatched = recognized.filter((r) => !r.matched).length;
    const bundle_warnings = recognized.filter((r) => r.bundle_empty).length;

    res.json({
      recipient: parsed.recipient || null,
      phone: parsed.phone || null,
      city: parsed.city || null,
      pvz_address: parsed.pvz_address || null,
      address: parsed.address || null,
      delivery: parsed.delivery || null,
      total: parsed.total ?? null,
      order_number: parsed.order_number || null,
      track: parsed.track || null,
      recognized,
      picklist,
      total_bottles,
      unmatched,
      bundle_warnings,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// POST /build-picklist — собрать пик-лист из выбранных товаров (ручной заказ)
// body: { items: [{ product_id, qty }] } → та же структура, что у parse-screenshot
router.post('/build-picklist', requireAuth, async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!items.length) return res.status(400).json({ error: 'Пустой список товаров' });
  const client = await pool.connect();
  try {
    const picklistAcc = new Map();
    const recognized = [];
    for (const it of items) {
      const pid = Number(it.product_id);
      const qty = Math.max(1, Number(it.qty) || 1);
      if (!pid) continue;
      const info = await client.query('SELECT id, name, entity_type FROM products_s WHERE id=$1', [pid]);
      if (!info.rows.length) continue;
      const tmp = new Map();
      await expandProduct(client, pid, qty, tmp);
      const bottles = [...tmp.values()].reduce((s, p) => s + p.qty, 0);
      for (const [id, v] of tmp) {
        const cur = picklistAcc.get(id) || { ...v, qty: 0 };
        cur.qty += v.qty;
        picklistAcc.set(id, cur);
      }
      recognized.push({
        raw_name: info.rows[0].name, quantity: qty, matched: true, confidence: 100,
        product_id: pid, product_name: info.rows[0].name,
        is_bundle: info.rows[0].entity_type === 'bundle', bottles, bundle_empty: false,
      });
    }
    const picklist = [...picklistAcc.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    const total_bottles = picklist.reduce((s, p) => s + p.qty, 0);
    res.json({
      recipient: null, phone: null, city: null, pvz_address: null, address: null,
      order_number: null, recognized, picklist, total_bottles, unmatched: 0, bundle_warnings: 0,
      manual: true,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// ════════════════════════════════════════════════════════════════════════════
//  СДЭК — оформление доставки
// ════════════════════════════════════════════════════════════════════════════

// Валидация ручного override габаритов/веса. Возвращает объект или null.
function normalizePkg(o) {
  if (!o) return null;
  const weight = Number(o.weight), length = Number(o.length), width = Number(o.width), height = Number(o.height);
  if ([weight, length, width, height].some((v) => !v || v <= 0)) return null;
  return { weight, length, width, height };
}

// СДЭК принимает целые см и граммы — округляем габариты вверх, вес — до целого.
function cdekPkgDims(pkg) {
  return {
    weight: Math.round(pkg.weight),
    length: Math.ceil(pkg.length),
    width: Math.ceil(pkg.width),
    height: Math.ceil(pkg.height),
  };
}

function cdekReady(res) {
  if (!cdek.isConfigured()) {
    res.status(503).json({ error: 'СДЭК API не настроен (CDEK_CLIENT_ID / CDEK_CLIENT_SECRET)' });
    return false;
  }
  return true;
}

// GET /cdek/config — данные отправителя, пункты отправки, параметры веса
router.get('/cdek/config', requireAuth, (req, res) => {
  res.json({
    configured: cdek.isConfigured(),
    sender: cdekCfg.SENDER,
    shipment_points: cdekCfg.SHIPMENT_POINTS,
    default_shipment_point: cdekCfg.DEFAULT_SHIPMENT_POINT,
    box_tare_g: cdekCfg.BOX_TARE_G,
    bottle_weight_g: cdekCfg.BOTTLE_WEIGHT_G,
    box_table: cdekCfg.BOX_TABLE,
  });
});

// GET /cdek/cities?name=Москва — поиск кода города
router.get('/cdek/cities', requireAuth, async (req, res) => {
  if (!cdekReady(res)) return;
  try {
    const r = await cdek.cities({ city: req.query.name || '', size: 10, country_codes: 'RU' });
    const list = (Array.isArray(r.json) ? r.json : []).map((c) => ({
      code: c.code, city: c.city, region: c.region, fias_guid: c.fias_guid,
    }));
    res.json(list);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /cdek/pvz?city_code=44&query=Цимлянская — список ПВЗ получения
router.get('/cdek/pvz', requireAuth, async (req, res) => {
  if (!cdekReady(res)) return;
  const { city_code, query, type } = req.query;
  if (!city_code) return res.status(400).json({ error: 'Нужен city_code' });
  try {
    const r = await cdek.deliveryPoints({ city_code, type: type || 'ALL', size: 1000 });
    let list = (Array.isArray(r.json) ? r.json : []).map((p) => ({
      code: p.code,
      name: p.name,
      // Чистый полный адрес: «Город, улица, дом» (address_full замусорен индексом/страной)
      address: [p.location?.city, p.location?.address].filter(Boolean).join(', ') || p.location?.address_full,
      short_address: p.location?.address,
      city: p.location?.city,
      city_code: p.location?.city_code,
      lat: p.location?.latitude ?? null,
      lng: p.location?.longitude ?? null,
      type: p.type,
      work_time: p.work_time,
      have_cashless: p.have_cashless,
      nearest_station: p.nearest_station,
    }));
    if (query) {
      const q = normalize(query);
      list = list.filter((p) => normalize(p.address).includes(q) || normalize(p.name).includes(q));
    }
    // На карту нужны все точки города; для списка ограничиваем.
    res.json(query ? list.slice(0, 60) : list.slice(0, 800));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /cdek/calculate — тарифы для заказа (только склад-* режимы)
// body: { shipment_point?, to_city_code, bottles }
router.post('/cdek/calculate', requireAuth, async (req, res) => {
  if (!cdekReady(res)) return;
  const { shipment_point, to_city_code, bottles, pkg: pkgOverride } = req.body || {};
  if (!to_city_code) return res.status(400).json({ error: 'Нужен to_city_code' });

  const point = cdekCfg.SHIPMENT_POINTS.find((p) => p.code === (shipment_point || cdekCfg.DEFAULT_SHIPMENT_POINT))
    || cdekCfg.SHIPMENT_POINTS[0];
  const pkg = normalizePkg(pkgOverride) || cdekCfg.computePackage(bottles);

  try {
    const r = await cdek.calcTariffList({
      type: 1,
      from_location: { code: point.city_code },
      to_location: { code: Number(to_city_code) },
      packages: [{ ...cdekPkgDims(pkg) }],
    });
    if (r.status !== 200 || !r.json?.tariff_codes) {
      return res.status(502).json({ error: 'СДЭК калькулятор: ' + (r.json?.errors?.[0]?.message || r.text?.slice(0, 200)) });
    }
    const tariffs = r.json.tariff_codes
      .filter((t) => cdekCfg.SENDER_DELIVERY_MODES.includes(t.delivery_mode))
      .map((t) => ({
        tariff_code: t.tariff_code,
        tariff_name: t.tariff_name,
        delivery_mode: t.delivery_mode, // 3 склад-дверь, 4 склад-склад, 7 склад-постамат
        delivery_sum: t.delivery_sum,
        period_min: t.period_min,
        period_max: t.period_max,
      }))
      .sort((a, b) => a.delivery_sum - b.delivery_sum);
    res.json({ package: pkg, tariffs });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /cdek/create — создать заказ в СДЭК
// body: { number?, tariff_code, shipment_point?, delivery_point?, to_location?,
//         recipient:{name,phone}, picklist:[{name,barcode,product_id,qty,cost?}], bottles }
router.post('/cdek/create', requireAuth, async (req, res) => {
  if (!cdekReady(res)) return;
  const b = req.body || {};
  if (!b.tariff_code) return res.status(400).json({ error: 'Нужен tariff_code' });
  if (!b.recipient?.name || !b.recipient?.phone) return res.status(400).json({ error: 'Нужны ФИО и телефон получателя' });
  if (!b.delivery_point && !b.to_location?.address) {
    return res.status(400).json({ error: 'Нужен delivery_point (ПВЗ) или to_location.address' });
  }
  const picklist = Array.isArray(b.picklist) ? b.picklist : [];
  if (picklist.length === 0) return res.status(400).json({ error: 'Пустой состав заказа' });

  const point = cdekCfg.SHIPMENT_POINTS.find((p) => p.code === (b.shipment_point || cdekCfg.DEFAULT_SHIPMENT_POINT))
    || cdekCfg.SHIPMENT_POINTS[0];
  const bottles = picklist.reduce((s, p) => s + (Number(p.qty) || 0), 0);
  const pkg = normalizePkg(b.pkg) || cdekCfg.computePackage(bottles);
  const number = String(b.number || `GRA-${Date.now()}`).slice(0, 40);

  const items = picklist.map((p, i) => ({
    name: p.name,
    ware_key: String(p.barcode || p.product_id || `pos${i + 1}`).slice(0, 50),
    payment: { value: 0 }, // предоплата, наложенного платежа нет
    cost: Number(p.cost ?? p.price) || 0, // объявленная ценность за ед. (цена баночки)
    weight: cdekCfg.BOTTLE_WEIGHT_G,
    amount: Math.max(1, Number(p.qty) || 1),
  }));

  const payload = {
    type: 1, // интернет-магазин
    number,
    tariff_code: Number(b.tariff_code),
    shipment_point: point.code,
    sender: {
      company: cdekCfg.SENDER.company,
      name: cdekCfg.SENDER.name,
      phones: [{ number: cdekCfg.SENDER.phone }],
    },
    recipient: {
      name: b.recipient.name,
      phones: [{ number: b.recipient.phone }],
    },
    packages: [{
      number: '1',
      ...cdekPkgDims(pkg),
      items,
    }],
  };
  if (b.delivery_point) payload.delivery_point = b.delivery_point;
  else payload.to_location = { address: b.to_location.address };
  if (b.recipient.email) payload.recipient.email = b.recipient.email;

  try {
    const r = await cdek.createOrder(payload);
    if (r.status !== 202 && r.status !== 200) {
      const msg = r.json?.requests?.[0]?.errors?.[0]?.message
        || r.json?.errors?.[0]?.message || r.text?.slice(0, 300);
      return res.status(502).json({ error: 'СДЭК не принял заказ: ' + msg, raw: r.json });
    }
    const uuid = r.json?.entity?.uuid;
    res.json({ ok: true, uuid, number, status: r.status });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /cdek/cancel/:uuid — отменить заказ в СДЭК
router.post('/cdek/cancel/:uuid', requireAuth, async (req, res) => {
  if (!cdekReady(res)) return;
  try {
    const r = await cdek.deleteOrder(req.params.uuid);
    if (r.status !== 200 && r.status !== 202) {
      const msg = r.json?.requests?.[0]?.errors?.[0]?.message || r.json?.errors?.[0]?.message || r.text?.slice(0, 200);
      return res.status(502).json({ error: 'СДЭК не отменил заказ: ' + msg });
    }
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /cdek/order/:uuid — статус и номер СДЭК
router.get('/cdek/order/:uuid', requireAuth, async (req, res) => {
  if (!cdekReady(res)) return;
  try {
    const r = await cdek.getOrder(req.params.uuid);
    const e = r.json?.entity;
    if (!e) return res.status(r.status || 404).json({ error: 'Заказ не найден', raw: r.json });
    res.json({
      uuid: e.uuid,
      cdek_number: e.cdek_number,
      number: e.number,
      statuses: (e.statuses || []).map((s) => ({ code: s.code, name: s.name, date: s.date_time })),
      errors: r.json?.requests?.flatMap((q) => q.errors || []) || [],
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /cdek/print/:uuid — сформировать этикетку (ШК), вернуть ссылку на PDF
router.post('/cdek/print/:uuid', requireAuth, async (req, res) => {
  if (!cdekReady(res)) return;
  try {
    const r = await cdek.printBarcode({ orders: [{ order_uuid: req.params.uuid }], format: 'A6', copy_count: 1 });
    const uuid = r.json?.entity?.uuid;
    if (!uuid) return res.status(502).json({ error: 'СДЭК не вернул задание на печать', raw: r.json });
    // Ссылка на PDF готовится асинхронно; фронт опрашивает GET /cdek/print/:uuid
    res.json({ print_uuid: uuid, url: r.json?.entity?.url || null });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /cdek/print/:uuid — статус/ссылка на готовый PDF этикетки
router.get('/cdek/print/:uuid', requireAuth, async (req, res) => {
  if (!cdekReady(res)) return;
  try {
    const r = await cdek.getPrintBarcode(req.params.uuid);
    const e = r.json?.entity;
    res.json({ url: e?.url || null, status: e?.statuses?.slice(-1)[0]?.code || null });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

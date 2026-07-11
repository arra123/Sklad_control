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

// Нормализация телефона в формат СДЭК: +7XXXXXXXXXX (убираем скобки/тире/пробелы).
function normalizePhone(raw) {
  let d = String(raw || '').replace(/\D/g, ''); // только цифры
  if (d.length === 11 && (d[0] === '8' || d[0] === '7')) d = '7' + d.slice(1);
  else if (d.length === 10) d = '7' + d;
  return d ? '+' + d : '';
}

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
  if (normalizePhone(b.recipient.phone).length < 12) return res.status(400).json({ error: `Телефон получателя некорректный: «${b.recipient.phone}»` });
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
      phones: [{ number: normalizePhone(b.recipient.phone) }],
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

// Сформировать печать и дождаться готового PDF-URL
async function preparePrint(kind, orderUuid) {
  const create = kind === 'receipt'
    ? await cdek.printReceipt({ orders: [{ order_uuid: orderUuid }], copy_count: 1 })
    : await cdek.printBarcode({ orders: [{ order_uuid: orderUuid }], format: 'A6', copy_count: 1 });
  const printUuid = create.json?.entity?.uuid;
  if (!printUuid) return { error: create.json?.requests?.[0]?.errors?.[0]?.message || 'СДЭК не принял запрос на печать' };
  for (let i = 0; i < 20; i++) {
    const g = kind === 'receipt' ? await cdek.getPrintReceipt(printUuid) : await cdek.getPrintBarcode(printUuid);
    const e = g.json?.entity;
    const st = e?.statuses?.slice(-1)[0]?.code;
    if (e?.url && (st === 'READY' || !st)) return { url: e.url };
    if (st === 'INVALID') return { error: 'СДЭК: не удалось сформировать документ' };
    await new Promise((r) => setTimeout(r, 1200));
  }
  return { error: 'PDF не готов (таймаут)' };
}

// GET /cdek/label/:uuid — PDF этикетки (ШК) | GET /cdek/receipt/:uuid — квитанция.
// Сервер сам скачивает PDF с авторизацией и отдаёт байты (браузер откроет как PDF).
async function streamPrint(kind, req, res) {
  if (!cdekReady(res)) return;
  try {
    const prep = await preparePrint(kind, req.params.uuid);
    if (prep.error) return res.status(502).json({ error: prep.error });
    const pdf = await cdek.getPdf(prep.url);
    if (pdf.status !== 200 || !pdf.buffer?.length) return res.status(502).json({ error: 'Не удалось скачать PDF (' + pdf.status + ')' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${kind}-${req.params.uuid}.pdf"`);
    res.send(pdf.buffer);
  } catch (err) { res.status(500).json({ error: err.message }); }
}
router.get('/cdek/label/:uuid', requireAuth, (req, res) => streamPrint('label', req, res));
router.get('/cdek/receipt/:uuid', requireAuth, (req, res) => streamPrint('receipt', req, res));

// ════════════════════════════════════════════════════════════════════════════
//  Заказы — хранение в БД, общий пикинг, статусы, история
// ════════════════════════════════════════════════════════════════════════════

async function logEvent(db, orderId, userId, type, productId, qty, notes) {
  await db.query(
    `INSERT INTO order_events_s (order_id, user_id, event_type, product_id, qty, notes) VALUES ($1,$2,$3,$4,$5,$6)`,
    [orderId, userId || null, type, productId || null, qty || null, notes || null]
  );
}

function collectedSum(collected) {
  return Object.values(collected || {}).reduce((s, n) => s + (Number(n) || 0), 0);
}

const ORDER_LIST_JOIN = `
  LEFT JOIN users_s cu ON cu.id = o.created_by
  LEFT JOIN employees_s ce ON ce.id = cu.employee_id
  LEFT JOIN users_s au ON au.id = o.assembled_by
  LEFT JOIN employees_s ae ON ae.id = au.employee_id`;

function fmtOrderRow(r) {
  return {
    ...r,
    collected: r.collected_json || {},
    collected_total: collectedSum(r.collected_json),
    picklist: r.picklist_json || undefined,
    recognized: r.recognized_json || undefined,
    pkg: r.pkg_json || undefined,
    created_by_label: r.created_by_fullname || r.created_by_name || null,
    assembled_by_label: r.assembled_by_fullname || r.assembled_by_name || null,
  };
}

// POST /orders — сохранить новый заказ (из фото или вручную)
router.post('/', requireAuth, async (req, res) => {
  const b = req.body || {};
  const picklist = Array.isArray(b.picklist) ? b.picklist : [];
  const orderValue = picklist.reduce((s, p) => s + (Number(p.price) || 0) * (Number(p.qty) || 0), 0);
  const status = b.status === 'draft' ? 'draft' : 'new'; // черновик — заводим неполный, дозаполним позже
  try {
    const r = await pool.query(
      `INSERT INTO orders_s
         (source, status, recipient_name, recipient_phone, city, city_code, address, pvz_code, pvz_address,
          total_bottles, order_value, recognized_json, picklist_json, pkg_json, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [b.source === 'manual' ? 'manual' : 'photo', status, b.recipient || null, b.phone || null, b.city || null,
       b.city_code || null, b.address || null, b.pvz_code || null, b.pvz_address || null,
       b.total_bottles || 0, orderValue, JSON.stringify(b.recognized || []), JSON.stringify(picklist),
       b.pkg ? JSON.stringify(b.pkg) : null, req.user.id]
    );
    await logEvent(pool, r.rows[0].id, req.user.id, 'created', null, null,
      `${status === 'draft' ? 'Черновик' : 'Создан'} (${b.source === 'manual' ? 'вручную' : 'по фото'})`);
    res.json(fmtOrderRow(r.rows[0]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /orders — список (?status=active|new|picking|assembled|shipped|cancelled)
router.get('/', requireAuth, async (req, res) => {
  const { status } = req.query;
  const cond = [];
  const params = [];
  if (status === 'active') cond.push(`o.status NOT IN ('cancelled','shipped','deleted')`);
  else if (status === 'deleted') cond.push(`o.status = 'deleted'`);
  else if (status) { params.push(status); cond.push(`o.status = $${params.length}`); }
  else cond.push(`o.status <> 'deleted'`); // по умолчанию — без удалённых
  const where = cond.length ? 'WHERE ' + cond.join(' AND ') : '';
  try {
    const r = await pool.query(
      `SELECT o.id, o.source, o.status, o.recipient_name, o.recipient_phone, o.city, o.pvz_address,
              o.total_bottles, o.order_value, o.collected_json, o.cdek_number, o.created_at, o.updated_at,
              cu.username AS created_by_name, ce.full_name AS created_by_fullname,
              au.username AS assembled_by_name, ae.full_name AS assembled_by_fullname
       FROM orders_s o ${ORDER_LIST_JOIN}
       ${where} ORDER BY o.created_at DESC LIMIT 200`,
      params
    );
    res.json(r.rows.map(fmtOrderRow));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /orders/:id — полный заказ
router.get('/:id(\\d+)', requireAuth, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT o.*, cu.username AS created_by_name, ce.full_name AS created_by_fullname,
              au.username AS assembled_by_name, ae.full_name AS assembled_by_fullname
       FROM orders_s o ${ORDER_LIST_JOIN} WHERE o.id = $1`,
      [req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Заказ не найден' });
    res.json(fmtOrderRow(r.rows[0]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /orders/:id/events — история (кто, когда, что)
router.get('/:id(\\d+)/events', requireAuth, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT e.*, COALESCE(emp.full_name, u.username) AS user_label, p.name AS product_name
       FROM order_events_s e
       LEFT JOIN users_s u ON u.id = e.user_id
       LEFT JOIN employees_s emp ON emp.id = u.employee_id
       LEFT JOIN products_s p ON p.id = e.product_id
       WHERE e.order_id = $1 ORDER BY e.created_at ASC`,
      [req.params.id]
    );
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /orders/:id/track — подтянуть реальный статус из СДЭК и сохранить
router.get('/:id(\\d+)/track', requireAuth, async (req, res) => {
  try {
    const o = await pool.query('SELECT cdek_uuid FROM orders_s WHERE id=$1', [req.params.id]);
    if (!o.rows.length) return res.status(404).json({ error: 'Заказ не найден' });
    const uuid = o.rows[0].cdek_uuid;
    if (!uuid) return res.json({ tracked: false, cdek_status: null, statuses: [] });
    if (!cdek.isConfigured()) return res.status(503).json({ error: 'СДЭК API не настроен' });

    const r = await cdek.getOrder(uuid);
    const e = r.json?.entity;
    const statuses = (e?.statuses || []).map((s) => ({ code: s.code, name: s.name, date: s.date_time }));
    const codes = statuses.map((s) => s.code);
    const cancelled = !e || codes.includes('INVALID') || codes.includes('CANCELED') || codes.includes('CANCELLED');
    const delivered = codes.includes('DELIVERED');
    // Текущий статус СДЭК — самый свежий по дате (иначе последний в списке)
    const latest = statuses.slice().sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))[0]
      || statuses[statuses.length - 1] || null;
    const cdekStatusText = e ? (latest ? latest.name : 'Создан') : 'Не найден в СДЭК';
    const ourStatus = cancelled ? 'cancelled' : (delivered ? 'delivered' : 'shipped');

    await pool.query('UPDATE orders_s SET cdek_status=$1, status=$2, updated_at=NOW() WHERE id=$3',
      [cdekStatusText, ourStatus, req.params.id]);
    res.json({ tracked: true, cdek_status: cdekStatusText, status: ourStatus, cancelled, statuses });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /orders/:id — обновить мета/статус/данные СДЭК
router.patch('/:id(\\d+)', requireAuth, async (req, res) => {
  const b = req.body || {};
  const map = {
    status: 'status', recipient_name: 'recipient_name', recipient_phone: 'recipient_phone',
    city: 'city', city_code: 'city_code', address: 'address', pvz_code: 'pvz_code', pvz_address: 'pvz_address',
    shipment_point: 'shipment_point', tariff_code: 'tariff_code', tariff_name: 'tariff_name',
    cdek_uuid: 'cdek_uuid', cdek_number: 'cdek_number', cdek_status: 'cdek_status', notes: 'notes',
  };
  const sets = [];
  const params = [];
  for (const [k, col] of Object.entries(map)) {
    if (b[k] !== undefined) { params.push(b[k]); sets.push(`${col} = $${params.length}`); }
  }
  if (b.pkg !== undefined) { params.push(JSON.stringify(b.pkg)); sets.push(`pkg_json = $${params.length}`); }
  if (!sets.length) return res.status(400).json({ error: 'Нет полей для обновления' });
  sets.push('updated_at = NOW()');
  params.push(req.params.id);
  try {
    const r = await pool.query(`UPDATE orders_s SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params);
    if (!r.rows.length) return res.status(404).json({ error: 'Заказ не найден' });
    if (b.status) await logEvent(pool, req.params.id, req.user.id, 'status', null, null, `Статус: ${b.status}`);
    res.json(fmtOrderRow(r.rows[0]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /orders/:id/collect — общий пикинг: {product_id, delta}
router.post('/:id(\\d+)/collect', requireAuth, async (req, res) => {
  const { product_id, delta } = req.body || {};
  if (!product_id || !delta) return res.status(400).json({ error: 'product_id и delta обязательны' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const or = await client.query('SELECT collected_json, picklist_json, total_bottles, status FROM orders_s WHERE id=$1 FOR UPDATE', [req.params.id]);
    if (!or.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Заказ не найден' }); }
    const collected = or.rows[0].collected_json || {};
    const picklist = or.rows[0].picklist_json || [];
    const item = picklist.find((p) => String(p.product_id) === String(product_id));
    const maxQty = item ? Number(item.qty) : Infinity;
    const cur = Number(collected[product_id]) || 0;
    const next = Math.max(0, Math.min(maxQty, cur + Number(delta)));
    if (next === cur) { await client.query('ROLLBACK'); return res.status(409).json({ error: delta > 0 ? 'Уже собрано полностью' : 'Нечего убирать' }); }
    collected[product_id] = next;

    const total = Number(or.rows[0].total_bottles) || 0;
    const done = collectedSum(collected);
    let status = or.rows[0].status;
    let assembledBy = null;
    if (done >= total && total > 0) { status = 'assembled'; assembledBy = req.user.id; }
    else if (done > 0) status = (status === 'new' ? 'picking' : status);

    await client.query(
      `UPDATE orders_s SET collected_json=$1, status=$2, ${assembledBy ? 'assembled_by=$3,' : ''} updated_at=NOW() WHERE id=$${assembledBy ? 4 : 3}`,
      assembledBy ? [JSON.stringify(collected), status, assembledBy, req.params.id] : [JSON.stringify(collected), status, req.params.id]
    );
    await logEvent(client, req.params.id, req.user.id, delta > 0 ? 'pick' : 'unpick', product_id, Math.abs(delta), item?.name || null);
    await client.query('COMMIT');
    res.json({ collected, collected_total: done, status });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// PUT /orders/:id/items — заменить состав заказа (ручное добавление/удаление позиций).
// body: { items: [{ product_id, qty }] } → пересобираем пик-лист (разворачивая наборы),
// пересчитываем баночки/сумму, подрезаем собранное под новые количества.
router.put('/:id(\\d+)/items', requireAuth, async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const or = await client.query('SELECT collected_json FROM orders_s WHERE id=$1 FOR UPDATE', [req.params.id]);
    if (!or.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Заказ не найден' }); }

    const acc = new Map();
    for (const it of items) {
      const pid = Number(it.product_id);
      const qty = Math.max(1, Number(it.qty) || 1);
      if (!pid) continue;
      const tmp = new Map();
      await expandProduct(client, pid, qty, tmp);
      for (const [id, v] of tmp) {
        const cur = acc.get(id) || { ...v, qty: 0 };
        cur.qty += v.qty;
        acc.set(id, cur);
      }
    }
    const picklist = [...acc.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    const total_bottles = picklist.reduce((s, p) => s + p.qty, 0);
    const order_value = picklist.reduce((s, p) => s + (Number(p.price) || 0) * p.qty, 0);

    // Собранное оставляем только по существующим позициям и не больше нового количества
    const collected = or.rows[0].collected_json || {};
    const clamped = {};
    for (const p of picklist) {
      const c = Number(collected[p.product_id]) || 0;
      if (c > 0) clamped[p.product_id] = Math.min(c, p.qty);
    }

    await client.query(
      `UPDATE orders_s SET picklist_json=$1, total_bottles=$2, order_value=$3, collected_json=$4, updated_at=NOW() WHERE id=$5`,
      [JSON.stringify(picklist), total_bottles, order_value, JSON.stringify(clamped), req.params.id]
    );
    await logEvent(client, req.params.id, req.user.id, 'items', null, null, `Изменён состав: ${picklist.length} поз., ${total_bottles} бан.`);
    await client.query('COMMIT');

    const full = await pool.query(
      `SELECT o.*, cu.username AS created_by_name, ce.full_name AS created_by_fullname,
              au.username AS assembled_by_name, ae.full_name AS assembled_by_fullname
       FROM orders_s o ${ORDER_LIST_JOIN} WHERE o.id=$1`, [req.params.id]);
    res.json(fmtOrderRow(full.rows[0]));
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// DELETE /orders/:id — мягкое удаление (заказ остаётся, статус deleted)
router.delete('/:id(\\d+)', requireAuth, async (req, res) => {
  try {
    const r = await pool.query(`UPDATE orders_s SET status='deleted', updated_at=NOW() WHERE id=$1 RETURNING id`, [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Заказ не найден' });
    await logEvent(pool, req.params.id, req.user.id, 'deleted', null, null, 'Заказ удалён');
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

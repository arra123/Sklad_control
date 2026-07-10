const router = require('express').Router();
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const aiProxy = require('../utils/aiProxy');

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
  const na = normalize(a);
  const nb = normalize(b);
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

// Лучшее совпадение названия среди каталога.
function bestMatch(name, catalog) {
  let best = null;
  let bestScore = 0;
  for (const p of catalog) {
    const score = diceScore(name, p.name);
    if (score > bestScore) { bestScore = score; best = p; }
  }
  return { product: best, score: bestScore };
}

// Рекурсивный разворот товара/набора в плоский список баночек.
// Возвращает Map: product_id → { product_id, name, barcode, qty }.
async function expandProduct(client, productId, qty, acc, depth = 0, visited = new Set()) {
  if (depth > 5 || visited.has(productId)) return;
  const r = await client.query(
    `SELECT id, name, entity_type, production_barcode, barcode_list FROM products_s WHERE id = $1`,
    [productId]
  );
  const p = r.rows[0];
  if (!p) return;

  if (p.entity_type !== 'bundle') {
    const cur = acc.get(p.id) || {
      product_id: p.id,
      name: p.name,
      barcode: p.production_barcode || (p.barcode_list ? p.barcode_list.split(';')[0] : null),
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
      const matched = product && score >= 0.4;

      recognized.push({
        raw_name: item.name,
        quantity: qty,
        price: item.price ?? null,
        matched: Boolean(matched),
        confidence: Math.round(score * 100),
        product_id: matched ? product.id : null,
        product_name: matched ? product.name : null,
        is_bundle: matched ? product.entity_type === 'bundle' : false,
      });

      if (matched) {
        await expandProduct(client, product.id, qty, picklistAcc);
      }
    }

    const picklist = [...picklistAcc.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    const total_bottles = picklist.reduce((s, p) => s + p.qty, 0);
    const unmatched = recognized.filter((r) => !r.matched).length;

    res.json({
      recipient: parsed.recipient || null,
      phone: parsed.phone || null,
      address: parsed.address || null,
      delivery: parsed.delivery || null,
      total: parsed.total ?? null,
      order_number: parsed.order_number || null,
      track: parsed.track || null,
      recognized,
      picklist,
      total_bottles,
      unmatched,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;

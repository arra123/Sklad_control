const router = require('express').Router();
const pool = require('../db/pool');
const { requireAuth, requireAdminOrManager } = require('../middleware/auth');

function parseBoolean(value, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

// GET /api/fbo/warehouses — list FBO warehouses
router.get('/warehouses', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT w.*,
        (SELECT COUNT(*) FROM pallet_rows_s WHERE warehouse_id = w.id) as rows_count,
        (SELECT COUNT(*) FROM pallets_s pa JOIN pallet_rows_s pr ON pa.row_id = pr.id WHERE pr.warehouse_id = w.id) as pallets_count,
        (SELECT COUNT(*) FROM boxes_s b JOIN pallets_s pa ON b.pallet_id = pa.id JOIN pallet_rows_s pr ON pa.row_id = pr.id WHERE pr.warehouse_id = w.id AND b.status = 'closed') as boxes_count
      FROM warehouses_s w WHERE w.warehouse_type IN ('fbo', 'both') ORDER BY w.name
    `);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/fbo/warehouses — create FBO warehouse
router.post('/warehouses', requireAuth, requireAdminOrManager, async (req, res) => {
  const { name, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Название обязательно' });
  try {
    const result = await pool.query(
      `INSERT INTO warehouses_s (name, notes, warehouse_type) VALUES ($1,$2,'fbo') RETURNING *`,
      [name, notes || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/fbo/warehouses/:id
router.delete('/warehouses/:id', requireAuth, requireAdminOrManager, async (req, res) => {
  try {
    await pool.query('DELETE FROM warehouses_s WHERE id=$1 AND warehouse_type=\'fbo\'', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/fbo/warehouses/:id — warehouse with rows and pallets
router.get('/warehouses/:id', requireAuth, async (req, res) => {
  try {
    const wh = await pool.query('SELECT * FROM warehouses_s WHERE id=$1 AND warehouse_type IN (\'fbo\',\'both\')', [req.params.id]);
    if (!wh.rows.length) return res.status(404).json({ error: 'Склад не найден' });
    const rows = await pool.query(`
      SELECT pr.*,
        (SELECT COUNT(*) FROM pallets_s WHERE row_id = pr.id) as pallets_count,
        (SELECT COUNT(*) FROM boxes_s b JOIN pallets_s pa ON b.pallet_id = pa.id WHERE pa.row_id = pr.id AND b.status = 'closed') as boxes_count,
        (SELECT COALESCE(SUM(b.quantity),0) FROM boxes_s b JOIN pallets_s pa ON b.pallet_id = pa.id WHERE pa.row_id = pr.id AND b.status = 'closed')
          + (SELECT COALESCE(SUM(pi.quantity),0) FROM pallet_items_s pi JOIN pallets_s pa ON pi.pallet_id = pa.id WHERE pa.row_id = pr.id AND pi.quantity > 0) as total_items
      FROM pallet_rows_s pr WHERE pr.warehouse_id = $1 ORDER BY pr.number
    `, [req.params.id]);
    res.json({ ...wh.rows[0], rows: rows.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/fbo/rows — create row
router.post('/rows', requireAuth, requireAdminOrManager, async (req, res) => {
  const { warehouse_id, number, name } = req.body;
  if (!warehouse_id || !number || !name) return res.status(400).json({ error: 'warehouse_id, number, name обязательны' });
  try {
    const result = await pool.query(
      'INSERT INTO pallet_rows_s (warehouse_id, number, name) VALUES ($1,$2,$3) RETURNING *',
      [warehouse_id, number, name]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/fbo/rows/:id
router.put('/rows/:id', requireAuth, requireAdminOrManager, async (req, res) => {
  const { name, number } = req.body;
  try {
    const result = await pool.query(
      'UPDATE pallet_rows_s SET name=COALESCE($1,name), number=COALESCE($2,number) WHERE id=$3 RETURNING *',
      [name || null, number || null, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Ряд не найден' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/fbo/rows/:id
router.delete('/rows/:id', requireAuth, requireAdminOrManager, async (req, res) => {
  try {
    await pool.query('DELETE FROM pallet_rows_s WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/fbo/rows/:id — row with pallets
router.get('/rows/:id', requireAuth, async (req, res) => {
  try {
    const row = await pool.query('SELECT * FROM pallet_rows_s WHERE id=$1', [req.params.id]);
    if (!row.rows.length) return res.status(404).json({ error: 'Ряд не найден' });
    const pallets = await pool.query(`
      SELECT pa.*,
        (SELECT COUNT(*) FROM boxes_s WHERE pallet_id = pa.id AND status = 'closed') as boxes_count,
        (SELECT COALESCE(SUM(quantity),0) FROM boxes_s WHERE pallet_id = pa.id AND status = 'closed') +
        (SELECT COALESCE(SUM(quantity),0) FROM pallet_items_s WHERE pallet_id = pa.id AND quantity > 0) as total_items,
        (SELECT COUNT(*) FROM pallet_items_s WHERE pallet_id = pa.id AND quantity > 0) as loose_items_count
      FROM pallets_s pa WHERE pa.row_id = $1 ORDER BY pa.number
    `, [req.params.id]);
    res.json({ ...row.rows[0], pallets: pallets.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/fbo/pallets — create pallet
router.post('/pallets', requireAuth, requireAdminOrManager, async (req, res) => {
  const { row_id, number, name, uses_boxes } = req.body;
  if (!row_id || !number || !name) return res.status(400).json({ error: 'row_id, number, name обязательны' });
  try {
    const row = await pool.query('SELECT * FROM pallet_rows_s WHERE id=$1', [row_id]);
    if (!row.rows.length) return res.status(404).json({ error: 'Ряд не найден' });
    const code = `Р${row.rows[0].number}П${number}`;
    const barcodeValue = String(Math.floor(Math.random() * 900000000) + 100000000);
    const result = await pool.query(
      'INSERT INTO pallets_s (row_id, number, name, barcode_value, uses_boxes) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [row_id, number, name, barcodeValue, parseBoolean(uses_boxes, true)]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: `Паллет с номером ${number} уже существует в этом ряду` });
    res.status(500).json({ error: err.message });
  }
});

// POST /api/fbo/pallets/:id/box — add product directly to pallet
router.post('/pallets/:id/box', requireAuth, requireAdminOrManager, async (req, res) => {
  const { product_id, quantity, box_size } = req.body;
  try {
    const pallet = await pool.query(
      `SELECT p.id, p.uses_boxes,
              (SELECT COUNT(*) FROM pallet_items_s pi WHERE pi.pallet_id = p.id AND pi.quantity > 0) as loose_items_count
       FROM pallets_s p
       WHERE p.id=$1`,
      [req.params.id]
    );
    if (!pallet.rows.length) return res.status(404).json({ error: 'Паллет не найден' });
    const pal = pallet.rows[0];
    const looseItemsCount = parseInt(pal.loose_items_count || 0, 10);

    if (!pal.uses_boxes) {
      if (looseItemsCount > 0) {
        return res.status(400).json({ error: 'Паллет уже используется без коробок. Сначала очистите товар россыпью.' });
      }
      await pool.query('UPDATE pallets_s SET uses_boxes = true WHERE id = $1', [req.params.id]);
    }

    const parsedQty = quantity === undefined || quantity === null || quantity === ''
      ? 0
      : parseInt(quantity, 10);
    const parsedBoxSize = box_size === undefined || box_size === null || box_size === ''
      ? Math.max(parsedQty, 1, 50)
      : parseInt(box_size, 10);

    if (Number.isNaN(parsedQty) || parsedQty < 0) {
      return res.status(400).json({ error: 'quantity должен быть числом 0 или больше' });
    }
    if (Number.isNaN(parsedBoxSize) || parsedBoxSize <= 0) {
      return res.status(400).json({ error: 'box_size должен быть больше 0' });
    }
    if (parsedQty > 0 && !product_id) {
      return res.status(400).json({ error: 'Для непустой коробки укажите товар' });
    }

    const barcodeValue = String(Math.floor(Math.random() * 900000000) + 100000000);
    const result = await pool.query(
      `INSERT INTO boxes_s (barcode_value, product_id, pallet_id, quantity, box_size, status, closed_at)
       VALUES ($1, $2, $3, $4, $5, 'closed', NOW()) RETURNING *`,
      [barcodeValue, product_id || null, req.params.id, parsedQty, parsedBoxSize]
    );
    if (product_id && parsedQty > 0) {
      await pool.query(
        `INSERT INTO box_items_s (box_id, product_id, quantity, updated_at)
         VALUES ($1, $2, $3, NOW())`,
        [result.rows[0].id, product_id, parsedQty]
      );
    }
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/fbo/pallets/:id/item — add product directly to pallet (no box)
router.post('/pallets/:id/item', requireAuth, requireAdminOrManager, async (req, res) => {
  const { product_id, quantity } = req.body;
  if (!product_id || !quantity || quantity <= 0) {
    return res.status(400).json({ error: 'product_id и quantity обязательны' });
  }
  try {
    const pallet = await pool.query(
      `SELECT p.id, p.uses_boxes,
              (SELECT COUNT(*) FROM boxes_s b WHERE b.pallet_id = p.id AND b.status IN ('open', 'closed')) as boxes_count
       FROM pallets_s p
       WHERE p.id=$1`,
      [req.params.id]
    );
    if (!pallet.rows.length) return res.status(404).json({ error: 'Паллет не найден' });
    const pal = pallet.rows[0];
    const boxesCount = parseInt(pal.boxes_count || 0, 10);
    if (pal.uses_boxes) {
      if (boxesCount > 0) {
        return res.status(400).json({ error: 'Паллет уже используется в коробочном режиме. Сначала очистите коробки.' });
      }
      await pool.query('UPDATE pallets_s SET uses_boxes = false WHERE id = $1', [req.params.id]);
    }
    const pQty = parseFloat(quantity);
    // Get current qty before change
    const prev = await pool.query('SELECT quantity FROM pallet_items_s WHERE pallet_id=$1 AND product_id=$2', [req.params.id, product_id]);
    const prevQty = prev.rows.length ? parseFloat(prev.rows[0].quantity) : 0;
    const result = await pool.query(
      `INSERT INTO pallet_items_s (pallet_id, product_id, quantity) VALUES ($1, $2, $3)
       ON CONFLICT (pallet_id, product_id) DO UPDATE SET quantity = pallet_items_s.quantity + $3
       RETURNING *`,
      [req.params.id, product_id, pQty]
    );
    const newQty = parseFloat(result.rows[0].quantity);
    await pool.query(
      `INSERT INTO movements_s (movement_type, product_id, quantity, to_pallet_id, performed_by, source, notes, quantity_before, quantity_after)
       VALUES ('external_to_pallet',$1,$2,$3,$4,'manual_edit','Добавление товара на паллет',$5,$6)`,
      [product_id, pQty, parseInt(req.params.id), req.user.id, prevQty, newQty]);
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/fbo/pallets/:id/item — update quantity of product directly on pallet
router.put('/pallets/:palletId/item/:productId', requireAuth, requireAdminOrManager, async (req, res) => {
  const { quantity } = req.body;
  const qty = parseFloat(quantity);
  if (isNaN(qty) || qty < 0) return res.status(400).json({ error: 'Некорректное количество' });
  try {
    const old = await pool.query('SELECT quantity FROM pallet_items_s WHERE pallet_id=$1 AND product_id=$2', [req.params.palletId, req.params.productId]);
    const oldQty = old.rows.length ? parseFloat(old.rows[0].quantity) : 0;
    if (qty <= 0) {
      await pool.query('DELETE FROM pallet_items_s WHERE pallet_id=$1 AND product_id=$2', [req.params.palletId, req.params.productId]);
    } else {
      await pool.query('UPDATE pallet_items_s SET quantity=$1 WHERE pallet_id=$2 AND product_id=$3', [qty, req.params.palletId, req.params.productId]);
    }
    const delta = qty - oldQty;
    if (delta !== 0) {
      await pool.query(
        `INSERT INTO movements_s (movement_type, product_id, quantity, from_pallet_id, to_pallet_id, performed_by, source, notes, quantity_before, quantity_after)
         VALUES ($1,$2,$3,$4,$5,$6,'manual_edit',$7,$8,$9)`,
        [delta < 0 ? 'pallet_correction_out' : 'pallet_correction_in', parseInt(req.params.productId), Math.abs(delta),
         delta < 0 ? parseInt(req.params.palletId) : null, delta > 0 ? parseInt(req.params.palletId) : null,
         req.user.id, 'Ручное редактирование', oldQty, qty]);
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/fbo/pallets/:id
router.delete('/pallets/:id', requireAuth, requireAdminOrManager, async (req, res) => {
  try {
    await pool.query('DELETE FROM pallets_s WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/fbo/pallets/:id — pallet with boxes
router.get('/pallets/:id', requireAuth, async (req, res) => {
  try {
    const pal = await pool.query(`
      SELECT pa.*, pr.name as row_name, pr.number as row_number, w.name as warehouse_name
      FROM pallets_s pa
      JOIN pallet_rows_s pr ON pa.row_id = pr.id
      JOIN warehouses_s w ON pr.warehouse_id = w.id
      WHERE pa.id = $1
    `, [req.params.id]);
    if (!pal.rows.length) return res.status(404).json({ error: 'Паллет не найден' });
    const boxes = await pool.query(`
      SELECT bx.*, agg.products_count, p.name as product_name, p.code as product_code
      FROM (
        SELECT b.*,
               ROW_NUMBER() OVER (PARTITION BY b.pallet_id ORDER BY b.created_at, b.id) as position
        FROM boxes_s b
        WHERE b.pallet_id = $1
      ) bx
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (WHERE quantity > 0) as products_count,
          MIN(product_id) FILTER (WHERE quantity > 0) as first_product_id
        FROM box_items_s
        WHERE box_id = bx.id
      ) agg ON TRUE
      LEFT JOIN products_s p ON p.id = CASE WHEN COALESCE(agg.products_count, 0) = 1 THEN agg.first_product_id ELSE bx.product_id END
      ORDER BY bx.position
    `, [req.params.id]);
    const items = await pool.query(`
      SELECT pi.*, p.name as product_name, p.code as product_code
      FROM pallet_items_s pi
      JOIN products_s p ON p.id = pi.product_id
      WHERE pi.pallet_id = $1 AND pi.quantity > 0
      ORDER BY p.name
    `, [req.params.id]);
    res.json({ ...pal.rows[0], boxes: boxes.rows, items: items.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/fbo/boxes/:id — box detail
router.get('/boxes/:id', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT b.*, agg.products_count, p.name as product_name, p.code as product_code,
             pa.name as pallet_name, pa.number as pallet_number,
             pr.name as row_name, pr.number as row_number,
             w.name as warehouse_name,
             (
               SELECT COUNT(*)
               FROM boxes_s b2
               WHERE b2.pallet_id = b.pallet_id
                 AND (
                   b2.created_at < b.created_at
                   OR (b2.created_at = b.created_at AND b2.id <= b.id)
                 )
             )::int as position
      FROM boxes_s b
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (WHERE quantity > 0) as products_count,
          MIN(product_id) FILTER (WHERE quantity > 0) as first_product_id
        FROM box_items_s
        WHERE box_id = b.id
      ) agg ON TRUE
      LEFT JOIN products_s p ON p.id = CASE WHEN COALESCE(agg.products_count, 0) = 1 THEN agg.first_product_id ELSE b.product_id END
      LEFT JOIN pallets_s pa ON pa.id = b.pallet_id
      LEFT JOIN pallet_rows_s pr ON pr.id = pa.row_id
      LEFT JOIN warehouses_s w ON w.id = pr.warehouse_id
      WHERE b.id = $1
    `, [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Коробка не найдена' });
    const items = await pool.query(
      `SELECT bi.product_id, bi.quantity, p.name as product_name, p.code as product_code
       FROM box_items_s bi
       JOIN products_s p ON p.id = bi.product_id
       WHERE bi.box_id = $1 AND bi.quantity > 0
       ORDER BY p.name`,
      [req.params.id]
    );
    res.json({ ...result.rows[0], items: items.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/fbo/boxes/:id — edit box (quantity, product)
router.put('/boxes/:id', requireAuth, requireAdminOrManager, async (req, res) => {
  const { quantity, product_id } = req.body;
  try {
    const sets = [];
    const params = [];
    let idx = 1;
    if (quantity !== undefined) {
      const parsedQty = parseInt(quantity, 10);
      if (Number.isNaN(parsedQty) || parsedQty < 0) {
        return res.status(400).json({ error: 'Количество должно быть 0 или больше' });
      }
      sets.push(`quantity = $${idx++}`); params.push(parsedQty);
      sets.push(`box_size = $${idx++}`); params.push(Math.max(parsedQty, 1));
    }
    if (product_id !== undefined) { sets.push(`product_id = $${idx++}`); params.push(product_id); }
    if (sets.length === 0) return res.status(400).json({ error: 'Нечего обновлять' });
    params.push(req.params.id);
    const result = await pool.query(
      `UPDATE boxes_s SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Коробка не найдена' });
    await pool.query('DELETE FROM box_items_s WHERE box_id = $1', [req.params.id]);
    if (result.rows[0].product_id && Number(result.rows[0].quantity || 0) > 0) {
      await pool.query(
        `INSERT INTO box_items_s (box_id, product_id, quantity, updated_at)
         VALUES ($1, $2, $3, NOW())`,
        [req.params.id, result.rows[0].product_id, result.rows[0].quantity]
      );
    }
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/fbo/boxes/:id — delete box
router.delete('/boxes/:id', requireAuth, requireAdminOrManager, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM boxes_s WHERE id=$1 RETURNING id', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Коробка не найдена' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/fbo/pallets-list?warehouse_id=X — flat list of pallets for task creation
router.get('/pallets-list', requireAuth, async (req, res) => {
  const { warehouse_id } = req.query;
  try {
    const params = [];
    let where = '';
    if (warehouse_id) { params.push(warehouse_id); where = 'WHERE pr.warehouse_id = $1'; }
    const result = await pool.query(`
      SELECT pa.id, pa.name, pa.number, pa.barcode_value,
             pr.name as row_name, pr.number as row_number,
             w.name as warehouse_name, w.id as warehouse_id
      FROM pallets_s pa
      JOIN pallet_rows_s pr ON pa.row_id = pr.id
      JOIN warehouses_s w ON pr.warehouse_id = w.id
      ${where}
      ORDER BY pr.number, pa.number
    `, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Visual FBO ───────────────────────────────────────────────────────────────

// POST /api/fbo/visual/move — Move box to another pallet (must be before GET /visual/:id)
router.post('/visual/move', requireAuth, async (req, res) => {
  const { box_id, to_pallet_id } = req.body;
  if (!box_id || !to_pallet_id) return res.status(400).json({ error: 'box_id и to_pallet_id обязательны' });
  try {
    await pool.query('UPDATE boxes_s SET pallet_id=$1 WHERE id=$2', [to_pallet_id, box_id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/fbo/visual/:warehouseId — rows → pallets → boxes with product info
router.get('/visual/:warehouseId', requireAuth, async (req, res) => {
  try {
    const { warehouseId } = req.params;

    // Single query with JOINs instead of N+1 loop
    const [rowsRes, palletsRes, boxesRes] = await Promise.all([
      pool.query(
        `SELECT id, name, number FROM pallet_rows_s WHERE warehouse_id=$1 ORDER BY number`,
        [warehouseId]
      ),
      pool.query(
        `SELECT pl.id, pl.name, pl.number, pl.barcode_value, pl.row_id
         FROM pallets_s pl
         JOIN pallet_rows_s pr ON pr.id = pl.row_id
         WHERE pr.warehouse_id=$1
         ORDER BY pl.number`,
        [warehouseId]
      ),
      pool.query(
        `SELECT b.id, b.barcode_value, b.quantity, b.status, b.product_id, b.pallet_id,
                p.name as product_name, p.code as product_code
         FROM boxes_s b
         LEFT JOIN products_s p ON p.id = b.product_id
         JOIN pallets_s pl ON pl.id = b.pallet_id
         JOIN pallet_rows_s pr ON pr.id = pl.row_id
         WHERE pr.warehouse_id=$1
         ORDER BY b.id`,
        [warehouseId]
      ),
    ]);

    // Group boxes by pallet_id
    const boxesByPallet = {};
    for (const box of boxesRes.rows) {
      if (!boxesByPallet[box.pallet_id]) boxesByPallet[box.pallet_id] = [];
      boxesByPallet[box.pallet_id].push(box);
    }

    // Group pallets by row_id
    const palletsByRow = {};
    for (const pl of palletsRes.rows) {
      if (!palletsByRow[pl.row_id]) palletsByRow[pl.row_id] = [];
      palletsByRow[pl.row_id].push({ ...pl, boxes: boxesByPallet[pl.id] || [] });
    }

    const result = rowsRes.rows.map(row => ({
      ...row,
      pallets: palletsByRow[row.id] || [],
    }));

    res.json({ rows: result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

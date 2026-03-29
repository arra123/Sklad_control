const router = require('express').Router();
const pool = require('../db/pool');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// ─── Barcode → Product resolver (reused from tasks.js pattern) ──────────────
async function resolveProduct(client, barcode) {
  const r = await client.query(
    `SELECT id, name, code, entity_type, production_barcode, barcode_list
     FROM products_s
     WHERE $1 = ANY(string_to_array(barcode_list, ';'))
        OR production_barcode = $1
        OR marketplace_barcodes_json @> jsonb_build_array(jsonb_build_object('value', $1))
     LIMIT 1`,
    [barcode]
  );
  return r.rows[0] || null;
}

// ─── POST / — Create assembly task (admin) ──────────────────────────────────
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { bundle_product_id, bundle_qty, employee_id, source_boxes, dest_shelf_id, dest_pallet_id, notes } = req.body;
  if (!bundle_product_id || !bundle_qty || bundle_qty < 1) return res.status(400).json({ error: 'bundle_product_id и bundle_qty обязательны' });

  try {
    // Verify it's a bundle
    const product = await pool.query('SELECT id, name, entity_type FROM products_s WHERE id = $1', [bundle_product_id]);
    if (!product.rows.length) return res.status(404).json({ error: 'Товар не найден' });
    if (product.rows[0].entity_type !== 'bundle') return res.status(400).json({ error: 'Товар должен быть комплектом (bundle)' });

    // Get bundle components
    const comps = await pool.query(
      `SELECT bc.component_id, bc.quantity, p.name, p.code
       FROM bundle_components_s bc JOIN products_s p ON p.id = bc.component_id
       WHERE bc.bundle_id = $1`, [bundle_product_id]);
    if (comps.rows.length === 0) return res.status(400).json({ error: 'У комплекта нет компонентов' });

    const title = `Сборка: ${product.rows[0].name} × ${bundle_qty}`;
    const result = await pool.query(
      `INSERT INTO inventory_tasks_s (title, task_type, employee_id, bundle_product_id, bundle_qty, assembly_phase, source_boxes, dest_shelf_id, dest_pallet_id, notes, created_by)
       VALUES ($1, 'bundle_assembly', $2, $3, $4, 'picking', $5, $6, $7, $8, $9) RETURNING id`,
      [title, employee_id || null, bundle_product_id, bundle_qty,
       source_boxes ? JSON.stringify(source_boxes) : null,
       dest_shelf_id || null, dest_pallet_id || null,
       notes || null, req.user.id]
    );
    res.json({ ok: true, id: result.rows[0].id, title, components: comps.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /:id — Task details ────────────────────────────────────────────────
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const task = await pool.query(
      `SELECT t.*, p.name as bundle_name, p.code as bundle_code,
              p.barcode_list as bundle_barcodes, p.production_barcode as bundle_barcode,
              e.full_name as employee_name
       FROM inventory_tasks_s t
       LEFT JOIN products_s p ON p.id = t.bundle_product_id
       LEFT JOIN employees_s e ON e.id = t.employee_id
       WHERE t.id = $1 AND t.task_type = 'bundle_assembly'`, [req.params.id]);
    if (!task.rows.length) return res.status(404).json({ error: 'Задача не найдена' });

    // Components
    const comps = await pool.query(
      `SELECT bc.component_id, bc.quantity, p.name, p.code, p.barcode_list, p.production_barcode
       FROM bundle_components_s bc JOIN products_s p ON p.id = bc.component_id
       WHERE bc.bundle_id = $1`, [task.rows[0].bundle_product_id]);

    // Picked items summary
    const picked = await pool.query(
      `SELECT product_id, COUNT(*) as picked_count
       FROM assembly_items_s WHERE task_id = $1 GROUP BY product_id`, [req.params.id]);

    // Assembly progress
    const assembled = await pool.query(
      `SELECT used_in_bundle, COUNT(*) as items
       FROM assembly_items_s WHERE task_id = $1 AND used_in_bundle > 0
       GROUP BY used_in_bundle`, [req.params.id]);

    res.json({
      ...task.rows[0],
      components: comps.rows,
      picked_summary: picked.rows,
      assembled_bundles: assembled.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /:id/source-boxes — Boxes with required products ──────────────────
router.get('/:id/source-boxes', requireAuth, async (req, res) => {
  try {
    const task = await pool.query('SELECT bundle_product_id FROM inventory_tasks_s WHERE id = $1', [req.params.id]);
    if (!task.rows.length) return res.status(404).json({ error: 'Задача не найдена' });

    const comps = await pool.query(
      'SELECT component_id FROM bundle_components_s WHERE bundle_id = $1', [task.rows[0].bundle_product_id]);
    const componentIds = comps.rows.map(c => c.component_id);
    if (componentIds.length === 0) return res.json([]);

    const boxes = await pool.query(
      `SELECT b.id as box_id, b.barcode_value, b.pallet_id, bi.product_id, bi.quantity,
              p.name as product_name, p.code as product_code,
              pa.name as pallet_name, pr.name as row_name, w.name as warehouse_name
       FROM box_items_s bi
       JOIN boxes_s b ON b.id = bi.box_id
       JOIN products_s p ON p.id = bi.product_id
       LEFT JOIN pallets_s pa ON pa.id = b.pallet_id
       LEFT JOIN pallet_rows_s pr ON pr.id = pa.row_id
       LEFT JOIN warehouses_s w ON w.id = pr.warehouse_id
       WHERE bi.product_id = ANY($1) AND bi.quantity > 0 AND b.status = 'closed' AND w.active = true
       ORDER BY p.name, w.name, pa.name`,
      [componentIds]
    );
    res.json(boxes.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /:id/start-picking — Start picking phase ─────────────────────────
router.post('/:id/start-picking', requireAuth, async (req, res) => {
  try {
    await pool.query(
      `UPDATE inventory_tasks_s SET status = 'in_progress', assembly_phase = 'picking', started_at = NOW(), employee_id = COALESCE(employee_id, $2)
       WHERE id = $1 AND task_type = 'bundle_assembly'`,
      [req.params.id, req.user.employee_id || req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /:id/scan-pick — Scan item from pallet box ───────────────────────
router.post('/:id/scan-pick', requireAuth, async (req, res) => {
  const { barcode, box_id } = req.body;
  if (!barcode) return res.status(400).json({ error: 'barcode обязателен' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const task = await client.query('SELECT * FROM inventory_tasks_s WHERE id = $1 AND task_type = $2', [req.params.id, 'bundle_assembly']);
    if (!task.rows.length) { await client.query('ROLLBACK'); client.release(); return res.status(404).json({ error: 'Задача не найдена' }); }

    const product = await resolveProduct(client, barcode);
    if (!product) { await client.query('ROLLBACK'); client.release(); return res.status(400).json({ error: 'Товар не найден по ШК' }); }

    // Check product is a component of this bundle
    const comp = await client.query(
      'SELECT * FROM bundle_components_s WHERE bundle_id = $1 AND component_id = $2',
      [task.rows[0].bundle_product_id, product.id]);
    if (!comp.rows.length) { await client.query('ROLLBACK'); client.release(); return res.status(400).json({ error: `${product.name} не входит в состав комплекта` }); }

    // Decrease quantity in box
    if (box_id) {
      const upd = await client.query(
        'UPDATE box_items_s SET quantity = quantity - 1 WHERE box_id = $1 AND product_id = $2 AND quantity > 0 RETURNING quantity',
        [box_id, product.id]);
      if (!upd.rows.length) { await client.query('ROLLBACK'); client.release(); return res.status(400).json({ error: 'В коробке нет этого товара' }); }

      // Log movement
      const boxInfo = await client.query('SELECT pallet_id FROM boxes_s WHERE id = $1', [box_id]);
      await client.query(
        `INSERT INTO movements_s (movement_type, product_id, quantity, from_box_id, from_pallet_id, to_employee_id, performed_by, source)
         VALUES ('bundle_pick', $1, 1, $2, $3, $4, $5, 'task')`,
        [product.id, box_id, boxInfo.rows[0]?.pallet_id, task.rows[0].employee_id, req.user.id]);
    }

    // Record picked item
    await client.query(
      `INSERT INTO assembly_items_s (task_id, product_id, source_box_id, source_pallet_id, scanned_barcode)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.params.id, product.id, box_id || null, null, barcode]);

    await client.query('COMMIT');
    client.release();

    // Return current pick progress
    const progress = await pool.query(
      `SELECT product_id, COUNT(*) as picked FROM assembly_items_s WHERE task_id = $1 GROUP BY product_id`, [req.params.id]);

    res.json({ ok: true, product: product.name, picked_summary: progress.rows });
  } catch (err) {
    await client.query('ROLLBACK');
    client.release();
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /:id/start-assembling — Switch to assembly phase ─────────────────
router.post('/:id/start-assembling', requireAuth, async (req, res) => {
  try {
    await pool.query(
      `UPDATE inventory_tasks_s SET assembly_phase = 'assembling' WHERE id = $1 AND task_type = 'bundle_assembly'`,
      [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /:id/scan-component — Scan component into current bundle ─────────
router.post('/:id/scan-component', requireAuth, async (req, res) => {
  const { barcode } = req.body;
  if (!barcode) return res.status(400).json({ error: 'barcode обязателен' });

  try {
    const task = await pool.query('SELECT * FROM inventory_tasks_s WHERE id = $1', [req.params.id]);
    if (!task.rows.length) return res.status(404).json({ error: 'Задача не найдена' });

    const currentBundle = task.rows[0].assembled_count + 1;
    const product = await resolveProduct(pool, barcode);
    if (!product) return res.status(400).json({ error: 'Товар не найден' });

    // Find unused picked item of this product
    const item = await pool.query(
      `SELECT id FROM assembly_items_s WHERE task_id = $1 AND product_id = $2 AND used_in_bundle = 0 LIMIT 1`,
      [req.params.id, product.id]);
    if (!item.rows.length) return res.status(400).json({ error: `Нет забранных ${product.name} — сначала заберите с паллета` });

    // Mark as used in current bundle
    await pool.query('UPDATE assembly_items_s SET used_in_bundle = $1 WHERE id = $2', [currentBundle, item.rows[0].id]);

    // Check if all components for this bundle are scanned
    const comps = await pool.query(
      'SELECT component_id, quantity FROM bundle_components_s WHERE bundle_id = $1', [task.rows[0].bundle_product_id]);
    const scanned = await pool.query(
      `SELECT product_id, COUNT(*) as cnt FROM assembly_items_s WHERE task_id = $1 AND used_in_bundle = $2 GROUP BY product_id`,
      [req.params.id, currentBundle]);

    const scannedMap = {};
    scanned.rows.forEach(r => { scannedMap[r.product_id] = Number(r.cnt); });

    let allDone = true;
    const status = comps.rows.map(c => {
      const needed = Number(c.quantity);
      const have = scannedMap[c.component_id] || 0;
      if (have < needed) allDone = false;
      return { product_id: c.component_id, needed, have, done: have >= needed };
    });

    res.json({ ok: true, product: product.name, bundle_number: currentBundle, all_components_scanned: allDone, components_status: status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /:id/confirm-bundle — Scan printed barcode of bundle ──────────────
router.post('/:id/confirm-bundle', requireAuth, async (req, res) => {
  const { barcode } = req.body;
  if (!barcode) return res.status(400).json({ error: 'barcode обязателен' });

  try {
    const task = await pool.query('SELECT * FROM inventory_tasks_s WHERE id = $1', [req.params.id]);
    if (!task.rows.length) return res.status(404).json({ error: 'Задача не найдена' });

    // Verify barcode belongs to the bundle product
    const bundle = await pool.query('SELECT * FROM products_s WHERE id = $1', [task.rows[0].bundle_product_id]);
    if (!bundle.rows.length) return res.status(404).json({ error: 'Комплект не найден' });

    const barcodes = (bundle.rows[0].barcode_list || '').split(';').map(s => s.trim()).filter(Boolean);
    if (bundle.rows[0].production_barcode) barcodes.push(bundle.rows[0].production_barcode);
    if (!barcodes.includes(barcode)) return res.status(400).json({ error: 'ШК не совпадает с комплектом' });

    const newCount = task.rows[0].assembled_count + 1;
    const phase = newCount >= task.rows[0].bundle_qty ? 'placing' : 'assembling';

    await pool.query(
      'UPDATE inventory_tasks_s SET assembled_count = $1, assembly_phase = $2 WHERE id = $3',
      [newCount, phase, req.params.id]);

    res.json({ ok: true, assembled_count: newCount, total: task.rows[0].bundle_qty, phase });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /:id/start-placing — Switch to placing phase ──────────────────────
router.post('/:id/start-placing', requireAuth, async (req, res) => {
  try {
    await pool.query(
      'UPDATE inventory_tasks_s SET assembly_phase = $1 WHERE id = $2', ['placing', req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /:id/scan-place — Place assembled bundle on shelf/pallet ──────────
router.post('/:id/scan-place', requireAuth, async (req, res) => {
  const { shelf_id, pallet_id } = req.body;
  if (!shelf_id && !pallet_id) return res.status(400).json({ error: 'shelf_id или pallet_id обязателен' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const task = await client.query('SELECT * FROM inventory_tasks_s WHERE id = $1', [req.params.id]);
    if (!task.rows.length) { await client.query('ROLLBACK'); client.release(); return res.status(404).json({ error: 'Задача не найдена' }); }

    const productId = task.rows[0].bundle_product_id;

    if (shelf_id) {
      // Add to shelf
      const existing = await client.query('SELECT id, quantity FROM shelf_items_s WHERE shelf_id = $1 AND product_id = $2', [shelf_id, productId]);
      if (existing.rows.length) {
        await client.query('UPDATE shelf_items_s SET quantity = quantity + 1 WHERE id = $1', [existing.rows[0].id]);
      } else {
        await client.query('INSERT INTO shelf_items_s (shelf_id, product_id, quantity) VALUES ($1, $2, 1)', [shelf_id, productId]);
      }
    } else if (pallet_id) {
      const existing = await client.query('SELECT id, quantity FROM pallet_items_s WHERE pallet_id = $1 AND product_id = $2', [pallet_id, productId]);
      if (existing.rows.length) {
        await client.query('UPDATE pallet_items_s SET quantity = quantity + 1 WHERE id = $1', [existing.rows[0].id]);
      } else {
        await client.query('INSERT INTO pallet_items_s (pallet_id, product_id, quantity) VALUES ($1, $2, 1)', [pallet_id, productId]);
      }
    }

    // Log movement
    await client.query(
      `INSERT INTO movements_s (movement_type, product_id, quantity, to_shelf_id, to_pallet_id, from_employee_id, performed_by, source)
       VALUES ('bundle_place', $1, 1, $2, $3, $4, $5, 'task')`,
      [productId, shelf_id || null, pallet_id || null, task.rows[0].employee_id, req.user.id]);

    const newPlaced = task.rows[0].placed_count + 1;
    const phase = newPlaced >= task.rows[0].bundle_qty ? 'completed' : 'placing';
    const status = phase === 'completed' ? 'completed' : 'in_progress';

    await client.query(
      'UPDATE inventory_tasks_s SET placed_count = $1, assembly_phase = $2, status = $3 WHERE id = $4',
      [newPlaced, phase, status, req.params.id]);

    if (phase === 'completed') {
      await client.query('UPDATE inventory_tasks_s SET completed_at = NOW() WHERE id = $1', [req.params.id]);
    }

    await client.query('COMMIT');
    client.release();
    res.json({ ok: true, placed_count: newPlaced, total: task.rows[0].bundle_qty, phase });
  } catch (err) {
    await client.query('ROLLBACK');
    client.release();
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /:id/complete — Force complete ────────────────────────────────────
router.post('/:id/complete', requireAuth, async (req, res) => {
  try {
    await pool.query(
      `UPDATE inventory_tasks_s SET status = 'completed', assembly_phase = 'completed', completed_at = NOW()
       WHERE id = $1 AND task_type = 'bundle_assembly'`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

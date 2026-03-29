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

// ─── GET /source-locations — Find where components are stored ────────────────
router.get('/source-locations', requireAuth, async (req, res) => {
  let { component_ids, bundle_id } = req.query;
  let ids = [];

  if (bundle_id) {
    // Resolve component IDs from bundle
    const comps = await pool.query('SELECT component_id FROM bundle_components_s WHERE bundle_id = $1', [bundle_id]);
    ids = comps.rows.map(c => c.component_id);
    // Fallback: resolve from source_json
    if (ids.length === 0) {
      const prod = await pool.query('SELECT source_json FROM products_s WHERE id = $1', [bundle_id]);
      const rows = prod.rows[0]?.source_json?.components?.rows || [];
      const extIds = rows.map(r => r.assortmentDetails?.id).filter(Boolean);
      if (extIds.length > 0) {
        const resolved = await pool.query('SELECT id FROM products_s WHERE external_id = ANY($1)', [extIds]);
        ids = resolved.rows.map(r => r.id);
      }
    }
  } else if (component_ids) {
    ids = component_ids.split(',').map(Number).filter(n => n > 0);
  }

  if (ids.length === 0) return res.json([]);

  try {
    // Find in pallet boxes
    const boxLocs = await pool.query(
      `SELECT bi.product_id, bi.quantity, b.id as box_id, b.barcode_value as box_barcode,
              pa.id as pallet_id, pa.name as pallet_name,
              pr.id as row_id, pr.name as row_name,
              w.id as warehouse_id, w.name as warehouse_name,
              p.name as product_name
       FROM box_items_s bi
       JOIN boxes_s b ON b.id = bi.box_id
       JOIN pallets_s pa ON pa.id = b.pallet_id
       JOIN pallet_rows_s pr ON pr.id = pa.row_id
       JOIN warehouses_s w ON w.id = pr.warehouse_id
       JOIN products_s p ON p.id = bi.product_id
       WHERE bi.product_id = ANY($1) AND bi.quantity > 0 AND b.status = 'closed' AND w.active = true
       ORDER BY p.name, w.name, pr.name, pa.name`, [ids]);

    // Find on shelves
    const shelfLocs = await pool.query(
      `SELECT si.product_id, si.quantity, s.id as shelf_id, s.code as shelf_code,
              r.name as rack_name, w.id as warehouse_id, w.name as warehouse_name,
              p.name as product_name
       FROM shelf_items_s si
       JOIN shelves_s s ON s.id = si.shelf_id
       JOIN racks_s r ON r.id = s.rack_id
       JOIN warehouses_s w ON w.id = r.warehouse_id
       JOIN products_s p ON p.id = si.product_id
       WHERE si.product_id = ANY($1) AND si.quantity > 0 AND w.active = true
       ORDER BY p.name, w.name`, [ids]);

    // Find on pallets directly (pallet_items_s — no boxes)
    const palletLocs = await pool.query(
      `SELECT pi.product_id, pi.quantity, pi.pallet_id,
              pa.name as pallet_name, pa.barcode_value as pallet_barcode,
              pr.name as row_name, pr.id as row_id,
              w.id as warehouse_id, w.name as warehouse_name,
              p.name as product_name
       FROM pallet_items_s pi
       JOIN pallets_s pa ON pa.id = pi.pallet_id
       JOIN pallet_rows_s pr ON pr.id = pa.row_id
       JOIN warehouses_s w ON w.id = pr.warehouse_id
       JOIN products_s p ON p.id = pi.product_id
       WHERE pi.product_id = ANY($1) AND pi.quantity > 0 AND w.active = true
       ORDER BY p.name, w.name, pr.name, pa.name`, [ids]);

    const results = [];
    boxLocs.rows.forEach(r => results.push({
      key: `box-${r.box_id}`,
      path: `${r.warehouse_name} → ${r.row_name} → ${r.pallet_name}`,
      product_id: r.product_id, product_name: r.product_name, qty: Number(r.quantity),
      box_id: r.box_id, pallet_id: r.pallet_id, warehouse_id: r.warehouse_id,
    }));
    palletLocs.rows.forEach(r => results.push({
      key: `pallet-${r.pallet_id}-${r.product_id}`,
      path: `${r.warehouse_name} → ${r.row_name} → ${r.pallet_name}`,
      product_id: r.product_id, product_name: r.product_name, qty: Number(r.quantity),
      pallet_id: r.pallet_id, warehouse_id: r.warehouse_id,
    }));
    shelfLocs.rows.forEach(r => results.push({
      key: `shelf-${r.shelf_id}-${r.product_id}`,
      path: `${r.warehouse_name} → ${r.rack_name} → ${r.shelf_code}`,
      product_id: r.product_id, product_name: r.product_name, qty: Number(r.quantity),
      shelf_id: r.shelf_id, warehouse_id: r.warehouse_id,
    }));

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST / — Create assembly task (admin) ──────────────────────────────────
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { bundle_product_id, bundle_qty, employee_id, source_boxes, dest_shelf_id, dest_pallet_id, notes } = req.body;
  if (!bundle_product_id || !bundle_qty || bundle_qty < 1) return res.status(400).json({ error: 'bundle_product_id и bundle_qty обязательны' });

  try {
    // Verify it's a bundle
    const product = await pool.query('SELECT id, name, entity_type FROM products_s WHERE id = $1', [bundle_product_id]);
    if (!product.rows.length) return res.status(404).json({ error: 'Товар не найден' });
    if (product.rows[0].entity_type !== 'bundle') return res.status(400).json({ error: 'Товар должен быть комплектом (bundle)' });

    // Get bundle components (bundle_components_s first, then source_json fallback)
    let comps = await pool.query(
      `SELECT bc.component_id, bc.quantity, p.name, p.code
       FROM bundle_components_s bc JOIN products_s p ON p.id = bc.component_id
       WHERE bc.bundle_id = $1`, [bundle_product_id]);

    // Fallback: resolve from source_json if no rows in bundle_components_s
    if (comps.rows.length === 0) {
      const fullProduct = await pool.query('SELECT source_json FROM products_s WHERE id = $1', [bundle_product_id]);
      const rows = fullProduct.rows[0]?.source_json?.components?.rows || [];
      if (rows.length > 0) {
        const externalIds = rows.map(r => r.assortmentDetails?.id).filter(Boolean);
        const quantities = {};
        rows.forEach(r => { if (r.assortmentDetails?.id) quantities[r.assortmentDetails.id] = r.quantity || 1; });
        if (externalIds.length > 0) {
          const resolved = await pool.query(
            `SELECT id as component_id, name, code, external_id FROM products_s WHERE external_id = ANY($1)`, [externalIds]);
          comps = { rows: resolved.rows.map(c => ({ ...c, quantity: quantities[c.external_id] || 1 })) };
        }
      }
    }

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

    // Pallet boxes
    const boxes = await pool.query(
      `SELECT b.id as box_id, b.barcode_value as box_barcode, b.pallet_id, bi.product_id, bi.quantity,
              p.name as product_name, p.code as product_code,
              pa.name as pallet_name, pa.barcode_value as pallet_barcode, pr.name as row_name, w.name as warehouse_name,
              'pallet' as source_type
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

    // Shelf items
    const shelves = await pool.query(
      `SELECT si.product_id, si.quantity, si.shelf_id,
              s.code as shelf_code, s.barcode_value as shelf_barcode,
              r.name as rack_name, r.id as rack_id,
              w.name as warehouse_name, w.id as warehouse_id,
              p.name as product_name, p.code as product_code,
              'shelf' as source_type
       FROM shelf_items_s si
       JOIN shelves_s s ON s.id = si.shelf_id
       JOIN racks_s r ON r.id = s.rack_id
       JOIN warehouses_s w ON w.id = r.warehouse_id
       JOIN products_s p ON p.id = si.product_id
       WHERE si.product_id = ANY($1) AND si.quantity > 0 AND w.active = true
       ORDER BY p.name, w.name, r.name, s.code`,
      [componentIds]
    );

    // Pallet items (directly on pallet, no boxes)
    const palletItems = await pool.query(
      `SELECT pi.product_id, pi.quantity, pi.pallet_id,
              pa.name as pallet_name, pa.barcode_value as pallet_barcode,
              pr.name as row_name,
              w.name as warehouse_name, w.id as warehouse_id,
              p.name as product_name, p.code as product_code,
              'pallet_item' as source_type
       FROM pallet_items_s pi
       JOIN pallets_s pa ON pa.id = pi.pallet_id
       JOIN pallet_rows_s pr ON pr.id = pa.row_id
       JOIN warehouses_s w ON w.id = pr.warehouse_id
       JOIN products_s p ON p.id = pi.product_id
       WHERE pi.product_id = ANY($1) AND pi.quantity > 0 AND w.active = true
       ORDER BY p.name, w.name, pr.name, pa.name`,
      [componentIds]
    );

    res.json([...boxes.rows, ...palletItems.rows, ...shelves.rows]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /:id/start-picking — Start picking phase ─────────────────────────
router.post('/:id/start-picking', requireAuth, async (req, res) => {
  try {
    // employee_id from users_s (may be null for admin)
    const employeeId = req.user.employee_id || null;
    // If no employee linked, just set null (admin testing)

    await pool.query(
      `UPDATE inventory_tasks_s SET status = 'in_progress', assembly_phase = 'picking', started_at = NOW(),
       employee_id = COALESCE(employee_id, $2)
       WHERE id = $1 AND task_type = 'bundle_assembly'`,
      [req.params.id, employeeId]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /:id/scan-pick — Scan item from pallet box or shelf ───────────────
router.post('/:id/scan-pick', requireAuth, async (req, res) => {
  const { barcode, box_id, shelf_id, pallet_id } = req.body;
  if (!barcode) return res.status(400).json({ error: 'barcode обязателен' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const task = await client.query('SELECT * FROM inventory_tasks_s WHERE id = $1 AND task_type = $2', [req.params.id, 'bundle_assembly']);
    if (!task.rows.length) { await client.query('ROLLBACK'); client.release(); return res.status(404).json({ error: 'Задача не найдена' }); }
    if (task.rows[0].status !== 'in_progress') { await client.query('ROLLBACK'); client.release(); return res.status(400).json({ error: 'Задача не начата. Нажмите «Начать забор»' }); }
    if (task.rows[0].assembly_phase !== 'picking') { await client.query('ROLLBACK'); client.release(); return res.status(400).json({ error: 'Задача не в фазе забора' }); }
    if (!box_id && !shelf_id && !pallet_id) { await client.query('ROLLBACK'); client.release(); return res.status(400).json({ error: 'Укажите источник (box_id / shelf_id / pallet_id)' }); }

    const product = await resolveProduct(client, barcode);
    if (!product) { await client.query('ROLLBACK'); client.release(); return res.status(400).json({ error: 'Товар не найден по ШК' }); }

    // Check product is a component of this bundle
    const comp = await client.query(
      'SELECT * FROM bundle_components_s WHERE bundle_id = $1 AND component_id = $2',
      [task.rows[0].bundle_product_id, product.id]);
    if (!comp.rows.length) { await client.query('ROLLBACK'); client.release(); return res.status(400).json({ error: `${product.name} не входит в состав комплекта` }); }

    // Check if already picked enough of this component
    const alreadyPicked = await client.query(
      'SELECT COUNT(*) as cnt FROM assembly_items_s WHERE task_id = $1 AND product_id = $2', [req.params.id, product.id]);
    const needed = Number(comp.rows[0].quantity) * task.rows[0].bundle_qty;
    if (Number(alreadyPicked.rows[0].cnt) >= needed) {
      await client.query('ROLLBACK'); client.release();
      return res.status(400).json({ error: `Уже набрано ${alreadyPicked.rows[0].cnt}/${needed}. Больше не нужно` });
    }

    // Decrease quantity from source
    if (box_id) {
      const upd = await client.query(
        'UPDATE box_items_s SET quantity = quantity - 1 WHERE box_id = $1 AND product_id = $2 AND quantity > 0 RETURNING quantity',
        [box_id, product.id]);
      if (!upd.rows.length) { await client.query('ROLLBACK'); client.release(); return res.status(400).json({ error: 'В коробке нет этого товара' }); }
      const boxInfo = await client.query('SELECT pallet_id FROM boxes_s WHERE id = $1', [box_id]);
      await client.query(
        `INSERT INTO movements_s (movement_type, product_id, quantity, from_box_id, from_pallet_id, performed_by, source, notes)
         VALUES ('bundle_pick', $1, 1, $2, $3, $4, 'task', $5)`,
        [product.id, box_id, boxInfo.rows[0]?.pallet_id, req.user.id, `task:${req.params.id}`]);
    } else if (shelf_id) {
      const upd = await client.query(
        'UPDATE shelf_items_s SET quantity = quantity - 1 WHERE shelf_id = $1 AND product_id = $2 AND quantity > 0 RETURNING quantity',
        [shelf_id, product.id]);
      if (!upd.rows.length) { await client.query('ROLLBACK'); client.release(); return res.status(400).json({ error: 'На полке нет этого товара' }); }
      await client.query(
        `INSERT INTO movements_s (movement_type, product_id, quantity, from_shelf_id, performed_by, source, notes)
         VALUES ('bundle_pick', $1, 1, $2, $3, 'task', $4)`,
        [product.id, shelf_id, req.user.id, `task:${req.params.id}`]);
    } else if (pallet_id) {
      const upd = await client.query(
        'UPDATE pallet_items_s SET quantity = quantity - 1 WHERE pallet_id = $1 AND product_id = $2 AND quantity > 0 RETURNING quantity',
        [pallet_id, product.id]);
      if (!upd.rows.length) { await client.query('ROLLBACK'); client.release(); return res.status(400).json({ error: 'На паллете нет этого товара' }); }
      await client.query(
        `INSERT INTO movements_s (movement_type, product_id, quantity, from_pallet_id, performed_by, source, notes)
         VALUES ('bundle_pick', $1, 1, $2, $3, 'task', $4)`,
        [product.id, pallet_id, req.user.id, `task:${req.params.id}`]);
    }

    // Record picked item
    await client.query(
      `INSERT INTO assembly_items_s (task_id, product_id, source_box_id, source_pallet_id, source_shelf_id, scanned_barcode)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [req.params.id, product.id, box_id || null, pallet_id || null, shelf_id || null, barcode]);

    // Also record in task_scans for chronology
    await client.query(
      `INSERT INTO inventory_task_scans_s (task_id, product_id, scanned_value, quantity_delta, shelf_id)
       VALUES ($1, $2, $3, 1, $4)`,
      [req.params.id, product.id, barcode, shelf_id || null]);

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
    const task = await pool.query('SELECT * FROM inventory_tasks_s WHERE id = $1 AND task_type = $2', [req.params.id, 'bundle_assembly']);
    if (!task.rows.length) return res.status(404).json({ error: 'Задача не найдена' });
    if (task.rows[0].assembly_phase !== 'picking') return res.status(400).json({ error: 'Задача не в фазе забора' });

    // Verify all components are fully picked
    const comps = await pool.query('SELECT component_id, quantity FROM bundle_components_s WHERE bundle_id = $1', [task.rows[0].bundle_product_id]);
    const picked = await pool.query('SELECT product_id, COUNT(*) as cnt FROM assembly_items_s WHERE task_id = $1 GROUP BY product_id', [req.params.id]);
    const pickedMap = {};
    picked.rows.forEach(r => { pickedMap[r.product_id] = Number(r.cnt); });

    for (const c of comps.rows) {
      const needed = Number(c.quantity) * task.rows[0].bundle_qty;
      const have = pickedMap[c.component_id] || 0;
      if (have < needed) return res.status(400).json({ error: `Не хватает компонентов: набрано ${have}/${needed}` });
    }

    await pool.query(
      `UPDATE inventory_tasks_s SET assembly_phase = 'assembling' WHERE id = $1`,
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
    const task = await pool.query('SELECT * FROM inventory_tasks_s WHERE id = $1 AND task_type = $2', [req.params.id, 'bundle_assembly']);
    if (!task.rows.length) return res.status(404).json({ error: 'Задача не найдена' });
    if (task.rows[0].assembly_phase !== 'assembling') return res.status(400).json({ error: 'Задача не в фазе сборки' });

    const currentBundle = task.rows[0].assembled_count + 1;
    const product = await resolveProduct(pool, barcode);
    if (!product) return res.status(400).json({ error: 'Товар не найден по ШК' });

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
    const task = await pool.query('SELECT * FROM inventory_tasks_s WHERE id = $1 AND task_type = $2', [req.params.id, 'bundle_assembly']);
    if (!task.rows.length) return res.status(404).json({ error: 'Задача не найдена' });
    if (task.rows[0].assembly_phase !== 'assembling') return res.status(400).json({ error: 'Задача не в фазе сборки' });

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
  const { shelf_id, pallet_id, barcode } = req.body;
  if (!shelf_id && !pallet_id) return res.status(400).json({ error: 'shelf_id или pallet_id обязателен' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const task = await client.query('SELECT * FROM inventory_tasks_s WHERE id = $1 AND task_type = $2', [req.params.id, 'bundle_assembly']);
    if (!task.rows.length) { await client.query('ROLLBACK'); client.release(); return res.status(404).json({ error: 'Задача не найдена' }); }

    if (task.rows[0].assembly_phase !== 'placing') {
      await client.query('ROLLBACK'); client.release();
      return res.status(400).json({ error: 'Задача не в фазе размещения' });
    }

    if (task.rows[0].placed_count >= task.rows[0].bundle_qty) {
      await client.query('ROLLBACK'); client.release();
      return res.status(400).json({ error: 'Все комплекты уже размещены' });
    }

    const productId = task.rows[0].bundle_product_id;

    // Verify scanned barcode belongs to bundle product
    if (!barcode) { await client.query('ROLLBACK'); client.release(); return res.status(400).json({ error: 'Отсканируйте ШК комплекта' }); }
    const product = await resolveProduct(client, barcode);
    if (!product || product.id !== productId) {
      await client.query('ROLLBACK'); client.release();
      return res.status(400).json({ error: 'ШК не соответствует комплекту. Сканируйте ШК собранного комплекта' });
    }

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
      `INSERT INTO movements_s (movement_type, product_id, quantity, to_shelf_id, to_pallet_id, performed_by, source, notes)
       VALUES ('bundle_place', $1, 1, $2, $3, $4, 'task', $5)`,
      [productId, shelf_id || null, pallet_id || null, req.user.id, `task:${req.params.id}`]);

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

// ─── DELETE /:id — Delete task and rollback all picks ────────────────────────
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const task = await client.query('SELECT * FROM inventory_tasks_s WHERE id = $1 AND task_type = $2', [req.params.id, 'bundle_assembly']);
    if (!task.rows.length) { await client.query('ROLLBACK'); client.release(); return res.status(404).json({ error: 'Задача не найдена' }); }

    // Rollback: return all picked items back to their source boxes/shelves
    const items = await client.query('SELECT * FROM assembly_items_s WHERE task_id = $1', [req.params.id]);
    for (const item of items.rows) {
      if (item.source_box_id) {
        const existing = await client.query('SELECT id FROM box_items_s WHERE box_id = $1 AND product_id = $2', [item.source_box_id, item.product_id]);
        if (existing.rows.length) {
          await client.query('UPDATE box_items_s SET quantity = quantity + $1 WHERE box_id = $2 AND product_id = $3',
            [Number(item.quantity), item.source_box_id, item.product_id]);
        } else {
          await client.query('INSERT INTO box_items_s (box_id, product_id, quantity) VALUES ($1, $2, $3)',
            [item.source_box_id, item.product_id, Number(item.quantity)]);
        }
      } else if (item.source_shelf_id) {
        const existing = await client.query('SELECT id FROM shelf_items_s WHERE shelf_id = $1 AND product_id = $2', [item.source_shelf_id, item.product_id]);
        if (existing.rows.length) {
          await client.query('UPDATE shelf_items_s SET quantity = quantity + $1 WHERE shelf_id = $2 AND product_id = $3',
            [Number(item.quantity), item.source_shelf_id, item.product_id]);
        } else {
          await client.query('INSERT INTO shelf_items_s (shelf_id, product_id, quantity) VALUES ($1, $2, $3)',
            [item.source_shelf_id, item.product_id, Number(item.quantity)]);
        }
      } else if (item.source_pallet_id) {
        const existing = await client.query('SELECT id FROM pallet_items_s WHERE pallet_id = $1 AND product_id = $2', [item.source_pallet_id, item.product_id]);
        if (existing.rows.length) {
          await client.query('UPDATE pallet_items_s SET quantity = quantity + $1 WHERE pallet_id = $2 AND product_id = $3',
            [Number(item.quantity), item.source_pallet_id, item.product_id]);
        } else {
          await client.query('INSERT INTO pallet_items_s (pallet_id, product_id, quantity) VALUES ($1, $2, $3)',
            [item.source_pallet_id, item.product_id, Number(item.quantity)]);
        }
      }
    }

    // Rollback: remove any placed bundles from shelves/pallets
    if (task.rows[0].placed_count > 0) {
      const bundleProductId = task.rows[0].bundle_product_id;
      const placed = task.rows[0].placed_count;
      // Remove from movements and reverse shelf/pallet additions
      const placements = await client.query(
        `SELECT to_shelf_id, to_pallet_id, SUM(quantity) as qty FROM movements_s
         WHERE product_id = $1 AND movement_type = 'bundle_place' AND source = 'task'
           AND (notes IS NULL OR notes NOT LIKE '%rollback%')
         GROUP BY to_shelf_id, to_pallet_id`, [bundleProductId]);
      for (const p of placements.rows) {
        if (p.to_shelf_id) {
          await client.query('UPDATE shelf_items_s SET quantity = GREATEST(0, quantity - $1) WHERE shelf_id = $2 AND product_id = $3',
            [Number(p.qty), p.to_shelf_id, bundleProductId]);
        }
        if (p.to_pallet_id) {
          await client.query('UPDATE pallet_items_s SET quantity = GREATEST(0, quantity - $1) WHERE pallet_id = $2 AND product_id = $3',
            [Number(p.qty), p.to_pallet_id, bundleProductId]);
        }
      }
    }

    // Delete assembly items and task
    await client.query('DELETE FROM assembly_items_s WHERE task_id = $1', [req.params.id]);
    await client.query('DELETE FROM inventory_tasks_s WHERE id = $1', [req.params.id]);

    await client.query('COMMIT');
    client.release();
    res.json({ ok: true, message: 'Задача удалена, все перемещения откачены' });
  } catch (err) {
    await client.query('ROLLBACK');
    client.release();
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

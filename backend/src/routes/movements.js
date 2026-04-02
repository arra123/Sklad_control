const router = require('express').Router();
const pool = require('../db/pool');
const { requireAuth, requirePermission } = require('../middleware/auth');

// POST /api/movements/scan — resolve barcode to location
router.post('/scan', requireAuth, async (req, res) => {
  const { barcode } = req.body;
  if (!barcode?.trim()) return res.status(400).json({ error: 'Штрих-код обязателен' });
  const bc = barcode.trim();
  try {
    // Check pallets
    const pal = await pool.query(
      `SELECT pa.id, pa.name, pa.number, pr.name as row_name, w.name as warehouse_name
       FROM pallets_s pa JOIN pallet_rows_s pr ON pa.row_id=pr.id JOIN warehouses_s w ON pr.warehouse_id=w.id
       WHERE pa.barcode_value=$1`, [bc]);
    if (pal.rows.length) {
      // Get contents: boxes + loose items
      const boxes = await pool.query(
        `SELECT b.id, b.quantity, b.product_id, p.name as product_name FROM boxes_s b
         LEFT JOIN products_s p ON p.id=b.product_id WHERE b.pallet_id=$1 AND b.status='closed'`, [pal.rows[0].id]);
      const items = await pool.query(
        `SELECT pi.id, pi.quantity, pi.product_id, p.name as product_name FROM pallet_items_s pi
         JOIN products_s p ON p.id=pi.product_id WHERE pi.pallet_id=$1 AND pi.quantity>0`, [pal.rows[0].id]);
      return res.json({ type: 'pallet', id: pal.rows[0].id, name: pal.rows[0].name,
        location: `${pal.rows[0].warehouse_name} · ${pal.rows[0].row_name}`,
        contents: [...items.rows.map(i => ({ ...i, source: 'pallet_item' })), ...boxes.rows.map(b => ({ ...b, source: 'box' }))] });
    }
    // Check shelves
    const sh = await pool.query(
      `SELECT s.id, s.code, s.name, r.name as rack_name, w.name as warehouse_name
       FROM shelves_s s JOIN racks_s r ON s.rack_id=r.id JOIN warehouses_s w ON r.warehouse_id=w.id
       WHERE s.barcode_value=$1`, [bc]);
    if (sh.rows.length) {
      const items = await pool.query(
        `SELECT si.product_id, si.quantity, p.name as product_name FROM shelf_items_s si
         JOIN products_s p ON p.id=si.product_id WHERE si.shelf_id=$1 AND si.quantity>0`, [sh.rows[0].id]);
      return res.json({ type: 'shelf', id: sh.rows[0].id, name: sh.rows[0].code || sh.rows[0].name,
        location: `${sh.rows[0].warehouse_name} · ${sh.rows[0].rack_name}`,
        contents: items.rows.map(i => ({ ...i, source: 'shelf_item' })) });
    }
    // Check shelf boxes
    const sbx = await pool.query(
      `SELECT sb.id, sb.barcode_value, sb.product_id, sb.quantity, sb.shelf_id,
              s.code as shelf_code, s.name as shelf_name,
              r.name as rack_name, w.name as warehouse_name
       FROM shelf_boxes_s sb
       JOIN shelves_s s ON s.id = sb.shelf_id
       JOIN racks_s r ON r.id = s.rack_id
       JOIN warehouses_s w ON w.id = r.warehouse_id
       WHERE sb.barcode_value = $1`, [bc]);
    if (sbx.rows.length) {
      const contents = await pool.query(
        `SELECT sbi.product_id, sbi.quantity, p.name as product_name
         FROM shelf_box_items_s sbi
         JOIN products_s p ON p.id = sbi.product_id
         WHERE sbi.shelf_box_id = $1 AND sbi.quantity > 0
         ORDER BY p.name`,
        [sbx.rows[0].id]
      );
      return res.json({ type: 'box', id: sbx.rows[0].id, name: sbx.rows[0].name || `Коробка ${sbx.rows[0].barcode_value}`,
        location: `${sbx.rows[0].warehouse_name} · ${sbx.rows[0].rack_name} · ${sbx.rows[0].shelf_code || sbx.rows[0].shelf_name}`,
        contents: contents.rows.map(item => ({ ...item, source: 'shelf_box' })) });
    }
    // Check boxes
    const bx = await pool.query(
      `SELECT b.id, b.barcode_value, b.product_id, b.quantity, b.pallet_id
       FROM boxes_s b WHERE b.barcode_value=$1`, [bc]);
    if (bx.rows.length) {
      const contents = await pool.query(
        `SELECT bi.product_id, bi.quantity, p.name as product_name
         FROM box_items_s bi
         JOIN products_s p ON p.id = bi.product_id
         WHERE bi.box_id = $1 AND bi.quantity > 0
         ORDER BY p.name`,
        [bx.rows[0].id]
      );
      return res.json({ type: 'box', id: bx.rows[0].id, name: `Коробка ${bx.rows[0].barcode_value}`,
        location: bx.rows[0].pallet_id ? `Паллет #${bx.rows[0].pallet_id}` : '',
        contents: contents.rows.map(item => ({ ...item, source: 'box' })) });
    }
    // Check product barcode
    const prod = await pool.query(
      `SELECT id, name, code FROM products_s
       WHERE $1 = ANY(string_to_array(barcode_list, ';')) OR production_barcode=$1
         OR marketplace_barcodes_json::text ILIKE '%' || $1 || '%'
       LIMIT 1`, [bc]);
    if (prod.rows.length) {
      return res.json({ type: 'product', id: prod.rows[0].id, name: prod.rows[0].name, location: '', contents: [] });
    }
    res.status(404).json({ error: 'Не найдено по штрих-коду' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/movements/move — universal move
router.post('/move', requireAuth, async (req, res) => {
  const { source_type, source_id, dest_type, dest_id, product_id, quantity } = req.body;
  if (!product_id || !quantity || quantity <= 0) return res.status(400).json({ error: 'product_id и quantity обязательны' });
  if (!dest_type || !dest_id) return res.status(400).json({ error: 'Укажите назначение' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const qty = parseFloat(quantity);

    // Deduct from source
    if (source_type === 'shelf') {
      const r = await client.query('SELECT quantity FROM shelf_items_s WHERE shelf_id=$1 AND product_id=$2', [source_id, product_id]);
      if (!r.rows.length || parseFloat(r.rows[0].quantity) < qty) throw new Error('Недостаточно товара на полке');
      const newQty = parseFloat(r.rows[0].quantity) - qty;
      if (newQty <= 0) await client.query('DELETE FROM shelf_items_s WHERE shelf_id=$1 AND product_id=$2', [source_id, product_id]);
      else await client.query('UPDATE shelf_items_s SET quantity=$1 WHERE shelf_id=$2 AND product_id=$3', [newQty, source_id, product_id]);
    } else if (source_type === 'pallet') {
      const r = await client.query('SELECT quantity FROM pallet_items_s WHERE pallet_id=$1 AND product_id=$2', [source_id, product_id]);
      if (!r.rows.length || parseFloat(r.rows[0].quantity) < qty) throw new Error('Недостаточно товара на паллете');
      const newQty = parseFloat(r.rows[0].quantity) - qty;
      if (newQty <= 0) await client.query('DELETE FROM pallet_items_s WHERE pallet_id=$1 AND product_id=$2', [source_id, product_id]);
      else await client.query('UPDATE pallet_items_s SET quantity=$1 WHERE pallet_id=$2 AND product_id=$3', [newQty, source_id, product_id]);
    } else if (source_type === 'box') {
      // Determine if shelf_box or pallet box
      const sbx = await client.query('SELECT id FROM shelf_boxes_s WHERE id=$1', [source_id]);
      if (sbx.rows.length) {
        // Shelf box — deduct from shelf_box_items_s
        const r = await client.query('SELECT quantity FROM shelf_box_items_s WHERE shelf_box_id=$1 AND product_id=$2', [source_id, product_id]);
        if (!r.rows.length || parseFloat(r.rows[0].quantity) < qty) throw new Error('Недостаточно товара в коробке на полке');
        const newQty = parseFloat(r.rows[0].quantity) - qty;
        if (newQty <= 0) await client.query('DELETE FROM shelf_box_items_s WHERE shelf_box_id=$1 AND product_id=$2', [source_id, product_id]);
        else await client.query('UPDATE shelf_box_items_s SET quantity=$1, updated_at=NOW() WHERE shelf_box_id=$2 AND product_id=$3', [newQty, source_id, product_id]);
      } else {
        // Pallet box — deduct from box_items_s
        const r = await client.query('SELECT quantity FROM box_items_s WHERE box_id=$1 AND product_id=$2', [source_id, product_id]);
        if (!r.rows.length || parseFloat(r.rows[0].quantity) < qty) throw new Error('Недостаточно товара в коробке');
        const newQty = parseFloat(r.rows[0].quantity) - qty;
        if (newQty <= 0) await client.query('DELETE FROM box_items_s WHERE box_id=$1 AND product_id=$2', [source_id, product_id]);
        else await client.query('UPDATE box_items_s SET quantity=$1 WHERE box_id=$2 AND product_id=$3', [newQty, source_id, product_id]);
        // Update box total quantity
        await client.query('UPDATE boxes_s SET quantity = GREATEST(0, quantity - $1) WHERE id=$2', [qty, source_id]);
      }
    } else if (source_type === 'employee') {
      const r = await client.query('SELECT quantity FROM employee_inventory_s WHERE employee_id=$1 AND product_id=$2', [source_id, product_id]);
      if (!r.rows.length || parseFloat(r.rows[0].quantity) < qty) throw new Error('Недостаточно товара у сотрудника');
      const newQty = parseFloat(r.rows[0].quantity) - qty;
      if (newQty <= 0) await client.query('DELETE FROM employee_inventory_s WHERE employee_id=$1 AND product_id=$2', [source_id, product_id]);
      else await client.query('UPDATE employee_inventory_s SET quantity=$1 WHERE employee_id=$2 AND product_id=$3', [newQty, source_id, product_id]);
    }
    // source_type can be null for "adding from nowhere" (admin)

    // Add to destination
    if (dest_type === 'shelf') {
      throw new Error('Россыпь на полках отключена. Сканируйте коробку на полке');
    } else if (dest_type === 'pallet') {
      await client.query(
        `INSERT INTO pallet_items_s (pallet_id, product_id, quantity) VALUES ($1,$2,$3)
         ON CONFLICT (pallet_id, product_id) DO UPDATE SET quantity = pallet_items_s.quantity + $3`,
        [dest_id, product_id, qty]);
    } else if (dest_type === 'box') {
      // Determine if shelf_box or pallet box
      const sbx = await client.query('SELECT id FROM shelf_boxes_s WHERE id=$1', [dest_id]);
      if (sbx.rows.length) {
        // Shelf box — add to shelf_box_items_s
        await client.query(
          `INSERT INTO shelf_box_items_s (shelf_box_id, product_id, quantity, updated_at) VALUES ($1,$2,$3,NOW())
           ON CONFLICT (shelf_box_id, product_id) DO UPDATE SET quantity = shelf_box_items_s.quantity + $3, updated_at=NOW()`,
          [dest_id, product_id, qty]);
      } else {
        // Pallet box — add to box_items_s
        const existing = await client.query('SELECT id FROM box_items_s WHERE box_id=$1 AND product_id=$2', [dest_id, product_id]);
        if (existing.rows.length) {
          await client.query('UPDATE box_items_s SET quantity = quantity + $1 WHERE box_id=$2 AND product_id=$3', [qty, dest_id, product_id]);
        } else {
          await client.query('INSERT INTO box_items_s (box_id, product_id, quantity) VALUES ($1,$2,$3)', [dest_id, product_id, qty]);
        }
        // Update box total quantity
        await client.query('UPDATE boxes_s SET quantity = quantity + $1 WHERE id=$2', [qty, dest_id]);
      }
    } else if (dest_type === 'employee') {
      await client.query(
        `INSERT INTO employee_inventory_s (employee_id, product_id, quantity) VALUES ($1,$2,$3)
         ON CONFLICT (employee_id, product_id) DO UPDATE SET quantity = employee_inventory_s.quantity + $3`,
        [dest_id, product_id, qty]);
    }

    // Log shelf_movements_s for shelf source/dest
    if (source_type === 'shelf') {
      const cur = await client.query('SELECT COALESCE(quantity,0) as quantity FROM shelf_items_s WHERE shelf_id=$1 AND product_id=$2', [source_id, product_id]);
      const afterQty = cur.rows.length ? parseFloat(cur.rows[0].quantity) : 0;
      await client.query(
        `INSERT INTO shelf_movements_s (shelf_id, product_id, operation_type, quantity_before, quantity_after, quantity_delta, user_id, notes)
         VALUES ($1,$2,'stock_out',$3,$4,$5,$6,'Перемещение')`,
        [source_id, product_id, afterQty + qty, afterQty, -qty, req.user.id]);
    }
    if (dest_type === 'shelf') {
      const cur = await client.query('SELECT COALESCE(quantity,0) as quantity FROM shelf_items_s WHERE shelf_id=$1 AND product_id=$2', [dest_id, product_id]);
      const afterQty = cur.rows.length ? parseFloat(cur.rows[0].quantity) : 0;
      await client.query(
        `INSERT INTO shelf_movements_s (shelf_id, product_id, operation_type, quantity_before, quantity_after, quantity_delta, user_id, notes)
         VALUES ($1,$2,'stock_in',$3,$4,$5,$6,'Перемещение')`,
        [dest_id, product_id, afterQty - qty, afterQty, qty, req.user.id]);
    }

    // Log movement
    await client.query(
      `INSERT INTO movements_s (movement_type, product_id, quantity,
        from_pallet_id, from_shelf_id, from_box_id, from_employee_id,
        to_pallet_id, to_shelf_id, to_box_id, to_employee_id, performed_by, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'scan')`,
      [
        `${source_type || 'external'}_to_${dest_type}`,
        product_id, qty,
        source_type === 'pallet' ? source_id : null,
        source_type === 'shelf' ? source_id : null,
        source_type === 'box' ? source_id : null,
        source_type === 'employee' ? source_id : null,
        dest_type === 'pallet' ? dest_id : null,
        dest_type === 'shelf' ? dest_id : null,
        dest_type === 'box' ? dest_id : null,
        dest_type === 'employee' ? dest_id : null,
        req.user.id,
      ]);

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: err.message });
  } finally { client.release(); }
});

// GET /api/movements/history — movement log
router.get('/history', requireAuth, async (req, res) => {
  const { page = 1, limit = 50, product_id, employee_id, movement_type, date_from, date_to, search } = req.query;
  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
  try {
    const conditions = [];
    const params = [];
    if (product_id) { params.push(product_id); conditions.push(`m.product_id=$${params.length}`); }
    if (employee_id) { params.push(parseInt(employee_id)); conditions.push(`(m.from_employee_id=$${params.length} OR m.to_employee_id=$${params.length} OR m.performed_by=$${params.length})`); }
    if (movement_type) { params.push(movement_type); conditions.push(`m.movement_type=$${params.length}`); }
    if (date_from) { params.push(date_from); conditions.push(`m.created_at >= $${params.length}::date`); }
    if (date_to) { params.push(date_to + ' 23:59:59'); conditions.push(`m.created_at <= $${params.length}::timestamp`); }
    if (search) { params.push(`%${search}%`); conditions.push(`(p.name ILIKE $${params.length} OR u.username ILIKE $${params.length} OR fe.full_name ILIKE $${params.length} OR te.full_name ILIKE $${params.length})`); }
    // Only last 30 days by default
    if (!date_from && !date_to) { conditions.push(`m.created_at >= NOW() - INTERVAL '30 days'`); }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const offset = (parseInt(page) - 1) * parseInt(limit);
    params.push(parseInt(limit), offset);
    const result = await pool.query(
      `SELECT m.*, p.name as product_name, u.username as performed_by_name,
        fp.name as from_pallet_name, fs.code as from_shelf_code, fs.name as from_shelf_name,
        tp.name as to_pallet_name, ts.code as to_shelf_code, ts.name as to_shelf_name,
        fe.full_name as from_employee_name, te.full_name as to_employee_name,
        e_perf.full_name as performer_name
       FROM movements_s m
       LEFT JOIN products_s p ON p.id=m.product_id
       LEFT JOIN users_s u ON u.id=m.performed_by
       LEFT JOIN employees_s e_perf ON e_perf.id=u.employee_id
       LEFT JOIN pallets_s fp ON fp.id=m.from_pallet_id
       LEFT JOIN shelves_s fs ON fs.id=m.from_shelf_id
       LEFT JOIN pallets_s tp ON tp.id=m.to_pallet_id
       LEFT JOIN shelves_s ts ON ts.id=m.to_shelf_id
       LEFT JOIN employees_s fe ON fe.id=m.from_employee_id
       LEFT JOIN employees_s te ON te.id=m.to_employee_id
       ${where} ORDER BY m.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params);
    const countR = await pool.query(`SELECT COUNT(*) FROM movements_s m
       LEFT JOIN products_s p ON p.id=m.product_id
       LEFT JOIN users_s u ON u.id=m.performed_by
       LEFT JOIN employees_s fe ON fe.id=m.from_employee_id
       LEFT JOIN employees_s te ON te.id=m.to_employee_id
       ${where}`, params.slice(0, -2));
    return res.json({ items: result.rows, total: parseInt(countR.rows[0].count) });
  } catch (err) {
    if (err.code === '40P01' && attempt < maxRetries) { await new Promise(r => setTimeout(r, 50 * attempt)); continue; }
    return res.status(500).json({ error: err.message });
  }
  }
});

// GET /api/movements/stats — summary statistics
router.get('/stats', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '1 day') as today,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') as week,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as month,
        COUNT(DISTINCT performed_by) FILTER (WHERE created_at >= NOW() - INTERVAL '1 day') as today_users,
        COUNT(DISTINCT product_id) FILTER (WHERE created_at >= NOW() - INTERVAL '1 day') as today_products,
        COUNT(*) FILTER (WHERE movement_type LIKE '%shelf%' AND created_at >= NOW() - INTERVAL '1 day') as today_shelf,
        COUNT(*) FILTER (WHERE movement_type LIKE '%pallet%' AND created_at >= NOW() - INTERVAL '1 day') as today_pallet,
        COUNT(*) FILTER (WHERE movement_type LIKE '%employee%' AND created_at >= NOW() - INTERVAL '1 day') as today_employee
      FROM movements_s
    `);

    // Top employees today
    const topRes = await pool.query(`
      SELECT e.full_name, COUNT(*) as count
      FROM movements_s m
      JOIN users_s u ON u.id = m.performed_by
      JOIN employees_s e ON e.id = u.employee_id
      WHERE m.created_at >= NOW() - INTERVAL '1 day'
      GROUP BY e.full_name ORDER BY count DESC LIMIT 5
    `);

    // Movement types distribution today
    const typesRes = await pool.query(`
      SELECT movement_type, COUNT(*) as count
      FROM movements_s WHERE created_at >= NOW() - INTERVAL '1 day'
      GROUP BY movement_type ORDER BY count DESC
    `);

    res.json({ ...rows[0], top_employees: topRes.rows, movement_types: typesRes.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/movements/employee-inventory/:employeeId
router.get('/employee-inventory/:employeeId', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ei.*, p.name as product_name, p.code as product_code
       FROM employee_inventory_s ei JOIN products_s p ON p.id=ei.product_id
       WHERE ei.employee_id=$1 AND ei.quantity>0 ORDER BY p.name`,
      [req.params.employeeId]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/movements/my-inventory — current employee's inventory
router.get('/my-inventory', requireAuth, async (req, res) => {
  if (!req.user.employee_id) return res.json([]);
  try {
    const result = await pool.query(
      `SELECT ei.*, p.name as product_name, p.code as product_code
       FROM employee_inventory_s ei JOIN products_s p ON p.id=ei.product_id
       WHERE ei.employee_id=$1 AND ei.quantity>0 ORDER BY p.name`,
      [req.user.employee_id]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/movements/all-employee-inventory — admin: all employees with inventory
router.get('/all-employee-inventory', requireAuth, requirePermission('movements.view', 'staff.view'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT e.id as employee_id, e.full_name,
        json_agg(json_build_object('product_id', ei.product_id, 'product_name', p.name, 'quantity', ei.quantity)) as items
       FROM employee_inventory_s ei
       JOIN employees_s e ON e.id=ei.employee_id
       JOIN products_s p ON p.id=ei.product_id
       WHERE ei.quantity > 0
       GROUP BY e.id, e.full_name ORDER BY e.full_name`);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/movements/employee-inventory/:employeeId/:productId — update qty
router.put('/employee-inventory/:employeeId/:productId', requireAuth, requirePermission('movements.edit', 'staff.edit'), async (req, res) => {
  const { quantity } = req.body;
  const newQty = parseFloat(quantity);
  if (isNaN(newQty) || newQty < 0) return res.status(400).json({ error: 'Некорректное количество' });
  try {
    const old = await pool.query('SELECT quantity FROM employee_inventory_s WHERE employee_id=$1 AND product_id=$2', [req.params.employeeId, req.params.productId]);
    const oldQty = old.rows.length ? parseFloat(old.rows[0].quantity) : 0;
    if (newQty <= 0) {
      await pool.query('DELETE FROM employee_inventory_s WHERE employee_id=$1 AND product_id=$2', [req.params.employeeId, req.params.productId]);
    } else {
      await pool.query(
        `INSERT INTO employee_inventory_s (employee_id, product_id, quantity) VALUES ($1,$2,$3)
         ON CONFLICT (employee_id, product_id) DO UPDATE SET quantity=$3`,
        [req.params.employeeId, req.params.productId, newQty]);
    }
    const delta = newQty - oldQty;
    if (delta !== 0) {
      await pool.query(
        `INSERT INTO movements_s (movement_type, product_id, quantity, from_employee_id, to_employee_id, performed_by, source, notes)
         VALUES ($1,$2,$3,$4,$5,$6,'manual_edit',$7)`,
        [delta < 0 ? 'employee_correction_out' : 'employee_correction_in', req.params.productId, Math.abs(delta),
         delta < 0 ? parseInt(req.params.employeeId) : null, delta > 0 ? parseInt(req.params.employeeId) : null,
         req.user.id, `Ручное редактирование: ${oldQty} → ${newQty}`]);
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/movements/employee-inventory/:employeeId/:productId
router.delete('/employee-inventory/:employeeId/:productId', requireAuth, requirePermission('movements.edit', 'staff.edit'), async (req, res) => {
  try {
    const old = await pool.query('SELECT quantity FROM employee_inventory_s WHERE employee_id=$1 AND product_id=$2', [req.params.employeeId, req.params.productId]);
    const oldQty = old.rows.length ? parseFloat(old.rows[0].quantity) : 0;
    await pool.query('DELETE FROM employee_inventory_s WHERE employee_id=$1 AND product_id=$2', [req.params.employeeId, req.params.productId]);
    if (oldQty > 0) {
      await pool.query(
        `INSERT INTO movements_s (movement_type, product_id, quantity, from_employee_id, performed_by, source, notes)
         VALUES ('employee_correction_out',$1,$2,$3,$4,'manual_edit','Удаление товара у сотрудника')`,
        [req.params.productId, oldQty, parseInt(req.params.employeeId), req.user.id]);
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/movements/employee-inventory/:employeeId — add product to employee
router.post('/employee-inventory/:employeeId', requireAuth, requirePermission('movements.edit', 'staff.edit'), async (req, res) => {
  const { product_id, quantity } = req.body;
  if (!product_id || !quantity || quantity <= 0) return res.status(400).json({ error: 'product_id и quantity обязательны' });
  const qty = parseFloat(quantity);
  try {
    await pool.query(
      `INSERT INTO employee_inventory_s (employee_id, product_id, quantity) VALUES ($1,$2,$3)
       ON CONFLICT (employee_id, product_id) DO UPDATE SET quantity = employee_inventory_s.quantity + $3`,
      [req.params.employeeId, product_id, qty]);
    await pool.query(
      `INSERT INTO movements_s (movement_type, product_id, quantity, to_employee_id, performed_by, source, notes)
       VALUES ('employee_correction_in',$1,$2,$3,$4,'manual_edit','Добавление товара сотруднику')`,
      [product_id, qty, parseInt(req.params.employeeId), req.user.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

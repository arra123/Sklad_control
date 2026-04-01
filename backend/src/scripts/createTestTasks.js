#!/usr/bin/env node
/**
 * Creates test tasks for employee Нурьев Артем (id=72)
 * Run on server: node backend/src/scripts/createTestTasks.js
 */
const pool = require('../db/pool');

async function run() {
  const client = await pool.connect();
  try {
    // Find employee
    const emp = await client.query(`SELECT id FROM employees_s WHERE full_name ILIKE '%Нурьев Артем%' LIMIT 1`);
    if (!emp.rows.length) { console.error('Employee not found'); return; }
    const employeeId = emp.rows[0].id;

    // Find admin user
    const admin = await client.query(`SELECT id FROM users_s WHERE role = 'admin' LIMIT 1`);
    const adminId = admin.rows[0]?.id || 1;

    // Find a shelf in "Ижевск FBS нов"
    const shelf = await client.query(`
      SELECT s.id, s.barcode_value, s.code FROM shelves_s s
      JOIN racks_s r ON r.id = s.rack_id
      JOIN warehouses_s w ON w.id = r.warehouse_id
      WHERE w.name = 'Ижевск FBS нов'
      ORDER BY s.id LIMIT 3
    `);

    // Find a pallet in "Наша продукция нов"
    const pallet = await client.query(`
      SELECT p.id, p.barcode_value, p.name FROM pallets_s p
      JOIN pallet_rows_s pr ON pr.id = p.row_id
      JOIN warehouses_s w ON w.id = pr.warehouse_id
      WHERE w.name = 'Наша продукция нов'
      ORDER BY p.id LIMIT 3
    `);

    // Find a box on a pallet
    const box = await client.query(`
      SELECT b.id, b.barcode_value FROM boxes_s b
      JOIN pallets_s p ON p.id = b.pallet_id
      JOIN pallet_rows_s pr ON pr.id = p.row_id
      JOIN warehouses_s w ON w.id = pr.warehouse_id
      WHERE w.name = 'Наша продукция нов' AND b.quantity > 0
      ORDER BY b.id LIMIT 1
    `);

    console.log('Employee:', employeeId);
    console.log('Shelves:', shelf.rows);
    console.log('Pallets:', pallet.rows);
    console.log('Box:', box.rows);

    await client.query('BEGIN');

    const tasks = [];

    // 1. Inventory task (shelf)
    if (shelf.rows[0]) {
      const r = await client.query(
        `INSERT INTO inventory_tasks_s (title, employee_id, shelf_id, task_type, created_by)
         VALUES ($1, $2, $3, 'inventory', $4) RETURNING id`,
        [`Тест: Инвентаризация ${shelf.rows[0].code}`, employeeId, shelf.rows[0].id, adminId]
      );
      tasks.push({ type: 'inventory', id: r.rows[0].id, shelf: shelf.rows[0] });
    }

    // 2. Packaging task (pallet)
    if (pallet.rows[0]) {
      const r = await client.query(
        `INSERT INTO inventory_tasks_s (title, employee_id, target_pallet_id, task_type, created_by)
         VALUES ($1, $2, $3, 'packaging', $4) RETURNING id`,
        [`Тест: Оприходование ${pallet.rows[0].name}`, employeeId, pallet.rows[0].id, adminId]
      );
      tasks.push({ type: 'packaging', id: r.rows[0].id, pallet: pallet.rows[0] });
    }

    // 3. Production transfer task (pallet)
    if (pallet.rows[1]) {
      const r = await client.query(
        `INSERT INTO inventory_tasks_s (title, employee_id, target_pallet_id, task_type, created_by)
         VALUES ($1, $2, $3, 'production_transfer', $4) RETURNING id`,
        [`Тест: Перенос на ${pallet.rows[1].name}`, employeeId, pallet.rows[1].id, adminId]
      );
      tasks.push({ type: 'production_transfer', id: r.rows[0].id, pallet: pallet.rows[1] });
    }

    await client.query('COMMIT');

    console.log('\n=== Created tasks ===');
    for (const t of tasks) {
      console.log(`  ${t.type} (id=${t.id})`);
    }
    console.log('\nDone!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error:', err.message);
  } finally {
    client.release();
    pool.end();
  }
}

run();

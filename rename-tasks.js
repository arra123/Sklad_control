require('dotenv').config();
const { Pool } = require('pg');
const p = new Pool({
  host: process.env.DB_HOST,
  port: 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function run() {
  const { rows } = await p.query(`
    SELECT t.id, t.title, s.name as shelf_name, r.name as rack_name, pa.name as pallet_name, pr.name as row_name
    FROM inventory_tasks_s t
    LEFT JOIN shelves_s s ON s.id = t.shelf_id
    LEFT JOIN racks_s r ON r.id = s.rack_id
    LEFT JOIN pallets_s pa ON pa.id = t.target_pallet_id
    LEFT JOIN pallet_rows_s pr ON pr.id = pa.row_id
  `);

  let count = 0;
  for (const t of rows) {
    let newTitle = null;
    if (t.rack_name && t.shelf_name) {
      newTitle = 'Инвентаризация · ' + t.rack_name + ' · ' + t.shelf_name;
    } else if (t.row_name && t.pallet_name) {
      newTitle = 'Инвентаризация · ' + t.row_name + ' · ' + t.pallet_name;
    }
    if (newTitle && newTitle !== t.title) {
      await p.query('UPDATE inventory_tasks_s SET title = $1 WHERE id = $2', [newTitle, t.id]);
      console.log('  #' + t.id + ': ' + t.title + ' → ' + newTitle);
      count++;
    }
  }
  console.log('Renamed:', count, 'tasks');
  await p.end();
}
run().catch(e => { console.error(e); p.end(); });

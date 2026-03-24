const pool = require('./pool');
const { hashPassword } = require('../utils/password');
const config = require('../config');

async function seedAdmin() {
  const { adminLogin, adminPassword } = config.seed;
  const existing = await pool.query('SELECT id FROM users_s WHERE username = $1', [adminLogin]);
  if (existing.rows.length > 0) {
    console.log('[Seed] Admin user already exists');
    return;
  }
  const hash = await hashPassword(adminPassword);
  await pool.query(
    'INSERT INTO users_s (username, password_hash, role) VALUES ($1, $2, $3)',
    [adminLogin, hash, 'admin']
  );
  console.log(`[Seed] Admin user created: ${adminLogin}`);
}

async function seedDefaultWarehouse() {
  const existing = await pool.query('SELECT id FROM warehouses_s WHERE name = $1', ['Ижевск FBS']);
  if (existing.rows.length > 0) return;

  const wh = await pool.query(
    'INSERT INTO warehouses_s (name, external_id) VALUES ($1, $2) RETURNING id',
    ['Ижевск FBS', 'c3fec71f-1ba1-11f1-0a80-0382002be32c']
  );
  const warehouseId = wh.rows[0].id;

  // Create 11 racks with 6 shelves each
  for (let r = 1; r <= 11; r++) {
    const rackCode = `С${r}`;
    const rackBarcode = String(Math.floor(Math.random() * 900000) + 100000);
    const rack = await pool.query(
      'INSERT INTO racks_s (warehouse_id, name, number, code, barcode_value) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [warehouseId, `Стеллаж ${r}`, r, rackCode, rackBarcode]
    );
    const rackId = rack.rows[0].id;

    for (let s = 1; s <= 6; s++) {
      const shelfCode = `${rackCode}П${s}`;
      await pool.query(
        'INSERT INTO shelves_s (rack_id, name, number, code, barcode_value) VALUES ($1, $2, $3, $4, $5)',
        [rackId, `Полка ${s}`, s, shelfCode, String(Math.floor(Math.random() * 900000000) + 100000000)]
      );
    }
  }
  console.log('[Seed] Default warehouse Ижевск FBS created with 11 racks × 6 shelves');
}

async function seedDefaultSettings() {
  const defaults = [
    { key: 'theme_color', value: 'purple' },
    { key: 'theme_mode', value: 'light' },
    { key: 'company_name', value: 'ARRA' },
  ];
  for (const { key, value } of defaults) {
    await pool.query(
      'INSERT INTO settings_s (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING',
      [key, value]
    );
  }
  console.log('[Seed] Default settings initialized');
}

async function runSeed() {
  await seedAdmin();
  await seedDefaultWarehouse();
  await seedDefaultSettings();
}

module.exports = { runSeed };

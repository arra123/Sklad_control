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

async function seedMissingEmployees() {
  const employees = [
    { full_name: 'Степанова Дарья Игоревна' },
  ];
  for (const emp of employees) {
    const existing = await pool.query('SELECT id FROM employees_s WHERE full_name = $1', [emp.full_name]);
    if (existing.rows.length > 0) {
      console.log(`[Seed] Employee already exists: ${emp.full_name}`);
      continue;
    }
    await pool.query(
      'INSERT INTO employees_s (full_name) VALUES ($1)',
      [emp.full_name]
    );
    console.log(`[Seed] Employee created: ${emp.full_name}`);
  }
}

async function runSeed() {
  await seedAdmin();
  await seedDefaultSettings();
  await seedMissingEmployees();
}

module.exports = { runSeed };

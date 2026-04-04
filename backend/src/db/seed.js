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
    { full_name: 'Степанова Дарья Игоревна', department: 'Производство', position: 'Сотрудник производства', username: 'степанова.дарья', password: 'степанова.дарья' },
  ];
  for (const emp of employees) {
    const existing = await pool.query('SELECT id FROM employees_s WHERE full_name = $1', [emp.full_name]);
    let empId;
    if (existing.rows.length > 0) {
      empId = existing.rows[0].id;
      // Update department/position if missing
      await pool.query(
        'UPDATE employees_s SET department = COALESCE(department, $1), position = COALESCE(position, $2) WHERE id = $3',
        [emp.department, emp.position, empId]
      );
      console.log(`[Seed] Employee updated: ${emp.full_name}`);
    } else {
      const res = await pool.query(
        'INSERT INTO employees_s (full_name, department, position) VALUES ($1, $2, $3) RETURNING id',
        [emp.full_name, emp.department, emp.position]
      );
      empId = res.rows[0].id;
      console.log(`[Seed] Employee created: ${emp.full_name}`);
    }
    // Create user account if missing
    if (emp.username && empId) {
      const userExists = await pool.query('SELECT id FROM users_s WHERE employee_id = $1', [empId]);
      if (userExists.rows.length === 0) {
        const hash = await hashPassword(emp.password);
        await pool.query(
          'INSERT INTO users_s (username, password_hash, password_plain, role, employee_id) VALUES ($1, $2, $3, $4, $5)',
          [emp.username, hash, emp.password, 'employee', empId]
        );
        console.log(`[Seed] User created for: ${emp.full_name}`);
      }
    }
  }
}

async function runSeed() {
  await seedAdmin();
  await seedDefaultSettings();
  await seedMissingEmployees();
}

module.exports = { runSeed };

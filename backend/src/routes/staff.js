const router = require('express').Router();
const pool = require('../db/pool');
const externalPool = require('../db/externalPool');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { hashPassword } = require('../utils/password');
const { syncEmployeesFromOsite } = require('../utils/syncFromOsite');

// POST /api/staff/sync — trigger sync from external site
router.post('/sync', requireAuth, requirePermission('staff.view', 'staff.edit'), async (_req, res) => {
  try {
    await syncEmployeesFromOsite();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Employees ────────────────────────────────────────────────────────────────

router.get('/employees', requireAuth, requirePermission('staff.view', 'staff.edit', 'tasks.create', 'tasks.view'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT ON (e.id) e.*,
        u.id as user_id, u.username, u.password_plain, u.role, u.role_id, u.active as user_active,
        r.name as role_name,
        (SELECT COALESCE(json_agg(json_build_object(
          'product_id', ei.product_id, 'product_name', p.name, 'quantity', ei.quantity
        )), '[]'::json)
        FROM employee_inventory_s ei JOIN products_s p ON p.id=ei.product_id
        WHERE ei.employee_id=e.id AND ei.quantity>0) as inventory
       FROM employees_s e
       LEFT JOIN users_s u ON u.employee_id = e.id
       LEFT JOIN roles_s r ON r.id = u.role_id
       ORDER BY e.id, u.id`
    );
    // Re-sort by full_name after DISTINCT ON
    result.rows.sort((a, b) => a.full_name.localeCompare(b.full_name, 'ru'));
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/staff/external-employees — list employees from external DB (not yet added)
router.get('/external-employees', requireAuth, requirePermission('staff.edit'), async (req, res) => {
  try {
    // Get IDs already linked
    const linked = await pool.query('SELECT external_employee_id FROM employees_s WHERE external_employee_id IS NOT NULL');
    const linkedIds = linked.rows.map(r => r.external_employee_id);

    const result = await externalPool.query(
      `SELECT e.id, e.full_name, e.phone, e.status, p.name as position_name,
              u.login, u.password_plain
       FROM employees_d e
       LEFT JOIN positions_d p ON p.id = e.position_id
       LEFT JOIN users_d u ON u.employee_id = e.id
       WHERE e.status = 'active'
       ORDER BY e.full_name`
    );

    // Mark which are already added
    const employees = result.rows.map(e => ({
      ...e,
      already_added: linkedIds.includes(e.id),
    }));

    res.json(employees);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/employees', requireAuth, requirePermission('staff.edit'), async (req, res) => {
  const { full_name, position, phone, external_employee_id, username, password, role, role_id } = req.body;
  if (!full_name) return res.status(400).json({ error: 'ФИО обязательно' });
  try {
    if (external_employee_id) {
      const exists = await pool.query('SELECT id FROM employees_s WHERE external_employee_id=$1', [external_employee_id]);
      if (exists.rows.length) return res.status(400).json({ error: 'Этот сотрудник уже добавлен' });
    }
    if (username) {
      const dup = await pool.query('SELECT id FROM users_s WHERE username=$1', [username]);
      if (dup.rows.length) return res.status(400).json({ error: 'Логин уже занят' });
    }
    const empResult = await pool.query(
      'INSERT INTO employees_s (full_name, position, phone, external_employee_id) VALUES ($1,$2,$3,$4) RETURNING *',
      [full_name, position || null, phone || null, external_employee_id || null]
    );
    const emp = empResult.rows[0];
    let user = null;
    if (username && password) {
      const hash = await hashPassword(password);
      const userResult = await pool.query(
        'INSERT INTO users_s (username, password_hash, role, employee_id, role_id) VALUES ($1,$2,$3,$4,$5) RETURNING id, username, role, role_id, employee_id, active',
        [username, hash, role || 'employee', emp.id, role_id || null]
      );
      user = userResult.rows[0];
    }
    res.status(201).json({ ...emp, user });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Этот сотрудник уже добавлен или логин занят' });
    res.status(500).json({ error: err.message });
  }
});

// GET /api/staff/employees/:id/credentials — get login/password from external DB
router.get('/employees/:id/credentials', requireAuth, requirePermission('staff.edit'), async (req, res) => {
  try {
    const emp = await pool.query('SELECT external_employee_id FROM employees_s WHERE id=$1', [req.params.id]);
    if (!emp.rows.length) return res.status(404).json({ error: 'Сотрудник не найден' });
    const extId = emp.rows[0].external_employee_id;
    if (!extId) return res.status(404).json({ error: 'Нет привязки к внешней БД' });
    const result = await externalPool.query('SELECT login, password_plain FROM users_d WHERE employee_id=$1', [extId]);
    if (!result.rows.length) return res.status(404).json({ error: 'Нет учётной записи во внешней БД' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/employees/:id', requireAuth, requirePermission('staff.edit'), async (req, res) => {
  const { full_name, position, phone, active } = req.body;
  try {
    const result = await pool.query(
      `UPDATE employees_s
       SET full_name=COALESCE($1,full_name),
           position=COALESCE($2,position),
           phone=COALESCE($3,phone),
           active=COALESCE($4,active)
       WHERE id=$5 RETURNING *`,
      [full_name, position, phone, active, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Сотрудник не найден' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/employees/:id', requireAuth, requirePermission('staff.edit'), async (req, res) => {
  try {
    await pool.query('DELETE FROM employees_s WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Users ────────────────────────────────────────────────────────────────────

// ─── Roles ────────────────────────────────────────────────────────────────────

router.get('/roles', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM roles_s ORDER BY id');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/roles', requireAuth, requirePermission('roles.manage'), async (req, res) => {
  const { name, permissions } = req.body;
  if (!name) return res.status(400).json({ error: 'Название обязательно' });
  try {
    const result = await pool.query(
      'INSERT INTO roles_s (name, permissions) VALUES ($1, $2) RETURNING *',
      [name, JSON.stringify(permissions || [])]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Роль с таким названием уже существует' });
    res.status(500).json({ error: err.message });
  }
});

router.put('/roles/:id', requireAuth, requirePermission('roles.manage'), async (req, res) => {
  const { name, permissions } = req.body;
  try {
    const result = await pool.query(
      'UPDATE roles_s SET name=COALESCE($1,name), permissions=COALESCE($2,permissions) WHERE id=$3 RETURNING *',
      [name, permissions ? JSON.stringify(permissions) : null, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Роль не найдена' });
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Роль с таким названием уже существует' });
    res.status(500).json({ error: err.message });
  }
});

router.delete('/roles/:id', requireAuth, requirePermission('roles.manage'), async (req, res) => {
  try {
    // Check if role is in use
    const inUse = await pool.query('SELECT COUNT(*) FROM users_s WHERE role_id=$1', [req.params.id]);
    if (parseInt(inUse.rows[0].count) > 0) return res.status(400).json({ error: 'Роль используется, нельзя удалить' });
    await pool.query('DELETE FROM roles_s WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Users ────────────────────────────────────────────────────────────────────

router.get('/users', requireAuth, requirePermission('staff.view', 'staff.edit'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.username, u.password_plain, u.role, u.role_id, u.active, u.employee_id, u.created_at,
              e.full_name as employee_name, r.name as role_name, r.permissions as role_permissions
       FROM users_s u
       LEFT JOIN employees_s e ON e.id = u.employee_id
       LEFT JOIN roles_s r ON r.id = u.role_id
       ORDER BY u.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/users', requireAuth, requirePermission('staff.edit'), async (req, res) => {
  const { username, password, role, employee_id } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Логин и пароль обязательны' });
  try {
    const hash = await hashPassword(password);
    const result = await pool.query(
      'INSERT INTO users_s (username, password_hash, password_plain, role, employee_id) VALUES ($1,$2,$3,$4,$5) RETURNING id, username, password_plain, role, employee_id, active, created_at',
      [username, hash, password, role || 'employee', employee_id || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Логин уже занят' });
    res.status(500).json({ error: err.message });
  }
});

router.put('/users/:id', requireAuth, requirePermission('staff.edit'), async (req, res) => {
  const { username, password, role, employee_id, active, role_id } = req.body;
  try {
    let hash = null;
    if (password) hash = await hashPassword(password);

    const result = await pool.query(
      `UPDATE users_s
       SET username=COALESCE($1,username),
           password_hash=COALESCE($2,password_hash),
           password_plain=COALESCE($8,password_plain),
           role=COALESCE($3,role),
           employee_id=COALESCE($4,employee_id),
           active=COALESCE($5,active),
           role_id=$7
       WHERE id=$6
       RETURNING id, username, password_plain, role, role_id, employee_id, active`,
      [username, hash, role, employee_id, active, req.params.id, role_id !== undefined ? role_id : null, password || null]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Пользователь не найден' });
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Логин уже занят' });
    res.status(500).json({ error: err.message });
  }
});

router.delete('/users/:id', requireAuth, requirePermission('staff.edit'), async (req, res) => {
  if (req.user.id === parseInt(req.params.id)) {
    return res.status(400).json({ error: 'Нельзя удалить себя' });
  }
  try {
    await pool.query('DELETE FROM users_s WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Employee Breaks ─────────────────────────────────────────────────────

// POST /api/staff/breaks/start — employee starts a break (lunch)
router.post('/breaks/start', requireAuth, async (req, res) => {
  const employeeId = req.user.employee_id;
  if (!employeeId) return res.status(400).json({ error: 'Нет привязки к сотруднику' });
  try {
    // Check if already on break
    const active = await pool.query(
      'SELECT id FROM employee_breaks_s WHERE employee_id=$1 AND ended_at IS NULL LIMIT 1',
      [employeeId]
    );
    if (active.rows.length) return res.status(400).json({ error: 'Вы уже на перерыве' });
    const result = await pool.query(
      'INSERT INTO employee_breaks_s (employee_id, break_type) VALUES ($1, $2) RETURNING *',
      [employeeId, req.body.break_type || 'lunch']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/staff/breaks/end — employee ends a break
router.post('/breaks/end', requireAuth, async (req, res) => {
  const employeeId = req.user.employee_id;
  if (!employeeId) return res.status(400).json({ error: 'Нет привязки к сотруднику' });
  try {
    const result = await pool.query(
      'UPDATE employee_breaks_s SET ended_at=NOW() WHERE employee_id=$1 AND ended_at IS NULL RETURNING *',
      [employeeId]
    );
    if (!result.rows.length) return res.status(400).json({ error: 'Нет активного перерыва' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/staff/breaks/active — check if employee is on break
router.get('/breaks/active', requireAuth, async (req, res) => {
  const employeeId = req.user.employee_id;
  if (!employeeId) return res.json({ on_break: false });
  try {
    const result = await pool.query(
      'SELECT * FROM employee_breaks_s WHERE employee_id=$1 AND ended_at IS NULL LIMIT 1',
      [employeeId]
    );
    res.json({ on_break: result.rows.length > 0, break: result.rows[0] || null });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/staff/breaks/admin-add — admin adds a tech break for an employee
router.post('/breaks/admin-add', requireAuth, requirePermission('tasks.view', 'tasks.create'), async (req, res) => {
  const { employee_id, break_type, started_at, ended_at } = req.body;
  if (!employee_id) return res.status(400).json({ error: 'employee_id обязателен' });
  try {
    const result = await pool.query(
      'INSERT INTO employee_breaks_s (employee_id, break_type, started_at, ended_at) VALUES ($1, $2, $3, $4) RETURNING *',
      [employee_id, break_type || 'tech', started_at || new Date(), ended_at || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/staff/breaks/admin-end — admin ends a tech break for an employee
router.post('/breaks/admin-end', requireAuth, requirePermission('tasks.view', 'tasks.create'), async (req, res) => {
  const { employee_id } = req.body;
  if (!employee_id) return res.status(400).json({ error: 'employee_id обязателен' });
  try {
    const result = await pool.query(
      'UPDATE employee_breaks_s SET ended_at=NOW() WHERE employee_id=$1 AND ended_at IS NULL RETURNING *',
      [employee_id]
    );
    if (!result.rows.length) return res.status(400).json({ error: 'Нет активного перерыва' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

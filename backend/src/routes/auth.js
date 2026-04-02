const router = require('express').Router();
const pool = require('../db/pool');
const { comparePassword } = require('../utils/password');
const { hashPassword } = require('../utils/password');
const { signToken } = require('../utils/jwt');
const { requireAuth } = require('../middleware/auth');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Введите логин и пароль' });
  }
  try {
    const result = await pool.query(
      `SELECT u.id, u.username, u.password_hash, u.role, u.role_id, u.employee_id, u.active,
              e.full_name as employee_name,
              COALESCE(e.gra_balance, 0) as gra_balance,
              r.name as role_name, r.permissions as role_permissions
       FROM users_s u
       LEFT JOIN employees_s e ON e.id = u.employee_id
       LEFT JOIN roles_s r ON r.id = u.role_id
       WHERE u.username = $1`,
      [username]
    );
    const user = result.rows[0];
    if (!user || !user.active) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }
    const ok = await comparePassword(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }
    const permissions = user.role_permissions || [];
    const token = signToken({ sub: user.id, role: user.role });
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        role_name: user.role_name,
        permissions,
        employee_id: user.employee_id,
        employee_name: user.employee_name,
        gra_balance: Number(user.gra_balance || 0),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.username, u.role, u.role_id, u.employee_id,
              e.full_name as employee_name,
              COALESCE(e.gra_balance, 0) as gra_balance,
              r.name as role_name, r.permissions as role_permissions
       FROM users_s u
       LEFT JOIN employees_s e ON e.id = u.employee_id
       LEFT JOIN roles_s r ON r.id = u.role_id
       WHERE u.id = $1`,
      [req.user.id]
    );
    const u = result.rows[0];
    res.json({ ...u, gra_balance: Number(u.gra_balance || 0), permissions: u.role_permissions || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/change-password
router.post('/change-password', requireAuth, async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Заполните все поля' });
  }
  try {
    const result = await pool.query('SELECT password_hash FROM users_s WHERE id = $1', [req.user.id]);
    const ok = await comparePassword(current_password, result.rows[0].password_hash);
    if (!ok) return res.status(400).json({ error: 'Неверный текущий пароль' });
    const hash = await hashPassword(new_password);
    await pool.query('UPDATE users_s SET password_hash = $1 WHERE id = $2', [hash, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/fix-passwords — one-time: rehash all passwords from password_plain
router.post('/fix-passwords', async (_req, res) => {
  try {
    const users = await pool.query('SELECT id, password_plain FROM users_s WHERE password_plain IS NOT NULL');
    let fixed = 0;
    for (const u of users.rows) {
      const hash = await hashPassword(u.password_plain);
      await pool.query('UPDATE users_s SET password_hash=$1, active=true WHERE id=$2', [hash, u.id]);
      fixed++;
    }
    res.json({ success: true, fixed });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

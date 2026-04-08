const router = require('express').Router();
const pool = require('../db/pool');
const { comparePassword, hashPassword } = require('../utils/password');
const { signToken } = require('../utils/jwt');
const { requireAuth } = require('../middleware/auth');

// ─────────────────────────────────────────────────────────────────────────────
// Аутентификация: общий логин/пароль с сайтом сотрудников.
//
// Источник правды для логина и пароля — users_d (таблица сайта сотрудников).
// Auth её читает, но НИКОГДА не пишет.
//
// Роль склада — sklad_user_roles_s (наш локальный довесок поверх users_d).
// Служебные аккаунты без сотрудника — sklad_service_users_s.
//
// req.user.id = users_s.id (legacy ID, нужен для FK на created_by/performed_by
// в 11 таблицах). users_s остаётся как «теневая» строка, которая создаётся
// автоматически при первом логине users_d-юзера.
// ─────────────────────────────────────────────────────────────────────────────

const SHADOW_PASSWORD_HASH = '__external__'; // никогда не используется для bcrypt

async function findOrCreateShadowUserS(client, dUser) {
  // 1) Найти существующую users_s, привязанную к этому users_d.id
  let r = await client.query('SELECT id FROM users_s WHERE users_d_id = $1', [dUser.id]);
  if (r.rows.length) return r.rows[0].id;

  // 2) Найти локального employees_s по external_employee_id
  const e = await client.query(
    'SELECT id FROM employees_s WHERE external_employee_id = $1',
    [dUser.employee_id]
  );
  const localEmployeeId = e.rows[0]?.id || null;

  // 3) Может уже есть users_s по employee_id (старая запись до миграции) — перепривязать
  if (localEmployeeId) {
    const u = await client.query(
      'SELECT id FROM users_s WHERE employee_id = $1 AND users_d_id IS NULL LIMIT 1',
      [localEmployeeId]
    );
    if (u.rows.length) {
      await client.query(
        'UPDATE users_s SET users_d_id = $1, username = $2, active = true WHERE id = $3',
        [dUser.id, dUser.login, u.rows[0].id]
      );
      return u.rows[0].id;
    }
  }

  // 4) Создать новую теневую запись
  const ins = await client.query(
    `INSERT INTO users_s (username, password_hash, role, role_id, employee_id, users_d_id, active)
     VALUES ($1, $2, 'employee', NULL, $3, $4, true)
     RETURNING id`,
    [dUser.login, SHADOW_PASSWORD_HASH, localEmployeeId, dUser.id]
  );
  return ins.rows[0].id;
}

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Введите логин и пароль' });
  }

  const client = await pool.connect();
  try {
    // ── 1. Поиск в общей users_d ──────────────────────────────────────────
    const dRes = await client.query(
      `SELECT u.id, u.login, u.password_hash, u.employee_id,
              e.full_name, e.status
       FROM users_d u
       LEFT JOIN employees_d e ON e.id = u.employee_id
       WHERE u.login = $1`,
      [username]
    );

    if (dRes.rows.length) {
      const dUser = dRes.rows[0];
      const ok = await comparePassword(password, dUser.password_hash);
      if (!ok) return res.status(401).json({ error: 'Неверный логин или пароль' });

      // Проверка статуса сотрудника
      if (!['active', 'internship', 'pending_employment'].includes(dUser.status)) {
        return res.status(403).json({ error: 'Сотрудник деактивирован на сайте сотрудников.' });
      }

      // Проверка наличия роли склада
      const roleRes = await client.query(
        `SELECT sur.role_id, r.name AS role_name, r.permissions
         FROM sklad_user_roles_s sur
         JOIN roles_s r ON r.id = sur.role_id
         WHERE sur.user_id = $1`,
        [dUser.id]
      );
      if (!roleRes.rows.length) {
        return res.status(403).json({ error: 'У вас нет доступа к складу. Обратитесь к администратору.' });
      }
      const role = roleRes.rows[0];

      // Найти/создать теневую users_s
      await client.query('BEGIN');
      let usId;
      try {
        usId = await findOrCreateShadowUserS(client, dUser);
        // Синхронизировать username и role_id (вдруг изменились на сайте сотрудников или admin поменял роль склада)
        await client.query(
          `UPDATE users_s SET username = $1, role_id = $2, role = $3, active = true WHERE id = $4`,
          [dUser.login, role.role_id, role.role_name === 'Администратор' ? 'admin' : 'employee', usId]
        );
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      }

      // Достать финальную карточку
      const finalRes = await client.query(
        `SELECT u.id, u.username, u.role, u.role_id, u.employee_id,
                e.full_name AS employee_name,
                COALESCE(e.gra_balance, 0) AS gra_balance,
                r.name AS role_name, r.permissions
         FROM users_s u
         LEFT JOIN employees_s e ON e.id = u.employee_id
         LEFT JOIN roles_s r ON r.id = u.role_id
         WHERE u.id = $1`,
        [usId]
      );
      const u = finalRes.rows[0];
      const token = signToken({ sub: u.id, source: 'd', role: u.role });
      return res.json({
        token,
        user: {
          id: u.id,
          username: u.username,
          role: u.role,
          role_id: u.role_id,
          role_name: u.role_name,
          permissions: u.permissions || [],
          employee_id: u.employee_id,
          employee_name: u.employee_name,
          gra_balance: Number(u.gra_balance || 0),
        },
      });
    }

    // ── 2. Fallback: служебные аккаунты ──────────────────────────────────
    const sRes = await client.query(
      `SELECT s.id, s.username, s.password_hash, s.role_id, s.active,
              r.name AS role_name, r.permissions
       FROM sklad_service_users_s s
       LEFT JOIN roles_s r ON r.id = s.role_id
       WHERE s.username = $1`,
      [username]
    );
    if (sRes.rows.length) {
      const sUser = sRes.rows[0];
      if (!sUser.active) return res.status(401).json({ error: 'Аккаунт деактивирован' });
      const ok = await comparePassword(password, sUser.password_hash);
      if (!ok) return res.status(401).json({ error: 'Неверный логин или пароль' });

      // Найти оригинальную users_s запись для служебного аккаунта (admin)
      const usRes = await client.query(
        'SELECT id FROM users_s WHERE username = $1 AND employee_id IS NULL LIMIT 1',
        [sUser.username]
      );
      if (!usRes.rows.length) {
        return res.status(500).json({ error: 'Служебный аккаунт сломан, обратитесь к разработчику' });
      }
      const usId = usRes.rows[0].id;

      // Синхронизировать role_id в shadow
      await client.query(
        'UPDATE users_s SET role_id = $1, role = $2, active = true WHERE id = $3',
        [sUser.role_id, sUser.role_name === 'Администратор' ? 'admin' : 'employee', usId]
      );

      const token = signToken({ sub: usId, source: 'service', role: 'admin' });
      return res.json({
        token,
        user: {
          id: usId,
          username: sUser.username,
          role: sUser.role_name === 'Администратор' ? 'admin' : 'employee',
          role_id: sUser.role_id,
          role_name: sUser.role_name,
          permissions: sUser.permissions || [],
          employee_id: null,
          employee_name: null,
          gra_balance: 0,
        },
      });
    }

    return res.status(401).json({ error: 'Неверный логин или пароль' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res) => {
  res.json(req.user);
});

// POST /api/auth/change-password
// Для users_d-юзеров — отказ (пароль управляется на сайте сотрудников).
router.post('/change-password', requireAuth, async (req, res) => {
  // Проверяем, есть ли у users_s линк на users_d → значит, это «общий» аккаунт
  const r = await pool.query('SELECT users_d_id FROM users_s WHERE id = $1', [req.user.id]);
  if (r.rows[0]?.users_d_id) {
    return res.status(400).json({
      error: 'Пароль для этого аккаунта управляется на сайте сотрудников. Смените пароль там.',
    });
  }
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Заполните все поля' });
  }
  try {
    // Это служебный аккаунт — обновляем sklad_service_users_s
    const us = await pool.query('SELECT username FROM users_s WHERE id = $1', [req.user.id]);
    const sv = await pool.query('SELECT password_hash FROM sklad_service_users_s WHERE username = $1', [us.rows[0]?.username]);
    if (!sv.rows.length) return res.status(404).json({ error: 'Не найдено' });
    const ok = await comparePassword(current_password, sv.rows[0].password_hash);
    if (!ok) return res.status(400).json({ error: 'Неверный текущий пароль' });
    const hash = await hashPassword(new_password);
    await pool.query(
      'UPDATE sklad_service_users_s SET password_hash = $1 WHERE username = $2',
      [hash, us.rows[0].username]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

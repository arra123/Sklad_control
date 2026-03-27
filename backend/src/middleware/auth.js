const { verifyToken } = require('../utils/jwt');
const pool = require('../db/pool');

// Short-lived user cache (TTL 30s) to avoid DB hit on every request
const userCache = new Map();
const USER_CACHE_TTL = 30_000;

function getCachedUser(userId) {
  const entry = userCache.get(userId);
  if (!entry) return null;
  if (Date.now() - entry.ts > USER_CACHE_TTL) {
    userCache.delete(userId);
    return null;
  }
  return entry.user;
}

function setCachedUser(userId, user) {
  userCache.set(userId, { user, ts: Date.now() });
  // Prevent unbounded growth
  if (userCache.size > 200) {
    const oldest = userCache.keys().next().value;
    userCache.delete(oldest);
  }
}

function invalidateUserCache(userId) {
  if (userId) userCache.delete(userId);
  else userCache.clear();
}

async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Не авторизован' });
  }
  const token = header.slice(7);
  try {
    const payload = verifyToken(token);

    let user = getCachedUser(payload.sub);
    if (!user) {
      const result = await pool.query(
        `SELECT u.id, u.username, u.role, u.role_id, u.employee_id, u.active,
                r.name as role_name, r.permissions as role_permissions
         FROM users_s u
         LEFT JOIN roles_s r ON r.id = u.role_id
         WHERE u.id = $1`,
        [payload.sub]
      );
      if (!result.rows.length || !result.rows[0].active) {
        return res.status(401).json({ error: 'Пользователь не найден или деактивирован' });
      }
      user = result.rows[0];
      user.permissions = user.role_permissions || [];
      setCachedUser(payload.sub, user);
    }

    req.user = { ...user };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Недействительный токен' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user) return res.status(403).json({ error: 'Нет прав доступа' });
  // Admin by old role OR by permissions
  const perms = req.user.permissions || [];
  if (req.user.role === 'admin' || perms.includes('staff.edit') || perms.includes('roles.manage')) {
    return next();
  }
  return res.status(403).json({ error: 'Нет прав доступа' });
}

function requireAdminOrManager(req, res, next) {
  if (!req.user) return res.status(403).json({ error: 'Нет прав доступа' });
  const perms = req.user.permissions || [];
  if (['admin', 'manager'].includes(req.user.role) || perms.includes('staff.edit') || perms.includes('tasks.create') || perms.includes('warehouse.edit')) {
    return next();
  }
  return res.status(403).json({ error: 'Нет прав доступа' });
}

module.exports = { requireAuth, requireAdmin, requireAdminOrManager, invalidateUserCache };

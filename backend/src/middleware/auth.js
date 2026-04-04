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
  // Prevent unbounded growth — evict oldest by timestamp (LRU)
  if (userCache.size > 200) {
    let oldestKey = null, oldestTs = Infinity;
    for (const [key, entry] of userCache) {
      if (entry.ts < oldestTs) { oldestTs = entry.ts; oldestKey = key; }
    }
    if (oldestKey !== null) userCache.delete(oldestKey);
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

    // Update last_active_at (throttled — once per 5 min per user)
    const lastActiveKey = `la_${payload.sub}`;
    if (!userCache.has(lastActiveKey) || Date.now() - (userCache.get(lastActiveKey)?.ts || 0) > 300_000) {
      userCache.set(lastActiveKey, { ts: Date.now() });
      pool.query('UPDATE users_s SET last_active_at = NOW() WHERE id = $1', [payload.sub]).catch(() => {});
    }

    next();
  } catch (err) {
    return res.status(401).json({ error: 'Недействительный токен' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user) return res.status(403).json({ error: 'Нет прав доступа' });
  if (req.user.role === 'admin') return next();
  return res.status(403).json({ error: 'Нет прав доступа' });
}

// Flexible permission check: admin always passes, otherwise checks if user has ANY of the listed permissions
function requirePermission(...requiredPerms) {
  return (req, res, next) => {
    if (!req.user) return res.status(403).json({ error: 'Нет прав доступа' });
    if (req.user.role === 'admin') return next();
    const userPerms = req.user.permissions || [];
    if (requiredPerms.some(p => userPerms.includes(p))) return next();
    return res.status(403).json({ error: 'Нет прав доступа' });
  };
}

function requireAdminOrManager(req, res, next) {
  if (!req.user) return res.status(403).json({ error: 'Нет прав доступа' });
  const perms = req.user.permissions || [];
  if (['admin', 'manager'].includes(req.user.role) || perms.includes('staff.edit') || perms.includes('tasks.create') || perms.includes('warehouse.edit')) {
    return next();
  }
  return res.status(403).json({ error: 'Нет прав доступа' });
}

module.exports = { requireAuth, requireAdmin, requireAdminOrManager, requirePermission, invalidateUserCache };

const router = require('express').Router();
const pool = require('../db/pool');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../../uploads/feedback');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer config
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e6);
    const ext = path.extname(file.originalname);
    cb(null, unique + ext);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max (covers both)
  },
  fileFilter: (_req, file, cb) => {
    if (file.fieldname === 'screenshot') {
      const allowed = /\.(jpg|jpeg|png|gif|webp|bmp)$/i;
      if (file.originalname && !allowed.test(path.extname(file.originalname))) {
        return cb(new Error('Допустимы только изображения'));
      }
    }
    if (file.fieldname === 'audio') {
      const allowed = /\.(mp3|wav|ogg|webm|m4a)$/i;
      if (file.originalname && !allowed.test(path.extname(file.originalname))) {
        return cb(new Error('Допустимы только аудио-файлы'));
      }
    }
    cb(null, true);
  },
});

const uploadFields = upload.fields([
  { name: 'screenshot', maxCount: 1 },
  { name: 'audio', maxCount: 1 },
]);

// POST / — create feedback (any authenticated user)
router.post('/', requireAuth, (req, res, next) => {
  uploadFields(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    next();
  });
}, async (req, res) => {
  try {
    const {
      category,
      subcategory,
      description,
      transcript,
      page_url,
      browser_info,
    } = req.body;

    const screenshotPath = req.files?.screenshot?.[0]
      ? 'feedback/' + req.files.screenshot[0].filename
      : null;
    const audioPath = req.files?.audio?.[0]
      ? 'feedback/' + req.files.audio[0].filename
      : null;

    const { rows } = await pool.query(`
      INSERT INTO feedback_s
        (user_id, username, user_role, category, subcategory, description,
         transcript, screenshot_path, audio_path, page_url, browser_info)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *
    `, [
      req.user.id,
      req.user.username,
      req.user.role,
      category || 'bug',
      subcategory || null,
      description ? String(description).slice(0, 5000) : null,
      transcript ? String(transcript).slice(0, 10000) : null,
      screenshotPath,
      audioPath,
      page_url ? String(page_url).slice(0, 1000) : null,
      browser_info ? String(browser_info).slice(0, 1000) : null,
    ]);

    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET / — list all feedback (admin only)
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { status, category, page = 1, limit = 50 } = req.query;
    const lim = Math.min(parseInt(limit) || 50, 200);
    const offset = (Math.max(parseInt(page) || 1, 1) - 1) * lim;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (status) {
      conditions.push(`status = $${idx++}`);
      params.push(status);
    }
    if (category) {
      conditions.push(`category = $${idx++}`);
      params.push(category);
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    params.push(lim, offset);
    const { rows } = await pool.query(`
      SELECT * FROM feedback_s
      ${where}
      ORDER BY created_at DESC
      LIMIT $${idx++} OFFSET $${idx++}
    `, params);

    const { rows: [{ cnt }] } = await pool.query(
      `SELECT COUNT(*) as cnt FROM feedback_s ${where}`,
      params.slice(0, params.length - 2)
    );

    res.json({ items: rows, total: parseInt(cnt) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /:id — single feedback detail (admin only)
router.get('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM feedback_s WHERE id = $1',
      [req.params.id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Обратная связь не найдена' });
    }
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /:id — update status + admin_notes (admin only)
router.patch('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { status, admin_notes } = req.body;

    const sets = [];
    const params = [];
    let idx = 1;

    if (status) {
      sets.push(`status = $${idx++}`);
      params.push(status);
      if (status === 'resolved') {
        sets.push(`resolved_by = $${idx++}`);
        params.push(req.user.id);
        sets.push(`resolved_at = NOW()`);
      }
    }
    if (admin_notes !== undefined) {
      sets.push(`admin_notes = $${idx++}`);
      params.push(admin_notes);
    }

    if (!sets.length) {
      return res.status(400).json({ error: 'Нечего обновлять' });
    }

    params.push(req.params.id);
    const { rows } = await pool.query(`
      UPDATE feedback_s SET ${sets.join(', ')}
      WHERE id = $${idx}
      RETURNING *
    `, params);

    if (!rows.length) {
      return res.status(404).json({ error: 'Обратная связь не найдена' });
    }
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /:id — delete feedback + remove files (admin only)
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT screenshot_path, audio_path FROM feedback_s WHERE id = $1',
      [req.params.id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Обратная связь не найдена' });
    }

    // Remove files from disk
    const baseDir = path.join(__dirname, '../../uploads');
    for (const filePath of [rows[0].screenshot_path, rows[0].audio_path]) {
      if (filePath) {
        const fullPath = path.join(baseDir, filePath);
        try { fs.unlinkSync(fullPath); } catch {}
      }
    }

    await pool.query('DELETE FROM feedback_s WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

const router = require('express').Router();
const pool = require('../db/pool');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { importTechCards } = require('../utils/techCardImport');

// GET /api/materials
router.get('/', requireAuth, async (req, res) => {
  try {
    const {
      search = '',
      category,
      archived = 'false',
      page = 1,
      limit = 50,
      sort_by = 'name',
      sort_dir = 'asc',
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conditions = [];
    const params = [];

    if (archived === 'false') {
      conditions.push('m.archived = false');
    }

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(m.name ILIKE $${params.length} OR m.code ILIKE $${params.length})`);
    }

    if (category) {
      params.push(category);
      conditions.push(`m.category = $${params.length}`);
    }

    const allowedSortBy = ['name', 'code', 'category', 'created_at'];
    const safeSortBy = allowedSortBy.includes(sort_by) ? sort_by : 'name';
    const safeSortDir = sort_dir === 'desc' ? 'DESC' : 'ASC';

    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM raw_materials_s m ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    const dataParams = [...params, parseInt(limit), offset];
    const rows = await pool.query(
      `SELECT m.id, m.name, m.code, m.article, m.unit, m.category, m.folder_path, m.stock, m.archived, m.created_at
       FROM raw_materials_s m
       ${where}
       ORDER BY m.${safeSortBy} ${safeSortDir}
       LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
      dataParams
    );

    res.json({ rows: rows.rows, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/materials/stats
router.get('/stats', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE category = 'ingredient') AS ingredients,
         COUNT(*) FILTER (WHERE category = 'packaging') AS packaging
       FROM raw_materials_s`
    );
    const stats = result.rows[0];
    res.json({
      total: parseInt(stats.total),
      ingredients: parseInt(stats.ingredients),
      packaging: parseInt(stats.packaging),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/materials/:id
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM raw_materials_s WHERE id = $1',
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Сырьё не найдено' });

    const material = result.rows[0];

    const techCardsResult = await pool.query(
      `SELECT tc.id, tc.name, tc.product_id, p.name as product_name, tcm.quantity
       FROM tech_card_materials_s tcm
       JOIN tech_cards_s tc ON tc.id = tcm.tech_card_id
       JOIN products_s p ON p.id = tc.product_id
       WHERE tcm.material_id = $1`,
      [material.id]
    );

    res.json({ ...material, tech_cards: techCardsResult.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/materials/import
router.post('/import', requireAuth, requireAdmin, async (req, res) => {
  try {
    const stats = await importTechCards();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/materials/:id
router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, code, unit, category, archived } = req.body;
    const fields = [];
    const params = [];

    if (name !== undefined) { params.push(name); fields.push(`name = $${params.length}`); }
    if (code !== undefined) { params.push(code); fields.push(`code = $${params.length}`); }
    if (unit !== undefined) { params.push(unit); fields.push(`unit = $${params.length}`); }
    if (category !== undefined) { params.push(category); fields.push(`category = $${params.length}`); }
    if (archived !== undefined) { params.push(archived); fields.push(`archived = $${params.length}`); }

    if (fields.length === 0) return res.status(400).json({ error: 'Нет полей для обновления' });

    params.push(req.params.id);
    const result = await pool.query(
      `UPDATE raw_materials_s SET ${fields.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );

    if (!result.rows.length) return res.status(404).json({ error: 'Сырьё не найдено' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

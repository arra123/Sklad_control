const router = require('express').Router();
const pool = require('../db/pool');
const { requireAuth, requireAdmin } = require('../middleware/auth');

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

// PUT /api/materials/:id
router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, code, unit, category, archived, buy_price, min_stock, supplier, notes, stock } = req.body;
    const fields = [];
    const params = [];

    if (name !== undefined) { params.push(name); fields.push(`name = $${params.length}`); }
    if (code !== undefined) { params.push(code); fields.push(`code = $${params.length}`); }
    if (unit !== undefined) { params.push(unit); fields.push(`unit = $${params.length}`); }
    if (category !== undefined) { params.push(category); fields.push(`category = $${params.length}`); }
    if (archived !== undefined) { params.push(archived); fields.push(`archived = $${params.length}`); }
    if (buy_price !== undefined) { params.push(buy_price); fields.push(`buy_price = $${params.length}`); }
    if (min_stock !== undefined) { params.push(min_stock); fields.push(`min_stock = $${params.length}`); }
    if (supplier !== undefined) { params.push(supplier); fields.push(`supplier = $${params.length}`); }
    if (notes !== undefined) { params.push(notes); fields.push(`notes = $${params.length}`); }
    if (stock !== undefined) { params.push(stock); fields.push(`stock = $${params.length}`); }

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

// DELETE /api/materials/:id
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM tech_card_materials_s WHERE material_id = $1', [req.params.id]);
    const result = await pool.query('DELETE FROM raw_materials_s WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Не найдено' });
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


module.exports = router;

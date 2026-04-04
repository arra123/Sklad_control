const router = require('express').Router();
const pool = require('../db/pool');
const { requireAuth, requirePermission } = require('../middleware/auth');

function parseNumeric(value, fallback = 0) {
  const parsed = Number.parseFloat(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatScopeLabel(row) {
  if (row.shelf_box_id) {
    const shelfCode = row.shelf_code || [row.rack_code || row.rack_name, row.shelf_name].filter(Boolean).join(' · ') || 'Полка';
    const boxPart = row.shelf_box_position != null ? `К${row.shelf_box_position}` : 'Коробка';
    return `${shelfCode}${row.shelf_box_position != null ? boxPart : ` · ${boxPart}`}`;
  }

  if (row.box_id) {
    const rowNo = row.row_number != null ? row.row_number : '?';
    const palletNo = row.pallet_number != null ? row.pallet_number : '?';
    const boxNo = row.task_box_sort_order != null ? row.task_box_sort_order : '?';
    return `Р${rowNo}П${palletNo}К${boxNo}`;
  }

  if (row.shelf_id) {
    return row.shelf_code || [row.rack_code || row.rack_name, row.shelf_name].filter(Boolean).join(' · ') || 'Полка';
  }

  return 'Задача';
}

async function getRewardRate(client = pool) {
  const result = await client.query(
    `SELECT key, value FROM settings_s WHERE key LIKE 'gra_rate_%' OR key = 'gra_inventory_scan_rate'`
  );
  const map = {};
  for (const r of result.rows) map[r.key] = r.value;
  // Return legacy single rate for backward compat
  return parseNumeric(map['gra_rate_inventory'] || map['gra_inventory_scan_rate'], 10);
}

async function getAllGraRates(client = pool) {
  const result = await client.query(
    `SELECT key, value FROM settings_s WHERE key LIKE 'gra_rate_%' OR key = 'gra_inventory_scan_rate'`
  );
  const map = {};
  for (const r of result.rows) map[r.key] = r.value;
  const fallback = parseNumeric(map['gra_inventory_scan_rate'], 10);
  return {
    inventory: parseNumeric(map['gra_rate_inventory'], fallback),
    packaging: parseNumeric(map['gra_rate_packaging'], fallback),
    assembly: parseNumeric(map['gra_rate_assembly'], fallback),
    production_transfer: parseNumeric(map['gra_rate_production_transfer'], fallback),
  };
}

// In-memory cache for heavy queries
const cache = new Map();
function cached(key, ttlMs, fn) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < ttlMs) return entry.data;
  return null;
}
function setCache(key, data) { cache.set(key, { data, ts: Date.now() }); }

router.get('/summary', requireAuth, requirePermission('analytics', 'staff.view'), async (req, res) => {
  const period = req.query.period || 'all';
  let pf = '';
  if (period === 'today') pf = `AND ee.created_at >= CURRENT_DATE`;
  else if (period === 'week') pf = `AND ee.created_at >= CURRENT_DATE - INTERVAL '7 days'`;
  else if (period === 'month') pf = `AND ee.created_at >= CURRENT_DATE - INTERVAL '30 days'`;
  else if (/^\d{4}-\d{2}-\d{2}$/.test(period)) pf = `AND ee.created_at >= '${period}'::date AND ee.created_at < '${period}'::date + INTERVAL '1 day'`;

  const cacheKey = `summary_${period}`;
  const hit = cached(cacheKey, 5000);
  if (hit) return res.json(hit);

  for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    const [rate, overviewResult, leadersResult, recentAdjustmentsResult] = await Promise.all([
      getRewardRate(pool),
      pool.query(`
        WITH employee_stats AS (
          SELECT
            e.id,
            e.full_name,
            COALESCE(e.gra_balance, 0) as current_balance,
            COUNT(ee.id) as events_count,
            COALESCE(SUM(CASE WHEN ee.event_type = 'inventory_scan' THEN ee.amount_delta ELSE 0 END), 0) as total_awarded,
            COALESCE(SUM(CASE WHEN ee.event_type = 'manual_adjustment' THEN ee.amount_delta ELSE 0 END), 0) as total_manual_adjustments,
            COALESCE(SUM(CASE WHEN ee.event_type = 'inventory_scan' THEN ee.reward_units ELSE 0 END), 0) as rewarded_scans,
            COALESCE(SUM(CASE WHEN ee.event_type IN ('external_order_pick','external_order_collect') AND ee.source = 'sborka-site' THEN ee.amount_delta ELSE 0 END), 0) as sborka_order_amount,
            COALESCE(SUM(CASE WHEN ee.event_type IN ('external_order_pick','external_order_collect') AND ee.source = 'sborka-site' THEN ee.reward_units ELSE 0 END), 0) as sborka_order_units
          FROM employees_s e
          LEFT JOIN employee_earnings_s ee ON ee.employee_id = e.id ${pf}
          GROUP BY e.id, e.full_name, e.gra_balance
        )
        SELECT
          COUNT(*) FILTER (WHERE events_count > 0 OR current_balance <> 0) as employees_with_activity,
          COUNT(*) FILTER (WHERE current_balance > 0) as employees_with_positive_balance,
          COALESCE(SUM(current_balance) FILTER (WHERE events_count > 0 OR current_balance <> 0), 0) as total_current_balance,
          COALESCE(SUM(total_awarded), 0) as total_awarded,
          COALESCE(SUM(total_manual_adjustments), 0) as total_manual_adjustments,
          COALESCE(SUM(rewarded_scans), 0) as rewarded_scans,
          COALESCE(SUM(sborka_order_amount), 0) as total_sborka_amount,
          COALESCE(SUM(sborka_order_units), 0) as total_sborka_units
        FROM employee_stats
      `),
      pool.query(`
        SELECT
          e.id as employee_id,
          e.full_name,
          COALESCE(e.gra_balance, 0) as current_balance,
          COALESCE(SUM(CASE WHEN ee.event_type = 'inventory_scan' THEN ee.amount_delta ELSE 0 END), 0) as total_awarded,
          COALESCE(SUM(CASE WHEN ee.event_type = 'inventory_scan' THEN ee.reward_units ELSE 0 END), 0) as rewarded_scans,
          COUNT(DISTINCT ee.task_id) FILTER (WHERE ee.event_type = 'inventory_scan' AND ee.task_id IS NOT NULL) as rewarded_tasks_count,
          COALESCE(SUM(CASE WHEN ee.event_type IN ('external_order_pick','external_order_collect') AND ee.source = 'sborka-site' THEN ee.amount_delta ELSE 0 END), 0) as sborka_amount,
          COALESCE(SUM(CASE WHEN ee.event_type IN ('external_order_pick','external_order_collect') AND ee.source = 'sborka-site' THEN ee.reward_units ELSE 0 END), 0) as sborka_units,
          MAX(ee.created_at) as last_earned_at
        FROM employees_s e
        JOIN employee_earnings_s ee ON ee.employee_id = e.id
        WHERE 1=1 ${pf}
        GROUP BY e.id, e.full_name, e.gra_balance
        HAVING COUNT(ee.id) > 0
        ORDER BY COALESCE(SUM(CASE WHEN ee.event_type = 'inventory_scan' THEN ee.amount_delta ELSE 0 END), 0) DESC, rewarded_scans DESC
        LIMIT 12
      `),
      pool.query(`
        SELECT
          ee.id,
          ee.employee_id,
          e.full_name as employee_name,
          ee.amount_delta,
          ee.balance_before,
          ee.balance_after,
          ee.notes,
          ee.created_at,
          u.username as changed_by_username
        FROM employee_earnings_s ee
        JOIN employees_s e ON e.id = ee.employee_id
        LEFT JOIN users_s u ON u.id = ee.created_by_user_id
        WHERE ee.event_type = 'manual_adjustment'
        ORDER BY ee.created_at DESC
        LIMIT 20
      `),
    ]);

    const allRates = await getAllGraRates(pool);
    const result = {
      settings: {
        gra_inventory_scan_rate: rate,
        rates: allRates,
      },
      overview: overviewResult.rows[0] || {},
      leaders: leadersResult.rows,
      recent_adjustments: recentAdjustmentsResult.rows,
    };
    setCache(cacheKey, result);
    res.json(result);
    return;
  } catch (err) {
    if (err.code === '40P01' && attempt < 3) { await new Promise(r => setTimeout(r, 50 * attempt)); continue; }
    return res.status(500).json({ error: err.message });
  }
  }
});

// GET /api/earnings/my — employee's own earnings (no admin required)
router.get('/my', requireAuth, async (req, res) => {
  const employeeId = req.user.employee_id;
  if (!employeeId) return res.status(400).json({ error: 'Нет привязки к сотруднику' });

  const period = req.query.period || 'today';
  let periodFilter = '';
  if (period === 'today') periodFilter = `AND ee.created_at >= CURRENT_DATE`;
  else if (period === 'week') periodFilter = `AND ee.created_at >= CURRENT_DATE - INTERVAL '7 days'`;
  else if (period === 'month') periodFilter = `AND ee.created_at >= CURRENT_DATE - INTERVAL '30 days'`;

  try {
    const [summaryResult, tasksResult] = await Promise.all([
      pool.query(`
        SELECT
          COALESCE(SUM(ee.amount_delta), 0) as total_earned,
          COALESCE(SUM(ee.reward_units), 0) as rewarded_scans,
          (SELECT COUNT(*) FROM inventory_task_scans_s sc
           JOIN inventory_tasks_s t ON t.id = sc.task_id AND t.employee_id = $1
           WHERE sc.product_id IS NOT NULL AND sc.created_at >= CURRENT_DATE) as total_scans,
          COUNT(DISTINCT ee.task_id) FILTER (WHERE ee.task_id IS NOT NULL) as tasks_count
        FROM employee_earnings_s ee
        WHERE ee.employee_id = $1
          AND ee.event_type IN ('inventory_scan','external_order_pick','external_order_collect')
          ${periodFilter}
      `, [employeeId]),
      pool.query(`
        SELECT
          ee.task_id,
          COALESCE(t.title, MAX(ee.task_title), 'Задача') as title,
          COALESCE(t.task_type, MAX(ee.task_type), 'inventory') as task_type,
          t.status,
          t.started_at,
          t.completed_at,
          COALESCE(SUM(ee.amount_delta), 0) as earned,
          COALESCE(SUM(ee.reward_units), 0) as rewarded_scans,
          (SELECT COUNT(*) FROM inventory_task_scans_s sc
           WHERE sc.task_id = ee.task_id AND sc.product_id IS NOT NULL) as total_scans,
          (SELECT ROUND(AVG(gap)::numeric, 1) FROM (
            SELECT EXTRACT(EPOCH FROM (sc.created_at - LAG(sc.created_at) OVER (ORDER BY sc.created_at))) as gap
            FROM inventory_task_scans_s sc WHERE sc.task_id = ee.task_id AND sc.product_id IS NOT NULL
          ) g WHERE gap > 0 AND gap < 300) as avg_scan_time
        FROM employee_earnings_s ee
        LEFT JOIN inventory_tasks_s t ON t.id = ee.task_id
        WHERE ee.employee_id = $1
          AND ee.event_type IN ('inventory_scan','external_order_pick','external_order_collect')
          ${periodFilter}
        GROUP BY ee.task_id, t.id, t.title, t.task_type, t.status, t.started_at, t.completed_at
        ORDER BY MAX(ee.created_at) DESC
      `, [employeeId]),
    ]);

    res.json({
      summary: summaryResult.rows[0] || { total_earned: 0, total_scans: 0, tasks_count: 0 },
      tasks: tasksResult.rows,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/employees', requireAuth, requirePermission('analytics', 'staff.view'), async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        e.id as employee_id,
        e.full_name,
        COALESCE(e.gra_balance, 0) as current_balance,
        agg.total_awarded,
        agg.total_manual_adjustments,
        agg.rewarded_scans,
        agg.rewarded_tasks_count,
        agg.sborka_amount,
        agg.sborka_units,
        agg.last_earned_at
      FROM employees_s e
      JOIN (
        SELECT
          employee_id,
          COALESCE(SUM(amount_delta) FILTER (WHERE event_type = 'inventory_scan'), 0) as total_awarded,
          COALESCE(SUM(amount_delta) FILTER (WHERE event_type = 'manual_adjustment'), 0) as total_manual_adjustments,
          COALESCE(SUM(reward_units) FILTER (WHERE event_type = 'inventory_scan'), 0) as rewarded_scans,
          COUNT(DISTINCT task_id) FILTER (WHERE event_type = 'inventory_scan' AND task_id IS NOT NULL) as rewarded_tasks_count,
          COALESCE(SUM(amount_delta) FILTER (WHERE event_type IN ('external_order_pick','external_order_collect') AND source = 'sborka-site'), 0) as sborka_amount,
          COALESCE(SUM(reward_units) FILTER (WHERE event_type IN ('external_order_pick','external_order_collect') AND source = 'sborka-site'), 0) as sborka_units,
          MAX(created_at) as last_earned_at
        FROM employee_earnings_s
        GROUP BY employee_id
      ) agg ON agg.employee_id = e.id
      ORDER BY COALESCE(e.gra_balance, 0) DESC, agg.last_earned_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/employees/:employeeId', requireAuth, requirePermission('analytics', 'staff.view'), async (req, res) => {
  for (let attempt = 1; attempt <= 3; attempt++) { try {
    const employeeId = Number(req.params.employeeId);
    if (!Number.isFinite(employeeId)) return res.status(400).json({ error: 'Некорректный employeeId' });

    // Period filter
    const period = req.query.period || 'all';
    let periodFilter = '';
    if (period === 'today') periodFilter = `AND ee.created_at >= CURRENT_DATE`;
    else if (period === 'week') periodFilter = `AND ee.created_at >= CURRENT_DATE - INTERVAL '7 days'`;
    else if (period === 'month') periodFilter = `AND ee.created_at >= CURRENT_DATE - INTERVAL '30 days'`;
    else if (/^\d{4}-\d{2}-\d{2}$/.test(period)) periodFilter = `AND ee.created_at >= '${period}'::date AND ee.created_at < '${period}'::date + INTERVAL '1 day'`;

    const [employeeResult, tasksResult, adjustmentsResult, sborkaResult] = await Promise.all([
      pool.query(`
        SELECT
          e.id as employee_id,
          e.full_name,
          COALESCE(e.gra_balance, 0) as current_balance,
          COALESCE(SUM(CASE WHEN ee.event_type = 'inventory_scan' THEN ee.amount_delta ELSE 0 END), 0) as total_awarded,
          COALESCE(SUM(CASE WHEN ee.event_type = 'manual_adjustment' THEN ee.amount_delta ELSE 0 END), 0) as total_manual_adjustments,
          COALESCE(SUM(CASE WHEN ee.event_type = 'inventory_scan' THEN ee.reward_units ELSE 0 END), 0) as rewarded_scans,
          COUNT(DISTINCT ee.task_id) FILTER (WHERE ee.event_type = 'inventory_scan' AND ee.task_id IS NOT NULL) as rewarded_tasks_count,
          COALESCE(SUM(CASE WHEN ee.event_type IN ('external_order_pick','external_order_collect') AND ee.source = 'sborka-site' THEN ee.amount_delta ELSE 0 END), 0) as sborka_amount,
          COALESCE(SUM(CASE WHEN ee.event_type IN ('external_order_pick','external_order_collect') AND ee.source = 'sborka-site' THEN ee.reward_units ELSE 0 END), 0) as sborka_units,
          MAX(ee.created_at) as last_earned_at
        FROM employees_s e
        LEFT JOIN employee_earnings_s ee ON ee.employee_id = e.id
        WHERE e.id = $1
        GROUP BY e.id, e.full_name, e.gra_balance
      `, [employeeId]),
      pool.query(`
        SELECT
          COALESCE(ee.task_id::text, 'deleted') as row_key,
          ee.task_id,
          COALESCE(t.title, MAX(ee.task_title), 'Удалённая задача') as title,
          t.status,
          COALESCE(t.task_type, MAX(ee.task_type), 'inventory') as task_type,
          s.code as shelf_code,
          s.name as shelf_name,
          r.name as rack_name,
          pa.name as pallet_name,
          pr.name as pallet_row_name,
          COALESCE(SUM(ee.amount_delta), 0) as amount_earned,
          COALESCE(SUM(ee.reward_units), 0) as rewarded_scans,
          COUNT(ee.id) as earning_events,
          COUNT(DISTINCT ee.task_box_id) FILTER (WHERE ee.task_box_id IS NOT NULL) as scopes_count,
          MAX(ee.created_at) as last_earned_at
        FROM employee_earnings_s ee
        LEFT JOIN inventory_tasks_s t ON t.id = ee.task_id
        LEFT JOIN shelves_s s ON s.id = t.shelf_id
        LEFT JOIN racks_s r ON r.id = s.rack_id
        LEFT JOIN pallets_s pa ON pa.id = t.target_pallet_id
        LEFT JOIN pallet_rows_s pr ON pr.id = pa.row_id
        WHERE ee.employee_id = $1
          AND ee.event_type = 'inventory_scan'
          ${periodFilter}
        GROUP BY
          ee.task_id, t.id, t.title, t.status, t.task_type,
          s.code, s.name, r.name, pa.name, pr.name
        ORDER BY last_earned_at DESC
      `, [employeeId]),
      pool.query(`
        SELECT
          ee.id,
          ee.amount_delta,
          ee.balance_before,
          ee.balance_after,
          ee.notes,
          ee.created_at,
          u.username as changed_by_username
        FROM employee_earnings_s ee
        LEFT JOIN users_s u ON u.id = ee.created_by_user_id
        WHERE ee.employee_id = $1
          AND ee.event_type = 'manual_adjustment'
        ORDER BY ee.created_at DESC
        LIMIT 50
      `, [employeeId]),
      pool.query(`
        SELECT
          ee.id,
          ee.event_type,
          ee.created_at,
          ee.amount_delta,
          ee.reward_units,
          ee.rate_per_unit,
          ee.source_marketplace,
          ee.source_store_name,
          ee.source_entity_name,
          ee.source_article,
          ee.source_product_name,
          ee.source_marketplace_code,
          ee.source_scanned_code,
          ee.source_task_id
        FROM employee_earnings_s ee
        WHERE ee.employee_id = $1
          AND ee.event_type IN ('external_order_pick', 'external_order_collect')
          AND ee.source = 'sborka-site'
        ORDER BY ee.created_at DESC
        LIMIT 200
      `, [employeeId]),
    ]);

    if (!employeeResult.rows.length) return res.status(404).json({ error: 'Сотрудник не найден' });

    res.json({
      employee: employeeResult.rows[0],
      tasks: tasksResult.rows,
      adjustments: adjustmentsResult.rows,
      sborka_picks: sborkaResult.rows,
    });
  } catch (err) {
    if (err.message.includes('deadlock') && attempt < 3) { await new Promise(r => setTimeout(r, 500 * attempt)); continue; }
    return res.status(500).json({ error: err.message });
  } }
});

router.get('/tasks/:taskId', requireAuth, requirePermission('analytics', 'staff.view'), async (req, res) => {
  try {
    const taskId = Number(req.params.taskId);
    if (!Number.isFinite(taskId)) return res.status(400).json({ error: 'Некорректный taskId' });

    const taskResult = await pool.query(`
      SELECT
        t.id as task_id,
        t.title,
        t.status,
        t.task_type,
        t.created_at,
        t.started_at,
        t.completed_at,
        e.id as employee_id,
        e.full_name as employee_name,
        COALESCE(e.gra_balance, 0) as current_balance,
        s.id as shelf_id,
        s.code as shelf_code,
        s.name as shelf_name,
        r.name as rack_name,
        r.code as rack_code,
        pa.id as pallet_id,
        pa.name as pallet_name,
        pa.number as pallet_number,
        pr.name as pallet_row_name,
        pr.number as pallet_row_number,
        COALESCE(SUM(ee.amount_delta), 0) as total_earned,
        COALESCE(SUM(ee.reward_units), 0) as rewarded_scans,
        COUNT(ee.id) as earning_events
      FROM inventory_tasks_s t
      LEFT JOIN employees_s e ON e.id = t.employee_id
      LEFT JOIN shelves_s s ON s.id = t.shelf_id
      LEFT JOIN racks_s r ON r.id = s.rack_id
      LEFT JOIN pallets_s pa ON pa.id = t.target_pallet_id
      LEFT JOIN pallet_rows_s pr ON pr.id = pa.row_id
      LEFT JOIN employee_earnings_s ee ON ee.task_id = t.id AND ee.event_type = 'inventory_scan'
      WHERE t.id = $1
      GROUP BY
        t.id, e.id, e.full_name, e.gra_balance,
        s.id, s.code, s.name, r.name, r.code,
        pa.id, pa.name, pa.number, pr.name, pr.number
    `, [taskId]);

    if (!taskResult.rows.length) return res.status(404).json({ error: 'Задача не найдена' });

    const task = taskResult.rows[0];
    const scansResult = await pool.query(`
      SELECT
        ee.id as earning_id,
        ee.amount_delta,
        ee.reward_units,
        ee.rate_per_unit,
        ee.balance_after,
        ee.created_at as earned_at,
        ee.task_box_id,
        ee.box_id,
        ee.shelf_box_id,
        ee.shelf_id,
        sc.id as task_scan_id,
        sc.scanned_value,
        sc.created_at as scanned_at,
        sc.quantity_delta,
        p.id as product_id,
        p.name as product_name,
        p.code as product_code,
        tb.sort_order as task_box_sort_order,
        sbx.position as shelf_box_position,
        sbx.barcode_value as shelf_box_barcode,
        bx.barcode_value as pallet_box_barcode,
        s.code as shelf_code,
        s.name as shelf_name,
        r.code as rack_code,
        r.name as rack_name,
        pa.number as pallet_number,
        pr.number as row_number
      FROM employee_earnings_s ee
      LEFT JOIN inventory_task_scans_s sc ON sc.id = ee.task_scan_id
      LEFT JOIN products_s p ON p.id = ee.product_id
      LEFT JOIN inventory_task_boxes_s tb ON tb.id = ee.task_box_id
      LEFT JOIN shelf_boxes_s sbx ON sbx.id = ee.shelf_box_id
      LEFT JOIN boxes_s bx ON bx.id = ee.box_id
      LEFT JOIN shelves_s s ON s.id = COALESCE(ee.shelf_id, sbx.shelf_id)
      LEFT JOIN racks_s r ON r.id = s.rack_id
      LEFT JOIN pallets_s pa ON pa.id = bx.pallet_id
      LEFT JOIN pallet_rows_s pr ON pr.id = pa.row_id
      WHERE ee.task_id = $1
        AND ee.event_type = 'inventory_scan'
      ORDER BY ee.created_at ASC, ee.id ASC
    `, [taskId]);

    const scopeMap = new Map();
    const scans = scansResult.rows.map((row) => {
      const scopeLabel = formatScopeLabel(row);
      const scopeKey = row.shelf_box_id
        ? `shelf_box:${row.shelf_box_id}`
        : row.box_id
        ? `pallet_box:${row.box_id}`
        : row.shelf_id
        ? `shelf:${row.shelf_id}`
        : `task:${taskId}`;

      if (!scopeMap.has(scopeKey)) {
        scopeMap.set(scopeKey, {
          scope_key: scopeKey,
          scope_type: row.shelf_box_id ? 'shelf_box' : row.box_id ? 'pallet_box' : row.shelf_id ? 'shelf' : 'task',
          scope_label: scopeLabel,
          box_barcode: row.shelf_box_barcode || row.pallet_box_barcode || null,
          amount_earned: 0,
          rewarded_scans: 0,
          scans: [],
        });
      }

      const group = scopeMap.get(scopeKey);
      group.amount_earned = Number(group.amount_earned || 0) + Number(row.amount_delta || 0);
      group.rewarded_scans = Number(group.rewarded_scans || 0) + Number(row.reward_units || 0);
      group.scans.push({
        earning_id: row.earning_id,
        task_scan_id: row.task_scan_id,
        scanned_value: row.scanned_value,
        scanned_at: row.scanned_at,
        product_id: row.product_id,
        product_name: row.product_name,
        product_code: row.product_code,
        quantity_delta: row.quantity_delta,
        reward_units: row.reward_units,
        rate_per_unit: row.rate_per_unit,
        amount_delta: row.amount_delta,
        balance_after: row.balance_after,
        scope_label: scopeLabel,
      });
      return {
        earning_id: row.earning_id,
        task_scan_id: row.task_scan_id,
        scanned_value: row.scanned_value,
        scanned_at: row.scanned_at,
        product_id: row.product_id,
        product_name: row.product_name,
        product_code: row.product_code,
        quantity_delta: row.quantity_delta,
        reward_units: row.reward_units,
        rate_per_unit: row.rate_per_unit,
        amount_delta: row.amount_delta,
        balance_after: row.balance_after,
        scope_label: scopeLabel,
      };
    });

    res.json({
      task,
      scopes: Array.from(scopeMap.values()),
      scans,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/employees/:employeeId/set-balance', requireAuth, requirePermission('staff.edit'), async (req, res) => {
  const employeeId = Number(req.params.employeeId);
  const newBalance = parseNumeric(req.body?.new_balance, NaN);
  const notes = String(req.body?.notes || '').trim();

  if (!Number.isFinite(employeeId)) return res.status(400).json({ error: 'Некорректный employeeId' });
  if (!Number.isFinite(newBalance)) return res.status(400).json({ error: 'new_balance обязателен' });
  if (!notes) return res.status(400).json({ error: 'Укажите причину изменения баланса' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '5s'");
    const employeeResult = await client.query(
      'SELECT id, full_name, COALESCE(gra_balance, 0) as gra_balance FROM employees_s WHERE id = $1 FOR UPDATE NOWAIT',
      [employeeId]
    );
    if (!employeeResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Сотрудник не найден' });
    }

    const employee = employeeResult.rows[0];
    const balanceBefore = Number(employee.gra_balance || 0);
    const balanceAfter = newBalance;
    const amountDelta = balanceAfter - balanceBefore;

    if (Math.abs(amountDelta) < 0.000001) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Баланс не изменился' });
    }

    const eventResult = await client.query(
      `INSERT INTO employee_earnings_s (
         employee_id, event_type, reward_units, rate_per_unit, amount_delta,
         balance_before, balance_after, notes, created_by_user_id
       )
       VALUES ($1, 'manual_adjustment', 0, 0, $2, $3, $4, $5, $6)
       RETURNING *`,
      [employeeId, amountDelta, balanceBefore, balanceAfter, notes, req.user.id]
    );

    await client.query(
      'UPDATE employees_s SET gra_balance = $1, updated_at = NOW() WHERE id = $2',
      [balanceAfter, employeeId]
    );

    await client.query('COMMIT');
    res.json({
      employee: {
        employee_id: employee.id,
        full_name: employee.full_name,
        current_balance: balanceAfter,
      },
      event: eventResult.rows[0],
    });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// POST /api/earnings/backfill-assembly — one-time backfill GRA for assembly scans
router.post('/backfill-assembly', requireAuth, requirePermission('settings'), async (_req, res) => {
  try {
    const rate = await pool.query(`SELECT value FROM settings_s WHERE key = 'gra_rate_assembly' LIMIT 1`);
    const graRate = rate.rows.length ? parseFloat(rate.rows[0].value) || 10 : 10;

    const unrewarded = await pool.query(`
      SELECT sc.id as scan_id, sc.task_id, sc.product_id, t.employee_id
      FROM inventory_task_scans_s sc
      JOIN inventory_tasks_s t ON t.id = sc.task_id AND t.task_type = 'bundle_assembly'
      WHERE NOT EXISTS (SELECT 1 FROM employee_earnings_s ee WHERE ee.task_scan_id = sc.id)
        AND t.employee_id IS NOT NULL
    `);

    let backfilled = 0;
    for (const scan of unrewarded.rows) {
      const bal = await pool.query('SELECT COALESCE(gra_balance, 0) as bal FROM employees_s WHERE id=$1', [scan.employee_id]);
      const balBefore = parseFloat(bal.rows[0]?.bal || 0);
      const balAfter = balBefore + graRate;
      // Check if already rewarded
      const exists = await pool.query('SELECT 1 FROM employee_earnings_s WHERE task_scan_id=$1', [scan.scan_id]);
      if (exists.rows.length) continue;
      await pool.query(
        `INSERT INTO employee_earnings_s (employee_id, task_id, task_scan_id, product_id, event_type, reward_units, rate_per_unit, amount_delta, balance_before, balance_after, task_type)
         VALUES ($1, $2, $3, $4, 'inventory_scan', 1, $5, $5, $6, $7, 'bundle_assembly')`,
        [scan.employee_id, scan.task_id, scan.scan_id, scan.product_id, graRate, balBefore, balAfter]);
      await pool.query('UPDATE employees_s SET gra_balance = $1 WHERE id = $2', [balAfter, scan.employee_id]);
      backfilled++;
    }

    res.json({ success: true, backfilled, rate: graRate });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

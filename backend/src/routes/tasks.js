const router = require('express').Router();
const pool = require('../db/pool');
const { requireAuth, requireAdmin, requireAdminOrManager } = require('../middleware/auth');

async function ensureInventoryPalletReady(client, palletId) {
  const palletResult = await client.query(
    `SELECT pa.id, pa.uses_boxes,
            (SELECT COUNT(*) FROM boxes_s b WHERE b.pallet_id = pa.id AND b.status IN ('open', 'closed')) as boxes_count
     FROM pallets_s pa
     WHERE pa.id = $1`,
    [palletId]
  );

  if (!palletResult.rows.length) {
    throw new Error('Паллет не найден');
  }

  const pallet = palletResult.rows[0];
  const boxesCount = parseInt(pallet.boxes_count || 0, 10);

  if (pallet.uses_boxes && boxesCount > 0) {
    throw new Error('Инвентаризация по товарам недоступна для паллета с коробками. Освободите паллет или используйте паллет без коробок.');
  }

  if (pallet.uses_boxes && boxesCount === 0) {
    await client.query('UPDATE pallets_s SET uses_boxes = false WHERE id = $1', [palletId]);
  }

  return pallet;
}

function parseNumeric(value, fallback = 0) {
  const parsed = Number.parseFloat(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function getInventoryScanRewardRate(client) {
  const result = await client.query(
    `SELECT value
     FROM settings_s
     WHERE key = 'gra_inventory_scan_rate'
     LIMIT 1`
  );
  return parseNumeric(result.rows[0]?.value, 10);
}

async function awardInventoryScanReward(client, { task, taskScanId, activeTaskBox, productId, quantityDelta, user }) {
  if (task.task_type !== 'inventory') return null;
  if (!task.employee_id) return null;
  if (user.role !== 'employee') return null;
  if (Number(user.employee_id) !== Number(task.employee_id)) return null;

  const rewardUnits = parseNumeric(quantityDelta, 1);
  if (!(rewardUnits > 0)) return null;

  const [rate, employeeResult] = await Promise.all([
    getInventoryScanRewardRate(client),
    client.query(
      `SELECT id, COALESCE(gra_balance, 0) as gra_balance
       FROM employees_s
       WHERE id = $1
       FOR UPDATE`,
      [task.employee_id]
    ),
  ]);

  if (!employeeResult.rows.length || !(rate > 0)) return null;

  const duplicateResult = await client.query(
    `SELECT id
     FROM employee_earnings_s
     WHERE task_scan_id = $1
     LIMIT 1`,
    [taskScanId]
  );
  if (duplicateResult.rows.length) return null;

  const balanceBefore = Number(employeeResult.rows[0].gra_balance || 0);
  const amountDelta = Number((rate * rewardUnits).toFixed(3));
  const balanceAfter = Number((balanceBefore + amountDelta).toFixed(3));

  const rewardResult = await client.query(
    `INSERT INTO employee_earnings_s (
       employee_id, task_id, task_scan_id, task_box_id, shelf_id,
       box_id, shelf_box_id, product_id, event_type, reward_units,
       rate_per_unit, amount_delta, balance_before, balance_after, created_by_user_id
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'inventory_scan', $9, $10, $11, $12, $13, $14)
     RETURNING id, amount_delta, rate_per_unit, reward_units, balance_after`,
    [
      task.employee_id,
      task.id,
      taskScanId,
      activeTaskBox?.id || null,
      task.shelf_id || null,
      activeTaskBox?.box_id || null,
      activeTaskBox?.shelf_box_id || null,
      productId,
      rewardUnits,
      rate,
      amountDelta,
      balanceBefore,
      balanceAfter,
      user.id,
    ]
  );

  await client.query(
    `UPDATE employees_s
     SET gra_balance = $1,
         updated_at = NOW()
     WHERE id = $2`,
    [balanceAfter, task.employee_id]
  );

  return rewardResult.rows[0];
}

function rowsToQtyMap(rows) {
  const map = new Map();
  for (const row of rows) {
    map.set(Number(row.product_id), Number(row.quantity || row.total_qty || 0));
  }
  return map;
}

async function syncPalletBoxSummary(client, boxId, palletId = null) {
  const itemsResult = await client.query(
    `SELECT product_id, quantity
     FROM box_items_s
     WHERE box_id = $1 AND quantity > 0
     ORDER BY product_id`,
    [boxId]
  );
  const items = itemsResult.rows.map(row => ({
    product_id: Number(row.product_id),
    quantity: Number(row.quantity),
  }));
  const totalQty = items.reduce((sum, row) => sum + row.quantity, 0);
  const summaryProductId = items.length === 1 ? items[0].product_id : null;
  await client.query(
    `UPDATE boxes_s
     SET product_id = $1,
         quantity = $2,
         pallet_id = COALESCE($3, pallet_id),
         status = 'closed',
         confirmed = $4,
         closed_at = CASE WHEN $2 > 0 THEN NOW() ELSE NULL END
     WHERE id = $5`,
    [summaryProductId, totalQty, palletId, totalQty > 0, boxId]
  );
  return { items, totalQty, summaryProductId };
}

async function syncShelfBoxSummary(client, shelfBoxId, shelfId = null) {
  const itemsResult = await client.query(
    `SELECT product_id, quantity
     FROM shelf_box_items_s
     WHERE shelf_box_id = $1 AND quantity > 0
     ORDER BY product_id`,
    [shelfBoxId]
  );
  const items = itemsResult.rows.map(row => ({
    product_id: Number(row.product_id),
    quantity: Number(row.quantity),
  }));
  const totalQty = items.reduce((sum, row) => sum + row.quantity, 0);
  const summaryProductId = items.length === 1 ? items[0].product_id : null;
  await client.query(
    `UPDATE shelf_boxes_s
     SET product_id = $1,
         quantity = $2,
         shelf_id = COALESCE($3, shelf_id),
         status = 'closed',
         confirmed = $4,
         closed_at = CASE WHEN $2 > 0 THEN NOW() ELSE NULL END
     WHERE id = $5`,
    [summaryProductId, totalQty, shelfId, totalQty > 0, shelfBoxId]
  );
  return { items, totalQty, summaryProductId };
}

async function logPalletBoxMovementDiff(client, boxId, userId, previousItems, nextItems, note) {
  const prevMap = rowsToQtyMap(previousItems);
  const nextMap = rowsToQtyMap(nextItems);
  const productIds = new Set([...prevMap.keys(), ...nextMap.keys()]);

  for (const productId of productIds) {
    const prevQty = Number(prevMap.get(productId) || 0);
    const nextQty = Number(nextMap.get(productId) || 0);
    if (prevQty === nextQty) continue;

    await client.query(
      `INSERT INTO movements_s (movement_type, product_id, quantity, from_box_id, to_box_id, performed_by, source, notes, quantity_before, quantity_after)
       VALUES ($1, $2, $3, $4, $5, $6, 'task', $7, $8, $9)`,
      [
        nextQty > prevQty ? 'edit_add_to_box' : 'edit_remove_from_box',
        productId,
        Math.abs(nextQty - prevQty),
        nextQty < prevQty ? boxId : null,
        nextQty > prevQty ? boxId : null,
        userId,
        note,
        prevQty,
        nextQty,
      ]
    );
  }
}

async function logShelfBoxMovementDiff(client, shelfId, boxBarcode, taskId, userId, previousItems, nextItems) {
  const prevMap = rowsToQtyMap(previousItems);
  const nextMap = rowsToQtyMap(nextItems);
  const productIds = new Set([...prevMap.keys(), ...nextMap.keys()]);

  for (const productId of productIds) {
    const prevQty = Number(prevMap.get(productId) || 0);
    const nextQty = Number(nextMap.get(productId) || 0);
    if (prevQty === nextQty) continue;

    await client.query(
      `INSERT INTO shelf_movements_s (shelf_id, product_id, operation_type, quantity_before, quantity_after, quantity_delta, user_id, task_id, notes)
       VALUES ($1, $2, 'inventory', $3, $4, $5, $6, $7, $8)`,
      [shelfId, productId, prevQty, nextQty, nextQty - prevQty, userId, taskId, `Инвентаризация коробки ${boxBarcode}`]
    );

    await client.query(
      `INSERT INTO movements_s (movement_type, product_id, quantity, to_shelf_id, performed_by, source, notes, quantity_before, quantity_after)
       VALUES ($1, $2, $3, $4, $5, 'task', $6, $7, $8)`,
      [
        nextQty > prevQty ? 'edit_add_to_shelf' : 'edit_remove_from_shelf',
        productId,
        Math.abs(nextQty - prevQty),
        shelfId,
        userId,
        `Инвентаризация коробки на полке ${boxBarcode}`,
        prevQty,
        nextQty,
      ]
    );
  }
}

async function getTaskBoxRows(client, taskId) {
  const result = await client.query(
    `SELECT tb.*,
            COALESCE(sbx.id, bx.id) as storage_box_id,
            CASE WHEN sbx.id IS NOT NULL THEN 'shelf' ELSE 'pallet' END as box_location_type,
            COALESCE(sbx.barcode_value, bx.barcode_value) as box_barcode,
            COALESCE(sbx.name, CASE
              WHEN pr.number IS NOT NULL AND pa.number IS NOT NULL THEN CONCAT('Р', pr.number, 'П', pa.number, 'К', ROW_NUMBER() OVER (PARTITION BY bx.pallet_id ORDER BY bx.created_at, bx.id))
              ELSE NULL
            END) as box_name,
            COALESCE(sbx.quantity, bx.quantity) as box_quantity,
            COALESCE(sbx.product_id, bx.product_id) as summary_product_id,
            COALESCE(sbp.name, bp.name) as summary_product_name,
            COALESCE(sbp.code, bp.code) as summary_product_code,
            s.id as shelf_id,
            s.name as shelf_name,
            s.code as shelf_code,
            r.name as rack_name,
            pa.id as pallet_id,
            pa.name as pallet_name,
            pa.number as pallet_number,
            pr.name as row_name,
            pr.number as row_number
     FROM inventory_task_boxes_s tb
     LEFT JOIN shelf_boxes_s sbx ON sbx.id = tb.shelf_box_id
     LEFT JOIN products_s sbp ON sbp.id = sbx.product_id
     LEFT JOIN shelves_s s ON s.id = sbx.shelf_id
     LEFT JOIN racks_s r ON r.id = s.rack_id
     LEFT JOIN boxes_s bx ON bx.id = tb.box_id
     LEFT JOIN products_s bp ON bp.id = bx.product_id
     LEFT JOIN pallets_s pa ON pa.id = bx.pallet_id
     LEFT JOIN pallet_rows_s pr ON pr.id = pa.row_id
     WHERE tb.task_id = $1
     ORDER BY tb.sort_order, tb.id`,
    [taskId]
  );
  return result.rows;
}

async function getActiveTaskBox(client, taskId) {
  const rows = await getTaskBoxRows(client, taskId);
  return rows.find(row => row.status === 'in_progress') || null;
}

async function applyInventoryToPallet(client, palletId, taskId, userId) {
  await ensureInventoryPalletReady(client, palletId);

  const scanTotals = await client.query(
    `SELECT product_id, SUM(quantity_delta) as total_qty
     FROM inventory_task_scans_s
     WHERE task_id = $1 AND product_id IS NOT NULL
     GROUP BY product_id`,
    [taskId]
  );

  for (const row of scanTotals.rows) {
    const current = await client.query(
      'SELECT quantity FROM pallet_items_s WHERE pallet_id = $1 AND product_id = $2',
      [palletId, row.product_id]
    );
    const prevQty = current.rows.length ? parseFloat(current.rows[0].quantity) : 0;
    const newQty = parseFloat(row.total_qty);

    await client.query(
      `INSERT INTO pallet_items_s (pallet_id, product_id, quantity)
       VALUES ($1, $2, $3)
       ON CONFLICT (pallet_id, product_id) DO UPDATE SET quantity = $3`,
      [palletId, row.product_id, newQty]
    );

    if (newQty !== prevQty) {
      await client.query(
        `INSERT INTO movements_s (movement_type, product_id, quantity, to_pallet_id, performed_by, source, notes, quantity_before, quantity_after)
         VALUES ($1, $2, $3, $4, $5, 'task', $6, $7, $8)`,
        [
          newQty > prevQty ? 'edit_add_to_pallet' : 'edit_remove_from_pallet',
          row.product_id,
          Math.abs(newQty - prevQty),
          palletId,
          userId,
          'Инвентаризация паллета',
          prevQty,
          newQty,
        ]
      );
    }
  }
}

async function applyInventoryToBox(client, boxId, palletId, taskId, userId, taskBoxId = null) {
  const boxResult = await client.query(
    'SELECT id, product_id, quantity, pallet_id FROM boxes_s WHERE id = $1 FOR UPDATE',
    [boxId]
  );
  if (!boxResult.rows.length) {
    throw new Error('Коробка не найдена');
  }

  const box = boxResult.rows[0];
  const previousItemsResult = await client.query(
    `SELECT product_id, quantity
     FROM box_items_s
     WHERE box_id = $1 AND quantity > 0`,
    [boxId]
  );
  const scanTotals = await client.query(
    `SELECT product_id, SUM(quantity_delta) as total_qty
     FROM inventory_task_scans_s
     WHERE task_id = $1 AND product_id IS NOT NULL
       ${taskBoxId ? 'AND task_box_id = $2' : ''}
     GROUP BY product_id`,
    taskBoxId ? [taskId, taskBoxId] : [taskId]
  );
  const effectivePalletId = palletId || box.pallet_id || null;

  await client.query('DELETE FROM box_items_s WHERE box_id = $1', [boxId]);
  for (const row of scanTotals.rows) {
    const qty = Number(row.total_qty || 0);
    if (qty <= 0) continue;
    await client.query(
      `INSERT INTO box_items_s (box_id, product_id, quantity, updated_at)
       VALUES ($1, $2, $3, NOW())`,
      [boxId, row.product_id, qty]
    );
  }

  await client.query(
    `UPDATE boxes_s SET pallet_id = COALESCE($1, pallet_id) WHERE id = $2`,
    [effectivePalletId, boxId]
  );
  const nextState = await syncPalletBoxSummary(client, boxId, effectivePalletId);
  await logPalletBoxMovementDiff(client, boxId, userId, previousItemsResult.rows, nextState.items, 'Инвентаризация коробки');
}

async function applyInventoryToShelfBox(client, shelfBoxId, shelfId, taskId, userId, taskBoxId = null) {
  const boxResult = await client.query(
    'SELECT id, product_id, quantity, shelf_id, barcode_value FROM shelf_boxes_s WHERE id = $1 FOR UPDATE',
    [shelfBoxId]
  );
  if (!boxResult.rows.length) {
    throw new Error('Коробка на полке не найдена');
  }

  const box = boxResult.rows[0];
  const previousItemsResult = await client.query(
    `SELECT product_id, quantity
     FROM shelf_box_items_s
     WHERE shelf_box_id = $1 AND quantity > 0`,
    [shelfBoxId]
  );
  const scanTotals = await client.query(
    `SELECT product_id, SUM(quantity_delta) as total_qty
     FROM inventory_task_scans_s
     WHERE task_id = $1 AND product_id IS NOT NULL
       ${taskBoxId ? 'AND task_box_id = $2' : ''}
     GROUP BY product_id`,
    taskBoxId ? [taskId, taskBoxId] : [taskId]
  );
  const effectiveShelfId = shelfId || box.shelf_id || null;

  await client.query('DELETE FROM shelf_box_items_s WHERE shelf_box_id = $1', [shelfBoxId]);
  for (const row of scanTotals.rows) {
    const qty = Number(row.total_qty || 0);
    if (qty <= 0) continue;
    await client.query(
      `INSERT INTO shelf_box_items_s (shelf_box_id, product_id, quantity, updated_at)
       VALUES ($1, $2, $3, NOW())`,
      [shelfBoxId, row.product_id, qty]
    );
  }

  await client.query(
    `UPDATE shelf_boxes_s SET shelf_id = COALESCE($1, shelf_id) WHERE id = $2`,
    [effectiveShelfId, shelfBoxId]
  );
  const nextState = await syncShelfBoxSummary(client, shelfBoxId, effectiveShelfId);
  await logShelfBoxMovementDiff(client, effectiveShelfId, box.barcode_value, taskId, userId, previousItemsResult.rows, nextState.items);
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function createLeafKey(type, id) {
  return `${type}:${Number(id)}`;
}

function normalizeInventoryEventRow(row) {
  const products = Array.isArray(row.products) ? row.products : [];
  return {
    leaf_type: row.leaf_type,
    leaf_id: Number(row.leaf_id),
    task_id: Number(row.task_id),
    task_title: row.task_title,
    started_at: row.started_at,
    completed_at: row.completed_at,
    duration_seconds: row.duration_seconds == null ? null : Number(row.duration_seconds),
    employee_name: row.employee_name || null,
    counted_qty: Number(row.counted_qty || 0),
    products: products.map(item => ({
      product_id: item.product_id == null ? null : Number(item.product_id),
      product_name: item.product_name || null,
      product_code: item.product_code || null,
      quantity: Number(item.quantity || 0),
    })),
  };
}

function groupInventoryEvents(rows) {
  const byLeaf = new Map();
  for (const row of rows) {
    const event = normalizeInventoryEventRow(row);
    const key = createLeafKey(event.leaf_type, event.leaf_id);
    const list = byLeaf.get(key) || [];
    list.push(event);
    byLeaf.set(key, list);
  }
  for (const list of byLeaf.values()) {
    list.sort((a, b) => new Date(b.completed_at || 0).getTime() - new Date(a.completed_at || 0).getTime());
  }
  return byLeaf;
}

function buildInventoryLeafStats(type, id, currentQty, eventsByLeaf) {
  const history = eventsByLeaf.get(createLeafKey(type, id)) || [];
  const latest = history[0] || null;
  const previous = history[1] || null;
  const safeCurrentQty = Number(currentQty || 0);
  const safeLatestQty = latest ? Number(latest.counted_qty || 0) : null;
  const safePreviousQty = previous ? Number(previous.counted_qty || 0) : null;
  return {
    current_qty: safeCurrentQty,
    last_inventory_qty: safeLatestQty,
    previous_inventory_qty: safePreviousQty,
    last_inventory_at: latest?.completed_at || null,
    previous_inventory_at: previous?.completed_at || null,
    last_inventory_by: latest?.employee_name || null,
    last_inventory_duration_seconds: latest?.duration_seconds ?? null,
    delta_vs_current: safeLatestQty == null ? null : safeCurrentQty - safeLatestQty,
    delta_vs_previous: safeLatestQty == null || safePreviousQty == null ? null : safeLatestQty - safePreviousQty,
    history_count: history.length,
    total_leaf_count: 1,
    covered_leaf_count: latest ? 1 : 0,
    coverage_complete: Boolean(latest),
  };
}

function aggregateInventoryStats(children) {
  const list = Array.isArray(children) ? children : [];
  const latestChild = list
    .filter(child => child?.last_inventory_at)
    .sort((a, b) => new Date(b.last_inventory_at).getTime() - new Date(a.last_inventory_at).getTime())[0] || null;

  const totalLeafCount = list.reduce((sum, child) => sum + Number(child?.total_leaf_count || 0), 0);
  const coveredLeafCount = list.reduce((sum, child) => sum + Number(child?.covered_leaf_count || 0), 0);
  const coverageComplete = totalLeafCount > 0 && totalLeafCount === coveredLeafCount;
  const previousCoverageComplete = coverageComplete && list.every(child => child?.previous_inventory_qty != null);
  const currentQty = list.reduce((sum, child) => sum + Number(child?.current_qty || 0), 0);
  const lastInventoryQty = coverageComplete
    ? list.reduce((sum, child) => sum + Number(child?.last_inventory_qty || 0), 0)
    : null;
  const previousInventoryQty = previousCoverageComplete
    ? list.reduce((sum, child) => sum + Number(child?.previous_inventory_qty || 0), 0)
    : null;

  return {
    current_qty: currentQty,
    last_inventory_qty: lastInventoryQty,
    previous_inventory_qty: previousInventoryQty,
    last_inventory_at: latestChild?.last_inventory_at || null,
    previous_inventory_at: previousCoverageComplete
      ? list
          .map(child => child?.previous_inventory_at)
          .filter(Boolean)
          .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || null
      : null,
    last_inventory_by: latestChild?.last_inventory_by || null,
    last_inventory_duration_seconds: coverageComplete
      ? list.reduce((sum, child) => sum + Number(child?.last_inventory_duration_seconds || 0), 0)
      : (latestChild?.last_inventory_duration_seconds ?? null),
    delta_vs_current: lastInventoryQty == null ? null : currentQty - lastInventoryQty,
    delta_vs_previous: lastInventoryQty == null || previousInventoryQty == null ? null : lastInventoryQty - previousInventoryQty,
    history_count: list.reduce((sum, child) => sum + Number(child?.history_count || 0), 0),
    total_leaf_count: totalLeafCount,
    covered_leaf_count: coveredLeafCount,
    coverage_complete: coverageComplete,
  };
}

function buildInventoryEventFilter(idField, ids, warehouseField, warehouseId, params) {
  if (Array.isArray(ids) && ids.length > 0) {
    params.push(ids.map(Number).filter(Boolean));
    return `${idField} = ANY($${params.length}::int[])`;
  }
  if (warehouseId) {
    params.push(Number(warehouseId));
    return `${warehouseField} = $${params.length}`;
  }
  return '1=1';
}

async function getShelfInventoryEvents(client, { shelfIds = null, warehouseId = null } = {}) {
  const params = [];
  const filterSql = buildInventoryEventFilter('t.shelf_id', shelfIds, 'r.warehouse_id', warehouseId, params);
  const result = await client.query(
    `SELECT
       'shelf' as leaf_type,
       t.shelf_id as leaf_id,
       t.id as task_id,
       t.title as task_title,
       t.started_at,
       t.completed_at,
       ROUND(EXTRACT(EPOCH FROM (t.completed_at - t.started_at))::numeric) as duration_seconds,
       e.full_name as employee_name,
       COALESCE(SUM(sc.quantity_delta), 0) as counted_qty,
       (
         SELECT COALESCE(json_agg(json_build_object(
           'product_id', agg.product_id,
           'product_name', p.name,
           'product_code', p.code,
           'quantity', agg.total_qty
         ) ORDER BY p.name), '[]'::json)
         FROM (
           SELECT sc2.product_id, SUM(sc2.quantity_delta) as total_qty
           FROM inventory_task_scans_s sc2
           WHERE sc2.task_id = t.id AND sc2.product_id IS NOT NULL
           GROUP BY sc2.product_id
         ) agg
         LEFT JOIN products_s p ON p.id = agg.product_id
       ) as products
     FROM inventory_tasks_s t
     JOIN shelves_s s ON s.id = t.shelf_id
     JOIN racks_s r ON r.id = s.rack_id
     LEFT JOIN employees_s e ON e.id = t.employee_id
     LEFT JOIN inventory_task_scans_s sc ON sc.task_id = t.id AND sc.product_id IS NOT NULL
     WHERE t.task_type = 'inventory'
       AND t.status = 'completed'
       AND t.shelf_id IS NOT NULL
       AND t.target_pallet_id IS NULL
       AND t.target_box_id IS NULL
       AND t.target_shelf_box_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM inventory_task_boxes_s tb WHERE tb.task_id = t.id)
       AND (t.shelf_ids IS NULL OR jsonb_typeof(t.shelf_ids) <> 'array' OR jsonb_array_length(t.shelf_ids) <= 1)
       AND ${filterSql}
     GROUP BY t.id, e.full_name
     ORDER BY t.completed_at DESC`,
    params
  );
  return result.rows;
}

async function getPalletInventoryEvents(client, { palletIds = null, warehouseId = null } = {}) {
  const params = [];
  const filterSql = buildInventoryEventFilter('t.target_pallet_id', palletIds, 'pr.warehouse_id', warehouseId, params);
  const result = await client.query(
    `SELECT
       'pallet' as leaf_type,
       t.target_pallet_id as leaf_id,
       t.id as task_id,
       t.title as task_title,
       t.started_at,
       t.completed_at,
       ROUND(EXTRACT(EPOCH FROM (t.completed_at - t.started_at))::numeric) as duration_seconds,
       e.full_name as employee_name,
       COALESCE(SUM(sc.quantity_delta), 0) as counted_qty,
       (
         SELECT COALESCE(json_agg(json_build_object(
           'product_id', agg.product_id,
           'product_name', p.name,
           'product_code', p.code,
           'quantity', agg.total_qty
         ) ORDER BY p.name), '[]'::json)
         FROM (
           SELECT sc2.product_id, SUM(sc2.quantity_delta) as total_qty
           FROM inventory_task_scans_s sc2
           WHERE sc2.task_id = t.id AND sc2.product_id IS NOT NULL
           GROUP BY sc2.product_id
         ) agg
         LEFT JOIN products_s p ON p.id = agg.product_id
       ) as products
     FROM inventory_tasks_s t
     JOIN pallets_s pa ON pa.id = t.target_pallet_id
     JOIN pallet_rows_s pr ON pr.id = pa.row_id
     LEFT JOIN employees_s e ON e.id = t.employee_id
     LEFT JOIN inventory_task_scans_s sc ON sc.task_id = t.id AND sc.product_id IS NOT NULL
     WHERE t.task_type = 'inventory'
       AND t.status = 'completed'
       AND t.target_pallet_id IS NOT NULL
       AND t.shelf_id IS NULL
       AND t.target_box_id IS NULL
       AND t.target_shelf_box_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM inventory_task_boxes_s tb WHERE tb.task_id = t.id)
       AND ${filterSql}
     GROUP BY t.id, e.full_name
     ORDER BY t.completed_at DESC`,
    params
  );
  return result.rows;
}

async function getShelfBoxInventoryEvents(client, { shelfBoxIds = null, warehouseId = null } = {}) {
  const params = [];
  const filterSql = buildInventoryEventFilter('tb.shelf_box_id', shelfBoxIds, 'r.warehouse_id', warehouseId, params);
  const result = await client.query(
    `SELECT
       'shelf_box' as leaf_type,
       tb.shelf_box_id as leaf_id,
       t.id as task_id,
       t.title as task_title,
       COALESCE(tb.started_at, t.started_at) as started_at,
       COALESCE(tb.completed_at, t.completed_at) as completed_at,
       ROUND(EXTRACT(EPOCH FROM (COALESCE(tb.completed_at, t.completed_at) - COALESCE(tb.started_at, t.started_at)))::numeric) as duration_seconds,
       e.full_name as employee_name,
       COALESCE((
         SELECT SUM(sc2.quantity_delta)
         FROM inventory_task_scans_s sc2
         WHERE sc2.task_id = t.id AND sc2.task_box_id = tb.id AND sc2.product_id IS NOT NULL
       ), 0) as counted_qty,
       (
         SELECT COALESCE(json_agg(json_build_object(
           'product_id', agg.product_id,
           'product_name', p.name,
           'product_code', p.code,
           'quantity', agg.total_qty
         ) ORDER BY p.name), '[]'::json)
         FROM (
           SELECT sc2.product_id, SUM(sc2.quantity_delta) as total_qty
           FROM inventory_task_scans_s sc2
           WHERE sc2.task_id = t.id AND sc2.task_box_id = tb.id AND sc2.product_id IS NOT NULL
           GROUP BY sc2.product_id
         ) agg
         LEFT JOIN products_s p ON p.id = agg.product_id
       ) as products
     FROM inventory_task_boxes_s tb
     JOIN inventory_tasks_s t ON t.id = tb.task_id
     JOIN shelf_boxes_s sb ON sb.id = tb.shelf_box_id
     JOIN shelves_s s ON s.id = sb.shelf_id
     JOIN racks_s r ON r.id = s.rack_id
     LEFT JOIN employees_s e ON e.id = t.employee_id
     WHERE tb.shelf_box_id IS NOT NULL
       AND tb.status = 'completed'
       AND t.task_type = 'inventory'
       AND t.status = 'completed'
       AND ${filterSql}
     ORDER BY COALESCE(tb.completed_at, t.completed_at) DESC`,
    params
  );
  return result.rows;
}

async function getPalletBoxInventoryEvents(client, { boxIds = null, warehouseId = null } = {}) {
  const params = [];
  const filterSql = buildInventoryEventFilter('tb.box_id', boxIds, 'pr.warehouse_id', warehouseId, params);
  const result = await client.query(
    `SELECT
       'pallet_box' as leaf_type,
       tb.box_id as leaf_id,
       t.id as task_id,
       t.title as task_title,
       COALESCE(tb.started_at, t.started_at) as started_at,
       COALESCE(tb.completed_at, t.completed_at) as completed_at,
       ROUND(EXTRACT(EPOCH FROM (COALESCE(tb.completed_at, t.completed_at) - COALESCE(tb.started_at, t.started_at)))::numeric) as duration_seconds,
       e.full_name as employee_name,
       COALESCE((
         SELECT SUM(sc2.quantity_delta)
         FROM inventory_task_scans_s sc2
         WHERE sc2.task_id = t.id AND sc2.task_box_id = tb.id AND sc2.product_id IS NOT NULL
       ), 0) as counted_qty,
       (
         SELECT COALESCE(json_agg(json_build_object(
           'product_id', agg.product_id,
           'product_name', p.name,
           'product_code', p.code,
           'quantity', agg.total_qty
         ) ORDER BY p.name), '[]'::json)
         FROM (
           SELECT sc2.product_id, SUM(sc2.quantity_delta) as total_qty
           FROM inventory_task_scans_s sc2
           WHERE sc2.task_id = t.id AND sc2.task_box_id = tb.id AND sc2.product_id IS NOT NULL
           GROUP BY sc2.product_id
         ) agg
         LEFT JOIN products_s p ON p.id = agg.product_id
       ) as products
     FROM inventory_task_boxes_s tb
     JOIN inventory_tasks_s t ON t.id = tb.task_id
     JOIN boxes_s b ON b.id = tb.box_id
     JOIN pallets_s pa ON pa.id = b.pallet_id
     JOIN pallet_rows_s pr ON pr.id = pa.row_id
     LEFT JOIN employees_s e ON e.id = t.employee_id
     WHERE tb.box_id IS NOT NULL
       AND tb.status = 'completed'
       AND t.task_type = 'inventory'
       AND t.status = 'completed'
       AND ${filterSql}
     ORDER BY COALESCE(tb.completed_at, t.completed_at) DESC`,
    params
  );
  return result.rows;
}

async function getInventoryOverviewData(client, warehouseId = null) {
  const warehouseParams = [];
  const warehouseWhere = warehouseId ? 'WHERE w.id = $1' : '';
  if (warehouseId) warehouseParams.push(Number(warehouseId));

  const warehousesResult = await client.query(
    `SELECT w.id, w.name, w.warehouse_type
     FROM warehouses_s w
     ${warehouseWhere}
     ORDER BY w.name`,
    warehouseParams
  );

  const warehouseRows = warehousesResult.rows;
  if (warehouseRows.length === 0) {
    return {
      summary: {
        warehouses_count: 0,
        racks_count: 0,
        shelves_count: 0,
        rows_count: 0,
        pallets_count: 0,
        boxes_count: 0,
        last_inventory_at: null,
      },
      warehouses: [],
      lookups: {},
    };
  }

  const warehouseIds = warehouseRows.map(row => Number(row.id));

  const [
    racksResult,
    shelvesResult,
    shelfBoxesResult,
    rowsResult,
    palletsResult,
    palletBoxesResult,
    shelfEventsRaw,
    palletEventsRaw,
    shelfBoxEventsRaw,
    palletBoxEventsRaw,
  ] = await Promise.all([
    client.query(
      `SELECT r.id, r.warehouse_id, r.name, r.code, r.number
       FROM racks_s r
       WHERE r.warehouse_id = ANY($1::int[])
       ORDER BY r.number, r.id`,
      [warehouseIds]
    ),
    client.query(
      `SELECT s.id, s.rack_id, s.name, s.code, s.number, s.barcode_value, s.uses_boxes,
              COALESCE(loose.total_qty, 0) + COALESCE(boxed.total_qty, 0) as current_qty
       FROM shelves_s s
       LEFT JOIN (
         SELECT shelf_id, SUM(quantity) as total_qty
         FROM shelf_items_s
         WHERE quantity > 0
         GROUP BY shelf_id
       ) loose ON loose.shelf_id = s.id
       LEFT JOIN (
         SELECT sb.shelf_id, SUM(sbi.quantity) as total_qty
         FROM shelf_box_items_s sbi
         JOIN shelf_boxes_s sb ON sb.id = sbi.shelf_box_id
         WHERE sbi.quantity > 0
         GROUP BY sb.shelf_id
       ) boxed ON boxed.shelf_id = s.id
       WHERE s.rack_id IN (SELECT id FROM racks_s WHERE warehouse_id = ANY($1::int[]))
       ORDER BY s.rack_id, s.number, s.id`,
      [warehouseIds]
    ),
    client.query(
      `SELECT sb.id, sb.shelf_id, sb.position, sb.name, sb.barcode_value, sb.created_at,
              COALESCE(SUM(sbi.quantity), 0) as current_qty,
              COUNT(*) FILTER (WHERE sbi.quantity > 0) as products_count
       FROM shelf_boxes_s sb
       LEFT JOIN shelf_box_items_s sbi ON sbi.shelf_box_id = sb.id AND sbi.quantity > 0
       WHERE sb.shelf_id IN (
         SELECT s.id
         FROM shelves_s s
         JOIN racks_s r ON r.id = s.rack_id
         WHERE r.warehouse_id = ANY($1::int[])
       )
       GROUP BY sb.id
       ORDER BY sb.shelf_id, sb.position, sb.created_at, sb.id`,
      [warehouseIds]
    ),
    client.query(
      `SELECT pr.id, pr.warehouse_id, pr.name, pr.number
       FROM pallet_rows_s pr
       WHERE pr.warehouse_id = ANY($1::int[])
       ORDER BY pr.number, pr.id`,
      [warehouseIds]
    ),
    client.query(
      `SELECT pa.id, pa.row_id, pa.name, pa.number, pa.barcode_value, pa.uses_boxes,
              COALESCE(loose.total_qty, 0) + COALESCE(boxed.total_qty, 0) as current_qty
       FROM pallets_s pa
       LEFT JOIN (
         SELECT pallet_id, SUM(quantity) as total_qty
         FROM pallet_items_s
         WHERE quantity > 0
         GROUP BY pallet_id
       ) loose ON loose.pallet_id = pa.id
       LEFT JOIN (
         SELECT b.pallet_id, SUM(bi.quantity) as total_qty
         FROM box_items_s bi
         JOIN boxes_s b ON b.id = bi.box_id
         WHERE bi.quantity > 0
         GROUP BY b.pallet_id
       ) boxed ON boxed.pallet_id = pa.id
       WHERE pa.row_id IN (SELECT id FROM pallet_rows_s WHERE warehouse_id = ANY($1::int[]))
       ORDER BY pa.row_id, pa.number, pa.id`,
      [warehouseIds]
    ),
    client.query(
      `SELECT * FROM (
         SELECT b.id, b.pallet_id, b.barcode_value, b.created_at,
                COALESCE(SUM(bi.quantity), 0) as current_qty,
                COUNT(*) FILTER (WHERE bi.quantity > 0) as products_count,
                ROW_NUMBER() OVER (PARTITION BY b.pallet_id ORDER BY b.created_at, b.id) as position
         FROM boxes_s b
         LEFT JOIN box_items_s bi ON bi.box_id = b.id AND bi.quantity > 0
         WHERE b.pallet_id IN (
           SELECT pa.id
           FROM pallets_s pa
           JOIN pallet_rows_s pr ON pr.id = pa.row_id
           WHERE pr.warehouse_id = ANY($1::int[])
         )
         GROUP BY b.id
       ) boxed
       ORDER BY boxed.pallet_id, boxed.position`,
      [warehouseIds]
    ),
    getShelfInventoryEvents(client, { warehouseId }),
    getPalletInventoryEvents(client, { warehouseId }),
    getShelfBoxInventoryEvents(client, { warehouseId }),
    getPalletBoxInventoryEvents(client, { warehouseId }),
  ]);

  const allEventsByLeaf = groupInventoryEvents([
    ...shelfEventsRaw,
    ...palletEventsRaw,
    ...shelfBoxEventsRaw,
    ...palletBoxEventsRaw,
  ]);

  const warehouseMap = new Map();
  const rackMap = new Map();
  const shelfMap = new Map();
  const rowMap = new Map();
  const palletMap = new Map();
  const shelfBoxMap = new Map();
  const palletBoxMap = new Map();
  const leafLookup = new Map();

  for (const row of warehouseRows) {
    warehouseMap.set(Number(row.id), {
      kind: 'warehouse',
      id: Number(row.id),
      name: row.name,
      warehouse_type: row.warehouse_type,
      racks: [],
      rows: [],
    });
  }

  for (const row of racksResult.rows) {
    const node = {
      kind: 'rack',
      id: Number(row.id),
      warehouse_id: Number(row.warehouse_id),
      name: row.name,
      code: row.code || null,
      label: row.code || row.name,
      shelves: [],
    };
    rackMap.set(node.id, node);
    warehouseMap.get(node.warehouse_id)?.racks.push(node);
  }

  for (const row of rowsResult.rows) {
    const node = {
      kind: 'row',
      id: Number(row.id),
      warehouse_id: Number(row.warehouse_id),
      name: row.name,
      number: Number(row.number),
      label: `Р${row.number}`,
      pallets: [],
    };
    rowMap.set(node.id, node);
    warehouseMap.get(node.warehouse_id)?.rows.push(node);
  }

  for (const row of shelvesResult.rows) {
    const node = {
      kind: 'shelf',
      id: Number(row.id),
      rack_id: Number(row.rack_id),
      name: row.name,
      code: row.code || null,
      number: Number(row.number),
      barcode_value: row.barcode_value || null,
      uses_boxes: row.uses_boxes === true,
      label: row.code || row.name,
      path_label: row.code || row.name,
      boxes: [],
      current_qty: Number(row.current_qty || 0),
    };
    shelfMap.set(node.id, node);
    rackMap.get(node.rack_id)?.shelves.push(node);
  }

  for (const row of palletsResult.rows) {
    const rowNode = rowMap.get(Number(row.row_id));
    const label = rowNode ? `Р${rowNode.number}П${row.number}` : (row.name || `Паллет ${row.number}`);
    const node = {
      kind: 'pallet',
      id: Number(row.id),
      row_id: Number(row.row_id),
      name: row.name,
      number: Number(row.number),
      barcode_value: row.barcode_value || null,
      uses_boxes: row.uses_boxes !== false,
      label,
      path_label: label,
      boxes: [],
      current_qty: Number(row.current_qty || 0),
    };
    palletMap.set(node.id, node);
    rowMap.get(node.row_id)?.pallets.push(node);
  }

  for (const row of shelfBoxesResult.rows) {
    const shelf = shelfMap.get(Number(row.shelf_id));
    const label = row.name || `${shelf?.code || shelf?.name || 'Полка'}К${row.position}`;
    const node = {
      kind: 'shelf_box',
      id: Number(row.id),
      shelf_id: Number(row.shelf_id),
      position: Number(row.position || 0),
      name: row.name || null,
      barcode_value: row.barcode_value || null,
      products_count: Number(row.products_count || 0),
      label,
      path_label: label,
      current_qty: Number(row.current_qty || 0),
    };
    const stats = buildInventoryLeafStats('shelf_box', node.id, node.current_qty, allEventsByLeaf);
    Object.assign(node, stats);
    shelfBoxMap.set(node.id, node);
    leafLookup.set(createLeafKey('shelf_box', node.id), node);
    shelf?.boxes.push(node);
  }

  for (const row of palletBoxesResult.rows) {
    const pallet = palletMap.get(Number(row.pallet_id));
    const rowNode = pallet ? rowMap.get(pallet.row_id) : null;
    const label = `${rowNode ? `Р${rowNode.number}` : ''}${pallet ? `П${pallet.number}` : ''}К${row.position}`;
    const node = {
      kind: 'pallet_box',
      id: Number(row.id),
      pallet_id: Number(row.pallet_id),
      position: Number(row.position || 0),
      name: null,
      barcode_value: row.barcode_value || null,
      products_count: Number(row.products_count || 0),
      label,
      path_label: label,
      current_qty: Number(row.current_qty || 0),
    };
    const stats = buildInventoryLeafStats('pallet_box', node.id, node.current_qty, allEventsByLeaf);
    Object.assign(node, stats);
    palletBoxMap.set(node.id, node);
    leafLookup.set(createLeafKey('pallet_box', node.id), node);
    pallet?.boxes.push(node);
  }

  for (const shelf of shelfMap.values()) {
    if (shelf.uses_boxes) {
      Object.assign(shelf, aggregateInventoryStats(shelf.boxes));
    } else {
      Object.assign(shelf, buildInventoryLeafStats('shelf', shelf.id, shelf.current_qty, allEventsByLeaf));
      leafLookup.set(createLeafKey('shelf', shelf.id), shelf);
    }
  }

  for (const pallet of palletMap.values()) {
    if (pallet.uses_boxes) {
      Object.assign(pallet, aggregateInventoryStats(pallet.boxes));
    } else {
      Object.assign(pallet, buildInventoryLeafStats('pallet', pallet.id, pallet.current_qty, allEventsByLeaf));
      leafLookup.set(createLeafKey('pallet', pallet.id), pallet);
    }
  }

  for (const rack of rackMap.values()) {
    Object.assign(rack, aggregateInventoryStats(rack.shelves));
  }
  for (const row of rowMap.values()) {
    Object.assign(row, aggregateInventoryStats(row.pallets));
  }
  for (const warehouse of warehouseMap.values()) {
    Object.assign(warehouse, aggregateInventoryStats([...warehouse.racks, ...warehouse.rows]));
  }

  const warehouses = Array.from(warehouseMap.values())
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));

  const summary = {
    warehouses_count: warehouses.length,
    racks_count: rackMap.size,
    shelves_count: shelfMap.size,
    rows_count: rowMap.size,
    pallets_count: palletMap.size,
    boxes_count: shelfBoxMap.size + palletBoxMap.size,
    last_inventory_at: warehouses
      .map(node => node.last_inventory_at)
      .filter(Boolean)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || null,
  };

  return {
    summary,
    warehouses,
    lookups: {
      warehouse: warehouseMap,
      rack: rackMap,
      shelf: shelfMap,
      shelf_box: shelfBoxMap,
      row: rowMap,
      pallet: palletMap,
      pallet_box: palletBoxMap,
      leaf: leafLookup,
    },
  };
}

function findInventoryNode(lookups, kind, id) {
  const map = lookups?.[kind];
  if (!map) return null;
  return map.get(Number(id)) || null;
}

function collectInventoryLeafRefs(node, refs = []) {
  if (!node) return refs;
  switch (node.kind) {
    case 'shelf_box':
      refs.push({ leaf_type: 'shelf_box', leaf_id: node.id });
      return refs;
    case 'pallet_box':
      refs.push({ leaf_type: 'pallet_box', leaf_id: node.id });
      return refs;
    case 'shelf':
      if (node.uses_boxes) node.boxes.forEach(child => collectInventoryLeafRefs(child, refs));
      else refs.push({ leaf_type: 'shelf', leaf_id: node.id });
      return refs;
    case 'pallet':
      if (node.uses_boxes) node.boxes.forEach(child => collectInventoryLeafRefs(child, refs));
      else refs.push({ leaf_type: 'pallet', leaf_id: node.id });
      return refs;
    case 'rack':
      node.shelves.forEach(child => collectInventoryLeafRefs(child, refs));
      return refs;
    case 'row':
      node.pallets.forEach(child => collectInventoryLeafRefs(child, refs));
      return refs;
    case 'warehouse':
      node.racks.forEach(child => collectInventoryLeafRefs(child, refs));
      node.rows.forEach(child => collectInventoryLeafRefs(child, refs));
      return refs;
    default:
      return refs;
  }
}

function serializeInventoryNodeSummary(node) {
  if (!node) return null;
  return {
    kind: node.kind,
    id: node.id,
    name: node.name || null,
    code: node.code || null,
    number: node.number || null,
    label: node.label || node.name || null,
    path_label: node.path_label || node.label || node.name || null,
    uses_boxes: node.uses_boxes === true,
    current_qty: Number(node.current_qty || 0),
    last_inventory_qty: node.last_inventory_qty == null ? null : Number(node.last_inventory_qty),
    previous_inventory_qty: node.previous_inventory_qty == null ? null : Number(node.previous_inventory_qty),
    last_inventory_at: node.last_inventory_at || null,
    previous_inventory_at: node.previous_inventory_at || null,
    last_inventory_by: node.last_inventory_by || null,
    last_inventory_duration_seconds: node.last_inventory_duration_seconds == null ? null : Number(node.last_inventory_duration_seconds),
    delta_vs_current: node.delta_vs_current == null ? null : Number(node.delta_vs_current),
    delta_vs_previous: node.delta_vs_previous == null ? null : Number(node.delta_vs_previous),
    history_count: Number(node.history_count || 0),
    total_leaf_count: Number(node.total_leaf_count || 0),
    covered_leaf_count: Number(node.covered_leaf_count || 0),
    coverage_complete: node.coverage_complete === true,
    children_count: Array.isArray(node.boxes)
      ? node.boxes.length
      : Array.isArray(node.shelves)
      ? node.shelves.length
      : Array.isArray(node.pallets)
      ? node.pallets.length
      : Array.isArray(node.racks) || Array.isArray(node.rows)
      ? Number(node.racks?.length || 0) + Number(node.rows?.length || 0)
      : 0,
  };
}

function buildInventoryHistoryByTask(rows, overview) {
  const normalized = rows.map(normalizeInventoryEventRow);
  const byLeaf = groupInventoryEvents(normalized);
  const byTask = new Map();

  for (const event of normalized) {
    const leafKey = createLeafKey(event.leaf_type, event.leaf_id);
    const leafNode = overview.lookups?.leaf?.get(leafKey) || null;
    const leafHistory = byLeaf.get(leafKey) || [];
    const currentIndex = leafHistory.findIndex(item =>
      item.task_id === event.task_id
      && item.leaf_type === event.leaf_type
      && item.leaf_id === event.leaf_id
      && item.completed_at === event.completed_at
      && item.started_at === event.started_at
    );
    const previous = currentIndex >= 0 ? (leafHistory[currentIndex + 1] || null) : null;
    const currentQty = Number(leafNode?.current_qty || 0);
    const countedQty = Number(event.counted_qty || 0);
    const previousQty = previous ? Number(previous.counted_qty || 0) : null;
    const taskKey = `task:${event.task_id}`;

    if (!byTask.has(taskKey)) {
      byTask.set(taskKey, {
        event_key: taskKey,
        task_id: event.task_id,
        task_title: event.task_title || null,
        completed_at: event.completed_at || null,
        started_at: event.started_at || null,
        employee_name: event.employee_name || null,
        locations: [],
      });
    }

    const group = byTask.get(taskKey);
    if (event.completed_at && (!group.completed_at || new Date(event.completed_at).getTime() > new Date(group.completed_at).getTime())) {
      group.completed_at = event.completed_at;
    }
    if (event.started_at && (!group.started_at || new Date(event.started_at).getTime() < new Date(group.started_at).getTime())) {
      group.started_at = event.started_at;
    }
    if (!group.employee_name && event.employee_name) {
      group.employee_name = event.employee_name;
    }

    group.locations.push({
      leaf_type: event.leaf_type,
      leaf_id: event.leaf_id,
      scope_label: leafNode?.label || null,
      scope_path: leafNode?.path_label || leafNode?.label || null,
      counted_qty: countedQty,
      previous_inventory_qty: previousQty,
      previous_inventory_at: previous?.completed_at || null,
      current_qty: currentQty,
      delta_vs_current: currentQty - countedQty,
      delta_vs_previous: previousQty == null ? null : countedQty - previousQty,
      products: event.products,
    });
  }

  return Array.from(byTask.values())
    .map(group => {
      const locations = group.locations
        .sort((a, b) => String(a.scope_label || '').localeCompare(String(b.scope_label || ''), 'ru'));
      const countedQty = locations.reduce((sum, item) => sum + Number(item.counted_qty || 0), 0);
      const currentQty = locations.reduce((sum, item) => sum + Number(item.current_qty || 0), 0);
      const hasFullPrevious = locations.length > 0 && locations.every(item => item.previous_inventory_qty != null);
      const previousQty = hasFullPrevious
        ? locations.reduce((sum, item) => sum + Number(item.previous_inventory_qty || 0), 0)
        : null;
      const durationSeconds = group.started_at && group.completed_at
        ? (new Date(group.completed_at).getTime() - new Date(group.started_at).getTime()) / 1000
        : null;

      return {
        event_key: group.event_key,
        task_id: group.task_id,
        task_title: group.task_title,
        completed_at: group.completed_at,
        started_at: group.started_at,
        duration_seconds: durationSeconds != null && Number.isFinite(durationSeconds) ? durationSeconds : null,
        employee_name: group.employee_name,
        counted_qty: countedQty,
        previous_inventory_qty: previousQty,
        current_qty: currentQty,
        delta_vs_previous: previousQty == null ? null : countedQty - previousQty,
        delta_vs_current: currentQty - countedQty,
        locations_count: locations.length,
        locations,
      };
    })
    .sort((a, b) => new Date(b.completed_at || 0).getTime() - new Date(a.completed_at || 0).getTime());
}

// GET /api/tasks
router.get('/', requireAuth, async (req, res) => {
  try {
    const { status, employee_id, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conditions = [];
    const params = [];

    if (req.user.role === 'employee') {
      params.push(req.user.employee_id);
      conditions.push(`t.employee_id = $${params.length}`);
    } else if (employee_id) {
      params.push(employee_id);
      conditions.push(`t.employee_id = $${params.length}`);
    }

    if (status) {
      params.push(status);
      conditions.push(`t.status = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM inventory_tasks_s t ${where}`, params
    );

    params.push(parseInt(limit), offset);
    const result = await pool.query(
      `SELECT t.id, t.title, t.status, t.notes, t.created_at, t.started_at, t.completed_at,
              t.task_type,
              t.target_box_id, t.target_shelf_box_id,
              e.full_name as employee_name,
              s.code as shelf_code, s.name as shelf_name,
              r.name as rack_name, r.code as rack_code,
              COALESCE(w.name, pw.name) as warehouse_name,
              pa.id as pallet_id, pa.name as pallet_name, pa.number as pallet_number,
              pr.name as pallet_row_name, pr.number as pallet_row_number,
              COALESCE(sbx.id, bx.id) as box_id,
              CASE WHEN sbx.id IS NOT NULL THEN 'shelf' WHEN bx.id IS NOT NULL THEN 'pallet' ELSE NULL END as box_location_type,
              COALESCE(sbx.barcode_value, bx.barcode_value) as box_barcode,
              COALESCE(sbx.quantity, bx.quantity) as box_quantity,
              COALESCE(sbp.name, bp.name) as box_product_name,
              COALESCE(sbp.code, bp.code) as box_product_code,
              (SELECT COUNT(*) FROM inventory_task_scans_s WHERE task_id = t.id AND product_id IS NOT NULL) as scans_count,
              (SELECT COUNT(*) FROM inventory_task_boxes_s tb WHERE tb.task_id = t.id) as task_boxes_total,
              (SELECT COUNT(*) FROM inventory_task_boxes_s tb WHERE tb.task_id = t.id AND tb.status = 'completed') as task_boxes_completed
       FROM inventory_tasks_s t
       LEFT JOIN employees_s e ON e.id = t.employee_id
       LEFT JOIN shelves_s s ON s.id = t.shelf_id
       LEFT JOIN racks_s r ON r.id = s.rack_id
       LEFT JOIN warehouses_s w ON w.id = r.warehouse_id
       LEFT JOIN shelf_boxes_s sbx ON sbx.id = t.target_shelf_box_id
       LEFT JOIN products_s sbp ON sbp.id = sbx.product_id
       LEFT JOIN boxes_s bx ON bx.id = t.target_box_id
       LEFT JOIN products_s bp ON bp.id = bx.product_id
       LEFT JOIN pallets_s pa ON pa.id = COALESCE(t.target_pallet_id, bx.pallet_id)
       LEFT JOIN pallet_rows_s pr ON pr.id = pa.row_id
       LEFT JOIN warehouses_s pw ON pw.id = pr.warehouse_id
       ${where}
       ORDER BY t.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({
      items: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Static routes BEFORE /:id ───────────────────────────────────────────────

// GET /api/tasks/stats/summary
router.get('/stats/summary', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'new') as new_count,
        COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress_count,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_count
      FROM inventory_tasks_s
    `);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tasks/analytics/summary — global analytics
router.get('/analytics/summary', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rows: [overview] } = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'completed') as completed_tasks,
        COUNT(*) FILTER (WHERE status = 'in_progress') as active_tasks,
        ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - started_at))/60)
          FILTER (WHERE status = 'completed' AND started_at IS NOT NULL AND completed_at IS NOT NULL)::numeric, 1
        ) as avg_duration_minutes,
        (SELECT COUNT(*) FROM inventory_task_scans_s WHERE product_id IS NOT NULL) + COALESCE((SELECT SUM(quantity) FROM boxes_s WHERE status IN ('closed','open')), 0) as total_scans,
        (SELECT COUNT(*) FROM scan_errors_s) as total_errors,
        (SELECT ROUND(AVG(gap)::numeric, 1) FROM (
          SELECT EXTRACT(EPOCH FROM (created_at - LAG(created_at) OVER (PARTITION BY task_id ORDER BY created_at))) as gap
          FROM inventory_task_scans_s
        ) g WHERE gap IS NOT NULL AND gap < 300) as avg_seconds_per_scan
      FROM inventory_tasks_s
    `);

    const { rows: topEmployees } = await pool.query(`
      SELECT
        e.full_name,
        COUNT(DISTINCT t.id) as tasks_count,
        COUNT(sc.id) FILTER (WHERE sc.product_id IS NOT NULL) + COALESCE(SUM(CASE WHEN t.task_type = 'packaging' THEN (SELECT COALESCE(SUM(b.quantity),0) FROM boxes_s b WHERE b.task_id = t.id) ELSE 0 END), 0) as scans_count,
        ROUND(AVG(EXTRACT(EPOCH FROM (t.completed_at - t.started_at))/60)
          FILTER (WHERE t.started_at IS NOT NULL AND t.completed_at IS NOT NULL)::numeric, 1
        ) as avg_minutes,
        (SELECT ROUND(AVG(gap)::numeric, 1) FROM (
          SELECT EXTRACT(EPOCH FROM (sc2.created_at - LAG(sc2.created_at) OVER (PARTITION BY sc2.task_id ORDER BY sc2.created_at))) as gap
          FROM inventory_task_scans_s sc2
          JOIN inventory_tasks_s t2 ON t2.id = sc2.task_id AND t2.employee_id = e.id
        ) g WHERE gap IS NOT NULL AND gap < 300) as avg_scan_gap
      FROM employees_s e
      JOIN inventory_tasks_s t ON t.employee_id = e.id AND t.status = 'completed'
      LEFT JOIN inventory_task_scans_s sc ON sc.task_id = t.id AND t.task_type != 'packaging'
      GROUP BY e.id, e.full_name
      ORDER BY scans_count DESC
      LIMIT 15
    `);

    const { rows: recentTasks } = await pool.query(`
      SELECT
        t.id, t.title, t.status, t.started_at, t.completed_at, t.task_type,
        e.full_name as employee_name,
        ROUND(EXTRACT(EPOCH FROM (t.completed_at - t.started_at))::numeric/60, 1) as duration_minutes,
        CASE WHEN t.task_type = 'packaging' THEN COALESCE((SELECT SUM(b.quantity) FROM boxes_s b WHERE b.task_id = t.id), 0)::bigint ELSE COUNT(sc.id) FILTER (WHERE sc.product_id IS NOT NULL) END as scans_count,
        (SELECT COUNT(*) FROM scan_errors_s WHERE task_id = t.id) as errors_count,
        (SELECT ROUND(AVG(gap)::numeric, 1) FROM (
          SELECT EXTRACT(EPOCH FROM (created_at - LAG(created_at) OVER (ORDER BY created_at))) as gap
          FROM inventory_task_scans_s WHERE task_id = t.id
        ) g WHERE gap IS NOT NULL AND gap < 300) as avg_scan_gap
      FROM inventory_tasks_s t
      LEFT JOIN employees_s e ON e.id = t.employee_id
      LEFT JOIN inventory_task_scans_s sc ON sc.task_id = t.id
      WHERE t.status = 'completed'
      GROUP BY t.id, e.full_name
      ORDER BY t.completed_at DESC
      LIMIT 20
    `);

    res.json({ overview, topEmployees, recentTasks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tasks/errors — all scan errors across all tasks
router.get('/errors', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        se.*,
        u.username,
        e.full_name as employee_name,
        t.title as task_title,
        s.id as shelf_id, s.code as shelf_code, s.name as shelf_name,
        r.name as rack_name, r.id as rack_id,
        ru.username as resolved_by_username
      FROM scan_errors_s se
      LEFT JOIN users_s u ON u.id = se.user_id
      LEFT JOIN employees_s e ON e.id = u.employee_id
      LEFT JOIN inventory_tasks_s t ON t.id = se.task_id
      LEFT JOIN shelves_s s ON s.id = t.shelf_id
      LEFT JOIN racks_s r ON r.id = s.rack_id
      LEFT JOIN users_s ru ON ru.id = se.resolved_by
      ORDER BY se.resolved_at NULLS FIRST, se.created_at DESC
      LIMIT 200
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/tasks/errors/:id/resolve — mark scan error as resolved
router.put('/errors/:id/resolve', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE scan_errors_s SET resolved_at=NOW(), resolved_by=$1 WHERE id=$2 RETURNING *',
      [req.user.id, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Не найдено' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tasks/analytics/inventory-overview — tree of storage locations with inventory stats
router.get('/analytics/inventory-overview', requireAuth, requireAdmin, async (req, res) => {
  try {
    const warehouseId = req.query.warehouse_id ? Number(req.query.warehouse_id) : null;
    const overview = await getInventoryOverviewData(pool, warehouseId);
    res.json({
      summary: overview.summary,
      warehouses: overview.warehouses,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tasks/analytics/inventory-history — history for selected node
router.get('/analytics/inventory-history', requireAuth, requireAdmin, async (req, res) => {
  try {
    const locationType = String(req.query.location_type || '').trim();
    const locationId = Number(req.query.id);
    if (!locationType || !Number.isFinite(locationId)) {
      return res.status(400).json({ error: 'location_type и id обязательны' });
    }

    const overview = await getInventoryOverviewData(pool, null);
    const selectedNode = findInventoryNode(overview.lookups, locationType, locationId);
    if (!selectedNode) {
      return res.status(404).json({ error: 'Узел инвентаризации не найден' });
    }

    const refs = collectInventoryLeafRefs(selectedNode, []);
    const shelfIds = refs.filter(ref => ref.leaf_type === 'shelf').map(ref => ref.leaf_id);
    const palletIds = refs.filter(ref => ref.leaf_type === 'pallet').map(ref => ref.leaf_id);
    const shelfBoxIds = refs.filter(ref => ref.leaf_type === 'shelf_box').map(ref => ref.leaf_id);
    const palletBoxIds = refs.filter(ref => ref.leaf_type === 'pallet_box').map(ref => ref.leaf_id);

    const [shelfEvents, palletEvents, shelfBoxEvents, palletBoxEvents] = await Promise.all([
      shelfIds.length ? getShelfInventoryEvents(pool, { shelfIds }) : [],
      palletIds.length ? getPalletInventoryEvents(pool, { palletIds }) : [],
      shelfBoxIds.length ? getShelfBoxInventoryEvents(pool, { shelfBoxIds }) : [],
      palletBoxIds.length ? getPalletBoxInventoryEvents(pool, { boxIds: palletBoxIds }) : [],
    ]);

    const history = buildInventoryHistoryByTask(
      [...shelfEvents, ...palletEvents, ...shelfBoxEvents, ...palletBoxEvents],
      overview
    );

    res.json({
      node: serializeInventoryNodeSummary(selectedNode),
      history,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Dynamic routes ───────────────────────────────────────────────────────────

// GET /api/tasks/:id
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const task = await pool.query(
      `SELECT t.*,
              e.full_name as employee_name,
              s.code as shelf_code, s.name as shelf_name, s.barcode_value as shelf_barcode,
              r.name as rack_name, r.code as rack_code,
              COALESCE(w.name, pw.name) as warehouse_name,
              pa.name as pallet_name, pa.number as pallet_number, pa.barcode_value as pallet_barcode,
              pr.name as pallet_row_name, pr.number as pallet_row_number,
              COALESCE(sbx.id, bx.id) as box_id,
              CASE WHEN sbx.id IS NOT NULL THEN 'shelf' WHEN bx.id IS NOT NULL THEN 'pallet' ELSE NULL END as box_location_type,
              COALESCE(sbx.barcode_value, bx.barcode_value) as box_barcode,
              COALESCE(sbx.quantity, bx.quantity) as box_quantity,
              COALESCE(sbp.name, bp.name) as box_product_name,
              COALESCE(sbp.code, bp.code) as box_product_code
       FROM inventory_tasks_s t
       LEFT JOIN employees_s e ON e.id = t.employee_id
       LEFT JOIN shelves_s s ON s.id = t.shelf_id
       LEFT JOIN racks_s r ON r.id = s.rack_id
       LEFT JOIN warehouses_s w ON w.id = r.warehouse_id
       LEFT JOIN shelf_boxes_s sbx ON sbx.id = t.target_shelf_box_id
       LEFT JOIN products_s sbp ON sbp.id = sbx.product_id
       LEFT JOIN boxes_s bx ON bx.id = t.target_box_id
       LEFT JOIN products_s bp ON bp.id = bx.product_id
       LEFT JOIN pallets_s pa ON pa.id = COALESCE(t.target_pallet_id, bx.pallet_id)
       LEFT JOIN pallet_rows_s pr ON pr.id = pa.row_id
       LEFT JOIN warehouses_s pw ON pw.id = pr.warehouse_id
       WHERE t.id = $1`,
      [req.params.id]
    );
    if (!task.rows.length) return res.status(404).json({ error: 'Задача не найдена' });

    if (req.user.role === 'employee' && task.rows[0].employee_id !== req.user.employee_id) {
      return res.status(403).json({ error: 'Нет доступа' });
    }

    const t = task.rows[0];
    const taskBoxes = await getTaskBoxRows(pool, req.params.id);
    const completedTaskBoxes = taskBoxes.filter(row => row.status === 'completed').length;
    const activeTaskBox = taskBoxes.find(row => row.status === 'in_progress') || null;

    // For completed tasks, don't tag (scans already tagged). For active — tag untagged.
    if (t.shelf_id && t.status === 'in_progress') {
      await pool.query(
        `UPDATE inventory_task_scans_s SET shelf_id = $1 WHERE task_id = $2 AND shelf_id IS NULL`,
        [t.shelf_id, req.params.id]
      );
    }

    // For multi-shelf tasks, only show scans for current shelf
    const isMultiShelf = t.shelf_ids && Array.isArray(t.shelf_ids) && t.shelf_ids.length > 1;
    const shelfFilter = isMultiShelf && t.shelf_id ? `AND sc.shelf_id = ${parseInt(t.shelf_id)}` : '';

    const scans = await pool.query(
      `SELECT
         sc.product_id,
         p.name as product_name, p.code as product_code,
         p.production_barcode, p.barcode_list,
         SUM(sc.quantity_delta) as total_quantity,
         COUNT(*) as scan_count,
         MAX(sc.created_at) as last_scan_at
       FROM inventory_task_scans_s sc
       LEFT JOIN products_s p ON p.id = sc.product_id
       WHERE sc.task_id = $1 AND sc.product_id IS NOT NULL ${shelfFilter}
       GROUP BY sc.product_id, p.name, p.code, p.production_barcode, p.barcode_list
       ORDER BY MAX(sc.created_at) DESC`,
      [req.params.id]
    );

    res.json({
      ...t,
      scans: scans.rows,
      task_boxes: taskBoxes,
      task_boxes_total: taskBoxes.length,
      task_boxes_completed: completedTaskBoxes,
      active_task_box: activeTaskBox,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tasks/:id/analytics — per-task detailed analytics
router.get('/:id/analytics', requireAuth, async (req, res) => {
  try {
    const taskId = parseInt(req.params.id);

    const { rows: [task] } = await pool.query(`
      SELECT t.*,
             e.full_name as employee_name,
             s.code as shelf_code, s.name as shelf_name,
             r.name as rack_name,
             pa.name as pallet_name, pa.number as pallet_number, pa.barcode_value as pallet_barcode,
             pr.name as pallet_row_name, pr.number as pallet_row_number,
             COALESCE(sbx.id, bx.id) as box_id,
             CASE WHEN sbx.id IS NOT NULL THEN 'shelf' WHEN bx.id IS NOT NULL THEN 'pallet' ELSE NULL END as box_location_type,
             COALESCE(sbx.barcode_value, bx.barcode_value) as box_barcode,
             COALESCE(sbx.quantity, bx.quantity) as box_quantity,
             COALESCE(sbp.name, bp.name) as box_product_name,
             COALESCE(sbp.code, bp.code) as box_product_code,
             ROUND(EXTRACT(EPOCH FROM (t.completed_at - t.started_at))::numeric) as duration_seconds
      FROM inventory_tasks_s t
      LEFT JOIN employees_s e ON e.id = t.employee_id
      LEFT JOIN shelves_s s ON s.id = t.shelf_id
      LEFT JOIN racks_s r ON r.id = s.rack_id
      LEFT JOIN shelf_boxes_s sbx ON sbx.id = t.target_shelf_box_id
      LEFT JOIN products_s sbp ON sbp.id = sbx.product_id
      LEFT JOIN boxes_s bx ON bx.id = t.target_box_id
      LEFT JOIN products_s bp ON bp.id = bx.product_id
      LEFT JOIN pallets_s pa ON pa.id = COALESCE(t.target_pallet_id, bx.pallet_id)
      LEFT JOIN pallet_rows_s pr ON pr.id = pa.row_id
      WHERE t.id = $1
    `, [taskId]);

    if (!task) return res.status(404).json({ error: 'Задача не найдена' });

    if (req.user.role === 'employee' && task.employee_id !== req.user.employee_id) {
      return res.status(403).json({ error: 'Нет доступа' });
    }

    const taskBoxes = await getTaskBoxRows(pool, taskId);
    const activeTaskBox = taskBoxes.find(row => row.status === 'in_progress') || null;

    // Tag untagged scans with current shelf before filtering
    if (task.shelf_id) {
      await pool.query(
        `UPDATE inventory_task_scans_s SET shelf_id = $1 WHERE task_id = $2 AND shelf_id IS NULL`,
        [task.shelf_id, taskId]
      );
    }

    // All scans with timestamps and gap from previous scan
    // For multi-shelf tasks, filter by current shelf_id
    const currentShelfId = task.shelf_id;
    const hasShelfFilter = task.shelf_ids && Array.isArray(task.shelf_ids) && task.shelf_ids.length > 1;

    const { rows: scans } = await pool.query(`
      SELECT
        sc.id,
        sc.task_box_id,
        sc.scanned_value,
        sc.quantity_delta,
        sc.created_at,
        p.name as product_name,
        p.code as product_code,
        ROUND(EXTRACT(EPOCH FROM (
          sc.created_at - LAG(sc.created_at) OVER (ORDER BY sc.created_at)
        ))::numeric, 1) as seconds_since_prev
      FROM inventory_task_scans_s sc
      LEFT JOIN products_s p ON p.id = sc.product_id
      WHERE sc.task_id = $1
        AND sc.product_id IS NOT NULL
        ${hasShelfFilter && currentShelfId ? `AND (sc.shelf_id = ${parseInt(currentShelfId)} OR sc.shelf_id IS NULL)` : ''}
      ORDER BY sc.created_at ASC
    `, [taskId]);

    const { rows: errors } = await pool.query(
      'SELECT * FROM scan_errors_s WHERE task_id = $1 ORDER BY created_at ASC',
      [taskId]
    );

    // Scans per minute histogram
    const { rows: perMinute } = await pool.query(`
      SELECT
        FLOOR(EXTRACT(EPOCH FROM (sc.created_at - t.started_at))/60)::int as minute_offset,
        COUNT(*) as scan_count
      FROM inventory_task_scans_s sc
      JOIN inventory_tasks_s t ON t.id = sc.task_id
      WHERE sc.task_id = $1 AND t.started_at IS NOT NULL AND sc.product_id IS NOT NULL
      GROUP BY minute_offset
      ORDER BY minute_offset
    `, [taskId]);

    // For packaging tasks also return boxes
    let boxes = [];
    if (task.task_type === 'packaging') {
      const { rows: bxs } = await pool.query(`
        SELECT b.*, p.name as product_name, p.code as product_code,
               pa.name as pallet_name, pa.number as pallet_number,
               pr.name as row_name, pr.number as row_number
        FROM boxes_s b
        LEFT JOIN products_s p ON p.id = b.product_id
        LEFT JOIN pallets_s pa ON pa.id = b.pallet_id
        LEFT JOIN pallet_rows_s pr ON pr.id = pa.row_id
        WHERE b.task_id = $1
        ORDER BY b.created_at ASC
      `, [taskId]);
      boxes = bxs;
    }

    res.json({
      task,
      scans,
      errors,
      perMinute,
      boxes,
      task_boxes: taskBoxes,
      active_task_box: activeTaskBox,
      task_boxes_total: taskBoxes.length,
      task_boxes_completed: taskBoxes.filter(row => row.status === 'completed').length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tasks
router.post('/', requireAuth, requireAdminOrManager, async (req, res) => {
  const {
    title,
    employee_id,
    shelf_id,
    shelf_ids,
    notes,
    task_type,
    product_id,
    box_size,
    target_pallet_id,
    target_box_id,
    target_shelf_box_id,
    target_box_ids,
    target_shelf_box_ids,
  } = req.body;
  if (!title) return res.status(400).json({ error: 'Название задачи обязательно' });
  const client = await pool.connect();
  try {
    const palletBoxIds = Array.isArray(target_box_ids) ? target_box_ids.map(Number).filter(Boolean) : [];
    const shelfBoxIds = Array.isArray(target_shelf_box_ids) ? target_shelf_box_ids.map(Number).filter(Boolean) : [];

    if ((task_type || 'inventory') === 'inventory'
      && !shelf_id
      && !target_pallet_id
      && !target_box_id
      && !target_shelf_box_id
      && !(shelf_ids?.length)
      && palletBoxIds.length === 0
      && shelfBoxIds.length === 0) {
      return res.status(400).json({ error: 'Для инвентаризации выберите полку, паллет или коробку' });
    }

    await client.query('BEGIN');

    // ─── Check: target not already in active task ──────────────────
    const activeStatuses = ['new', 'in_progress'];
    const allShelfIds = shelf_ids?.length ? shelf_ids.map(Number).filter(Boolean) : (shelf_id ? [Number(shelf_id)] : []);

    if (allShelfIds.length > 0) {
      const busyShelf = await client.query(
        `SELECT t.id, t.title, t.status, s.name as shelf_name, r.name as rack_name
         FROM inventory_tasks_s t
         LEFT JOIN shelves_s s ON s.id = t.shelf_id
         LEFT JOIN racks_s r ON r.id = s.rack_id
         WHERE t.shelf_id = ANY($1)
           AND t.status = ANY($2)
         LIMIT 1`,
        [allShelfIds, activeStatuses]
      );
      if (busyShelf.rows.length) {
        const b = busyShelf.rows[0];
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: `Полка "${b.rack_name ? b.rack_name + ' · ' : ''}${b.shelf_name}" уже в задаче #${b.id} "${b.title}" (${b.status === 'new' ? 'новая' : 'в работе'})`,
        });
      }
    }

    if (target_pallet_id) {
      const busyPallet = await client.query(
        `SELECT t.id, t.title, t.status
         FROM inventory_tasks_s t
         WHERE t.target_pallet_id = $1
           AND t.status = ANY($2)
         LIMIT 1`,
        [target_pallet_id, activeStatuses]
      );
      if (busyPallet.rows.length) {
        const b = busyPallet.rows[0];
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: `Паллет уже в задаче #${b.id} "${b.title}" (${b.status === 'new' ? 'новая' : 'в работе'})`,
        });
      }
    }

    if (palletBoxIds.length > 0) {
      const busyBox = await client.query(
        `SELECT itb.task_id, t.title, t.status, b.barcode_value
         FROM inventory_task_boxes_s itb
         JOIN inventory_tasks_s t ON t.id = itb.task_id
         LEFT JOIN boxes_s b ON b.id = itb.box_id
         WHERE itb.box_id = ANY($1)
           AND t.status = ANY($2)
         LIMIT 1`,
        [palletBoxIds, activeStatuses]
      );
      if (busyBox.rows.length) {
        const b = busyBox.rows[0];
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: `Коробка ${b.barcode_value || ''} уже в задаче #${b.task_id} "${b.title}" (${b.status === 'new' ? 'новая' : 'в работе'})`,
        });
      }
    }

    if (shelfBoxIds.length > 0) {
      const busyShelfBox = await client.query(
        `SELECT itb.task_id, t.title, t.status, sb.barcode_value
         FROM inventory_task_boxes_s itb
         JOIN inventory_tasks_s t ON t.id = itb.task_id
         LEFT JOIN shelf_boxes_s sb ON sb.id = itb.shelf_box_id
         WHERE itb.shelf_box_id = ANY($1)
           AND t.status = ANY($2)
         LIMIT 1`,
        [shelfBoxIds, activeStatuses]
      );
      if (busyShelfBox.rows.length) {
        const b = busyShelfBox.rows[0];
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: `Коробка ${b.barcode_value || ''} уже в задаче #${b.task_id} "${b.title}" (${b.status === 'new' ? 'новая' : 'в работе'})`,
        });
      }
    }

    if (target_box_id) {
      const busyTargetBox = await client.query(
        `SELECT t.id, t.title, t.status
         FROM inventory_tasks_s t
         WHERE t.target_box_id = $1
           AND t.status = ANY($2)
         LIMIT 1`,
        [target_box_id, activeStatuses]
      );
      if (busyTargetBox.rows.length) {
        const b = busyTargetBox.rows[0];
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: `Коробка уже в задаче #${b.id} "${b.title}" (${b.status === 'new' ? 'новая' : 'в работе'})`,
        });
      }
    }

    if (target_shelf_box_id) {
      const busyTargetShelfBox = await client.query(
        `SELECT t.id, t.title, t.status
         FROM inventory_tasks_s t
         WHERE t.target_shelf_box_id = $1
           AND t.status = ANY($2)
         LIMIT 1`,
        [target_shelf_box_id, activeStatuses]
      );
      if (busyTargetShelfBox.rows.length) {
        const b = busyTargetShelfBox.rows[0];
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: `Коробка на полке уже в задаче #${b.id} "${b.title}" (${b.status === 'new' ? 'новая' : 'в работе'})`,
        });
      }
    }

    // If shelf_ids provided, use first as shelf_id and store full list
    let effectiveShelfId = shelf_ids?.length ? shelf_ids[0] : (shelf_id || null);
    const effectiveShelfIds = shelf_ids?.length ? JSON.stringify(shelf_ids) : null;
    let effectivePalletId = target_pallet_id || null;

    if ((target_box_id || palletBoxIds.length > 0) && !effectivePalletId) {
      const primaryBoxId = target_box_id || palletBoxIds[0];
      const boxResult = await client.query('SELECT pallet_id FROM boxes_s WHERE id = $1', [primaryBoxId]);
      if (!boxResult.rows.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Коробка не найдена' });
      }
      effectivePalletId = boxResult.rows[0].pallet_id || null;
    }

    if ((target_shelf_box_id || shelfBoxIds.length > 0) && !effectiveShelfId) {
      const primaryBoxId = target_shelf_box_id || shelfBoxIds[0];
      const boxResult = await client.query('SELECT shelf_id FROM shelf_boxes_s WHERE id = $1', [primaryBoxId]);
      if (!boxResult.rows.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Коробка на полке не найдена' });
      }
      effectiveShelfId = boxResult.rows[0].shelf_id || null;
    }

    const result = await client.query(
      `INSERT INTO inventory_tasks_s (title, employee_id, shelf_id, shelf_ids, current_shelf_index, notes, created_by, task_type, product_id, box_size, target_pallet_id, target_box_id, target_shelf_box_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [title, employee_id || null, effectiveShelfId, effectiveShelfIds, 0, notes || null, req.user.id, task_type || 'inventory', product_id || null, box_size || null, effectivePalletId, target_box_id || null, target_shelf_box_id || null]
    );

    const taskId = result.rows[0].id;

    for (let i = 0; i < palletBoxIds.length; i += 1) {
      await client.query(
        `INSERT INTO inventory_task_boxes_s (task_id, box_id, sort_order)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [taskId, palletBoxIds[i], i]
      );
    }

    for (let i = 0; i < shelfBoxIds.length; i += 1) {
      await client.query(
        `INSERT INTO inventory_task_boxes_s (task_id, shelf_box_id, sort_order)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [taskId, shelfBoxIds[i], i]
      );
    }

    await client.query('COMMIT');
    res.status(201).json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// POST /api/tasks/:id/next-shelf — finish current shelf inventory + move to next shelf
router.post('/:id/next-shelf', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const taskId = req.params.id;

    const t = await client.query('SELECT * FROM inventory_tasks_s WHERE id=$1', [taskId]);
    if (!t.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Задача не найдена' }); }
    const task = t.rows[0];

    if (task.status !== 'in_progress') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Задача не в работе' });
    }

    const shelfIds = task.shelf_ids;
    if (!shelfIds || !Array.isArray(shelfIds) || shelfIds.length <= 1) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Это задача с одной полкой' });
    }

    const currentShelfId = task.shelf_id;
    const nextIndex = (task.current_shelf_index || 0) + 1;

    if (nextIndex >= shelfIds.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Все полки пройдены', allDone: true });
    }

    // 1. Tag any untagged scans with current shelf_id
    if (currentShelfId) {
      await client.query(
        `UPDATE inventory_task_scans_s SET shelf_id = $1 WHERE task_id = $2 AND shelf_id IS NULL`,
        [currentShelfId, taskId]
      );
    }

    // 2. Apply inventory results for CURRENT shelf (same logic as /complete)
    if (currentShelfId) {
      const scanTotals = await client.query(
        `SELECT product_id, SUM(quantity_delta) as total_qty
         FROM inventory_task_scans_s
         WHERE task_id = $1 AND product_id IS NOT NULL AND shelf_id = $2
         GROUP BY product_id`,
        [taskId, currentShelfId]
      );

      // If no scans have shelf_id, try without shelf_id filter (backward compat)
      let scans = scanTotals.rows;
      if (scans.length === 0) {
        const fallback = await client.query(
          `SELECT product_id, SUM(quantity_delta) as total_qty
           FROM inventory_task_scans_s
           WHERE task_id = $1 AND product_id IS NOT NULL
           GROUP BY product_id`,
          [taskId]
        );
        scans = fallback.rows;
      }

      for (const row of scans) {
        const current = await client.query(
          'SELECT quantity FROM shelf_items_s WHERE shelf_id=$1 AND product_id=$2',
          [currentShelfId, row.product_id]
        );
        const prevQty = current.rows.length ? parseFloat(current.rows[0].quantity) : 0;
        const newQty = parseFloat(row.total_qty);

        await client.query(
          `INSERT INTO shelf_items_s (shelf_id, product_id, quantity, updated_by, updated_at)
           VALUES ($1,$2,$3,$4,NOW())
           ON CONFLICT (shelf_id, product_id) DO UPDATE SET quantity=$3, updated_by=$4, updated_at=NOW()`,
          [currentShelfId, row.product_id, newQty, req.user.id]
        );

        await client.query(
          `INSERT INTO shelf_movements_s (shelf_id, product_id, operation_type, quantity_before, quantity_after, quantity_delta, user_id, task_id)
           VALUES ($1,$2,'inventory',$3,$4,$5,$6,$7)`,
          [currentShelfId, row.product_id, prevQty, newQty, newQty - prevQty, req.user.id, taskId]
        );

        // Log to movements_s
        if (newQty !== prevQty) {
          await client.query(
            `INSERT INTO movements_s (movement_type, product_id, quantity, to_shelf_id, performed_by, source, notes, quantity_before, quantity_after)
             VALUES ($1,$2,$3,$4,$5,'task',$6,$7,$8)`,
            [newQty > prevQty ? 'edit_add_to_shelf' : 'edit_remove_from_shelf',
             row.product_id, Math.abs(newQty - prevQty), currentShelfId, req.user.id,
             'Инвентаризация (переход к след. полке)', prevQty, newQty]
          );
        }
      }
    }

    // 2. Switch to next shelf
    const nextShelfId = shelfIds[nextIndex];
    await client.query(
      `UPDATE inventory_tasks_s SET shelf_id=$1, current_shelf_index=$2, updated_at=NOW() WHERE id=$3`,
      [nextShelfId, nextIndex, taskId]
    );

    await client.query('COMMIT');

    const shelf = await pool.query(
      `SELECT s.id, s.code, s.name, s.barcode_value, r.name as rack_name, r.code as rack_code
       FROM shelves_s s LEFT JOIN racks_s r ON r.id = s.rack_id WHERE s.id=$1`, [nextShelfId]);
    res.json({ success: true, nextIndex, totalShelves: shelfIds.length, shelf: shelf.rows[0] || null });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// PUT /api/tasks/:id
router.put('/:id', requireAuth, requireAdminOrManager, async (req, res) => {
  const { title, employee_id, shelf_id, notes, status } = req.body;
  try {
    const result = await pool.query(
      `UPDATE inventory_tasks_s
       SET title=COALESCE($1,title),
           employee_id=COALESCE($2,employee_id),
           shelf_id=COALESCE($3,shelf_id),
           notes=COALESCE($4,notes),
           status=COALESCE($5,status)
       WHERE id=$6 RETURNING *`,
      [title, employee_id, shelf_id, notes, status, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Задача не найдена' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/tasks/:id
router.delete('/:id', requireAuth, requireAdminOrManager, async (req, res) => {
  try {
    await pool.query('DELETE FROM inventory_tasks_s WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tasks/:id/start — employee starts task
// For inventory tasks: must scan shelf barcode
// For production_transfer tasks: must scan pallet barcode
router.post('/:id/start', requireAuth, async (req, res) => {
  const { shelf_barcode, pallet_barcode, box_barcode } = req.body;
  try {
    const task = await pool.query(
      `SELECT t.*,
              s.barcode_value as shelf_barcode_expected,
              pa.barcode_value as pallet_barcode_expected,
              bx.barcode_value as box_barcode_expected,
              sbx.barcode_value as shelf_box_barcode_expected
       FROM inventory_tasks_s t
       LEFT JOIN shelves_s s ON s.id = t.shelf_id
       LEFT JOIN pallets_s pa ON pa.id = t.target_pallet_id
       LEFT JOIN boxes_s bx ON bx.id = t.target_box_id
       LEFT JOIN shelf_boxes_s sbx ON sbx.id = t.target_shelf_box_id
       WHERE t.id = $1`,
      [req.params.id]
    );
    if (!task.rows.length) return res.status(404).json({ error: 'Задача не найдена' });

    const t = task.rows[0];
    const taskBoxesResult = await pool.query(
      `SELECT tb.id, tb.status,
              COALESCE(sbx.barcode_value, bx.barcode_value) as box_barcode,
              CASE WHEN sbx.id IS NOT NULL THEN 'shelf' ELSE 'pallet' END as box_location_type
       FROM inventory_task_boxes_s tb
       LEFT JOIN shelf_boxes_s sbx ON sbx.id = tb.shelf_box_id
       LEFT JOIN boxes_s bx ON bx.id = tb.box_id
       WHERE tb.task_id = $1
       ORDER BY tb.sort_order, tb.id`,
      [req.params.id]
    );
    const taskBoxes = taskBoxesResult.rows;
    const hasTaskBoxQueue = taskBoxes.length > 0;

    if (req.user.role === 'employee' && t.employee_id !== req.user.employee_id) {
      return res.status(403).json({ error: 'Нет доступа' });
    }
    if (t.status !== 'new' && t.status !== 'in_progress') {
      return res.status(400).json({ error: 'Задача уже завершена' });
    }
    const alreadyStarted = t.status === 'in_progress';

    // For new pallet inventory tasks — validate pallet barcode first, even if task boxes exist
    if (!alreadyStarted && t.task_type === 'inventory' && t.target_pallet_id && !t.shelf_id && !t.target_box_id && !t.target_shelf_box_id) {
      const trimmed = (pallet_barcode || '').trim();
      if (!trimmed) {
        return res.status(400).json({ error: 'Необходимо отсканировать штрих-код паллета' });
      }
      if (t.pallet_barcode_expected !== trimmed) {
        return res.status(400).json({ error: 'Штрих-код не совпадает с назначенным паллетом.' });
      }
      await pool.query(
        'UPDATE inventory_tasks_s SET status=$1, started_at=NOW() WHERE id=$2',
        ['in_progress', req.params.id]
      );
      // If pallet uses boxes and no task boxes exist yet, auto-create them
      if (!hasTaskBoxQueue) {
        const palletCheck = await pool.query('SELECT uses_boxes FROM pallets_s WHERE id=$1', [t.target_pallet_id]);
        if (palletCheck.rows[0]?.uses_boxes) {
          const palletBoxes = await pool.query(
            'SELECT id FROM boxes_s WHERE pallet_id=$1 ORDER BY id', [t.target_pallet_id]
          );
          let sortOrder = 1;
          for (const box of palletBoxes.rows) {
            await pool.query(
              `INSERT INTO inventory_task_boxes_s (task_id, box_id, shelf_box_id, sort_order, status)
               VALUES ($1, $2, NULL, $3, 'pending')
               ON CONFLICT DO NOTHING`,
              [req.params.id, box.id, sortOrder++]
            );
          }
        }
      }
    } else if (hasTaskBoxQueue) {
      const trimmed = (box_barcode || '').trim();
      if (!trimmed) {
        return res.status(400).json({ error: 'Необходимо отсканировать штрих-код коробки' });
      }

      const matchedBox = taskBoxes.find(box => box.box_barcode === trimmed);
      if (!matchedBox) {
        return res.status(400).json({ error: 'Эта коробка не входит в назначенную инвентаризацию.' });
      }
      if (matchedBox.status === 'completed') {
        return res.status(400).json({ error: 'Эта коробка уже завершена в этой задаче.' });
      }

      const activeBox = taskBoxes.find(box => box.status === 'in_progress');
      if (activeBox && activeBox.id !== matchedBox.id) {
        return res.status(400).json({ error: `Сначала завершите текущую коробку ${activeBox.box_barcode}.` });
      }

      if (!alreadyStarted) {
        await pool.query(
          'UPDATE inventory_tasks_s SET status = $1, started_at = NOW() WHERE id = $2',
          ['in_progress', req.params.id]
        );
      }

      if (matchedBox.status !== 'in_progress') {
        await pool.query(
          `UPDATE inventory_task_boxes_s
           SET status = 'in_progress',
               started_at = COALESCE(started_at, NOW())
           WHERE id = $1`,
          [matchedBox.id]
        );
      }
    } else if (t.task_type === 'production_transfer') {
      // Must scan pallet barcode
      const trimmed = (pallet_barcode || '').trim();
      if (!trimmed) {
        return res.status(400).json({ error: 'Необходимо отсканировать штрих-код паллета' });
      }
      const palletRow = await pool.query(
        'SELECT id FROM pallets_s WHERE barcode_value = $1', [trimmed]
      );
      if (!palletRow.rows.length) {
        return res.status(400).json({ error: 'Паллет с таким штрих-кодом не найден' });
      }
      const palletId = palletRow.rows[0].id;
      await pool.query(
        'UPDATE inventory_tasks_s SET status=$1, started_at=NOW(), target_pallet_id=$2 WHERE id=$3',
        ['in_progress', palletId, req.params.id]
      );
    } else if (t.task_type === 'inventory' && (t.target_box_id || t.target_shelf_box_id)) {
      const trimmed = (box_barcode || '').trim();
      if (!trimmed) {
        return res.status(400).json({ error: 'Необходимо отсканировать штрих-код коробки' });
      }
      const expectedBoxBarcode = t.target_shelf_box_id ? t.shelf_box_barcode_expected : t.box_barcode_expected;
      if (expectedBoxBarcode !== trimmed) {
        return res.status(400).json({ error: 'Штрих-код не совпадает с назначенной коробкой.' });
      }
      if (!alreadyStarted) {
        await pool.query(
          'UPDATE inventory_tasks_s SET status=$1, started_at=NOW() WHERE id=$2',
          ['in_progress', req.params.id]
        );
      }
    } else if (t.task_type === 'inventory' && t.target_pallet_id && !t.shelf_id) {
      const trimmed = (pallet_barcode || '').trim();
      if (!trimmed) {
        return res.status(400).json({ error: 'Необходимо отсканировать штрих-код паллета' });
      }
      if (t.pallet_barcode_expected !== trimmed) {
        return res.status(400).json({ error: 'Штрих-код не совпадает с назначенным паллетом.' });
      }
      if (!alreadyStarted) {
          await pool.query(
            'UPDATE inventory_tasks_s SET status=$1, started_at=NOW() WHERE id=$2',
            ['in_progress', req.params.id]
          );

          // If pallet uses boxes, auto-create task boxes for all boxes on this pallet
          const palletCheck = await pool.query('SELECT uses_boxes FROM pallets_s WHERE id=$1', [t.target_pallet_id]);
          if (palletCheck.rows[0]?.uses_boxes) {
            const palletBoxes = await pool.query(
              'SELECT id FROM boxes_s WHERE pallet_id=$1 ORDER BY id', [t.target_pallet_id]
            );
            let sortOrder = 1;
            for (const box of palletBoxes.rows) {
              await pool.query(
                `INSERT INTO inventory_task_boxes_s (task_id, box_id, shelf_box_id, sort_order, status)
                 VALUES ($1, $2, NULL, $3, 'pending')
                 ON CONFLICT DO NOTHING`,
                [req.params.id, box.id, sortOrder++]
              );
            }
            // task_boxes_total is computed from inventory_task_boxes_s count, no need to update
          }
      }
    } else {
      // inventory / default: validate shelf barcode if task has a shelf
      if (t.shelf_id) {
        if (!shelf_barcode || !shelf_barcode.trim()) {
          return res.status(400).json({ error: 'Необходимо отсканировать штрих-код полки' });
        }
        const trimmed = shelf_barcode.trim();

        // Reject rack barcodes
        const rackCheck = await pool.query(
          'SELECT id FROM racks_s WHERE barcode_value = $1', [trimmed]
        );
        if (rackCheck.rows.length > 0) {
          return res.status(400).json({ error: 'Это штрих-код стеллажа. Отсканируйте штрих-код полки.' });
        }

        if (t.shelf_barcode_expected !== trimmed) {
          return res.status(400).json({ error: 'Штрих-код не совпадает с назначенной полкой.' });
        }
      }
      if (!alreadyStarted) {
        await pool.query(
          'UPDATE inventory_tasks_s SET status=$1, started_at=NOW() WHERE id=$2',
          ['in_progress', req.params.id]
        );
      }
      // If already started (multi-shelf continuation), just validate — no status change needed
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tasks/:id/scan — scan a product barcode
router.post('/:id/scan', requireAuth, async (req, res) => {
  const { scanned_value, quantity_delta = 1 } = req.body;
  if (!scanned_value) return res.status(400).json({ error: 'scanned_value обязателен' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const taskId = req.params.id;

    const task = await client.query(
      'SELECT * FROM inventory_tasks_s WHERE id = $1', [taskId]
    );
    if (!task.rows.length) return res.status(404).json({ error: 'Задача не найдена' });

    const t = task.rows[0];
    const taskBoxes = await client.query(
      `SELECT tb.id, tb.status,
              COALESCE(sbx.barcode_value, bx.barcode_value) as box_barcode
       FROM inventory_task_boxes_s tb
       LEFT JOIN shelf_boxes_s sbx ON sbx.id = tb.shelf_box_id
       LEFT JOIN boxes_s bx ON bx.id = tb.box_id
       WHERE tb.task_id = $1
       ORDER BY tb.sort_order, tb.id`,
      [taskId]
    );
    const activeTaskBox = taskBoxes.rows.find(row => row.status === 'in_progress') || null;
    const hasTaskBoxQueue = taskBoxes.rows.length > 0;

    if (req.user.role === 'employee' && t.employee_id !== req.user.employee_id) {
      return res.status(403).json({ error: 'Нет доступа' });
    }
    if (t.status !== 'in_progress') {
      return res.status(400).json({ error: 'Задача не в состоянии "в работе"' });
    }
    if (hasTaskBoxQueue && !activeTaskBox) {
      return res.status(400).json({ error: 'Сначала отсканируйте коробку из этой инвентаризации.' });
    }

    // Find product — check ALL barcode fields
    const product = await client.query(
      `SELECT id, external_id, name, code, production_barcode
       FROM products_s
       WHERE $1 = ANY(string_to_array(barcode_list, ';'))
          OR production_barcode = $1
          OR marketplace_barcodes_json @> jsonb_build_array(jsonb_build_object('value', $1))
       LIMIT 1`,
      [scanned_value]
    );

    const productRow = product.rows[0] || null;
    if (!productRow) {
      const errorResult = await client.query(
        `INSERT INTO scan_errors_s (task_id, task_box_id, scanned_value, employee_note, user_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [taskId, activeTaskBox?.id || null, scanned_value, null, req.user.id]
      );
      await client.query('COMMIT');
      return res.json({ found: false, scanned_value, error_id: errorResult.rows[0].id });
    }

    const scanInsert = await client.query(
      `INSERT INTO inventory_task_scans_s (task_id, task_box_id, product_id, product_external_id, scanned_value, quantity_delta, shelf_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id`,
      [taskId, activeTaskBox?.id || null, productRow.id, productRow.external_id || null, scanned_value, parseFloat(quantity_delta), t.shelf_id || null]
    );

    const reward = await awardInventoryScanReward(client, {
      task: { ...t, id: Number(taskId) },
      taskScanId: scanInsert.rows[0].id,
      activeTaskBox,
      productId: productRow.id,
      quantityDelta: parseFloat(quantity_delta),
      user: req.user,
    });

    await client.query('COMMIT');
    res.json({ found: true, product: productRow, quantity_delta: parseFloat(quantity_delta), reward: reward || undefined });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// POST /api/tasks/:id/report-error — employee reports unknown barcode
router.post('/:id/report-error', requireAuth, async (req, res) => {
  const { scanned_value, employee_note, error_id } = req.body;
  if (!scanned_value) return res.status(400).json({ error: 'scanned_value обязателен' });
  try {
    if (error_id) {
      const updated = await pool.query(
        `UPDATE scan_errors_s
         SET employee_note = COALESCE($1, employee_note)
         WHERE id = $2 AND task_id = $3
         RETURNING *`,
        [employee_note || null, error_id, req.params.id]
      );
      if (updated.rows.length) return res.json(updated.rows[0]);
    }
    const result = await pool.query(
      `INSERT INTO scan_errors_s (task_id, task_box_id, scanned_value, employee_note, user_id)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.params.id, null, scanned_value, employee_note || null, req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tasks/:id/abandon-box — exit current box without completing
router.post('/:id/abandon-box', requireAuth, async (req, res) => {
  const { task_box_id } = req.body;
  try {
    if (task_box_id) {
      await pool.query(
        `UPDATE inventory_task_boxes_s SET status = 'pending', started_at = NULL WHERE id = $1 AND task_id = $2`,
        [task_box_id, req.params.id]
      );
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/tasks/:id/complete
router.post('/:id/complete', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const taskId = req.params.id;

    const task = await client.query(
      'SELECT * FROM inventory_tasks_s WHERE id = $1', [taskId]
    );
    if (!task.rows.length) return res.status(404).json({ error: 'Задача не найдена' });
    const t = task.rows[0];

    if (req.user.role === 'employee' && t.employee_id !== req.user.employee_id) {
      return res.status(403).json({ error: 'Нет доступа' });
    }
    if (t.status !== 'in_progress') {
      return res.status(400).json({ error: 'Задача не в состоянии "в работе"' });
    }

    const taskBoxes = await getTaskBoxRows(client, taskId);
    if (taskBoxes.length > 0) {
      const activeTaskBox = taskBoxes.find(row => row.status === 'in_progress');
      if (!activeTaskBox) {
        return res.status(400).json({ error: 'Сначала отсканируйте следующую коробку из этой задачи.' });
      }

      if (activeTaskBox.shelf_box_id) {
        await applyInventoryToShelfBox(client, activeTaskBox.shelf_box_id, t.shelf_id, taskId, req.user.id, activeTaskBox.id);
      } else {
        await applyInventoryToBox(client, activeTaskBox.box_id, t.target_pallet_id, taskId, req.user.id, activeTaskBox.id);
      }

      await client.query(
        `UPDATE inventory_task_boxes_s
         SET status = 'completed',
             completed_at = NOW()
         WHERE id = $1`,
        [activeTaskBox.id]
      );

      const progressResult = await client.query(
        `SELECT
           COUNT(*) as total_count,
           COUNT(*) FILTER (WHERE status = 'completed') as completed_count
         FROM inventory_task_boxes_s
         WHERE task_id = $1`,
        [taskId]
      );
      const totalCount = Number(progressResult.rows[0]?.total_count || 0);
      const completedCount = Number(progressResult.rows[0]?.completed_count || 0);
      const taskCompleted = totalCount > 0 && completedCount >= totalCount;

      if (taskCompleted) {
        await client.query(
          'UPDATE inventory_tasks_s SET status = $1, completed_at = NOW() WHERE id = $2',
          ['completed', taskId]
        );
      }

      await client.query('COMMIT');
      return res.json({
        success: true,
        box_completed: true,
        task_completed: taskCompleted,
        completed_boxes: completedCount,
        total_boxes: totalCount,
        next_box_required: !taskCompleted,
      });
    }

    if (t.target_shelf_box_id) {
      await applyInventoryToShelfBox(client, t.target_shelf_box_id, t.shelf_id, taskId, req.user.id);
    } else if (t.target_box_id) {
      await applyInventoryToBox(client, t.target_box_id, t.target_pallet_id, taskId, req.user.id);
    } else if (t.shelf_id) {
      // Tag untagged scans with current shelf
      await client.query(
        `UPDATE inventory_task_scans_s SET shelf_id = $1 WHERE task_id = $2 AND shelf_id IS NULL`,
        [t.shelf_id, taskId]
      );

      // For multi-shelf tasks, only count scans for the CURRENT shelf
      const isMultiShelf = t.shelf_ids && Array.isArray(t.shelf_ids) && t.shelf_ids.length > 1;
      const shelfFilter = isMultiShelf ? `AND shelf_id = ${parseInt(t.shelf_id)}` : '';

      const scanTotals = await client.query(
        `SELECT product_id, SUM(quantity_delta) as total_qty
         FROM inventory_task_scans_s
         WHERE task_id = $1 AND product_id IS NOT NULL ${shelfFilter}
         GROUP BY product_id`,
        [taskId]
      );

      for (const row of scanTotals.rows) {
        const current = await client.query(
          'SELECT quantity FROM shelf_items_s WHERE shelf_id=$1 AND product_id=$2',
          [t.shelf_id, row.product_id]
        );
        const prevQty = current.rows.length ? parseFloat(current.rows[0].quantity) : 0;
        const newQty = parseFloat(row.total_qty);

        await client.query(
          `INSERT INTO shelf_items_s (shelf_id, product_id, quantity, updated_by, updated_at)
           VALUES ($1,$2,$3,$4,NOW())
           ON CONFLICT (shelf_id, product_id) DO UPDATE SET quantity=$3, updated_by=$4, updated_at=NOW()`,
          [t.shelf_id, row.product_id, newQty, req.user.id]
        );

        await client.query(
          `INSERT INTO shelf_movements_s (shelf_id, product_id, operation_type, quantity_before, quantity_after, quantity_delta, user_id, task_id)
           VALUES ($1,$2,'inventory',$3,$4,$5,$6,$7)`,
          [t.shelf_id, row.product_id, prevQty, newQty, newQty - prevQty, req.user.id, taskId]
        );
      }
    } else if (t.target_pallet_id) {
      await applyInventoryToPallet(client, t.target_pallet_id, taskId, req.user.id);
    }

    await client.query(
      'UPDATE inventory_tasks_s SET status=$1, completed_at=NOW() WHERE id=$2',
      ['completed', taskId]
    );

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;

/**
 * techCardImport.js
 *
 * Imports processing plans (тех. карты) from МойСклад API into the local
 * PostgreSQL database, linking them to existing products and upserting
 * raw materials along the way.
 */

const config = require('../config');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const API_BASE = config.moySkladApiBase || 'https://api.moysklad.ru/api/remap/1.2';
const TOKEN = config.moySkladToken || process.env.MOYSKLAD_TOKEN || '';
const PAGE_LIMIT = 100;
const REQUEST_DELAY_MS = 200;
const MAX_RETRIES = 5;
const RETRY_BASE_DELAY_MS = 1500;

const PACKAGING_RE = /банк|крышк|этикетк|мембран|упаковк|коробк|флакон|пакет/i;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractUuid(href) {
  if (!href) return null;
  const parts = href.split('/');
  return parts[parts.length - 1] || null;
}

/**
 * Fetch JSON from МойСклад with retry / rate-limit handling.
 */
async function msGet(url, authToken) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${authToken}`,
        Accept: 'application/json;charset=utf-8',
      },
    });

    const text = await response.text();
    let payload = null;

    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }
    }

    if (response.ok) {
      return payload;
    }

    const errorCode = Number(payload?.errors?.[0]?.code || 0);
    if ((response.status === 429 || errorCode === 1049) && attempt < MAX_RETRIES) {
      const delayMs = RETRY_BASE_DELAY_MS * (attempt + 1);
      console.log(`[techCardImport] Rate-limited (${response.status}), retrying in ${delayMs}ms...`);
      await delay(delayMs);
      continue;
    }

    const message =
      payload?.errors?.[0]?.error || payload?.error || response.statusText || 'Request failed';
    const err = new Error(`[techCardImport] API error: ${message} (${response.status}) — ${url}`);
    err.status = response.status;
    err.body = payload;
    throw err;
  }

  throw new Error(`[techCardImport] Max retries exceeded for ${url}`);
}

/**
 * Fetch all rows from a paginated МойСклад endpoint.
 */
async function fetchAllRows(baseUrl, authToken) {
  const items = [];
  let offset = 0;

  while (true) {
    const pageUrl = new URL(baseUrl);
    pageUrl.searchParams.set('limit', String(PAGE_LIMIT));
    pageUrl.searchParams.set('offset', String(offset));

    const page = await msGet(pageUrl.toString(), authToken);
    const rows = Array.isArray(page?.rows) ? page.rows : [];
    items.push(...rows);

    const total = Number(page?.meta?.size);
    if (!rows.length) break;
    if (Number.isFinite(total) && items.length >= total) break;
    if (rows.length < PAGE_LIMIT) break;

    offset += rows.length;
    await delay(REQUEST_DELAY_MS);
  }

  return items;
}

/**
 * Determine material category from name and folder path.
 */
function classifyMaterial(name, pathName) {
  const combined = `${name || ''} ${pathName || ''}`;
  return PACKAGING_RE.test(combined) ? 'packaging' : 'ingredient';
}

// ---------------------------------------------------------------------------
// Main import function
// ---------------------------------------------------------------------------

/**
 * Import all processing plans (тех. карты) from МойСклад into the local DB.
 *
 * @param {import('pg').Pool} pool  – PostgreSQL connection pool
 * @returns {Promise<{total_plans: number, matched: number, skipped: number, materials_count: number, errors: string[]}>}
 */
async function importTechCards(pool, { token: overrideToken } = {}) {
  const useToken = overrideToken || TOKEN;
  if (!useToken) throw new Error('[techCardImport] MOYSKLAD_TOKEN is not configured');
  const stats = { total_plans: 0, matched: 0, skipped: 0, materials_count: 0, errors: [] };

  // ------ Step 1: fetch all processing plans ------
  console.log('[techCardImport] Fetching processing plans from МойСклад...');
  const plans = await fetchAllRows(`${API_BASE}/entity/processingplan`, useToken);
  stats.total_plans = plans.length;
  console.log(`[techCardImport] Fetched ${plans.length} processing plan(s)`);

  // Cache for product metadata (uuid -> { name, code, pathName })
  const productCache = new Map();

  for (const plan of plans) {
    const planExternalId = extractUuid(plan.meta?.href);
    const planName = plan.name || '(unnamed)';

    try {
      // ------ Step 2: fetch output products for this plan ------
      const productsHref = plan.products?.meta?.href;
      if (!productsHref) {
        console.log(`[techCardImport] Plan "${planName}" has no products href — skipping`);
        stats.skipped++;
        continue;
      }

      await delay(REQUEST_DELAY_MS);
      const outputProducts = await msGet(productsHref, useToken);
      const outputRows = Array.isArray(outputProducts?.rows) ? outputProducts.rows : [];

      if (outputRows.length === 0) {
        console.log(`[techCardImport] Plan "${planName}" has 0 output products — skipping`);
        stats.skipped++;
        continue;
      }

      // Take the first output product as the primary one
      const firstOutput = outputRows[0];
      const outputProductUuid = extractUuid(firstOutput?.product?.meta?.href);
      const outputQuantity = Number(firstOutput?.quantity) || 1;

      if (!outputProductUuid) {
        console.log(`[techCardImport] Plan "${planName}" — cannot extract output product UUID — skipping`);
        stats.skipped++;
        continue;
      }

      // Check if we have this product in our local DB
      const { rows: localProducts } = await pool.query(
        'SELECT id FROM products_s WHERE external_id = $1',
        [outputProductUuid],
      );

      if (localProducts.length === 0) {
        console.log(`[techCardImport] Plan "${planName}" — output product ${outputProductUuid} not found locally — skipping`);
        stats.skipped++;
        continue;
      }

      const localProductId = localProducts[0].id;

      // ------ Step 3: fetch materials ------
      const materialsHref = plan.materials?.meta?.href;
      if (!materialsHref) {
        console.log(`[techCardImport] Plan "${planName}" has no materials href — skipping`);
        stats.skipped++;
        continue;
      }

      await delay(REQUEST_DELAY_MS);
      const materialsData = await msGet(materialsHref, useToken);
      const materialRows = Array.isArray(materialsData?.rows) ? materialsData.rows : [];

      // Resolve each material's product details
      const resolvedMaterials = [];

      for (let i = 0; i < materialRows.length; i++) {
        const matRow = materialRows[i];
        const matProductUuid = extractUuid(matRow?.product?.meta?.href);

        if (!matProductUuid) {
          console.log(`[techCardImport]   Material #${i} in "${planName}" has no product UUID — skipping material`);
          continue;
        }

        // Lookup or fetch product metadata
        if (!productCache.has(matProductUuid)) {
          await delay(REQUEST_DELAY_MS);
          try {
            const prodData = await msGet(`${API_BASE}/entity/product/${matProductUuid}`, useToken);
            productCache.set(matProductUuid, {
              name: prodData.name || '',
              code: prodData.code || null,
              pathName: prodData.pathName || '',
            });
          } catch (fetchErr) {
            console.log(`[techCardImport]   Failed to fetch product ${matProductUuid}: ${fetchErr.message}`);
            productCache.set(matProductUuid, { name: '', code: null, pathName: '' });
          }
        }

        const meta = productCache.get(matProductUuid);

        // Skip materials that are our own products (by code or UUID match)
        if (meta.code) {
          const isOurProduct = await pool.query(
            'SELECT 1 FROM products_s WHERE code = $1 OR external_id = $2 LIMIT 1',
            [meta.code, matProductUuid]
          );
          if (isOurProduct.rows.length > 0) {
            console.log(`[techCardImport]   Material "${meta.name}" is our product — skipping`);
            continue;
          }
        }

        const category = classifyMaterial(meta.name, meta.pathName);

        resolvedMaterials.push({
          externalId: matProductUuid,
          name: meta.name,
          code: meta.code,
          folderPath: meta.pathName,
          category,
          quantity: Number(matRow.quantity) || 0,
          sortOrder: i + 1,
        });
      }

      // ------ Step 4: upsert into DB within a transaction ------
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // 4a. Upsert raw materials
        const materialIdMap = new Map(); // externalId -> local id

        for (const mat of resolvedMaterials) {
          const { rows: upsertedRows } = await client.query(
            `INSERT INTO raw_materials_s (external_id, name, code, folder_path, category, updated_at)
             VALUES ($1, $2, $3, $4, $5, NOW())
             ON CONFLICT (external_id) DO UPDATE
               SET name        = EXCLUDED.name,
                   code        = EXCLUDED.code,
                   folder_path = EXCLUDED.folder_path,
                   updated_at  = NOW()
             RETURNING id`,
            [mat.externalId, mat.name, mat.code, mat.folderPath, mat.category],
          );
          materialIdMap.set(mat.externalId, upsertedRows[0].id);
        }

        // 4b. Upsert tech card
        const planFolderPath = plan.pathName || '';
        const { rows: tcRows } = await client.query(
          `INSERT INTO tech_cards_s (external_id, name, folder_path, output_quantity, product_id, updated_at)
           VALUES ($1, $2, $3, $4, $5, NOW())
           ON CONFLICT (external_id) DO UPDATE
             SET name            = EXCLUDED.name,
                 folder_path     = EXCLUDED.folder_path,
                 output_quantity = EXCLUDED.output_quantity,
                 product_id      = EXCLUDED.product_id,
                 updated_at      = NOW()
           RETURNING id`,
          [planExternalId, planName, planFolderPath, outputQuantity, localProductId],
        );
        const techCardId = tcRows[0].id;

        // 4c. Replace materials for this tech card
        await client.query('DELETE FROM tech_card_materials_s WHERE tech_card_id = $1', [techCardId]);

        for (const mat of resolvedMaterials) {
          const materialId = materialIdMap.get(mat.externalId);
          await client.query(
            `INSERT INTO tech_card_materials_s (tech_card_id, material_id, quantity, sort_order)
             VALUES ($1, $2, $3, $4)`,
            [techCardId, materialId, mat.quantity, mat.sortOrder],
          );
        }

        await client.query('COMMIT');

        stats.matched++;
        stats.materials_count += resolvedMaterials.length;
        console.log(
          `[techCardImport] ✓ "${planName}" — ${resolvedMaterials.length} material(s), product #${localProductId}`,
        );
      } catch (txErr) {
        await client.query('ROLLBACK');
        const errMsg = `Plan "${planName}": ${txErr.message}`;
        console.error(`[techCardImport] DB error — ${errMsg}`);
        stats.errors.push(errMsg);
      } finally {
        client.release();
      }
    } catch (planErr) {
      const errMsg = `Plan "${planName}": ${planErr.message}`;
      console.error(`[techCardImport] Error — ${errMsg}`);
      stats.errors.push(errMsg);
    }
  }

  console.log(
    `[techCardImport] Done. Total: ${stats.total_plans}, matched: ${stats.matched}, ` +
      `skipped: ${stats.skipped}, materials: ${stats.materials_count}, errors: ${stats.errors.length}`,
  );

  return stats;
}

module.exports = { importTechCards };

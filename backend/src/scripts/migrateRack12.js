#!/usr/bin/env node
/**
 * One-time migration: create 5 shelves on rack 12 of "Ижевск FBS нов"
 * and populate them with items from the old "Ижевск FBS" rack 12 backup.
 *
 * Run: node backend/src/scripts/migrateRack12.js
 */

const pool = require('../db/pool');

// Data from backup: shelf_items on old rack 12 (qty > 0 only)
// Merged С12П7/П8 test items into main list
const items = [
  // ── Берберин & комплексы ──
  { pid: 176, qty: 96,  name: 'Берберин + Холин, 2 банки' },
  { pid: 134, qty: 60,  name: 'Берберин New 2 банки' },
  { pid: 142, qty: 50,  name: 'Берберин New 3 банки' },
  { pid: 147, qty: 215, name: 'Берберин 500 мг, 2 банки' },
  { pid: 130, qty: 19,  name: 'Берберин 500 мг, 3 банки' },
  { pid: 171, qty: 49,  name: 'Берберин Пиколинат хрома' },

  // ── Биотин & Коллаген ──
  { pid: 131, qty: 10,  name: 'Биотин+Коллаген+ГК 180 капсул' },
  { pid: 133, qty: 181, name: 'Биотин+Коллаген 2 банки' },
  { pid: 113, qty: 13,  name: 'Коллаген UP, 3 банки' },
  { pid: 123, qty: 43,  name: 'Куркумин+Коллаген UP' },
  { pid: 148, qty: 33,  name: 'IQ Collagen 2 банки' },

  // ── Гинкго Билоба ──
  { pid: 116, qty: 46,  name: 'Гинкго Билоба 2 банки' },
  { pid: 125, qty: 27,  name: 'Гинкго Билоба 3 банки' },
  { pid: 172, qty: 471, name: 'Гинкго Билоба+Холин, 2 банки' },

  // ── Ежовик ──
  { pid: 143, qty: 32,  name: 'Ежовик гребенчатый 2 банки' },

  // ── Инозитол ──
  { pid: 117, qty: 194, name: 'Инозитол с фолиевой, 2 банки' },
  { pid: 118, qty: 18,  name: 'NMN 3 банки' },   // was on С12П1
  { pid: 128, qty: 43,  name: 'Инозитол с фолиевой, 3 банки' },
  { pid: 127, qty: 7,   name: 'Инозитол с фолиевой + Магний В6' },

  // ── Магний ──
  { pid: 167, qty: 56,  name: '(цитрат,глицинат,треонат) набор магния 3 банки' },
  { pid: 112, qty: 48,  name: 'Магний L-треонат 2 банки' },
  { pid: 129, qty: 40,  name: 'Магний L-треонат 3 банки' },
  { pid: 132, qty: 207, name: 'Хелатный Глицинат магния, 2 банки' },
  { pid: 139, qty: 97,  name: 'Хелатный Глицинат магния, 3 банки' },
  // from С12П7/П8 test shelves
  { pid: 110, qty: 1,   name: 'Магний L-треонат, 60 капсул (единичка)' },
  { pid: 40,  qty: 7,   name: 'Хелатный глицинат магния 60 капсул (3+2+2)' },
  { pid: 85,  qty: 5,   name: 'Магний Цитрат + D3, 60 капсул (3+2)' },

  // ── NMN & Ресвератрол ──
  { pid: 159, qty: 399, name: 'Ресвератрол + NMN, по 60 капсул' },
  { pid: 165, qty: 15,  name: 'Ресвератрол 2 банки' },
  { pid: 137, qty: 3,   name: 'Ресвератрол 3 банки' },
  { pid: 175, qty: 119, name: 'NMN 2 банки' },
  { pid: 120, qty: 47,  name: 'NMN·Глутатион·NAC, 2 банки' },
  { pid: 168, qty: 43,  name: 'NMN·Глутатион·NAC, 3 банки' },
  { pid: 38,  qty: 4,   name: 'NMN-Глутатион-NAC, 60 капсул (единичка)' },

  // ── Монолаурин & Кверцетин ──
  { pid: 174, qty: 38,  name: 'Монолаурин + L-лизин, 2 банки' },
  { pid: 140, qty: 50,  name: 'Кверцетин 500 мг, 2 банки' },
  { pid: 124, qty: 27,  name: 'Кверцетин 500 мг, 3 банки' },

  // ── D-Манноза ──
  { pid: 154, qty: 24,  name: 'Набор D-Манноза + Магний В6, 2 банки' },
  { pid: 155, qty: 10,  name: 'D Манноза, 2 банки' },
  { pid: 169, qty: 48,  name: 'D Манноза, 3 банки' },

  // ── Холин & DMAE ──
  { pid: 144, qty: 132, name: 'Холин 2 банки' },
  { pid: 150, qty: 42,  name: 'Холин 3 банки' },
  { pid: 170, qty: 28,  name: 'Холин + DMAE' },
  { pid: 156, qty: 35,  name: 'DMAE 2 банки' },

  // ── Остальное ──
  { pid: 121, qty: 17,  name: 'Псиллиум 3 банки' },
  { pid: 158, qty: 21,  name: 'Псиллиум 2 банки' },
  { pid: 157, qty: 42,  name: 'Серрапептаза, 2 банки' },
  { pid: 162, qty: 38,  name: 'Серрапептаза, 3 банки' },
  { pid: 146, qty: 29,  name: 'Тирозин 2 банки' },
  { pid: 153, qty: 19,  name: 'Фосфатидилсерин, 2 банки' },
  { pid: 111, qty: 1,   name: 'Фосфатидилсерин, 60 капсул (единичка)' },
  { pid: 151, qty: 42,  name: 'Янтарная кислота 2 банки' },
  { pid: 163, qty: 113, name: 'Янтарная кислота 3 банки' },
  { pid: 161, qty: 37,  name: 'Комплекс для сна, 120 капсул' },
  { pid: 173, qty: 21,  name: 'ZMA 2 банки' },
  { pid: 115, qty: 48,  name: 'Йохимбин + мака 2 банки' },
  { pid: 177, qty: 22,  name: 'Йохимбин + мака 3 банки' },
  { pid: 114, qty: 34,  name: 'Лактоферрин, 2 банки' },
  { pid: 152, qty: 42,  name: 'Лактоферрин, 3 банки' },
  { pid: 160, qty: 13,  name: 'Лютеин 3 банки' },
  { pid: 141, qty: 50,  name: 'Лютеин 2 банки' },
  { pid: 145, qty: 7,   name: 'Набор Монолаурин + Кверцетин' },
];

// Distribute into 5 shelves by category
const shelves = [
  { name: 'Полка 1', number: 1, code: 'С12П1', items: [] }, // Берберин, Биотин/Коллаген
  { name: 'Полка 2', number: 2, code: 'С12П2', items: [] }, // Гинкго, Инозитол, Ежовик
  { name: 'Полка 3', number: 3, code: 'С12П3', items: [] }, // Магний (все виды)
  { name: 'Полка 4', number: 4, code: 'С12П4', items: [] }, // NMN, Ресвератрол, Монолаурин, Кверцетин, D-Манноза
  { name: 'Полка 5', number: 5, code: 'С12П5', items: [] }, // Холин, DMAE, остальное
];

// Categorize
for (const it of items) {
  const n = it.name.toLowerCase();
  if (n.includes('берберин') || n.includes('биотин') || n.includes('коллаген') || n.includes('iq collagen') || n.includes('куркумин')) {
    shelves[0].items.push(it);
  } else if (n.includes('гинкго') || n.includes('инозитол') || n.includes('ежовик')) {
    shelves[1].items.push(it);
  } else if (n.includes('магний') || n.includes('глицинат') || n.includes('треонат') || n.includes('цитрат')) {
    shelves[2].items.push(it);
  } else if (n.includes('nmn') || n.includes('ресвератрол') || n.includes('монолаурин') || n.includes('кверцетин') || n.includes('манноз') || n.includes('лизин')) {
    shelves[3].items.push(it);
  } else {
    shelves[4].items.push(it);
  }
}

async function run() {
  const client = await pool.connect();
  try {
    // Find rack 12 in "Ижевск FBS нов"
    const whRes = await client.query(`SELECT id FROM warehouses_s WHERE name = 'Ижевск FBS нов'`);
    if (whRes.rows.length === 0) { console.error('Warehouse "Ижевск FBS нов" not found'); return; }
    const whId = whRes.rows[0].id;

    const rackRes = await client.query(`SELECT id FROM racks_s WHERE warehouse_id = $1 AND number = 12`, [whId]);
    if (rackRes.rows.length === 0) { console.error('Rack 12 not found in warehouse'); return; }
    const rackId = rackRes.rows[0].id;

    // Check if shelves already exist
    const existingShelves = await client.query(`SELECT id FROM shelves_s WHERE rack_id = $1`, [rackId]);
    if (existingShelves.rows.length > 0) {
      console.log(`[migrate] Rack 12 already has ${existingShelves.rows.length} shelves — skipping`);
      return;
    }

    await client.query('BEGIN');

    let totalItems = 0, totalQty = 0;

    for (const shelf of shelves) {
      // Create shelf
      const barcode = String(Math.floor(Math.random() * 900000000) + 100000000);
      const shelfRes = await client.query(
        `INSERT INTO shelves_s (rack_id, name, number, code, barcode_value) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [rackId, shelf.name, shelf.number, shelf.code, barcode]
      );
      const shelfId = shelfRes.rows[0].id;
      console.log(`[migrate] Created ${shelf.code} (id=${shelfId}) — ${shelf.items.length} items`);

      // Insert items
      for (const it of shelf.items) {
        // Verify product exists
        const prodCheck = await client.query(`SELECT id FROM products_s WHERE id = $1`, [it.pid]);
        if (prodCheck.rows.length === 0) {
          console.log(`  SKIP: product id=${it.pid} not found (${it.name})`);
          continue;
        }
        await client.query(
          `INSERT INTO shelf_items_s (shelf_id, product_id, quantity) VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [shelfId, it.pid, it.qty]
        );
        totalItems++;
        totalQty += it.qty;
      }
    }

    await client.query('COMMIT');
    console.log(`\n[migrate] Done: 5 shelves, ${totalItems} items, ${totalQty} total qty`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[migrate] Error:', err.message);
    throw err;
  } finally {
    client.release();
    pool.end();
  }
}

run();

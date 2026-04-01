const pool = require('./pool');

async function createSchema() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ─── Users & Employees ───────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS employees_s (
        id SERIAL PRIMARY KEY,
        full_name VARCHAR(255) NOT NULL,
        position VARCHAR(255),
        phone VARCHAR(50),
        active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS users_s (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'employee' CHECK (role IN ('admin', 'employee')),
        employee_id INTEGER REFERENCES employees_s(id) ON DELETE SET NULL,
        active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Add password_plain and widen role check
    await client.query(`ALTER TABLE users_s ADD COLUMN IF NOT EXISTS password_plain VARCHAR(255)`);
    await client.query(`ALTER TABLE users_s ADD COLUMN IF NOT EXISTS role_id INTEGER`);
    await client.query(`ALTER TABLE users_s DROP CONSTRAINT IF EXISTS users_c_role_check`);

    // Add shelf_id to scans for multi-shelf tracking
    await client.query(`ALTER TABLE inventory_task_scans_s ADD COLUMN IF NOT EXISTS shelf_id INTEGER`);

    // Add 'paused' status to inventory_tasks_s
    await client.query(`ALTER TABLE inventory_tasks_s DROP CONSTRAINT IF EXISTS inventory_tasks_s_status_check`);
    await client.query(`ALTER TABLE inventory_tasks_s DROP CONSTRAINT IF EXISTS inventory_tasks_c_status_check`);
    await client.query(`ALTER TABLE inventory_tasks_s ADD CONSTRAINT inventory_tasks_s_status_check CHECK (status IN ('new', 'in_progress', 'completed', 'cancelled', 'paused'))`);
    await client.query(`ALTER TABLE inventory_tasks_s ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ`);
    await client.query(`ALTER TABLE inventory_tasks_s ADD COLUMN IF NOT EXISTS paused_by INTEGER REFERENCES users_s(id) ON DELETE SET NULL`);
    await client.query(`ALTER TABLE inventory_tasks_s ADD COLUMN IF NOT EXISTS pause_log JSONB DEFAULT '[]'`);

    // Multi-shelf support for inventory tasks
    await client.query(`ALTER TABLE inventory_tasks_s ADD COLUMN IF NOT EXISTS shelf_ids JSONB`);
    await client.query(`ALTER TABLE inventory_tasks_s ADD COLUMN IF NOT EXISTS current_shelf_index INTEGER DEFAULT 0`);

    // ─── Product Catalog ─────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS product_folders_s (
        id SERIAL PRIMARY KEY,
        external_id VARCHAR(255) UNIQUE,
        name VARCHAR(500) NOT NULL,
        parent_id INTEGER REFERENCES product_folders_s(id) ON DELETE SET NULL,
        full_path TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS products_s (
        id SERIAL PRIMARY KEY,
        external_id VARCHAR(255) UNIQUE,
        name VARCHAR(500) NOT NULL,
        code VARCHAR(255),
        article VARCHAR(255),
        entity_type VARCHAR(20) NOT NULL DEFAULT 'product' CHECK (entity_type IN ('product', 'bundle')),
        barcode_list TEXT,
        production_barcode VARCHAR(255),
        marketplace_barcodes_json JSONB,
        stock NUMERIC(15,3) DEFAULT 0,
        reserve NUMERIC(15,3) DEFAULT 0,
        in_transit NUMERIC(15,3) DEFAULT 0,
        quantity NUMERIC(15,3) DEFAULT 0,
        folder_id INTEGER REFERENCES product_folders_s(id) ON DELETE SET NULL,
        folder_path TEXT,
        archived BOOLEAN NOT NULL DEFAULT false,
        source_json JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`ALTER TABLE products_s ADD COLUMN IF NOT EXISTS sale_price NUMERIC(18,2)`);
    await client.query(`ALTER TABLE products_s ADD COLUMN IF NOT EXISTS cost_price NUMERIC(18,2)`);
    await client.query(`ALTER TABLE products_s ADD COLUMN IF NOT EXISTS honest_sign BOOLEAN NOT NULL DEFAULT false`);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_products_c_name ON products_s(name);
      CREATE INDEX IF NOT EXISTS idx_products_c_code ON products_s(code);
      CREATE INDEX IF NOT EXISTS idx_products_c_external_id ON products_s(external_id);
      CREATE INDEX IF NOT EXISTS idx_products_c_entity_type ON products_s(entity_type);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS bundle_components_s (
        id SERIAL PRIMARY KEY,
        bundle_id INTEGER NOT NULL REFERENCES products_s(id) ON DELETE CASCADE,
        component_id INTEGER REFERENCES products_s(id) ON DELETE SET NULL,
        component_external_id VARCHAR(255),
        quantity NUMERIC(15,3) NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(bundle_id, component_id)
      )
    `);

    // ─── Raw Materials (ingredients & packaging) ───────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS raw_materials_s (
        id SERIAL PRIMARY KEY,
        external_id VARCHAR(255) UNIQUE,
        name VARCHAR(500) NOT NULL,
        code VARCHAR(255),
        article VARCHAR(255),
        unit VARCHAR(20) DEFAULT 'шт',
        category VARCHAR(30) NOT NULL DEFAULT 'ingredient' CHECK (category IN ('ingredient', 'packaging')),
        folder_path TEXT,
        stock NUMERIC(15,3) DEFAULT 0,
        archived BOOLEAN NOT NULL DEFAULT false,
        source_json JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_raw_materials_c_external_id ON raw_materials_s(external_id);
      CREATE INDEX IF NOT EXISTS idx_raw_materials_c_name ON raw_materials_s(name);
      CREATE INDEX IF NOT EXISTS idx_raw_materials_c_category ON raw_materials_s(category);
    `);

    // Migrations for raw_materials_s
    await client.query(`ALTER TABLE raw_materials_s ADD COLUMN IF NOT EXISTS buy_price NUMERIC(18,2)`);
    await client.query(`ALTER TABLE raw_materials_s ADD COLUMN IF NOT EXISTS min_stock NUMERIC(15,3) DEFAULT 0`);
    await client.query(`ALTER TABLE raw_materials_s ADD COLUMN IF NOT EXISTS supplier VARCHAR(500)`);
    await client.query(`ALTER TABLE raw_materials_s ADD COLUMN IF NOT EXISTS notes TEXT`);
    await client.query(`ALTER TABLE raw_materials_s ADD COLUMN IF NOT EXISTS material_group VARCHAR(50) DEFAULT 'другое'`);

    // ─── Material Recipe (what a material consists of) ─────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS material_recipe_s (
        id SERIAL PRIMARY KEY,
        material_id INTEGER NOT NULL REFERENCES raw_materials_s(id) ON DELETE CASCADE,
        ingredient_id INTEGER NOT NULL REFERENCES raw_materials_s(id) ON DELETE CASCADE,
        quantity NUMERIC(15,4) NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(material_id, ingredient_id)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_material_recipe_c_mat ON material_recipe_s(material_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_material_recipe_c_ing ON material_recipe_s(ingredient_id)`);

    // ─── Tech Cards (production recipes) ───────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS tech_cards_s (
        id SERIAL PRIMARY KEY,
        product_id INTEGER NOT NULL REFERENCES products_s(id) ON DELETE CASCADE,
        external_id VARCHAR(255) UNIQUE,
        name VARCHAR(500) NOT NULL,
        folder_path TEXT,
        output_quantity NUMERIC(15,3) DEFAULT 1,
        cost NUMERIC(18,2),
        archived BOOLEAN NOT NULL DEFAULT false,
        source_json JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_tech_cards_c_product_id ON tech_cards_s(product_id);
      CREATE INDEX IF NOT EXISTS idx_tech_cards_c_external_id ON tech_cards_s(external_id);
    `);

    // ─── Tech Card Materials (recipe lines) ────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS tech_card_materials_s (
        id SERIAL PRIMARY KEY,
        tech_card_id INTEGER NOT NULL REFERENCES tech_cards_s(id) ON DELETE CASCADE,
        material_id INTEGER NOT NULL REFERENCES raw_materials_s(id) ON DELETE CASCADE,
        quantity NUMERIC(15,4) NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(tech_card_id, material_id)
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_tech_card_materials_c_tech_card_id ON tech_card_materials_s(tech_card_id);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS import_runs_s (
        id SERIAL PRIMARY KEY,
        status VARCHAR(20) NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'error')),
        products_count INTEGER DEFAULT 0,
        bundles_count INTEGER DEFAULT 0,
        errors_json JSONB,
        source_dir TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        finished_at TIMESTAMPTZ
      )
    `);

    // ─── Warehouse Structure ─────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS warehouses_s (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        external_id VARCHAR(255),
        active BOOLEAN NOT NULL DEFAULT true,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS racks_s (
        id SERIAL PRIMARY KEY,
        warehouse_id INTEGER NOT NULL REFERENCES warehouses_s(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        number INTEGER NOT NULL,
        code VARCHAR(50),
        barcode_value VARCHAR(255) UNIQUE,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS shelves_s (
        id SERIAL PRIMARY KEY,
        rack_id INTEGER NOT NULL REFERENCES racks_s(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        number INTEGER NOT NULL,
        code VARCHAR(50),
        barcode_value VARCHAR(255) UNIQUE,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`ALTER TABLE shelves_s ADD COLUMN IF NOT EXISTS uses_boxes BOOLEAN NOT NULL DEFAULT false`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS shelf_items_s (
        id SERIAL PRIMARY KEY,
        shelf_id INTEGER NOT NULL REFERENCES shelves_s(id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL REFERENCES products_s(id) ON DELETE CASCADE,
        quantity NUMERIC(15,3) NOT NULL DEFAULT 0,
        updated_by INTEGER REFERENCES users_s(id) ON DELETE SET NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(shelf_id, product_id)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS shelf_movements_s (
        id SERIAL PRIMARY KEY,
        shelf_id INTEGER NOT NULL REFERENCES shelves_s(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products_s(id) ON DELETE SET NULL,
        operation_type VARCHAR(30) NOT NULL CHECK (operation_type IN ('inventory', 'correction', 'stock_in', 'stock_out')),
        quantity_before NUMERIC(15,3) NOT NULL DEFAULT 0,
        quantity_after NUMERIC(15,3) NOT NULL DEFAULT 0,
        quantity_delta NUMERIC(15,3) NOT NULL DEFAULT 0,
        user_id INTEGER REFERENCES users_s(id) ON DELETE SET NULL,
        task_id INTEGER,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // ─── Inventory Tasks ─────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS inventory_tasks_s (
        id SERIAL PRIMARY KEY,
        title VARCHAR(500) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'completed', 'cancelled')),
        employee_id INTEGER REFERENCES employees_s(id) ON DELETE SET NULL,
        shelf_id INTEGER REFERENCES shelves_s(id) ON DELETE SET NULL,
        notes TEXT,
        created_by INTEGER REFERENCES users_s(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS inventory_task_scans_s (
        id SERIAL PRIMARY KEY,
        task_id INTEGER NOT NULL REFERENCES inventory_tasks_s(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products_s(id) ON DELETE SET NULL,
        product_external_id VARCHAR(255),
        scanned_value VARCHAR(500) NOT NULL,
        quantity_delta NUMERIC(15,3) NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // ─── Scan Errors ─────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS scan_errors_s (
        id SERIAL PRIMARY KEY,
        task_id INTEGER REFERENCES inventory_tasks_s(id) ON DELETE SET NULL,
        scanned_value VARCHAR(500) NOT NULL,
        employee_note TEXT,
        user_id INTEGER REFERENCES users_s(id),
        resolved_at TIMESTAMPTZ,
        resolved_by INTEGER REFERENCES users_s(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Migration: add resolved columns if they don't exist (for existing tables)
    await client.query(`ALTER TABLE scan_errors_s ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ`);
    await client.query(`ALTER TABLE scan_errors_s ADD COLUMN IF NOT EXISTS resolved_by INTEGER REFERENCES users_s(id) ON DELETE SET NULL`);

    // ─── Performance indexes ─────────────────────────────────────────
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_task_scans_task_id ON inventory_task_scans_s(task_id);
      CREATE INDEX IF NOT EXISTS idx_task_scans_task_product ON inventory_task_scans_s(task_id, product_id);
      CREATE INDEX IF NOT EXISTS idx_task_scans_task_box ON inventory_task_scans_s(task_box_id);
      CREATE INDEX IF NOT EXISTS idx_scan_errors_task_id ON scan_errors_s(task_id);
      CREATE INDEX IF NOT EXISTS idx_inv_tasks_status ON inventory_tasks_s(status);
      CREATE INDEX IF NOT EXISTS idx_inv_tasks_employee ON inventory_tasks_s(employee_id);
      CREATE INDEX IF NOT EXISTS idx_inv_tasks_shelf ON inventory_tasks_s(shelf_id);
      CREATE INDEX IF NOT EXISTS idx_inv_tasks_target_pallet ON inventory_tasks_s(target_pallet_id);
      CREATE INDEX IF NOT EXISTS idx_shelf_movements_shelf_created ON shelf_movements_s(shelf_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_shelf_items_product ON shelf_items_s(product_id);
      CREATE INDEX IF NOT EXISTS idx_boxes_pallet ON boxes_s(pallet_id);
      CREATE INDEX IF NOT EXISTS idx_boxes_task ON boxes_s(task_id);
      CREATE INDEX IF NOT EXISTS idx_boxes_status ON boxes_s(status);
      CREATE INDEX IF NOT EXISTS idx_shelf_boxes_shelf ON shelf_boxes_s(shelf_id);
      CREATE INDEX IF NOT EXISTS idx_box_items_box ON box_items_s(box_id);
      CREATE INDEX IF NOT EXISTS idx_shelf_box_items_shelf_box ON shelf_box_items_s(shelf_box_id);
      CREATE INDEX IF NOT EXISTS idx_pallet_items_pallet ON pallet_items_s(pallet_id);
      CREATE INDEX IF NOT EXISTS idx_employee_inventory_employee ON employee_inventory_s(employee_id);
    `);

    // External employee link
    await client.query(`ALTER TABLE employees_s ADD COLUMN IF NOT EXISTS external_employee_id INTEGER UNIQUE`);
    await client.query(`ALTER TABLE employees_s ADD COLUMN IF NOT EXISTS department VARCHAR(255)`);

    // ─── Settings ────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS settings_s (
        id SERIAL PRIMARY KEY,
        key VARCHAR(100) NOT NULL UNIQUE,
        value TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // ─── Updated_at triggers ─────────────────────────────────────────
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_s()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    const tablesWithUpdatedAt = [
      'employees_s', 'users_s', 'product_folders_s', 'products_s',
      'warehouses_s', 'racks_s', 'shelves_s', 'inventory_tasks_s', 'settings_s',
      'raw_materials_s', 'tech_cards_s'
    ];

    for (const table of tablesWithUpdatedAt) {
      await client.query(`
        DROP TRIGGER IF EXISTS trg_${table}_updated_at ON ${table};
        CREATE TRIGGER trg_${table}_updated_at
          BEFORE UPDATE ON ${table}
          FOR EACH ROW EXECUTE FUNCTION update_updated_at_s();
      `);
    }

    // ─── System / Frontend Error Log ─────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS system_errors_s (
        id             SERIAL PRIMARY KEY,
        user_id        INTEGER REFERENCES users_s(id) ON DELETE SET NULL,
        username       VARCHAR(100),
        user_role      VARCHAR(20),
        error_type     VARCHAR(30) NOT NULL DEFAULT 'unknown',
        error_message  TEXT,
        error_stack    TEXT,
        page_url       TEXT,
        component      VARCHAR(255),
        http_status    INTEGER,
        request_url    TEXT,
        request_method VARCHAR(10),
        response_data  TEXT,
        browser_info   TEXT,
        extra_json     JSONB,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_system_errors_c_created ON system_errors_s(created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_system_errors_c_type    ON system_errors_s(error_type)`);

    // ─── Feedback ─────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS feedback_s (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users_s(id) ON DELETE SET NULL,
        username VARCHAR(100),
        user_role VARCHAR(20),
        category VARCHAR(30) NOT NULL DEFAULT 'bug',
        subcategory VARCHAR(50),
        description TEXT,
        transcript TEXT,
        screenshot_path VARCHAR(500),
        audio_path VARCHAR(500),
        page_url TEXT,
        browser_info TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'new',
        admin_notes TEXT,
        resolved_by INTEGER REFERENCES users_s(id) ON DELETE SET NULL,
        resolved_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback_s(created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback_s(status)`);
    await client.query(`
      DROP TRIGGER IF EXISTS trg_feedback_s_updated_at ON feedback_s;
      CREATE TRIGGER trg_feedback_s_updated_at
        BEFORE UPDATE ON feedback_s
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_s();
    `);

    // ─── Migrations ──────────────────────────────────────────────────

    // Allow 'manager' role
    await client.query(`ALTER TABLE users_s DROP CONSTRAINT IF EXISTS users_c_role_check`);
    await client.query(`ALTER TABLE users_s ADD CONSTRAINT users_c_role_check CHECK (role IN ('admin', 'manager', 'employee'))`);

    // Warehouse type for FBO support
    await client.query(`ALTER TABLE warehouses_s ADD COLUMN IF NOT EXISTS warehouse_type VARCHAR(20) NOT NULL DEFAULT 'fbs'`);
    await client.query(`ALTER TABLE warehouses_s ALTER COLUMN warehouse_type TYPE VARCHAR(20)`);

    // FBO: Rows (analogous to racks)
    await client.query(`
      CREATE TABLE IF NOT EXISTS pallet_rows_s (
        id SERIAL PRIMARY KEY,
        warehouse_id INTEGER NOT NULL REFERENCES warehouses_s(id) ON DELETE CASCADE,
        number INTEGER NOT NULL,
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(warehouse_id, number)
      )
    `);

    // FBO: Pallets (analogous to shelves)
    await client.query(`
      CREATE TABLE IF NOT EXISTS pallets_s (
        id SERIAL PRIMARY KEY,
        row_id INTEGER NOT NULL REFERENCES pallet_rows_s(id) ON DELETE CASCADE,
        number INTEGER NOT NULL,
        name VARCHAR(255) NOT NULL,
        barcode_value VARCHAR(255) UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(row_id, number)
      )
    `);

    // FBO: Boxes (physical boxes with barcodes stored on pallets)
    await client.query(`
      CREATE TABLE IF NOT EXISTS boxes_s (
        id SERIAL PRIMARY KEY,
        barcode_value VARCHAR(255) NOT NULL UNIQUE,
        product_id INTEGER REFERENCES products_s(id) ON DELETE SET NULL,
        pallet_id INTEGER REFERENCES pallets_s(id) ON DELETE SET NULL,
        task_id INTEGER REFERENCES inventory_tasks_s(id) ON DELETE SET NULL,
        quantity INTEGER NOT NULL DEFAULT 0,
        box_size INTEGER NOT NULL DEFAULT 50,
        status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        closed_at TIMESTAMPTZ
      )
    `);

    // Add packaging columns to inventory_tasks_s
    await client.query(`ALTER TABLE inventory_tasks_s ADD COLUMN IF NOT EXISTS task_type VARCHAR(20) NOT NULL DEFAULT 'inventory'`);
    await client.query(`ALTER TABLE inventory_tasks_s ADD COLUMN IF NOT EXISTS product_id INTEGER REFERENCES products_s(id) ON DELETE SET NULL`);
    await client.query(`ALTER TABLE inventory_tasks_s ADD COLUMN IF NOT EXISTS box_size INTEGER DEFAULT 50`);
    await client.query(`ALTER TABLE inventory_tasks_s ADD COLUMN IF NOT EXISTS target_pallet_id INTEGER REFERENCES pallets_s(id) ON DELETE SET NULL`);
    await client.query(`ALTER TABLE inventory_tasks_s ADD COLUMN IF NOT EXISTS packing_phase VARCHAR(20) DEFAULT 'packaging'`);

    // Add confirmed column to boxes_s
    await client.query(`ALTER TABLE boxes_s ADD COLUMN IF NOT EXISTS confirmed BOOLEAN NOT NULL DEFAULT false`);
    await client.query(`ALTER TABLE inventory_tasks_s ADD COLUMN IF NOT EXISTS target_box_id INTEGER REFERENCES boxes_s(id) ON DELETE SET NULL`);

    // Mark remainder boxes (not placed on FBO pallet, transferred to FBS shelf instead)
    await client.query(`ALTER TABLE boxes_s ADD COLUMN IF NOT EXISTS is_remainder BOOLEAN NOT NULL DEFAULT false`);
    // Store which FBS shelf the remainder went to
    await client.query(`ALTER TABLE boxes_s ADD COLUMN IF NOT EXISTS remainder_shelf_id INTEGER REFERENCES shelves_s(id) ON DELETE SET NULL`);

    // Pallet: uses_boxes flag (true = товар в коробках, false = товар напрямую)
    await client.query(`ALTER TABLE pallets_s ADD COLUMN IF NOT EXISTS uses_boxes BOOLEAN NOT NULL DEFAULT true`);

    // Warehouse types
    await client.query(`ALTER TABLE warehouses_s DROP CONSTRAINT IF EXISTS warehouses_c_warehouse_type_check`);
    await client.query(`ALTER TABLE warehouses_s ADD CONSTRAINT warehouses_c_warehouse_type_check CHECK (warehouse_type IN ('fbs', 'fbo', 'both', 'visual', 'visual_pallet', 'box'))`);

    // boxes_s: warehouse_id for box-type warehouses (boxes without pallets)
    await client.query(`ALTER TABLE boxes_s ADD COLUMN IF NOT EXISTS warehouse_id INTEGER REFERENCES warehouses_s(id) ON DELETE SET NULL`);
    await client.query(`ALTER TABLE boxes_s ADD COLUMN IF NOT EXISTS name VARCHAR(255)`);

    // shelf_boxes_s: physical boxes on FBS shelves (for visual/experimental warehouses)
    await client.query(`
      CREATE TABLE IF NOT EXISTS shelf_boxes_s (
        id SERIAL PRIMARY KEY,
        shelf_id INTEGER NOT NULL REFERENCES shelves_s(id) ON DELETE CASCADE,
        position INTEGER NOT NULL DEFAULT 1,
        name VARCHAR(100),
        barcode_value VARCHAR(255) UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(shelf_id, position)
      )
    `);
    await client.query(`ALTER TABLE shelf_boxes_s ADD COLUMN IF NOT EXISTS product_id INTEGER REFERENCES products_s(id) ON DELETE SET NULL`);
    await client.query(`ALTER TABLE shelf_boxes_s ADD COLUMN IF NOT EXISTS task_id INTEGER REFERENCES inventory_tasks_s(id) ON DELETE SET NULL`);
    await client.query(`ALTER TABLE shelf_boxes_s ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 0`);
    await client.query(`ALTER TABLE shelf_boxes_s ADD COLUMN IF NOT EXISTS box_size INTEGER NOT NULL DEFAULT 50`);
    await client.query(`ALTER TABLE shelf_boxes_s ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'closed'`);
    await client.query(`ALTER TABLE shelf_boxes_s ADD COLUMN IF NOT EXISTS confirmed BOOLEAN NOT NULL DEFAULT false`);
    await client.query(`ALTER TABLE shelf_boxes_s ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ`);
    await client.query(`ALTER TABLE inventory_tasks_s ADD COLUMN IF NOT EXISTS target_shelf_box_id INTEGER REFERENCES shelf_boxes_s(id) ON DELETE SET NULL`);

    // Multi-product contents for pallet boxes
    await client.query(`
      CREATE TABLE IF NOT EXISTS box_items_s (
        id SERIAL PRIMARY KEY,
        box_id INTEGER NOT NULL REFERENCES boxes_s(id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL REFERENCES products_s(id) ON DELETE CASCADE,
        quantity NUMERIC(15,3) NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(box_id, product_id)
      )
    `);

    // Multi-product contents for shelf boxes
    await client.query(`
      CREATE TABLE IF NOT EXISTS shelf_box_items_s (
        id SERIAL PRIMARY KEY,
        shelf_box_id INTEGER NOT NULL REFERENCES shelf_boxes_s(id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL REFERENCES products_s(id) ON DELETE CASCADE,
        quantity NUMERIC(15,3) NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(shelf_box_id, product_id)
      )
    `);

    // One inventory task can now include multiple boxes processed one by one
    await client.query(`
      CREATE TABLE IF NOT EXISTS inventory_task_boxes_s (
        id SERIAL PRIMARY KEY,
        task_id INTEGER NOT NULL REFERENCES inventory_tasks_s(id) ON DELETE CASCADE,
        box_id INTEGER REFERENCES boxes_s(id) ON DELETE CASCADE,
        shelf_box_id INTEGER REFERENCES shelf_boxes_s(id) ON DELETE CASCADE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT inventory_task_boxes_target_check CHECK (
          (box_id IS NOT NULL AND shelf_box_id IS NULL)
          OR (box_id IS NULL AND shelf_box_id IS NOT NULL)
        )
      )
    `);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_task_boxes_unique_box ON inventory_task_boxes_s(task_id, box_id) WHERE box_id IS NOT NULL`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_task_boxes_unique_shelf_box ON inventory_task_boxes_s(task_id, shelf_box_id) WHERE shelf_box_id IS NOT NULL`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_inventory_task_boxes_task_sort ON inventory_task_boxes_s(task_id, sort_order)`);

    await client.query(`ALTER TABLE inventory_task_scans_s ADD COLUMN IF NOT EXISTS task_box_id INTEGER REFERENCES inventory_task_boxes_s(id) ON DELETE SET NULL`);
    await client.query(`ALTER TABLE scan_errors_s ADD COLUMN IF NOT EXISTS task_box_id INTEGER REFERENCES inventory_task_boxes_s(id) ON DELETE SET NULL`);

    // ─── Employee Earnings / GRAcoin ────────────────────────────────
    await client.query(`ALTER TABLE employees_s ADD COLUMN IF NOT EXISTS gra_balance NUMERIC(18,3) NOT NULL DEFAULT 0`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS employee_earnings_s (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL REFERENCES employees_s(id) ON DELETE CASCADE,
        task_id INTEGER REFERENCES inventory_tasks_s(id) ON DELETE SET NULL,
        task_scan_id INTEGER REFERENCES inventory_task_scans_s(id) ON DELETE SET NULL,
        task_box_id INTEGER REFERENCES inventory_task_boxes_s(id) ON DELETE SET NULL,
        shelf_id INTEGER REFERENCES shelves_s(id) ON DELETE SET NULL,
        box_id INTEGER REFERENCES boxes_s(id) ON DELETE SET NULL,
        shelf_box_id INTEGER REFERENCES shelf_boxes_s(id) ON DELETE SET NULL,
        product_id INTEGER REFERENCES products_s(id) ON DELETE SET NULL,
        event_type VARCHAR(30) NOT NULL CHECK (event_type IN ('inventory_scan', 'manual_adjustment')),
        reward_units NUMERIC(15,3) NOT NULL DEFAULT 1,
        rate_per_unit NUMERIC(18,3) NOT NULL DEFAULT 0,
        amount_delta NUMERIC(18,3) NOT NULL,
        balance_before NUMERIC(18,3) NOT NULL DEFAULT 0,
        balance_after NUMERIC(18,3) NOT NULL DEFAULT 0,
        notes TEXT,
        created_by_user_id INTEGER REFERENCES users_s(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_employee_earnings_employee_created ON employee_earnings_s(employee_id, created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_employee_earnings_task ON employee_earnings_s(task_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_employee_earnings_event_type ON employee_earnings_s(event_type)`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_earnings_unique_scan ON employee_earnings_s(task_scan_id) WHERE task_scan_id IS NOT NULL`);

    // External earnings fields (sborka site)
    await client.query(`ALTER TABLE employee_earnings_s ADD COLUMN IF NOT EXISTS source VARCHAR(50)`);
    await client.query(`ALTER TABLE employee_earnings_s ADD COLUMN IF NOT EXISTS source_marketplace VARCHAR(50)`);
    await client.query(`ALTER TABLE employee_earnings_s ADD COLUMN IF NOT EXISTS source_store_id VARCHAR(100)`);
    await client.query(`ALTER TABLE employee_earnings_s ADD COLUMN IF NOT EXISTS source_store_name VARCHAR(255)`);
    await client.query(`ALTER TABLE employee_earnings_s ADD COLUMN IF NOT EXISTS source_entity_type VARCHAR(50)`);
    await client.query(`ALTER TABLE employee_earnings_s ADD COLUMN IF NOT EXISTS source_entity_id VARCHAR(100)`);
    await client.query(`ALTER TABLE employee_earnings_s ADD COLUMN IF NOT EXISTS source_entity_name VARCHAR(500)`);
    await client.query(`ALTER TABLE employee_earnings_s ADD COLUMN IF NOT EXISTS source_article VARCHAR(255)`);
    await client.query(`ALTER TABLE employee_earnings_s ADD COLUMN IF NOT EXISTS source_product_name VARCHAR(500)`);
    await client.query(`ALTER TABLE employee_earnings_s ADD COLUMN IF NOT EXISTS source_marketplace_code VARCHAR(255)`);
    await client.query(`ALTER TABLE employee_earnings_s ADD COLUMN IF NOT EXISTS source_scanned_code VARCHAR(255)`);
    await client.query(`ALTER TABLE employee_earnings_s ADD COLUMN IF NOT EXISTS source_task_id VARCHAR(100)`);
    // Expand event_type constraint
    await client.query(`ALTER TABLE employee_earnings_s DROP CONSTRAINT IF EXISTS employee_earnings_s_event_type_check`);
    await client.query(`ALTER TABLE employee_earnings_s ADD CONSTRAINT employee_earnings_s_event_type_check CHECK (event_type IN ('inventory_scan', 'manual_adjustment', 'external_order_pick'))`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_employee_earnings_source ON employee_earnings_s(source) WHERE source IS NOT NULL`);

    // Seed new item tables from legacy one-product boxes
    await client.query(`
      INSERT INTO box_items_s (box_id, product_id, quantity, updated_at)
      SELECT b.id, b.product_id, b.quantity, NOW()
      FROM boxes_s b
      WHERE b.product_id IS NOT NULL
        AND b.quantity > 0
        AND NOT EXISTS (
          SELECT 1 FROM box_items_s bi WHERE bi.box_id = b.id AND bi.product_id = b.product_id
        )
    `);
    await client.query(`
      INSERT INTO shelf_box_items_s (shelf_box_id, product_id, quantity, updated_at)
      SELECT sb.id, sb.product_id, sb.quantity, NOW()
      FROM shelf_boxes_s sb
      WHERE sb.product_id IS NOT NULL
        AND sb.quantity > 0
        AND NOT EXISTS (
          SELECT 1 FROM shelf_box_items_s sbi WHERE sbi.shelf_box_id = sb.id AND sbi.product_id = sb.product_id
        )
    `);

    // Visual warehouse seed removed — create warehouses manually via UI

    // Fix old-format barcodes (SHELF-X-Y, RACK-X-Y) → use shelf/rack ID for uniqueness
    await client.query(`
      UPDATE shelves_s
      SET barcode_value = (200000000 + id)::text
      WHERE barcode_value ~ '^SHELF-'
    `);
    await client.query(`
      UPDATE racks_s
      SET barcode_value = (100000 + id)::text
      WHERE barcode_value ~ '^RACK-'
    `);

    // ─── Pallet items (loose products on pallets, like shelf_items_s) ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS pallet_items_s (
        id SERIAL PRIMARY KEY,
        pallet_id INTEGER NOT NULL REFERENCES pallets_s(id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL REFERENCES products_s(id) ON DELETE CASCADE,
        quantity NUMERIC(15,3) NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(pallet_id, product_id)
      )
    `);

    // ─── Employee inventory (what employees are holding) ─────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS employee_inventory_s (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL REFERENCES employees_s(id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL REFERENCES products_s(id) ON DELETE CASCADE,
        quantity NUMERIC(15,3) NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(employee_id, product_id)
      )
    `);

    // ─── Universal movement log ──────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS movements_s (
        id SERIAL PRIMARY KEY,
        movement_type VARCHAR(30) NOT NULL,
        product_id INTEGER REFERENCES products_s(id) ON DELETE SET NULL,
        quantity NUMERIC(15,3) NOT NULL DEFAULT 0,
        from_pallet_id INTEGER REFERENCES pallets_s(id) ON DELETE SET NULL,
        from_shelf_id INTEGER REFERENCES shelves_s(id) ON DELETE SET NULL,
        from_box_id INTEGER REFERENCES boxes_s(id) ON DELETE SET NULL,
        from_employee_id INTEGER REFERENCES employees_s(id) ON DELETE SET NULL,
        to_pallet_id INTEGER REFERENCES pallets_s(id) ON DELETE SET NULL,
        to_shelf_id INTEGER REFERENCES shelves_s(id) ON DELETE SET NULL,
        to_box_id INTEGER REFERENCES boxes_s(id) ON DELETE SET NULL,
        to_employee_id INTEGER REFERENCES employees_s(id) ON DELETE SET NULL,
        performed_by INTEGER REFERENCES users_s(id) ON DELETE SET NULL,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_movements_c_created ON movements_s(created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_movements_c_product ON movements_s(product_id)`);
    // Add source column and widen movement_type if needed
    await client.query(`ALTER TABLE movements_s ADD COLUMN IF NOT EXISTS source VARCHAR(50)`);
    await client.query(`ALTER TABLE movements_s ALTER COLUMN movement_type TYPE VARCHAR(100)`);
    await client.query(`ALTER TABLE movements_s ADD COLUMN IF NOT EXISTS quantity_before NUMERIC(15,3)`);
    await client.query(`ALTER TABLE movements_s ADD COLUMN IF NOT EXISTS quantity_after NUMERIC(15,3)`);
    // Source of change: scan, manual_edit, task, admin, packaging
    await client.query(`ALTER TABLE movements_s ADD COLUMN IF NOT EXISTS source VARCHAR(30) NOT NULL DEFAULT 'manual_edit'`);
    await client.query(`ALTER TABLE shelf_movements_s ADD COLUMN IF NOT EXISTS source VARCHAR(30) NOT NULL DEFAULT 'manual_edit'`);

    // shelf_box_id columns for tracking box-level movements
    await client.query(`ALTER TABLE movements_s ADD COLUMN IF NOT EXISTS from_shelf_box_id INTEGER REFERENCES shelf_boxes_s(id) ON DELETE SET NULL`);
    await client.query(`ALTER TABLE movements_s ADD COLUMN IF NOT EXISTS to_shelf_box_id INTEGER REFERENCES shelf_boxes_s(id) ON DELETE SET NULL`);
    // Indexes for fast lookups by box/pallet/shelf_box
    await client.query(`CREATE INDEX IF NOT EXISTS idx_movements_s_from_box ON movements_s(from_box_id) WHERE from_box_id IS NOT NULL`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_movements_s_to_box ON movements_s(to_box_id) WHERE to_box_id IS NOT NULL`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_movements_s_from_shelf_box ON movements_s(from_shelf_box_id) WHERE from_shelf_box_id IS NOT NULL`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_movements_s_to_shelf_box ON movements_s(to_shelf_box_id) WHERE to_shelf_box_id IS NOT NULL`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_movements_s_from_pallet ON movements_s(from_pallet_id) WHERE from_pallet_id IS NOT NULL`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_movements_s_to_pallet ON movements_s(to_pallet_id) WHERE to_pallet_id IS NOT NULL`);

    // ─── Roles ─────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS roles_s (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        permissions JSONB NOT NULL DEFAULT '[]',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`ALTER TABLE users_s ADD COLUMN IF NOT EXISTS role_id INTEGER REFERENCES roles_s(id) ON DELETE SET NULL`);

    // Seed default roles
    await client.query(`
      INSERT INTO roles_s (name, permissions) VALUES
        ('Администратор', '["dashboard","products.view","products.edit","warehouse.view","warehouse.edit","tasks.view","tasks.create","tasks.execute","staff.view","staff.edit","movements.view","movements.edit","settings","analytics","errors","roles.manage"]'),
        ('Менеджер', '["dashboard","products.view","warehouse.view","tasks.view","tasks.create","staff.view","movements.view","analytics","errors"]'),
        ('Сотрудник', '["tasks.execute","movements.edit"]')
      ON CONFLICT (name) DO NOTHING
    `);

    // ─── Bundle Assembly ────────────────────────────────────────────
    await client.query(`ALTER TABLE inventory_tasks_s ADD COLUMN IF NOT EXISTS bundle_product_id INTEGER REFERENCES products_s(id)`);
    await client.query(`ALTER TABLE inventory_tasks_s ADD COLUMN IF NOT EXISTS bundle_qty INTEGER DEFAULT 0`);
    await client.query(`ALTER TABLE inventory_tasks_s ADD COLUMN IF NOT EXISTS assembly_phase VARCHAR(20) DEFAULT 'picking'`);
    await client.query(`ALTER TABLE inventory_tasks_s ADD COLUMN IF NOT EXISTS source_boxes JSONB`);
    await client.query(`ALTER TABLE inventory_tasks_s ADD COLUMN IF NOT EXISTS dest_shelf_id INTEGER REFERENCES shelves_s(id)`);
    await client.query(`ALTER TABLE inventory_tasks_s ADD COLUMN IF NOT EXISTS dest_pallet_id INTEGER REFERENCES pallets_s(id)`);
    await client.query(`ALTER TABLE inventory_tasks_s ADD COLUMN IF NOT EXISTS assembled_count INTEGER DEFAULT 0`);
    await client.query(`ALTER TABLE inventory_tasks_s ADD COLUMN IF NOT EXISTS placed_count INTEGER DEFAULT 0`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS assembly_items_s (
        id SERIAL PRIMARY KEY,
        task_id INTEGER NOT NULL REFERENCES inventory_tasks_s(id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL REFERENCES products_s(id),
        source_box_id INTEGER REFERENCES boxes_s(id),
        source_pallet_id INTEGER REFERENCES pallets_s(id),
        source_shelf_id INTEGER REFERENCES shelves_s(id),
        scanned_barcode VARCHAR(500),
        quantity NUMERIC(15,3) DEFAULT 1,
        used_in_bundle INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`ALTER TABLE assembly_items_s ADD COLUMN IF NOT EXISTS source_shelf_id INTEGER REFERENCES shelves_s(id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_assembly_items_task ON assembly_items_s(task_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_assembly_items_bundle ON assembly_items_s(task_id, used_in_bundle)`);

    // ─── One-time migration: remove old "Ижевск FBS" warehouse (id=1) ──
    const oldWh = await client.query(`SELECT id FROM warehouses_s WHERE id = 1 AND name = 'Ижевск FBS'`);
    if (oldWh.rows.length > 0) {
      await client.query(`DELETE FROM warehouses_s WHERE id = 1`);
      console.log('[DB] Removed old warehouse "Ижевск FBS" (id=1)');
    }

    // ─── One-time migration: populate rack 12 in "Ижевск FBS нов" with backup data ──
    const newWhRes = await client.query(`SELECT id FROM warehouses_s WHERE name = 'Ижевск FBS нов'`);
    if (newWhRes.rows.length > 0) {
      const rack12Res = await client.query(`SELECT id FROM racks_s WHERE warehouse_id = $1 AND number = 12`, [newWhRes.rows[0].id]);
      if (rack12Res.rows.length > 0) {
        const rackId = rack12Res.rows[0].id;
        const existingShelves = await client.query(`SELECT id FROM shelves_s WHERE rack_id = $1`, [rackId]);
        if (existingShelves.rows.length === 0) {
          // Shelf definitions: [name, number, code, [[product_id, qty], ...]]
          const shelvesData = [
            ['Полка 1', 1, 'С12П1', [[176,96],[134,60],[142,50],[147,215],[130,19],[171,49],[131,10],[133,181],[113,13],[123,43],[148,33]]],
            ['Полка 2', 2, 'С12П2', [[116,46],[125,27],[172,471],[143,32],[117,194],[128,43],[127,7]]],
            ['Полка 3', 3, 'С12П3', [[167,56],[112,48],[129,40],[132,207],[139,97],[110,1],[40,7],[85,5]]],
            ['Полка 4', 4, 'С12П4', [[159,399],[165,15],[137,3],[175,119],[118,18],[120,47],[168,43],[38,4],[174,38],[140,50],[124,27],[154,24],[155,10],[169,48],[145,7]]],
            ['Полка 5', 5, 'С12П5', [[144,132],[150,42],[170,28],[156,35],[121,17],[158,21],[157,42],[162,38],[146,29],[153,19],[111,1],[151,42],[163,113],[161,37],[173,21],[115,48],[177,22],[114,34],[152,42],[160,13],[141,50]]],
          ];
          let totalItems = 0;
          for (const [name, num, code, itemsList] of shelvesData) {
            const bc = String(Math.floor(Math.random() * 900000000) + 100000000);
            const sr = await client.query(
              `INSERT INTO shelves_s (rack_id, name, number, code, barcode_value) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
              [rackId, name, num, code, bc]
            );
            const sid = sr.rows[0].id;
            for (const [pid, qty] of itemsList) {
              const prodExists = await client.query(`SELECT id FROM products_s WHERE id = $1`, [pid]);
              if (prodExists.rows.length > 0) {
                await client.query(`INSERT INTO shelf_items_s (shelf_id, product_id, quantity) VALUES ($1,$2,$3)`, [sid, pid, qty]);
                totalItems++;
              }
            }
          }
          console.log(`[DB] Migrated rack 12: 5 shelves, ${totalItems} items from old backup`);
        }
      }
    }

    // ─── One-time: create test tasks for Нурьев Артем ──
    const testTaskCheck = await client.query(`SELECT id FROM inventory_tasks_s WHERE title LIKE 'Тест:%' AND employee_id = (SELECT id FROM employees_s WHERE full_name ILIKE '%Нурьев Артем%' LIMIT 1) LIMIT 1`);
    if (testTaskCheck.rows.length === 0) {
      const empRes = await client.query(`SELECT id FROM employees_s WHERE full_name ILIKE '%Нурьев Артем%' LIMIT 1`);
      if (empRes.rows.length > 0) {
        const empId = empRes.rows[0].id;
        const adminRes = await client.query(`SELECT id FROM users_s WHERE role = 'admin' LIMIT 1`);
        const adminId = adminRes.rows[0]?.id || 1;
        const shelfRes = await client.query(`SELECT s.id, s.code FROM shelves_s s JOIN racks_s r ON r.id=s.rack_id JOIN warehouses_s w ON w.id=r.warehouse_id WHERE w.name='Ижевск FBS нов' ORDER BY s.id LIMIT 3`);
        const palletRes = await client.query(`SELECT p.id, p.name FROM pallets_s p JOIN pallet_rows_s pr ON pr.id=p.row_id JOIN warehouses_s w ON w.id=pr.warehouse_id WHERE w.name='Наша продукция нов' ORDER BY p.id LIMIT 3`);
        const types = [];
        if (shelfRes.rows[0]) {
          await client.query(`INSERT INTO inventory_tasks_s (title, employee_id, shelf_id, task_type, created_by) VALUES ($1,$2,$3,'inventory',$4)`,
            ['Тест: Инвентаризация ' + shelfRes.rows[0].code, empId, shelfRes.rows[0].id, adminId]);
          types.push('inventory');
        }
        if (shelfRes.rows[1]) {
          await client.query(`INSERT INTO inventory_tasks_s (title, employee_id, shelf_id, task_type, created_by) VALUES ($1,$2,$3,'inventory',$4)`,
            ['Тест: Инвентаризация ' + shelfRes.rows[1].code, empId, shelfRes.rows[1].id, adminId]);
        }
        if (shelfRes.rows[2]) {
          await client.query(`INSERT INTO inventory_tasks_s (title, employee_id, shelf_id, task_type, created_by) VALUES ($1,$2,$3,'inventory',$4)`,
            ['Тест: Инвентаризация ' + shelfRes.rows[2].code, empId, shelfRes.rows[2].id, adminId]);
        }
        if (palletRes.rows[0]) {
          await client.query(`INSERT INTO inventory_tasks_s (title, employee_id, target_pallet_id, task_type, created_by) VALUES ($1,$2,$3,'packaging',$4)`,
            ['Тест: Оприходование ' + palletRes.rows[0].name, empId, palletRes.rows[0].id, adminId]);
          await client.query(`INSERT INTO inventory_tasks_s (title, employee_id, target_pallet_id, task_type, created_by) VALUES ($1,$2,$3,'packaging',$4)`,
            ['Тест: Оприходование 2 ' + palletRes.rows[0].name, empId, palletRes.rows[0].id, adminId]);
          await client.query(`INSERT INTO inventory_tasks_s (title, employee_id, target_pallet_id, task_type, created_by) VALUES ($1,$2,$3,'packaging',$4)`,
            ['Тест: Оприходование 3 ' + (palletRes.rows[1]||palletRes.rows[0]).name, empId, (palletRes.rows[1]||palletRes.rows[0]).id, adminId]);
          types.push('packaging');
        }
        if (palletRes.rows[0]) {
          await client.query(`INSERT INTO inventory_tasks_s (title, employee_id, target_pallet_id, task_type, created_by) VALUES ($1,$2,$3,'production_transfer',$4)`,
            ['Тест: Перенос на ' + palletRes.rows[0].name, empId, palletRes.rows[0].id, adminId]);
          await client.query(`INSERT INTO inventory_tasks_s (title, employee_id, target_pallet_id, task_type, created_by) VALUES ($1,$2,$3,'production_transfer',$4)`,
            ['Тест: Перенос на ' + (palletRes.rows[1]||palletRes.rows[0]).name, empId, (palletRes.rows[1]||palletRes.rows[0]).id, adminId]);
          await client.query(`INSERT INTO inventory_tasks_s (title, employee_id, target_pallet_id, task_type, created_by) VALUES ($1,$2,$3,'production_transfer',$4)`,
            ['Тест: Перенос на ' + (palletRes.rows[2]||palletRes.rows[0]).name, empId, (palletRes.rows[2]||palletRes.rows[0]).id, adminId]);
          types.push('production_transfer');
        }
        console.log('[DB] Created test tasks:', types.join(', '));
      }
    }

    await client.query('COMMIT');
    console.log('[DB] Schema created/verified successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[DB] Schema creation failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { createSchema };

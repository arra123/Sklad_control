const pool = require('../db/pool');
const externalPool = require('../db/externalPool');
const { hashPassword } = require('./password');

/**
 * Sync employees from external o_site DB into local c_site DB.
 *
 * Rules:
 * - Only sync employees with external_employee_id link
 * - Never touch local-only users (no external link)
 * - Only update password if password_plain actually changed
 * - Never deactivate admin/manager users
 * - Reactivate employees that reappear on external site
 */
async function syncEmployeesFromOsite() {
  try {
    const { rows: extEmployees } = await externalPool.query(`
      SELECT e.id, e.full_name, e.phone, e.status, e.department_id,
             p.name AS position_name, d.name AS department_name,
             u.login, u.password_plain
      FROM employees_d e
      LEFT JOIN positions_d p ON p.id = e.position_id
      LEFT JOIN departments_d d ON d.id = e.department_id
      LEFT JOIN users_d u ON u.employee_id = e.id
      WHERE e.status IN ('active', 'internship')
      ORDER BY e.full_name
    `);

    let created = 0, updated = 0, deactivated = 0;

    for (const ext of extEmployees) {
      const existing = await pool.query(
        'SELECT id FROM employees_s WHERE external_employee_id = $1',
        [ext.id]
      );

      let empId;
      if (existing.rows.length > 0) {
        empId = existing.rows[0].id;
        // Update name/phone/position, reactivate
        await pool.query(
          `UPDATE employees_s SET full_name=$1, phone=$2, position=$3, department=$4, active=true WHERE id=$5`,
          [ext.full_name, ext.phone, ext.position_name, ext.department_name || null, empId]
        );
        await pool.query('UPDATE users_s SET active = true WHERE employee_id = $1', [empId]);
        updated++;
      } else {
        const res = await pool.query(
          `INSERT INTO employees_s (full_name, position, phone, external_employee_id, active, department)
           VALUES ($1, $2, $3, $4, true, $5) RETURNING id`,
          [ext.full_name, ext.position_name, ext.phone, ext.id, ext.department_name || null]
        );
        empId = res.rows[0].id;
        created++;
      }

      // Sync user account
      if (ext.login) {
        const existingUser = await pool.query(
          'SELECT id, password_plain FROM users_s WHERE employee_id = $1',
          [empId]
        );

        if (existingUser.rows.length > 0) {
          const localPlain = existingUser.rows[0].password_plain;
          // Only rehash if password actually changed
          if (ext.password_plain && ext.password_plain !== localPlain) {
            const hash = await hashPassword(ext.password_plain);
            await pool.query(
              `UPDATE users_s SET username=$1, password_hash=$2, password_plain=$3 WHERE employee_id=$4`,
              [ext.login, hash, ext.password_plain, empId]
            );
          } else {
            // Just update username in case it changed
            await pool.query(`UPDATE users_s SET username=$1 WHERE employee_id=$2`, [ext.login, empId]);
          }
        } else {
          // Create new user
          if (ext.password_plain) {
            const hash = await hashPassword(ext.password_plain);
            await pool.query(
              `INSERT INTO users_s (username, password_hash, password_plain, role, employee_id, active)
               VALUES ($1, $2, $3, 'employee', $4, true)`,
              [ext.login, hash, ext.password_plain, empId]
            );
          }
        }
      }
    }

    // Deactivate linked employees no longer active on external site
    const activeExtIds = new Set(extEmployees.map(e => Number(e.id)));
    const localLinked = await pool.query(
      'SELECT id, external_employee_id FROM employees_s WHERE external_employee_id IS NOT NULL AND active = true'
    );
    for (const local of localLinked.rows) {
      if (!activeExtIds.has(Number(local.external_employee_id))) {
        await pool.query('UPDATE employees_s SET active = false WHERE id = $1', [local.id]);
        // Don't deactivate admin/manager users even if their employee is deactivated
        await pool.query(
          `UPDATE users_s SET active = false WHERE employee_id = $1 AND role NOT IN ('admin', 'manager')`,
          [local.id]
        );
        deactivated++;
      }
    }

    // NOTE: Never touch local-only users (no external_employee_id)

    console.log(`[Sync] Created ${created}, updated ${updated}, deactivated ${deactivated}`);
  } catch (err) {
    console.error('[Sync] Error:', err.message);
  }
}

module.exports = { syncEmployeesFromOsite };

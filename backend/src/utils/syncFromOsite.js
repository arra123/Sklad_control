const pool = require('../db/pool');
const externalPool = require('../db/externalPool');
const { hashPassword } = require('./password');

/**
 * Sync employees and users from o_site DB (external) into c_site DB (local).
 * Same login/password — so users can login with same credentials on both sites.
 */
async function syncEmployeesFromOsite() {
  try {
    // Get all active employees with their users from o_site
    const { rows: extEmployees } = await externalPool.query(`
      SELECT e.id, e.full_name, e.phone, e.status, e.department_id,
             p.name AS position_name, d.name AS department_name,
             u.login, u.password_hash, u.password_plain, u.role
      FROM employees_d e
      LEFT JOIN positions_d p ON p.id = e.position_id
      LEFT JOIN departments_d d ON d.id = e.department_id
      LEFT JOIN users_d u ON u.employee_id = e.id
      WHERE e.status IN ('active', 'internship')
      ORDER BY e.full_name
    `);

    let synced = 0;

    for (const ext of extEmployees) {
      // Check if employee already exists by external_employee_id
      const existing = await pool.query(
        'SELECT id FROM employees_s WHERE external_employee_id = $1',
        [ext.id]
      );

      let empId;
      if (existing.rows.length > 0) {
        empId = existing.rows[0].id;
        // Update name/phone/position
        await pool.query(
          `UPDATE employees_s SET full_name=$1, phone=$2, position=$3, department=$4 WHERE id=$5`,
          [ext.full_name, ext.phone, ext.position_name, ext.department_name || null, empId]
        );
      } else {
        // Create new employee
        const res = await pool.query(
          `INSERT INTO employees_s (full_name, position, phone, external_employee_id, active, department)
           VALUES ($1, $2, $3, $4, true, $5) RETURNING id`,
          [ext.full_name, ext.position_name, ext.phone, ext.id, ext.department_name || null]
        );
        empId = res.rows[0].id;
        synced++;
      }

      // Sync user account (same login/password)
      if (ext.login) {
        const existingUser = await pool.query(
          'SELECT id FROM users_s WHERE employee_id = $1',
          [empId]
        );

        if (existingUser.rows.length > 0) {
          // Update login and password to match o_site
          await pool.query(
            `UPDATE users_s SET username=$1, password_hash=$2, password_plain=$3 WHERE employee_id=$4`,
            [ext.login, ext.password_hash, ext.password_plain || null, empId]
          );
        } else {
          // Create user with same credentials
          await pool.query(
            `INSERT INTO users_s (username, password_hash, password_plain, role, employee_id, active)
             VALUES ($1, $2, $3, $4, $5, true)`,
            [ext.login, ext.password_hash, ext.password_plain || null, ext.role === 'admin' ? 'admin' : 'employee', empId]
          );
        }
      }
    }

    if (synced > 0) {
      console.log(`[Sync] Synced ${synced} new employees from o_site`);
    } else {
      console.log('[Sync] All employees already synced');
    }
  } catch (err) {
    console.error('[Sync] Error syncing from o_site:', err.message);
  }
}

module.exports = { syncEmployeesFromOsite };

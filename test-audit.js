const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://147.45.97.155/sklad';
const SCREENS_DIR = path.join(__dirname, 'test-screenshots');

async function run() {
  if (!fs.existsSync(SCREENS_DIR)) fs.mkdirSync(SCREENS_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();

  const errors = [];
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => errors.push(err.message));

  const results = [];

  async function screenshot(name) {
    await page.screenshot({ path: path.join(SCREENS_DIR, `${name}.png`), fullPage: true });
  }

  async function testPage(name, url, checks = []) {
    const result = { name, url, status: 'ok', issues: [] };
    try {
      const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
      if (!resp || resp.status() >= 400) {
        result.issues.push(`HTTP ${resp?.status() || 'no response'}`);
        result.status = 'error';
      }
      await page.waitForTimeout(1000);
      await screenshot(name);

      // Check for visible error messages
      const errorEl = await page.$('.text-red-500, .text-red-600, [role="alert"]');
      if (errorEl) {
        const text = await errorEl.textContent();
        if (text && text.length > 5) result.issues.push(`Visible error: ${text.trim().slice(0, 100)}`);
      }

      // Check for empty state (no data loaded)
      const spinner = await page.$('.animate-spin');
      if (spinner) result.issues.push('Spinner still visible (data not loaded?)');

      // Check page has content
      const bodyText = await page.textContent('body');
      if (bodyText.length < 50) result.issues.push('Page appears empty');

      // Check for "FBO" or "FBS" text still visible
      if (/\bFBO\b|\bFBS\b/.test(bodyText)) {
        const matches = bodyText.match(/\b(FBO|FBS)\b/g) || [];
        result.issues.push(`Still shows FBO/FBS text: ${[...new Set(matches)].join(', ')}`);
      }

      // Run custom checks
      for (const check of checks) {
        try {
          const issue = await check(page);
          if (issue) result.issues.push(issue);
        } catch (e) {
          result.issues.push(`Check failed: ${e.message}`);
        }
      }

      if (result.issues.length > 0 && result.status === 'ok') result.status = 'warning';
    } catch (e) {
      result.status = 'error';
      result.issues.push(e.message.slice(0, 200));
      try { await screenshot(name + '-error'); } catch {}
    }
    results.push(result);
    return result;
  }

  // 1. Login
  console.log('1. Login...');
  await page.goto(BASE + '/login', { waitUntil: 'networkidle', timeout: 15000 });
  await page.fill('input[type="text"], input[name="username"], input:first-of-type', 'admin');
  await page.fill('input[type="password"]', 'Admin12345');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/admin**', { timeout: 10000 });
  await page.waitForTimeout(1500);
  await screenshot('01-login-success');
  results.push({ name: 'Login', url: BASE + '/login', status: 'ok', issues: [] });

  // 2. Dashboard
  console.log('2. Dashboard...');
  await testPage('02-dashboard', BASE + '/admin', [
    async (p) => {
      const links = await p.$$('nav .sidebar-link');
      const labels = [];
      for (const l of links) labels.push(await l.textContent());
      const dashCount = labels.filter(t => t.includes('Дашборд')).length;
      if (dashCount > 1) return `Dashboard duplicated ${dashCount} times in sidebar`;
      return null;
    }
  ]);

  // 3. Products - Cards
  console.log('3. Products Cards...');
  await testPage('03-products-cards', BASE + '/admin/products/cards');

  // 4. Products - Stock
  console.log('4. Products Stock...');
  await testPage('04-products-stock', BASE + '/admin/products/stock');

  // 5. Warehouse
  console.log('5. Warehouse...');
  await testPage('05-warehouse', BASE + '/admin/warehouse');

  // 6. Tasks
  console.log('6. Tasks...');
  await testPage('06-tasks', BASE + '/admin/tasks');

  // 7. Test Create Task modal
  console.log('7. Create Task Modal...');
  try {
    await page.goto(BASE + '/admin/tasks', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);
    const createBtn = await page.$('button:has-text("Создать задачу")');
    if (createBtn) {
      await createBtn.click();
      await page.waitForTimeout(1500);
      await screenshot('07-create-task-modal');

      // Try clicking warehouse SearchSelect
      const warehouseField = await page.$('text=Поиск склада...');
      if (warehouseField) {
        await warehouseField.click();
        await page.waitForTimeout(500);
        await screenshot('07b-warehouse-dropdown');
        const dropItems = await page.$$('[class*="z-[100]"] > div');
        if (dropItems.length === 0) {
          results.push({ name: 'SearchSelect', url: '', status: 'warning', issues: ['Warehouse dropdown empty or not opening'] });
        }
      }
      // Close modal
      const closeBtn = await page.$('button:has-text("Отмена")');
      if (closeBtn) await closeBtn.click();
    }
  } catch (e) {
    results.push({ name: 'Create Task Modal', url: '', status: 'error', issues: [e.message.slice(0, 200)] });
  }

  // 8. Analytics
  console.log('8. Analytics...');
  await testPage('08-analytics', BASE + '/admin/analytics');

  // 9. Earnings
  console.log('9. Earnings...');
  await testPage('09-earnings', BASE + '/admin/earnings');

  // 10. Movements
  console.log('10. Movements...');
  await testPage('10-movements', BASE + '/admin/movements');

  // 11. Errors page
  console.log('11. Errors...');
  await testPage('11-errors', BASE + '/admin/errors');

  // 12. Staff
  console.log('12. Staff...');
  await testPage('12-staff', BASE + '/admin/staff', [
    async (p) => {
      // Check if password column exists
      const headers = await p.$$eval('th', els => els.map(e => e.textContent));
      if (!headers.some(h => h.includes('Пароль'))) return 'Password column missing in users table';
      return null;
    }
  ]);

  // 13. Settings
  console.log('13. Settings...');
  await testPage('13-settings', BASE + '/admin/settings');

  // 14. FBO Page
  console.log('14. Pallet warehouse...');
  await testPage('14-pallet-warehouse', BASE + '/admin/fbo');

  // 15. Employee view
  console.log('15. Employee view...');
  // Logout and login as employee if possible, or just check route
  await testPage('15-employee-tasks', BASE + '/employee/tasks');

  // 16. Version check
  console.log('16. Version check...');
  await page.goto(BASE + '/admin', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1000);
  const bodyText = await page.textContent('body');
  const versionMatch = bodyText.match(/v\d+\.\d+\.\d+/);
  if (versionMatch) {
    results.push({ name: 'Version', url: '', status: 'ok', issues: [`Showing: ${versionMatch[0]}`] });
  } else {
    results.push({ name: 'Version', url: '', status: 'warning', issues: ['Version not found on page'] });
  }

  await browser.close();

  // Report
  console.log('\n' + '='.repeat(70));
  console.log('AUDIT REPORT — ' + new Date().toLocaleString('ru-RU'));
  console.log('='.repeat(70) + '\n');

  for (const r of results) {
    const icon = r.status === 'ok' ? '✅' : r.status === 'warning' ? '⚠️' : '❌';
    console.log(`${icon} ${r.name} ${r.url ? `(${r.url})` : ''}`);
    for (const issue of r.issues) console.log(`   → ${issue}`);
  }

  if (consoleErrors.length > 0) {
    console.log(`\n⚠️ Console errors (${consoleErrors.length}):`);
    [...new Set(consoleErrors)].slice(0, 10).forEach(e => console.log(`   → ${e.slice(0, 150)}`));
  }

  if (errors.length > 0) {
    console.log(`\n❌ Page errors (${errors.length}):`);
    errors.slice(0, 10).forEach(e => console.log(`   → ${e.slice(0, 150)}`));
  }

  console.log(`\nScreenshots saved to: ${SCREENS_DIR}`);
  console.log(`Total pages tested: ${results.length}`);
  console.log(`Issues found: ${results.filter(r => r.status !== 'ok').length}`);
}

run().catch(console.error);

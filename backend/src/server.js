require('dotenv').config();
const app = require('./app');
const config = require('./config');
const { createSchema } = require('./db/schema');
const { runSeed } = require('./db/seed');
const { syncEmployeesFromOsite } = require('./utils/syncFromOsite');

async function start() {
  try {
    await createSchema();
    await runSeed();
    app.listen(config.port, () => {
      console.log(`[Server] Running at http://localhost:${config.port}`);
      // Sync disabled at startup — only via POST /staff/sync
      // syncEmployeesFromOsite().catch(err => console.error('[Sync] Background sync failed:', err.message));
    });
  } catch (err) {
    console.error('[Server] Failed to start:', err.message);
    process.exit(1);
  }
}

start();

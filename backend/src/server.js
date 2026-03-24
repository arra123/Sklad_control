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
    await syncEmployeesFromOsite();
    app.listen(config.port, () => {
      console.log(`[Server] Running at http://localhost:${config.port}`);
    });
  } catch (err) {
    console.error('[Server] Failed to start:', err.message);
    process.exit(1);
  }
}

start();

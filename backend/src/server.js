require('dotenv').config();
const http = require('http');
const app = require('./app');
const config = require('./config');
const { createSchema } = require('./db/schema');
const { runSeed } = require('./db/seed');
const { syncEmployeesFromOsite } = require('./utils/syncFromOsite');
const { initSocket } = require('./socket');

async function start() {
  try {
    await createSchema();
    await runSeed();
    const server = http.createServer(app);
    initSocket(server);
    server.listen(config.port, () => {
      console.log(`[Server] Running at http://localhost:${config.port}`);
      syncEmployeesFromOsite().catch(err => console.error('[Sync] Background sync failed:', err.message));
    });
  } catch (err) {
    console.error('[Server] Failed to start:', err.message);
    process.exit(1);
  }
}

start();

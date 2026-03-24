const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');

const authRoutes = require('./routes/auth');
const productsRoutes = require('./routes/products');
const warehouseRoutes = require('./routes/warehouse');
const tasksRoutes = require('./routes/tasks');
const fboRoutes = require('./routes/fbo');
const packingRoutes = require('./routes/packing');
const staffRoutes = require('./routes/staff');
const settingsRoutes = require('./routes/settings');
const syserrorsRoutes = require('./routes/syserrors');
const movementsRoutes = require('./routes/movements');

const app = express();
const siteRouter = express.Router();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// API routes
siteRouter.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

siteRouter.use('/api/auth', authRoutes);
siteRouter.use('/api/products', productsRoutes);
siteRouter.use('/api/warehouse', warehouseRoutes);
siteRouter.use('/api/tasks', tasksRoutes);
siteRouter.use('/api/fbo', fboRoutes);
siteRouter.use('/api/packing', packingRoutes);
siteRouter.use('/api/staff', staffRoutes);
siteRouter.use('/api/settings', settingsRoutes);
siteRouter.use('/api/errors', syserrorsRoutes);
siteRouter.use('/api/movements', movementsRoutes);
siteRouter.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Serve frontend in production
const frontendDist = path.join(__dirname, '../../frontend/dist');
siteRouter.use(express.static(frontendDist, { maxAge: '1d', immutable: true }));
siteRouter.get('*', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(frontendDist, 'index.html'));
});

if (config.appBasePath) {
  app.use(config.appBasePath, siteRouter);
} else {
  app.use(siteRouter);
}

module.exports = app;

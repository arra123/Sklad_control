require('dotenv').config();

function normalizeBasePath(value) {
  const cleaned = String(value || '').trim();
  if (!cleaned || cleaned === '/') {
    return '';
  }

  return `/${cleaned.replace(/^\/+|\/+$/g, '')}`;
}

module.exports = {
  port: parseInt(process.env.PORT || '3020', 10),
  appBasePath: normalizeBasePath(process.env.APP_BASE_PATH || ''),
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'default_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    ssl: process.env.DB_SSL === 'true',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'change_me',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  seed: {
    adminLogin: process.env.SEED_ADMIN_LOGIN || 'admin',
    adminPassword: process.env.SEED_ADMIN_PASSWORD || 'Admin12345',
  },
  catalogSourceDir: process.env.CATALOG_SOURCE_DIR || 'C:\\ARRA\\Work\\moiskladimport',
  moySkladToken: process.env.MOYSKLAD_TOKEN || '',
  wbToken: process.env.WB_TOKEN || '',
  moySkladApiBase: 'https://api.moysklad.ru/api/remap/1.2',
  externalDb: {
    host: process.env.EXT_DB_HOST || '5.42.100.180',
    port: parseInt(process.env.EXT_DB_PORT || '5432', 10),
    database: process.env.EXT_DB_NAME || 'bd2',
    user: process.env.EXT_DB_USER || 'danila',
    password: process.env.EXT_DB_PASSWORD || 'Iw)7oH$nbu=T%m',
    ssl: process.env.EXT_DB_SSL === 'true',
  },
};

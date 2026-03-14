import path from 'node:path';

const isProduction = process.env.NODE_ENV === 'production';
const rootDir = process.cwd();
const defaultDataDir = isProduction ? '/data' : path.join(rootDir, 'data');
const dataDir = process.env.DATA_DIR || defaultDataDir;
const dbPath = process.env.DB_PATH || path.join(dataDir, 'skills.db');

const fallbackApiKey = 'local-dev-api-key';
const fallbackSyncKey = 'local-dev-sync-key';

export const config = {
  isProduction,
  rootDir,
  dataDir,
  dbPath,
  port: Number.parseInt(process.env.PORT || '3000', 10),
  apiKey: process.env.API_KEY || (!isProduction ? fallbackApiKey : ''),
  syncKey: process.env.SYNC_KEY || (!isProduction ? fallbackSyncKey : ''),
  corsOrigin: process.env.CORS_ORIGIN || '*'
};

export function validateConfig() {
  if (!Number.isFinite(config.port) || config.port <= 0) {
    throw new Error('PORT must be a positive integer.');
  }

  if (config.isProduction && !config.apiKey) {
    throw new Error('API_KEY is required in production.');
  }

  if (config.isProduction && !config.syncKey) {
    throw new Error('SYNC_KEY is required in production.');
  }
}

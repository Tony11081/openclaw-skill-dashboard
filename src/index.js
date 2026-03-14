import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import { config, validateConfig } from './config.js';
import { getStats } from './db.js';
import { createHeaderAuth } from './middleware/auth.js';
import { readRateLimiter, syncRateLimiter } from './middleware/rateLimit.js';
import skillsRouter from './routes/skills.js';
import statsRouter from './routes/stats.js';
import syncRouter from './routes/sync.js';

validateConfig();

if (!config.isProduction) {
  console.log(`[cloud-skills-api] Using development API key: ${config.apiKey}`);
  console.log(`[cloud-skills-api] Using development sync key: ${config.syncKey}`);
}

const app = express();
const publicDir = path.join(config.rootDir, 'src', 'public');

fs.mkdirSync(config.dataDir, { recursive: true });

app.disable('x-powered-by');
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: '15mb' }));
app.use(express.static(publicDir));

const requireApiKey = createHeaderAuth({
  headerName: 'X-API-Key',
  expectedValue: config.apiKey,
  label: 'API key'
});

const requireSyncKey = createHeaderAuth({
  headerName: 'X-Sync-Key',
  expectedValue: config.syncKey,
  label: 'Sync key'
});

app.get('/api', (_req, res) => {
  const stats = getStats();
  res.json({ name: 'cloud-skills-api', status: 'ok', skillCount: stats.total });
});

app.use('/api/skills', readRateLimiter, requireApiKey, skillsRouter);
app.use('/api/stats', readRateLimiter, requireApiKey, statsRouter);
app.use('/api/sync', syncRateLimiter, requireSyncKey, syncRouter);

app.get('/', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'API route not found.' });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error.' });
});

app.listen(config.port, () => {
  console.log(`Cloud Skills API listening on http://0.0.0.0:${config.port}`);
  console.log(`Data dir: ${config.dataDir}`);
});

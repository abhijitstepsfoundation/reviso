import express from 'express';
import path from 'path';
import { config } from './config';
import health from './routes/health';
import me from './routes/me';
import diag from './routes/diag';
import { notFound, errorHandler } from './middleware/errors';

const app = express();
app.use(express.json({ limit: '25mb' }));

// --- API ---
const api = express.Router();
api.use(health);
api.use(me);
api.use(diag);
app.use('/api', api);
app.use('/api', notFound);

// --- Static frontend (production only; in dev Vite serves it) ---
const publicDir = path.resolve(__dirname, '../public');
app.use(express.static(publicDir));

// Single-page-app fallback. Written as middleware rather than a '*' route
// because Express 5 no longer accepts a bare wildcard path.
app.use((_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'), (err) => {
    if (err) res.status(404).send('Frontend not built');
  });
});

app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`Reviso backend listening on port ${config.port}`);
  console.log(`Project: ${config.projectId} | Model: ${config.geminiModel}`);
});

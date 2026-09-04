import express from 'express';
import path from 'path';
import { config } from './config';
import health from './routes/health';
import me from './routes/me';
import diag from './routes/diag';
import materials from './routes/materials';
import sessions from './routes/sessions';
import exams from './routes/exams';
import profile from './routes/profile';
import { notFound, errorHandler } from './middleware/errors';
import { securityHeaders, rateLimit } from './middleware/security';
import { requireAuth } from './middleware/auth';

const app = express();

// Cloud Run terminates TLS upstream; trust its forwarding headers so that
// req.ip reflects the real client for rate limiting.
app.set('trust proxy', true);
app.disable('x-powered-by');

app.use(securityHeaders);
app.use(express.json({ limit: '25mb' }));

// --- API ---
const api = express.Router();

api.use(health);

// Everything below requires a verified Firebase ID token. Rate limits are
// keyed on the authenticated uid, so they are applied after verification.
api.use(requireAuth);
api.use(rateLimit(120, 60_000));

// The AI endpoints are the expensive ones and get a tighter limit.
api.use(['/materials', '/sessions', '/exams', '/profile'], (req, res, next) => {
  if (req.method === 'GET') return next();
  return rateLimit(20, 60_000)(req, res, next);
});

api.use(me);
api.use(materials);
api.use(sessions);
api.use(exams);
api.use(profile);

// Diagnostics expose model availability. Useful while building, off by
// default in production.
if (process.env.ENABLE_DIAG === 'true') {
  api.use(diag);
}

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

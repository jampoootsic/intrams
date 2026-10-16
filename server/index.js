import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import dotenv from 'dotenv';
import judgeRoutes from './routes/auth.js';
import competitionRoutes from './routes/competitions.js';
import candidateRoutes from './routes/candidates.js';
import teamRoutes from './routes/teams.js';
import segmentRoutes from './routes/segments.js';
import scoreRoutes from './routes/scores.js';
import resultRoutes from './routes/results.js';
import settingsRoutes from './routes/settings.js';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3001);

app.use(
  cors({
    // Allow same-origin requests and any origin from inside the local network,
    // so the dev app can be opened from other devices:
    // e.g. http://localhost:5174, http://192.168.1.50:5174
    origin(origin, callback) {
      const allowed =
        !origin ||
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ||
        /^https?:\/\/192\.168\.\d{1,3}\.\d{1,3}(:\d+)?$/.test(origin) ||
        /^https?:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?$/.test(origin) ||
        /^https?:\/\/172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}(:\d+)?$/.test(origin);
      // cors expects the reflected origin to be echoed back when allowed.
      callback(null, allowed ? origin : false);
    },
  }),
);
app.use(express.json());

app.use('/api/auth', judgeRoutes);
app.use('/api/competitions', competitionRoutes);
app.use('/api/candidates', candidateRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/segments', segmentRoutes);
app.use('/api/scores', scoreRoutes);
app.use('/api/results', resultRoutes);
app.use('/api/settings', settingsRoutes);

app.get('/api/health', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// Serve built React app if it exists.
const dist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(dist));

// Serve uploaded candidate photos.
const uploadsDir = path.join(__dirname, 'uploads');
app.use('/uploads', express.static(uploadsDir));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  return res.sendFile(path.join(dist, 'index.html'), (err) => {
    if (err) next();
  });
});

app.listen(PORT, () => {
  console.log(`Events scoring server running at http://localhost:${PORT}`);
});
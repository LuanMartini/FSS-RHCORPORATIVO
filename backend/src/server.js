import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { getEnv } from './config/env.js';
import { getPool } from './db/client.js';
import { ensureSchema, seedIfEmpty } from './db/schema.js';
import { corsOptions, securityMiddleware } from './middleware/security.js';
import authRoutes from './routes/authRoutes.js';
import rhRoutes from './routes/rhRoutes.js';

const env = getEnv();

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(securityMiddleware());
  app.use(cors(corsOptions()));
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (req, res) => {
    res.json({ ok: true, service: 'rhcorp-api' });
  });

  app.use(authRoutes);
  app.use('/rh', rhRoutes);

  app.use((req, res) => {
    res.status(404).json({ erro: 'Rota nao encontrada' });
  });

  app.use((err, req, res, next) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    const status = err.status || 500;
    const message = status >= 500 ? 'Erro interno do servidor' : err.message;
    if (status >= 500) console.error(err);
    res.status(status).json({ erro: message });
  });

  return app;
}

export async function start() {
  await getPool();
  await ensureSchema();
  await seedIfEmpty();
  const app = createApp();
  app.listen(env.port, () => {
    console.log(`API http://localhost:${env.port}`);
  });
}

if (process.env.NODE_ENV !== 'test') {
  start().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

import 'dotenv/config';
import express from 'express';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import cors from 'cors';
import { getEnv } from './config/env.js';
import { getPool } from './db/client.js';
import { assertSchemaCurrent } from './db/migrate.js';
import { corsOptions, securityMiddleware } from './middleware/security.js';
import authRoutes from './routes/authRoutes.js';
import rhRoutes from './routes/rhRoutes.js';
import coreRoutes, { publicCoreRoutes } from './core/interfaces/coreRoutes.js';
import journeyRoutes from './jornada/interfaces/journeyRoutes.ts';
import payrollRoutes from './payroll/interfaces/payrollRoutes.ts';
import atsRoutes, { publicAtsRoutes } from './ats/interfaces/atsRoutes.ts';
import { attachAtsSocketServer, atsInfrastructureStatus } from './ats/interfaces/atsSocketServer.ts';
import performanceRoutes from './performance/interfaces/performanceRoutes.ts';
import flexBenefitsRoutes from './flexBenefits/interfaces/flexBenefitsRoutes.ts';
import lmsRoutes from './lms/interfaces/lmsRoutes.ts';
import climateRoutes from './climate/interfaces/climateRoutes.ts';
import auditRoutes from './audit/interfaces/auditRoutes.ts';
import privacyRoutes from './privacy/privacyRoutes.js';
import { auditCaptureMiddleware } from './audit/interfaces/auditCaptureMiddleware.ts';

const env = getEnv();

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', env.trustProxyHops);
  app.use(securityMiddleware());
  app.use(cors(corsOptions()));
  app.use(express.json({ limit: '1mb' }));
  app.use((req,res,next)=>{req.correlationId=String(req.get('x-correlation-id')||randomUUID());res.setHeader('x-correlation-id',req.correlationId);next();});
  app.use(auditCaptureMiddleware);

  app.get('/health', (req, res) => {
    res.json({ ok: true, service: 'rhcorp-api' });
  });
  app.get('/ready', async (req, res) => {
    try {
      await (await getPool()).query('SELECT 1');
      await assertSchemaCurrent();
      const sockets = atsInfrastructureStatus();
      if (!sockets.ready) return res.status(503).json({ ok: false, service: 'rhcorp-api', redis: sockets.error ?? 'not-ready' });
      res.json({ ok: true, service: 'rhcorp-api' });
    } catch (error) {
      res.status(503).json({ ok: false, service: 'rhcorp-api', error: 'not-ready' });
    }
  });

  app.use(authRoutes);
  app.use('/rh', rhRoutes);
  app.use('/core/publico', publicCoreRoutes);
  app.use('/ats/publico', publicAtsRoutes);
  app.use('/core', coreRoutes);
  app.use('/jornada', journeyRoutes);
  app.use('/payroll', payrollRoutes);
  app.use('/ats', atsRoutes);
  app.use('/performance', performanceRoutes);
  app.use('/flex-benefits', flexBenefitsRoutes);
  app.use('/lms', lmsRoutes);
  app.use('/clima', climateRoutes);
  app.use('/auditoria', auditRoutes);
  app.use('/privacidade', privacyRoutes);

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
    const body = { erro: message };
    if (status < 500 && err.code) body.codigo = err.code;
    if (status < 500 && err.details) body.detalhes = err.details;
    res.status(status).json(body);
  });

  return app;
}

export async function start() {
  await getPool();
  await assertSchemaCurrent();
  const app = createApp();
  const server = createServer(app);
  attachAtsSocketServer(server);
  server.listen(env.port, () => {
    console.log(`API http://localhost:${env.port}`);
  });
}

if (process.env.NODE_ENV !== 'test') {
  start().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

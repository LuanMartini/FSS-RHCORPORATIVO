import 'dotenv/config';
import express from 'express';
import { createServer } from 'node:http';
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
import { initializeErrorTracking, installProcessErrorHandlers, reportError } from './observability/errorTracking.js';
import { errorLogFields, logger } from './observability/logger.js';
import {
  httpMetricsMiddleware, httpRequestLogMiddleware, metricsAccessMiddleware, prometheusMetrics,
  recordError, requestIdMiddleware,
} from './observability/metrics.js';
import { assertIcpBrasilConfiguration } from './security/icpBrasilSigner.ts';
import { assertEsocialTransmissionConfiguration } from './payroll/esocial/esocialClient.ts';

const env = getEnv();

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', env.trustProxyHops);
  app.use(securityMiddleware());
  app.use(cors(corsOptions()));
  app.use(express.json({ limit: '1mb' }));
  app.use(requestIdMiddleware);
  app.use(httpMetricsMiddleware);
  app.use(httpRequestLogMiddleware);
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
      logger.warn({ event: 'readiness_check_failed', requestId: req.requestId, ...errorLogFields(error) }, 'Readiness indisponivel');
      res.status(503).json({ ok: false, service: 'rhcorp-api', error: 'not-ready' });
    }
  });
  app.get('/metrics', metricsAccessMiddleware, async (req, res, next) => {
    try {
      const metrics = await prometheusMetrics();
      res.setHeader('content-type', metrics.contentType);
      res.send(metrics.body);
    } catch (error) { next(error); }
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

  app.use(errorCaptureMiddleware);

  return app;
}

export async function start() {
  await initializeErrorTracking();
  installProcessErrorHandlers();
  await assertIcpBrasilConfiguration();
  await assertEsocialTransmissionConfiguration();
  await getPool();
  await assertSchemaCurrent();
  const app = createApp();
  const server = createServer(app);
  attachAtsSocketServer(server);
  server.listen(env.port, () => {
    logger.info({ event: 'http_server_started', port: env.port }, `API http://localhost:${env.port}`);
  });
}

export function errorCaptureMiddleware(err, req, res, next) {
  if (res.headersSent) {
    next(err);
    return;
  }
  const status = err.status || 500;
  const message = status >= 500 ? 'Erro interno do servidor' : err.message;
  if (status >= 500) {
    recordError('http', err);
    logger.error({
      event: 'http_unhandled_error', requestId: req.requestId,
      method: req.method, route: req.route?.path ?? 'unmatched',
      userId: typeof req.user?.sub === 'number' ? req.user.sub : undefined,
      ...errorLogFields(err),
    }, 'Erro nao tratado em requisicao HTTP');
    reportError(err, {
      request_id: req.requestId, method: req.method,
      route: typeof req.route?.path === 'string' ? req.route.path : 'unmatched',
    });
  }
  const body = { erro: message };
  if (status < 500 && err.code) body.codigo = err.code;
  if (status < 500 && err.details) body.detalhes = err.details;
  res.status(status).json(body);
}

if (process.env.NODE_ENV !== 'test') {
  start().catch((e) => {
    logger.fatal({ event: 'http_server_start_failed', ...errorLogFields(e) }, 'Falha ao iniciar API');
    reportError(e, { source: 'http_server_start' });
    process.exit(1);
  });
}

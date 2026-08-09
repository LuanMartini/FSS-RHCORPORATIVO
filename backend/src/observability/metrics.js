import { randomUUID, timingSafeEqual } from 'node:crypto';
import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from 'prom-client';
import { getPool } from '../db/client.js';
import { errorLogFields, logger } from './logger.js';

export const metricsRegistry = new Registry();
collectDefaultMetrics({ register: metricsRegistry, prefix: 'rhcorp_' });

const httpRequests = new Counter({
  name: 'rhcorp_http_requests_total', help: 'Requisicoes HTTP finalizadas',
  labelNames: ['method', 'route', 'status'], registers: [metricsRegistry],
});
const httpDuration = new Histogram({
  name: 'rhcorp_http_request_duration_seconds', help: 'Duracao de requisicoes HTTP em segundos',
  labelNames: ['method', 'route', 'status'], registers: [metricsRegistry],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});
const errors = new Counter({
  name: 'rhcorp_errors_total', help: 'Erros classificados sem dados pessoais',
  labelNames: ['source', 'type'], registers: [metricsRegistry],
});
const payrollQueue = new Gauge({
  name: 'rhcorp_payroll_queue_pending', help: 'Jobs de folha aguardando execucao', registers: [metricsRegistry],
});
const reimbursementQueue = new Gauge({
  name: 'rhcorp_reimbursements_pending', help: 'Reembolsos aguardando decisao humana', registers: [metricsRegistry],
});
const workerJobs = new Counter({
  name: 'rhcorp_payroll_worker_jobs_total', help: 'Jobs de folha processados pelo worker',
  labelNames: ['outcome'], registers: [metricsRegistry],
});

function routeName(req) {
  const route = req.route?.path;
  if (typeof route !== 'string') return 'unmatched';
  const normalized = `${req.baseUrl ?? ''}${route}`.slice(0, 160);
  return normalized || '/';
}

export function requestIdMiddleware(req, res, next) {
  const supplied = req.get('x-request-id') ?? req.get('x-correlation-id');
  const requestId = supplied && /^[A-Za-z0-9_-]{8,128}$/.test(supplied) ? supplied : randomUUID();
  req.requestId = requestId;
  req.correlationId = requestId;
  res.setHeader('x-request-id', requestId);
  res.setHeader('x-correlation-id', requestId);
  next();
}

export function httpMetricsMiddleware(req, res, next) {
  if (req.path === '/metrics') { next(); return; }
  const startedAt = process.hrtime.bigint();
  res.once('finish', () => {
    const labels = { method: req.method, route: routeName(req), status: String(res.statusCode) };
    const elapsedSeconds = Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
    httpRequests.inc(labels);
    httpDuration.observe(labels, elapsedSeconds);
  });
  next();
}

export function httpRequestLogMiddleware(req, res, next) {
  const startedAt = process.hrtime.bigint();
  res.once('finish', () => {
    logger.info({
      event: 'http_request_completed', requestId: req.requestId, method: req.method,
      route: routeName(req), statusCode: res.statusCode,
      durationMs: Math.round(Number(process.hrtime.bigint() - startedAt) / 1_000_000),
      userId: typeof req.user?.sub === 'number' ? req.user.sub : undefined,
    }, 'Requisicao HTTP finalizada');
  });
  next();
}

function metricTokenMatches(received, expected) {
  if (!received) return false;
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function metricsAccessMiddleware(req, res, next) {
  const expected = process.env.METRICS_TOKEN;
  if (process.env.METRICS_ENABLED !== 'true' || !expected) {
    res.status(404).json({ erro: 'Rota nao encontrada' });
    return;
  }
  const authorization = req.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!metricTokenMatches(req.get('x-metrics-token') ?? authorization, expected)) {
    res.status(401).json({ erro: 'Nao autorizado' });
    return;
  }
  next();
}

export async function refreshQueueMetrics() {
  try {
    const pool = await getPool();
    const [payroll, reimbursements] = await Promise.all([
      pool.query("SELECT count(*)::int AS total FROM fila_folha WHERE status='AGUARDANDO'"),
      pool.query("SELECT count(*)::int AS total FROM reembolsos_solicitacoes WHERE status IN ('EM_ANALISE','PENDENTE_GESTOR','PENDENTE_DIRETORIA')"),
    ]);
    payrollQueue.set(Number(payroll.rows[0]?.total ?? 0));
    reimbursementQueue.set(Number(reimbursements.rows[0]?.total ?? 0));
  } catch (error) {
    logger.warn({ event: 'metrics_queue_refresh_failed', ...errorLogFields(error) }, 'Nao foi possivel atualizar filas de metricas');
  }
}

export function recordError(source, error) {
  const type = error instanceof Error ? String(error.code ?? error.name) : 'UnknownError';
  errors.inc({ source: source.slice(0, 40), type: type.replace(/[^A-Za-z0-9_:-]/g, '_').slice(0, 80) || 'UnknownError' });
}

export function recordPayrollWorkerJob(outcome) {
  workerJobs.inc({ outcome });
}

export async function prometheusMetrics() {
  await refreshQueueMetrics();
  return { contentType: metricsRegistry.contentType, body: await metricsRegistry.metrics() };
}

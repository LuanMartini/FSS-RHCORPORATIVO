import 'dotenv/config';
import { sincronizarFerias } from '../models/rh.js';
import { getPool } from '../db/client.js';
import { initializeErrorTracking, installProcessErrorHandlers, reportError } from '../observability/errorTracking.js';
import { errorLogFields, logger } from '../observability/logger.js';
import { recordError } from '../observability/metrics.js';

const intervalMs = Math.max(
  60_000,
  Number(process.env.LEAVE_WORKER_INTERVAL_MS ?? 300_000),
);
let stopping = false;

async function tick() {
  if (stopping) return;
  try {
    await sincronizarFerias();
  } catch (error) {
    recordError('leave_worker', error);
    logger.error({ event: 'leave_worker_tick_failed', ...errorLogFields(error) }, 'Falha no worker de vigencia de ferias');
    reportError(error, { source: 'leave_worker' });
  }
}

const timer = setInterval(() => void tick(), intervalMs);
timer.unref();
initializeErrorTracking();
installProcessErrorHandlers();
logger.info({ event: 'leave_worker_started', intervalMs }, 'Worker de ferias iniciado');
void tick();

async function stop() {
  stopping = true;
  clearInterval(timer);
  await (await getPool()).end();
  logger.info({ event: 'leave_worker_stopped' }, 'Worker de ferias encerrado');
}

process.once('SIGTERM', () => void stop());
process.once('SIGINT', () => void stop());

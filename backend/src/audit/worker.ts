import 'dotenv/config';
import { setTimeout as delay } from 'node:timers/promises';
import { getPool } from '../db/client.js';
import { assertSchemaCurrent } from '../db/migrate.js';
import { processAuditOutboxBatch } from './application/auditService.js';
import { initializeErrorTracking, installProcessErrorHandlers, reportError } from '../observability/errorTracking.js';
import { errorLogFields, logger } from '../observability/logger.js';
import { recordError } from '../observability/metrics.js';

let running = true;
process.on('SIGINT', () => { running = false; });
process.on('SIGTERM', () => { running = false; });

async function run() {
  await initializeErrorTracking();
  installProcessErrorHandlers();
  await getPool();
  await assertSchemaCurrent();
  logger.info({ event: 'audit_worker_started', pid: process.pid }, 'Worker de auditoria iniciado');
  while (running) {
    const processed = await processAuditOutboxBatch();
    if (processed === 0) await delay(1000);
  }
  await (await getPool()).end();
  logger.info({ event: 'audit_worker_stopped' }, 'Worker de auditoria encerrado');
}

run().catch((error) => {
  recordError('audit_worker', error);
  logger.fatal({ event: 'audit_worker_fatal', ...errorLogFields(error) }, 'Worker de auditoria interrompido');
  reportError(error, { source: 'audit_worker' });
  process.exit(1);
});

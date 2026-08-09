import 'dotenv/config';
import { setTimeout as delay } from 'node:timers/promises';
import { getPool } from '../db/client.js';
import { processPayrollJob } from './application/payrollBatchProcessor.js';
import { claimNextJob, failJob } from './infrastructure/payrollRepository.js';
import { initializeErrorTracking, installProcessErrorHandlers, reportError } from '../observability/errorTracking.js';
import { errorLogFields, logger } from '../observability/logger.js';
import { recordError, recordPayrollWorkerJob } from '../observability/metrics.js';

let running = true;
process.on('SIGINT', () => { running = false; });
process.on('SIGTERM', () => { running = false; });

async function run(): Promise<void> {
  await initializeErrorTracking();
  installProcessErrorHandlers();
  await getPool();
  logger.info({ event: 'payroll_worker_started', pid: process.pid }, 'Worker de folha iniciado');
  while (running) {
    try {
      const job = await claimNextJob();
      if (!job) { await delay(1500); continue; }
      try {
        await processPayrollJob(job);
        recordPayrollWorkerJob('success');
      } catch (error) {
        await failJob(job, error);
        recordPayrollWorkerJob('failure');
        recordError('payroll_worker', error);
        logger.error({ event: 'payroll_job_failed', jobId: String(job.id ?? ''), ...errorLogFields(error) }, 'Falha no job de folha');
        reportError(error, { source: 'payroll_worker', job_id: String(job.id ?? '') });
      }
    } catch (error) {
      recordError('payroll_worker', error);
      logger.warn({ event: 'payroll_worker_waiting_for_database', ...errorLogFields(error) }, 'Worker aguardando banco ou migracao');
      await delay(5000);
    }
  }
  logger.info({ event: 'payroll_worker_stopped' }, 'Worker de folha encerrado');
}

run().catch((error) => {
  logger.fatal({ event: 'payroll_worker_fatal', ...errorLogFields(error) }, 'Worker de folha interrompido');
  reportError(error, { source: 'payroll_worker' });
  process.exit(1);
});

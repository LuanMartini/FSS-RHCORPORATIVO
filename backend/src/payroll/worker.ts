import 'dotenv/config';
import { setTimeout as delay } from 'node:timers/promises';
import { getPool } from '../db/client.js';
import { processPayrollJob } from './application/payrollBatchProcessor.js';
import { claimNextJob, failJob } from './infrastructure/payrollRepository.js';

let running = true;
process.on('SIGINT', () => { running = false; });
process.on('SIGTERM', () => { running = false; });

async function run(): Promise<void> {
  await getPool();
  console.log(`Worker de folha iniciado (pid ${process.pid}).`);
  while (running) {
    try {
      const job = await claimNextJob();
      if (!job) { await delay(1500); continue; }
      try { await processPayrollJob(job); }
      catch (error) { await failJob(job, error); console.error('Falha no job de folha', error); }
    } catch (error) {
      console.error('Worker aguardando banco/migracao', error instanceof Error ? error.message : error);
      await delay(5000);
    }
  }
  console.log('Worker de folha encerrado.');
}

run().catch((error) => { console.error(error); process.exit(1); });

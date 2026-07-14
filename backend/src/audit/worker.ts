import 'dotenv/config';
import { setTimeout as delay } from 'node:timers/promises';
import { getPool } from '../db/client.js';
import { assertSchemaCurrent } from '../db/migrate.js';
import { processAuditOutboxBatch } from './application/auditService.js';

let running = true;
process.on('SIGINT', () => { running = false; });
process.on('SIGTERM', () => { running = false; });

async function run() {
  await getPool();
  await assertSchemaCurrent();
  while (running) {
    const processed = await processAuditOutboxBatch();
    if (processed === 0) await delay(1000);
  }
  await (await getPool()).end();
}

run().catch((error) => { console.error(error); process.exit(1); });

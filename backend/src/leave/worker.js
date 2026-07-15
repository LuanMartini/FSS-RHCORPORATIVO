import 'dotenv/config';
import { sincronizarFerias } from '../models/rh.js';
import { getPool } from '../db/client.js';

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
    console.error(
      'Falha no worker de vigencia de ferias',
      error instanceof Error ? error.message : 'erro',
    );
  }
}

const timer = setInterval(() => void tick(), intervalMs);
timer.unref();
void tick();

async function stop() {
  stopping = true;
  clearInterval(timer);
  await (await getPool()).end();
}

process.once('SIGTERM', () => void stop());
process.once('SIGINT', () => void stop());

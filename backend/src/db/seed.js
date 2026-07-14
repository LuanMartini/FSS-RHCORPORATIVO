import 'dotenv/config';
import { getPool } from './client.js';
import { seedIfEmpty } from './schema.js';

seedIfEmpty()
  .then(async () => {
    console.log('Seed concluido.');
    (await getPool()).end();
  })
  .catch(async (error) => {
    console.error(error);
    try { (await getPool()).end(); } catch {}
    process.exitCode = 1;
  });

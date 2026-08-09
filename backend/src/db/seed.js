import 'dotenv/config';
import { getPool } from './client.js';
import { seedIfEmpty } from './schema.js';
import { initializeErrorTracking, installProcessErrorHandlers, reportError } from '../observability/errorTracking.js';
import { errorLogFields, logger } from '../observability/logger.js';

initializeErrorTracking();
installProcessErrorHandlers();
seedIfEmpty()
  .then(async () => {
    logger.info({ event: 'database_seeded' }, 'Seed concluido');
    (await getPool()).end();
  })
  .catch(async (error) => {
    logger.fatal({ event: 'database_seed_failed', ...errorLogFields(error) }, 'Falha no seed do banco');
    reportError(error, { source: 'database_seed' });
    try { (await getPool()).end(); } catch {}
    process.exitCode = 1;
  });

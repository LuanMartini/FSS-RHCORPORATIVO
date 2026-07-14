import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { getPool } from './client.js';
import { assertSchemaCurrent } from './migrate.js';

async function scalar(pool, sql, params = []) {
  const result = await pool.query(sql, params);
  return Number(Object.values(result.rows[0] ?? {})[0] ?? 0);
}

export async function verifyDatabase() {
  await assertSchemaCurrent();
  const pool = await getPool();
  const [legacyOrphans, snapshotOrphans, failedAuditEvents, pgcrypto] = await Promise.all([
    scalar(pool, `SELECT count(*)::int FROM funcionarios f
      LEFT JOIN funcionarios_colaboradores m ON m.funcionario_id=f.id
      LEFT JOIN colaboradores c ON c.id=m.colaborador_id WHERE c.id IS NULL`),
    scalar(pool, `SELECT count(*)::int FROM snapshots_folha_colaboradores s
      LEFT JOIN colaboradores c ON c.id=s.colaborador_id WHERE c.id IS NULL`),
    scalar(pool, `SELECT count(*)::int FROM audit_outbox
      WHERE processado_em IS NULL AND ultimo_erro IS NOT NULL AND tentativas>=10`),
    scalar(pool, `SELECT count(*)::int FROM pg_extension WHERE extname=$1`, ['pgcrypto']),
  ]);

  const report = { legacyOrphans, snapshotOrphans, failedAuditEvents, pgcryptoInstalled: pgcrypto === 1 };
  const valid = legacyOrphans === 0 && snapshotOrphans === 0 && failedAuditEvents === 0 && pgcrypto === 1;
  if (!valid) throw Object.assign(new Error(`Verificacao do banco falhou: ${JSON.stringify(report)}`), { report });
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  verifyDatabase()
    .then(async (report) => {
      console.log(JSON.stringify({ ok: true, ...report }, null, 2));
      await (await getPool()).end();
    })
    .catch(async (error) => {
      console.error(error.message);
      try { await (await getPool()).end(); } catch {}
      process.exitCode = 1;
    });
}

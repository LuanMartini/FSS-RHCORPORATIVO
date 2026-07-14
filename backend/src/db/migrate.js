import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { getPool, isMysql } from './client.js';
import { ensureBaseSchema } from './schema.js';

const MIGRATION_LOCK = 671202608;
const directory = new URL('./migrations/', import.meta.url);

async function migrationFiles() {
  return (await readdir(directory))
    .filter((name) => /^\d{3}_.+\.sql$/.test(name))
    .sort((a, b) => a.localeCompare(b));
}

function checksum(content) {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

async function ensureHistory(client) {
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    nome VARCHAR(255) PRIMARY KEY,
    checksum CHAR(64) NOT NULL,
    aplicado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    aplicado_por VARCHAR(180) NOT NULL DEFAULT current_user
  )`);
}

export async function migrate() {
  if (isMysql) throw new Error('As migracoes avancadas exigem PostgreSQL.');
  await ensureBaseSchema();
  const pool = await getPool();
  const client = await pool.connect();
  const applied = [];
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK]);
    await ensureHistory(client);
    for (const name of await migrationFiles()) {
      const content = await readFile(new URL(name, directory), 'utf8');
      const hash = checksum(content);
      const existing = await client.query('SELECT checksum FROM schema_migrations WHERE nome=$1', [name]);
      if (existing.rowCount) {
        if (existing.rows[0].checksum !== hash) {
          throw new Error(`Checksum divergente para migracao ja aplicada: ${name}`);
        }
        continue;
      }
      await client.query(content);
      await client.query('INSERT INTO schema_migrations (nome,checksum) VALUES ($1,$2)', [name, hash]);
      applied.push(name);
    }
    return { applied };
  } finally {
    try { await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK]); } finally { client.release(); }
  }
}

export async function assertSchemaCurrent() {
  if (isMysql) throw new Error('Producao requer PostgreSQL.');
  const pool = await getPool();
  const exists = await pool.query("SELECT to_regclass('public.schema_migrations') AS table_name");
  if (!exists.rows[0]?.table_name) throw new Error('Banco nao migrado. Execute npm run db:migrate.');
  const rows = await pool.query('SELECT nome,checksum FROM schema_migrations');
  const known = new Map(rows.rows.map((row) => [row.nome, row.checksum]));
  for (const name of await migrationFiles()) {
    const content = await readFile(new URL(name, directory), 'utf8');
    if (!known.has(name)) throw new Error(`Migracao pendente: ${name}`);
    if (known.get(name) !== checksum(content)) throw new Error(`Checksum divergente: ${name}`);
  }
}

if (process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replaceAll('\\','/')}`).href) {
  migrate()
    .then(async (result) => {
      console.log(result.applied.length ? `Migracoes aplicadas: ${result.applied.join(', ')}` : 'Banco ja esta atualizado.');
      (await getPool()).end();
    })
    .catch(async (error) => {
      console.error(error);
      try { (await getPool()).end(); } catch {}
      process.exitCode = 1;
    });
}

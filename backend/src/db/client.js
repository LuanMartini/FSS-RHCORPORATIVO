import pg from 'pg';
import mysql from 'mysql2/promise';

const dialect = (process.env.DB_CLIENT || 'postgres').toLowerCase();
export const isMysql = dialect === 'mysql' || dialect === 'mysql2';

let pool;

export async function getPool() {
  if (pool) return pool;
  if (isMysql) {
    pool = mysql.createPool({
      host: process.env.MYSQL_HOST || 'localhost',
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD ?? '',
      database: process.env.MYSQL_DATABASE || 'rhcorp',
      waitForConnections: true,
      connectionLimit: 10,
    });
  } else {
    pool = new pg.Pool({
      host: process.env.PG_HOST || 'localhost',
      port: Number(process.env.PG_PORT || 5432),
      user: process.env.PG_USER || 'postgres',
      password: process.env.PG_PASSWORD ?? 'postgres',
      database: process.env.PG_DATABASE || 'rhcorp',
      max: Number(process.env.PG_POOL_MAX || 10),
      connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS || 5000),
      idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 30000),
      statement_timeout: Number(process.env.PG_STATEMENT_TIMEOUT_MS || 30000),
      application_name: process.env.PG_APPLICATION_NAME || 'rhcorp-api',
      ...(process.env.PG_SSL === 'true' ? {
        ssl: {
          rejectUnauthorized: process.env.PG_SSL_REJECT_UNAUTHORIZED !== 'false',
          ...(process.env.PG_SSL_CA_BASE64
            ? { ca: Buffer.from(process.env.PG_SSL_CA_BASE64, 'base64').toString('utf8') }
            : {}),
        },
      } : {}),
    });
  }
  return pool;
}

function qToPg(sql) {
  let n = 0;
  return sql.replace(/\?/g, () => `$${++n}`);
}

function transactionClient(connection) {
  return {
    async all(sql, params = []) {
      if (isMysql) {
        const [rows] = await connection.execute(sql, params);
        return rows;
      }
      const result = await connection.query(qToPg(sql), params);
      return result.rows;
    },
    async run(sql, params = []) {
      if (isMysql) {
        const [result] = await connection.execute(sql, params);
        if (Array.isArray(result)) return { rows: result, insertId: undefined };
        return { insertId: result.insertId, affectedRows: result.affectedRows };
      }
      const result = await connection.query(qToPg(sql), params);
      return { rows: result.rows, rowCount: result.rowCount };
    },
  };
}

export async function all(sql, params = []) {
  const p = await getPool();
  if (isMysql) {
    const [rows] = await p.execute(sql, params);
    return rows;
  }
  const r = await p.query(qToPg(sql), params);
  return r.rows;
}

export async function run(sql, params = []) {
  const p = await getPool();
  if (isMysql) {
    const [res] = await p.execute(sql, params);
    if (Array.isArray(res)) return { rows: res, insertId: undefined };
    return { insertId: res.insertId, affectedRows: res.affectedRows };
  }
  const r = await p.query(qToPg(sql), params);
  return { rows: r.rows, rowCount: r.rowCount };
}

export async function execRaw(sql) {
  const p = await getPool();
  if (isMysql) await p.query(sql);
  else await p.query(sql);
}

/**
 * Executa uma unidade de trabalho atomicamente. O callback deve usar apenas o
 * client fornecido para que todas as consultas participem da transacao.
 *
 * @template T
 * @param {(client: ReturnType<typeof transactionClient>) => Promise<T>} work
 * @param {{ isolationLevel?: 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE' }} [options]
 * @returns {Promise<T>}
 */
export async function withTransaction(work, options = {}) {
  const p = await getPool();
  const isolationLevel = options.isolationLevel ?? 'READ COMMITTED';
  const connection = isMysql ? await p.getConnection() : await p.connect();

  try {
    if (isMysql) {
      await connection.query(`SET TRANSACTION ISOLATION LEVEL ${isolationLevel}`);
      await connection.beginTransaction();
    } else {
      await connection.query(`BEGIN ISOLATION LEVEL ${isolationLevel}`);
    }

    const result = await work(transactionClient(connection));
    if (isMysql) await connection.commit();
    else await connection.query('COMMIT');
    return result;
  } catch (error) {
    try {
      if (isMysql) await connection.rollback();
      else await connection.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Falha ao executar rollback', rollbackError);
    }
    throw error;
  } finally {
    connection.release();
  }
}

export async function withSerializableRetry(work, options = {}) {
  const maxAttempts = Math.max(1, Number(options.maxAttempts ?? 3));
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await withTransaction(work, { isolationLevel: 'SERIALIZABLE' });
    } catch (error) {
      const retryable = !isMysql && ['40001', '40P01'].includes(error?.code);
      if (!retryable || attempt >= maxAttempts) throw error;
      const backoff = 20 * (2 ** (attempt - 1)) + Math.floor(Math.random() * 30);
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  }
}

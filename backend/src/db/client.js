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
      max: 10,
    });
  }
  return pool;
}

function qToPg(sql) {
  let n = 0;
  return sql.replace(/\?/g, () => `$${++n}`);
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

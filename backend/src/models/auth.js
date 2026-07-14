import { all, run, isMysql } from '../db/client.js';

export async function findUserByEmail(email) {
  const rows = await all(
    'SELECT id, nome, email, senha_hash, perfil, ativo, session_version FROM usuarios WHERE email = ?',
    [email]
  );
  return rows[0] ?? null;
}

export async function userPermissions(userId) {
  const rows = await all(
    `SELECT pp.permissao FROM usuarios u
     JOIN perfis_permissoes pp ON pp.perfil=u.perfil
     WHERE u.id=? ORDER BY pp.permissao`,
    [userId]
  );
  return rows.map((row) => String(row.permissao));
}

export async function createUser({ nome, email, senhaHash }) {
  if (isMysql) {
    const r = await run('INSERT INTO usuarios (nome, email, senha_hash) VALUES (?, ?, ?)', [
      nome,
      email,
      senhaHash,
    ]);
    return r.insertId;
  }
  const rows = await all(
    'INSERT INTO usuarios (nome, email, senha_hash) VALUES (?, ?, ?) RETURNING id',
    [nome, email, senhaHash]
  );
  return rows[0].id;
}

export async function countUsers() {
  const rows = await all('SELECT COUNT(*) AS c FROM usuarios');
  return Number(rows[0]?.c ?? rows[0]?.['COUNT(*)'] ?? 0);
}

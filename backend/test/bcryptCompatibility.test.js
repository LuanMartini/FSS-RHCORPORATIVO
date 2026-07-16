import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import bcrypt from 'bcryptjs';

const LEGACY_PASSWORD = 'Compatibilidade-2026!';
const integrationEnabled = process.env.RUN_DB_INTEGRATION === '1';

// Fixtures geradas com bcryptjs 2.4.3 antes do upgrade, usando o mesmo salt.
const LEGACY_HASHES = [
  '$2a$10$abcdefghijklmnopqrstuuhZNfN63JSTNsCN6.5jbrNp/Owi.u8wW',
  '$2b$10$abcdefghijklmnopqrstuuhZNfN63JSTNsCN6.5jbrNp/Owi.u8wW',
];

test('bcryptjs 3 autentica hashes $2a$ e $2b$ gerados pelo bcryptjs 2.4.3', async () => {
  for (const hash of LEGACY_HASHES) {
    assert.equal(await bcrypt.compare(LEGACY_PASSWORD, hash), true);
    assert.equal(await bcrypt.compare('senha-incorreta', hash), false);
  }
});

test('bcryptjs continua gerando hashes verificaveis para novos usuarios', async () => {
  const hash = await bcrypt.hash('Nova-Senha-2026!', 10);
  assert.match(hash, /^\$2[ab]\$10\$/);
  assert.equal(await bcrypt.compare('Nova-Senha-2026!', hash), true);
});

test('login autentica usuario existente com hash $2a$ do bcryptjs 2.4.3', {
  skip: !integrationEnabled,
}, async () => {
  const { all } = await import('../src/db/client.js');
  const { createApp } = await import('../src/server.js');
  const email = `bcrypt-legacy-${Date.now()}@example.invalid`;
  const inserted = await all(
    `INSERT INTO usuarios (nome,email,senha_hash,perfil)
     VALUES ('Bcrypt Legacy',?,?,'COLABORADOR') RETURNING id`,
    [email, LEGACY_HASHES[0]],
  );
  const server = http.createServer(createApp());
  await new Promise((resolve) => server.listen(0, resolve));

  try {
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const response = await fetch(`http://127.0.0.1:${address.port}/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, senha: LEGACY_PASSWORD }),
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(typeof body.token, 'string');
    assert.ok(body.token.length > 20);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await all('DELETE FROM usuarios WHERE id=? RETURNING id', [inserted[0].id]);
  }
});

after(async () => {
  if (!integrationEnabled) return;
  const { getPool } = await import('../src/db/client.js');
  await (await getPool()).end();
});

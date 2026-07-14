import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

const enabled = process.env.RUN_DB_INTEGRATION === '1';
if (enabled) process.env.NODE_ENV = 'test';

after(async () => {
  if (!enabled) return;
  const { getPool } = await import('../src/db/client.js');
  await (await getPool()).end();
});

test('schema de producao esta versionado e sem drift', { skip: !enabled }, async () => {
  const { assertSchemaCurrent } = await import('../src/db/migrate.js');
  await assert.doesNotReject(() => assertSchemaCurrent());
});

test('RBAC aplica menor privilegio por padrao', { skip: !enabled }, async () => {
  const { all } = await import('../src/db/client.js');
  const defaults = await all(
    `SELECT column_default FROM information_schema.columns
      WHERE table_schema='public' AND table_name='usuarios' AND column_name='perfil'`,
  );
  assert.match(String(defaults[0]?.column_default), /COLABORADOR/);
  const grants = await all(
    `SELECT permissao FROM perfis_permissoes WHERE perfil='COLABORADOR' ORDER BY permissao`,
  );
  const permissions = grants.map((row) => row.permissao);
  assert.ok(permissions.includes('time.self'));
  assert.ok(!permissions.includes('payroll.run'));
  assert.ok(!permissions.includes('onboarding.document.review'));
});

test('colaborador autenticado recebe 403 em rota financeira administrativa', { skip: !enabled }, async () => {
  const { all } = await import('../src/db/client.js');
  const { signToken } = await import('../src/middleware/auth.js');
  const { createApp } = await import('../src/server.js');
  const email = `rbac-test-${Date.now()}@example.invalid`;
  const inserted = await all(
    `INSERT INTO usuarios (nome,email,senha_hash,perfil)
     VALUES ('RBAC Test',?,'not-used','COLABORADOR') RETURNING id,session_version`,
    [email],
  );
  const server = http.createServer(createApp());
  await new Promise((resolve) => server.listen(0, resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const token = signToken({ sub: inserted[0].id, email, sv: inserted[0].session_version });
    const response = await fetch(`http://127.0.0.1:${address.port}/payroll/dashboard`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(response.status, 403);
    const body = await response.json();
    assert.equal(body.codigo, 'FORBIDDEN');
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await all('DELETE FROM usuarios WHERE email=? RETURNING id', [email]);
  }
});

test('todos os funcionarios legados possuem colaborador canonico', { skip: !enabled }, async () => {
  const { all } = await import('../src/db/client.js');
  const rows = await all(
    `SELECT count(*)::int AS orfaos FROM funcionarios f
      LEFT JOIN funcionarios_colaboradores m ON m.funcionario_id=f.id
      LEFT JOIN colaboradores c ON c.id=m.colaborador_id
      WHERE c.id IS NULL`,
  );
  assert.equal(Number(rows[0]?.orfaos), 0);
});

test('audit outbox participa do rollback da transacao de negocio', { skip: !enabled }, async () => {
  const { all, withTransaction } = await import('../src/db/client.js');
  const marker = `ROLLBACK_TEST_${Date.now()}`;
  await assert.rejects(() => withTransaction(async (tx) => {
    await tx.run(
      `INSERT INTO audit_outbox
        (ator_referencia,acao,recurso_tipo,recurso_id,metadados)
       VALUES ('test','ROLLBACK_TEST','TESTE',?,?::jsonb)`,
      [marker, JSON.stringify({ marker })],
    );
    throw new Error('rollback esperado');
  }));
  const rows = await all('SELECT count(*)::int AS total FROM audit_outbox WHERE recurso_id=?', [marker]);
  assert.equal(Number(rows[0]?.total), 0);
});

test('ativacao falha atomicamente quando documentos ou contrato estao ausentes', { skip: !enabled }, async () => {
  const { all } = await import('../src/db/client.js');
  const { activateCollaborator } = await import('../src/core/application/lifecycleService.js');
  const suffix = String(Date.now()).slice(-9);
  const base = await all('SELECT c.id AS cargo_id,c.departamento_id,e.id AS escala_id FROM cargos c CROSS JOIN escalas_trabalho e WHERE c.ativo AND e.ativo LIMIT 1');
  assert.ok(base[0]);
  const created = await all(
    `INSERT INTO colaboradores
      (nome_completo,cpf,email,cargo_id,departamento_id,status,etapa_admissao,lifecycle_status)
     VALUES ('Teste Ativacao',?,? ,?,?,'PRE_ADMISSAO','PRE_ADMISSAO','PRE_ADMISSAO')
     RETURNING id,versao`,
    [`9${suffix.padStart(10, '0')}`.slice(0, 11), `activation-${Date.now()}@example.invalid`, base[0].cargo_id, base[0].departamento_id],
  );
  try {
    await assert.rejects(
      () => activateCollaborator({
        collaboratorId: Number(created[0].id),
        scheduleId: Number(base[0].escala_id),
        expectedVersion: Number(created[0].versao),
        actorUserId: 1,
        actorReference: 'test',
      }),
      (error) => error?.code === 'ACTIVATION_NOT_READY',
    );
    const rows = await all('SELECT status,lifecycle_status,versao FROM colaboradores WHERE id=?', [created[0].id]);
    assert.equal(rows[0].status, 'PRE_ADMISSAO');
    assert.equal(rows[0].lifecycle_status, 'PRE_ADMISSAO');
    assert.equal(Number(rows[0].versao), Number(created[0].versao));
  } finally {
    await all('DELETE FROM colaboradores WHERE id=? RETURNING id', [created[0].id]);
  }
});

test('snapshot de folha referencia somente colaboradores canonicos', { skip: !enabled }, async () => {
  const { all } = await import('../src/db/client.js');
  const rows = await all(
    `SELECT count(*)::int AS orfaos FROM snapshots_folha_colaboradores s
      LEFT JOIN colaboradores c ON c.id=s.colaborador_id WHERE c.id IS NULL`,
  );
  assert.equal(Number(rows[0]?.orfaos), 0);
});

test('inicio da folha congela snapshot canonico e reproduz os mesmos colaboradores', { skip: !enabled }, async () => {
  const repository = await import('../src/payroll/infrastructure/payrollRepository.ts');
  const { all } = await import('../src/db/client.js');
  const processing = await repository.createPayrollProcessing('2099-12', 1);
  try {
    const employees = await repository.loadEmployees(String(processing.id));
    assert.equal(employees.length, Number(processing.total_funcionarios));
    assert.ok(employees.every((employee) => employee.id > 0 && employee.nome && employee.cpf));
    const hashes = await all(
      `SELECT count(*)::int AS total FROM snapshots_folha_colaboradores
        WHERE folha_id=? AND hash_dados ~ '^[0-9a-f]{64}$'`,
      [processing.id],
    );
    assert.equal(Number(hashes[0].total), employees.length);
  } finally {
    await all('DELETE FROM folhas_processadas WHERE id=? RETURNING id', [processing.id]);
    await all(
      `DELETE FROM audit_outbox WHERE acao='PAYROLL_PROCESSING_STARTED' AND recurso_id=? RETURNING id`,
      [String(processing.id)],
    );
  }
});

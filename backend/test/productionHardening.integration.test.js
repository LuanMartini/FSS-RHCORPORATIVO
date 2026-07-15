import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { randomUUID } from 'node:crypto';

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

test('carteira de beneficios rejeita colaborador que nao e o proprietario', { skip: !enabled }, async () => {
  const { all } = await import('../src/db/client.js');
  const repository = await import('../src/flexBenefits/infrastructure/flexBenefitsRepository.ts');
  const rows = await all(`SELECT c.id,c.colaborador_id,(SELECT id FROM colaboradores WHERE id<>c.colaborador_id LIMIT 1) AS outro
    FROM carteira_colaborador c LIMIT 1`);
  assert.ok(rows[0]?.outro);
  await assert.rejects(() => repository.distribute({
    walletId:Number(rows[0].id),collaboratorId:Number(rows[0].outro),expectedVersion:1,
    idempotencyKey:randomUUID(),payloadHash:'a'.repeat(64),allocations:[],
  }),(error)=>error?.status===403&&error?.code==='WALLET_OWNER_FORBIDDEN');
});

test('LMS ignora colaborador forjado e impede responder tentativa alheia', { skip: !enabled }, async () => {
  const { all } = await import('../src/db/client.js');
  const { signToken } = await import('../src/middleware/auth.js');
  const { createApp } = await import('../src/server.js');
  const suffix=Date.now();
  const base=(await all('SELECT id AS cargo_id,departamento_id FROM cargos ORDER BY id LIMIT 1'))[0];assert.ok(base);
  const cpfBase=String(suffix).slice(-9);
  const collaborators=await all(`INSERT INTO colaboradores
    (nome_completo,cpf,email,cargo_id,departamento_id,status,etapa_admissao,lifecycle_status)
    VALUES ('LMS Atacante',?, ?,?,?,'ATIVO','CONCLUIDA','ATIVO'),
           ('LMS Vitima',?, ?,?,?,'ATIVO','CONCLUIDA','ATIVO') RETURNING id`,
    [`71${cpfBase}`.slice(0,11),`lms-collab-a-${suffix}@example.invalid`,base.cargo_id,base.departamento_id,
     `72${cpfBase}`.slice(0,11),`lms-collab-v-${suffix}@example.invalid`,base.cargo_id,base.departamento_id]);
  const users=await all(`INSERT INTO usuarios(nome,email,senha_hash,perfil) VALUES
    ('LMS Atacante',?,'unused','COLABORADOR'),('LMS Vitima',?,'unused','COLABORADOR') RETURNING id,email,session_version`,
    [`lms-attacker-${suffix}@example.invalid`,`lms-victim-${suffix}@example.invalid`]);
  await all(`INSERT INTO usuarios_colaboradores(usuario_id,colaborador_id) VALUES (?,?),(?,?) RETURNING usuario_id`,
    [users[0].id,collaborators[0].id,users[1].id,collaborators[1].id]);
  const questionnaire=(await all('SELECT id FROM questionarios_provas WHERE ativo LIMIT 1'))[0];assert.ok(questionnaire);
  const attemptId=randomUUID();
  await all(`INSERT INTO provas_tentativas(id,questionario_id,colaborador_id,numero_tentativa,questoes_snapshot,expira_em)
    VALUES (?::uuid,?,?,999999,'[]'::jsonb,now()+interval '10 minutes') RETURNING id`,[attemptId,questionnaire.id,collaborators[1].id]);
  const server=http.createServer(createApp());await new Promise(resolve=>server.listen(0,resolve));
  try{const address=server.address();assert.ok(address&&typeof address==='object');const token=signToken({sub:users[0].id,email:users[0].email,sv:users[0].session_version});
    const response=await fetch(`http://127.0.0.1:${address.port}/lms/tentativas/${attemptId}/responder`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({colaboradorId:Number(collaborators[1].id),respostas:[]})});
    assert.equal(response.status,404);
    const stored=await all('SELECT status FROM provas_tentativas WHERE id=?::uuid',[attemptId]);assert.equal(stored[0].status,'EM_ANDAMENTO');
  }finally{await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));await all('DELETE FROM provas_tentativas WHERE id=?::uuid RETURNING id',[attemptId]);await all('DELETE FROM usuarios WHERE id=ANY(?::int[]) RETURNING id',[users.map(row=>row.id)]);await all('DELETE FROM colaboradores WHERE id=ANY(?::bigint[]) RETURNING id',[collaborators.map(row=>row.id)]);}
});

test('gestor lista apenas a propria equipe sem CPF ou salario', { skip: !enabled }, async () => {
  const { all } = await import('../src/db/client.js');const { signToken }=await import('../src/middleware/auth.js');const { createApp }=await import('../src/server.js');
  const suffix=Date.now();const base=(await all('SELECT id AS cargo_id,departamento_id FROM cargos ORDER BY id LIMIT 1'))[0];const cpfBase=String(suffix).slice(-8);
  const collaborators=await all(`INSERT INTO colaboradores
    (nome_completo,cpf,email,cargo_id,departamento_id,status,etapa_admissao,lifecycle_status) VALUES
    ('Gestor Teste',?, ?,?,?,'ATIVO','CONCLUIDA','ATIVO'),('Subordinado Teste',?, ?,?,?,'ATIVO','CONCLUIDA','ATIVO'),
    ('Fora Escopo',?, ?,?,?,'ATIVO','CONCLUIDA','ATIVO') RETURNING id,gestor_id`,
    [`81${cpfBase}1`.slice(0,11),`manager-c-${suffix}@example.invalid`,base.cargo_id,base.departamento_id,
     `82${cpfBase}2`.slice(0,11),`report-c-${suffix}@example.invalid`,base.cargo_id,base.departamento_id,
     `83${cpfBase}3`.slice(0,11),`outsider-c-${suffix}@example.invalid`,base.cargo_id,base.departamento_id]);
  const email=`manager-scope-${Date.now()}@example.invalid`;const user=(await all(`INSERT INTO usuarios(nome,email,senha_hash,perfil) VALUES ('Gestor Escopo',?,'unused','GESTOR') RETURNING id,session_version`,[email]))[0];
  await all('INSERT INTO usuarios_colaboradores(usuario_id,colaborador_id) VALUES (?,?) RETURNING usuario_id',[user.id,collaborators[0].id]);
  await all('UPDATE colaboradores SET gestor_id=? WHERE id=? RETURNING id',[collaborators[0].id,collaborators[1].id]);
  const server=http.createServer(createApp());await new Promise(resolve=>server.listen(0,resolve));
  try{const address=server.address();assert.ok(address&&typeof address==='object');const token=signToken({sub:user.id,email,sv:user.session_version});const response=await fetch(`http://127.0.0.1:${address.port}/rh/funcionarios`,{headers:{authorization:`Bearer ${token}`}});assert.equal(response.status,200);const body=await response.json();const ids=body.map(row=>Number(row.id));assert.ok(ids.includes(Number(collaborators[0].id)));assert.ok(ids.includes(Number(collaborators[1].id)));assert.ok(!ids.includes(Number(collaborators[2].id)));assert.ok(body.every(row=>row.cpf==null&&row.salario==null));}
  finally{await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));await all('DELETE FROM usuarios WHERE id=? RETURNING id',[user.id]);await all('DELETE FROM colaboradores WHERE id=ANY(?::bigint[]) RETURNING id',[collaborators.map(row=>row.id)]);}
});

test('ferias serializam concorrencia, impedem sobreposicao e nao afastam antes da vigencia', { skip: !enabled }, async () => {
  const { all }=await import('../src/db/client.js');const rh=await import('../src/models/rh.js');const suffix=Date.now();
  const base=(await all('SELECT id AS cargo_id,departamento_id FROM cargos ORDER BY id LIMIT 1'))[0];
  const collaborator=(await all(`INSERT INTO colaboradores
    (nome_completo,cpf,email,cargo_id,departamento_id,data_admissao,status,etapa_admissao,lifecycle_status)
    VALUES ('Ferias Concorrencia',?, ?,?,?,'2020-01-01','ATIVO','CONCLUIDA','ATIVO') RETURNING id,status`,
    [`91${String(suffix).slice(-9)}`.slice(0,11),`leave-${suffix}@example.invalid`,base.cargo_id,base.departamento_id]))[0];
  const period=(await all(`INSERT INTO periodos_aquisitivos_ferias
    (colaborador_id,inicio_em,fim_em,disponivel_em,dias_direito) VALUES (?,'2020-01-01','2020-12-31','2021-01-01',30) RETURNING id`,[collaborator.id]))[0];
  try{
    const first=rh.createFeria({funcionarioId:collaborator.id,dataInicio:'2099-01-10',dataFim:'2099-01-19'});
    const second=rh.createFeria({funcionarioId:collaborator.id,dataInicio:'2099-01-15',dataFim:'2099-01-20'});
    const results=await Promise.allSettled([first,second]);assert.equal(results.filter(row=>row.status==='fulfilled').length,1);assert.equal(results.filter(row=>row.status==='rejected').length,1);
    const leave=(await all('SELECT * FROM ferias WHERE colaborador_id=?',[collaborator.id]))[0];assert.equal(leave.status,'PENDENTE');
    await rh.feriasAprovar(leave.id,{versao:leave.versao,userId:1,all:true});
    const approved=(await all('SELECT status,versao FROM ferias WHERE id=?',[leave.id]))[0];assert.equal(approved.status,'APROVADA');
    const unchanged=(await all('SELECT status FROM colaboradores WHERE id=?',[collaborator.id]))[0];assert.equal(unchanged.status,'ATIVO');
    await assert.rejects(()=>rh.feriasAprovar(leave.id,{versao:leave.versao,userId:1,all:true}),(error)=>error?.code==='LEAVE_STATE_CONFLICT');
  }finally{await all(`DELETE FROM audit_outbox WHERE recurso_tipo='FERIAS' AND metadados->>'collaboratorId'=? RETURNING id`,[String(collaborator.id)]);await all('DELETE FROM ferias WHERE colaborador_id=? RETURNING id',[collaborator.id]);await all('DELETE FROM periodos_aquisitivos_ferias WHERE id=? RETURNING id',[period.id]);await all('DELETE FROM colaboradores WHERE id=? RETURNING id',[collaborator.id]);}
});

import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import 'dotenv/config';

const enabled = process.env.RUN_DB_INTEGRATION === '1';
if (enabled) process.env.NODE_ENV = 'test';

const suffix = String(Date.now());
const ctx = { server: null, base: '', tokens: {}, ids: { users: [], collaborators: [] } };

async function db() {
  return import('../src/db/client.js');
}

async function createUser({ nome, perfil, collaboratorId }) {
  const { all } = await db();
  const { signToken } = await import('../src/middleware/auth.js');
  const email = `authz-${perfil.toLowerCase()}-${suffix}@example.invalid`;
  const [user] = await all(
    `INSERT INTO usuarios(nome,email,senha_hash,perfil) VALUES (?,?,'unused',?) RETURNING id,email,session_version`,
    [nome, email, perfil],
  );
  ctx.ids.users.push(user.id);
  if (collaboratorId) {
    await all(
      'INSERT INTO usuarios_colaboradores(usuario_id,colaborador_id) VALUES (?,?) RETURNING usuario_id',
      [user.id, collaboratorId],
    );
  }
  return signToken({ sub: user.id, email: user.email, sv: user.session_version });
}

async function createCollaborator({ nome, cpf, base, managerId = null }) {
  const { all } = await db();
  const [row] = await all(
    `INSERT INTO colaboradores
      (nome_completo,cpf,email,cargo_id,departamento_id,status,etapa_admissao,lifecycle_status,salario,gestor_id)
     VALUES (?,?,?,?,?,'ATIVO','CONCLUIDA','ATIVO',7777.77,?) RETURNING id`,
    [nome, cpf, `authz-col-${cpf}-${suffix}@example.invalid`, base.cargo_id, base.departamento_id, managerId],
  );
  ctx.ids.collaborators.push(row.id);
  return Number(row.id);
}

async function call(method, path, token, body) {
  const response = await fetch(`${ctx.base}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* corpo nao JSON */ }
  return { status: response.status, text, json };
}

before(async () => {
  if (!enabled) return;
  const { all } = await db();
  const { createApp } = await import('../src/server.js');
  ctx.server = http.createServer(createApp());
  await new Promise((resolve) => ctx.server.listen(0, resolve));
  ctx.base = `http://127.0.0.1:${ctx.server.address().port}`;

  const base = (await all('SELECT id AS cargo_id,departamento_id FROM cargos WHERE ativo ORDER BY id LIMIT 1'))[0];
  assert.ok(base, 'o teste requer ao menos um cargo ativo');
  ctx.base_cargo = base;

  const tail = suffix.slice(-9);
  ctx.managerCollab = await createCollaborator({ nome: 'Gestor Authz', cpf: `81${tail}`.slice(0, 11), base });
  ctx.teamCollab = await createCollaborator({ nome: 'Equipe Authz', cpf: `82${tail}`.slice(0, 11), base, managerId: ctx.managerCollab });
  ctx.outsiderCollab = await createCollaborator({ nome: 'Fora Authz', cpf: `83${tail}`.slice(0, 11), base });

  const [admin] = await all(`SELECT id,email,session_version FROM usuarios WHERE perfil='ADMINISTRADOR' AND ativo ORDER BY id LIMIT 1`);
  assert.ok(admin, 'o teste requer um administrador (rode npm run db:seed)');
  const { signToken } = await import('../src/middleware/auth.js');
  ctx.tokens.admin = signToken({ sub: admin.id, email: admin.email, sv: admin.session_version });
  ctx.tokens.gestor = await createUser({ nome: 'Gestor Authz', perfil: 'GESTOR', collaboratorId: ctx.managerCollab });
  ctx.tokens.colaborador = await createUser({ nome: 'Colaborador Authz', perfil: 'COLABORADOR', collaboratorId: ctx.teamCollab });
});

after(async () => {
  if (!enabled) return;
  const { all, getPool } = await db();
  if (ctx.server) await new Promise((resolve, reject) => ctx.server.close((e) => (e ? reject(e) : resolve())));
  for (const id of ctx.ids.users) {
    await all('DELETE FROM usuarios_colaboradores WHERE usuario_id=? RETURNING usuario_id', [id]).catch(() => {});
    await all('DELETE FROM usuarios WHERE id=? RETURNING id', [id]).catch(() => {});
  }
  for (const id of [...ctx.ids.collaborators].reverse()) {
    await all(`DELETE FROM audit_outbox WHERE recurso_tipo='COLABORADOR' AND recurso_id=? RETURNING id`, [String(id)]).catch(() => {});
    await all(`DELETE FROM outbox_eventos WHERE agregado_tipo='COLABORADOR' AND agregado_id=? RETURNING id`, [String(id)]).catch(() => {});
    await all('DELETE FROM colaboradores WHERE id=? RETURNING id', [id]).catch(() => {});
  }
  await (await getPool()).end();
});

const opts = { skip: !enabled };

test('sem token ou com token adulterado a API responde 401', opts, async () => {
  assert.equal((await call('GET', '/rh/dashboard')).status, 401);
  assert.equal((await call('GET', '/rh/dashboard', `${ctx.tokens.admin}x`)).status, 401);
  assert.equal((await call('GET', '/rh/folha', 'nao-e-um-jwt')).status, 401);
});

test('administrador consulta dashboard com bloco folha', opts, async () => {
  const res = await call('GET', '/rh/dashboard', ctx.tokens.admin);
  assert.equal(res.status, 200, res.text);
  assert.ok(res.json.folha, 'administrador deve receber o bloco folha');
  assert.ok('custoMensalBruto' in res.json.folha);
  assert.ok(res.json.colaboradores.total >= 3);
});

test('gestor sem payroll.read recebe dashboard SEM o bloco folha', opts, async () => {
  const res = await call('GET', '/rh/dashboard', ctx.tokens.gestor);
  assert.equal(res.status, 200, res.text);
  assert.equal('folha' in res.json, false);
  for (const marker of ['custoMensalBruto', 'mediaSalarial', 'maiorSalario', 'menorSalario', 'custoFGTS', 'custoTotalEmpresa', 'salario']) {
    assert.ok(!res.text.includes(marker), `resposta do gestor nao pode conter "${marker}"`);
  }
});

test('colaborador comum nao acessa o dashboard de RH (403)', opts, async () => {
  assert.equal((await call('GET', '/rh/dashboard', ctx.tokens.colaborador)).status, 403);
});

test('rotas de folha e payroll negam gestor e colaborador, liberam administrador', opts, async () => {
  const forbidden = [
    ['GET', '/rh/folha'],
    ['GET', `/rh/folha/${ctx.teamCollab}`],
    ['GET', '/payroll/dashboard'],
    ['GET', '/payroll/processamentos/1'],
    ['GET', '/payroll/processamentos/1/esocial/eventos'],
    ['POST', '/payroll/processamentos', {}],
    ['POST', '/payroll/simular', {}],
    ['POST', '/payroll/processamentos/1/enviar-banco', {}],
  ];
  for (const token of [ctx.tokens.gestor, ctx.tokens.colaborador]) {
    for (const [method, path, body] of forbidden) {
      const res = await call(method, path, token, body);
      assert.equal(res.status, 403, `${method} ${path} deveria ser 403, veio ${res.status}: ${res.text}`);
    }
  }
  const admin = await call('GET', '/rh/folha', ctx.tokens.admin);
  assert.equal(admin.status, 200, admin.text);
  assert.ok(Array.isArray(admin.json.holerites));
  const one = await call('GET', `/rh/folha/${ctx.teamCollab}`, ctx.tokens.admin);
  assert.equal(one.status, 200, one.text);
});

test('listagem de funcionarios nao revela salario nem CPF ao gestor', opts, async () => {
  const res = await call('GET', '/rh/funcionarios', ctx.tokens.gestor);
  assert.equal(res.status, 200, res.text);
  assert.ok(res.json.length >= 1, 'gestor deve ver ao menos a si mesmo e a equipe');
  for (const row of res.json) {
    assert.equal(row.salario, undefined, `salario exposto para ${row.nome}`);
    assert.ok(row.cpf == null, `cpf exposto para ${row.nome}`);
  }
  assert.ok(!res.text.includes('7777'), 'valor do salario nao pode aparecer na resposta');
  const ids = res.json.map((row) => Number(row.id));
  assert.ok(ids.includes(ctx.teamCollab), 'gestor enxerga a propria equipe');
  assert.ok(!ids.includes(ctx.outsiderCollab), 'gestor nao enxerga colaborador fora da equipe');
});

test('parametros alternativos nao liberam salario na listagem', opts, async () => {
  for (const query of ['?salario=true', '?canReadSalary=1', '?incluirSalario=true', '?limite=100&campos=salario']) {
    const res = await call('GET', `/rh/funcionarios${query}`, ctx.tokens.gestor);
    assert.equal(res.status, 200, res.text);
    assert.ok(res.json.every((row) => row.salario === undefined), `salario vazou com ${query}`);
  }
});

test('administrador enxerga salario na listagem', opts, async () => {
  const res = await call('GET', '/rh/funcionarios', ctx.tokens.admin);
  assert.equal(res.status, 200, res.text);
  const row = res.json.find((item) => Number(item.id) === ctx.teamCollab);
  assert.ok(row, 'colaborador de teste deve aparecer para o administrador');
  assert.equal(row.salario, 7777.77);
});

test('colaborador comum nao lista funcionarios com dados alheios', opts, async () => {
  const res = await call('GET', '/rh/funcionarios', ctx.tokens.colaborador);
  assert.ok([200, 403].includes(res.status), res.text);
  if (res.status === 200) {
    assert.ok(res.json.every((row) => row.salario === undefined && row.cpf == null));
    assert.ok(!res.json.some((row) => Number(row.id) === ctx.outsiderCollab));
  }
});

test('catalogo de cargos nao revela salario base a quem nao pode ver salarios', opts, async () => {
  const gestor = await call('GET', '/rh/cargos', ctx.tokens.gestor);
  assert.equal(gestor.status, 200, gestor.text);
  assert.ok(gestor.json.length >= 1);
  assert.ok(gestor.json.every((cargo) => cargo.salarioBase === undefined), 'salarioBase exposto ao gestor');
  const admin = await call('GET', '/rh/cargos', ctx.tokens.admin);
  assert.equal(admin.status, 200, admin.text);
  assert.ok(admin.json.every((cargo) => typeof cargo.salarioBase === 'number'));
});

test('alteracao de salario/departamento/cadastro nao existe como rota e nao e possivel via API generica', opts, async () => {
  for (const token of [ctx.tokens.gestor, ctx.tokens.colaborador]) {
    for (const method of ['PUT', 'PATCH']) {
      const res = await call(method, `/rh/funcionarios/${ctx.teamCollab}`, token, { salario: 99999, departamentoId: 1, nome: 'Hack' });
      assert.ok([403, 404].includes(res.status), `${method} /rh/funcionarios/:id retornou ${res.status}`);
    }
    const colab = await call('PATCH', `/core/colaboradores/${ctx.teamCollab}`, token, { salario: 99999 });
    assert.ok([403, 404].includes(colab.status), `PATCH /core/colaboradores/:id retornou ${colab.status}`);
  }
  const { all } = await db();
  const [row] = await all('SELECT salario,nome_completo FROM colaboradores WHERE id=?', [ctx.teamCollab]);
  assert.equal(Number(row.salario), 7777.77);
  assert.equal(row.nome_completo, 'Equipe Authz');
});

test('admissao, desligamento e escritas de RH exigem employee.write/terminate (403)', opts, async () => {
  const payload = {
    nome: 'Invasor', cpf: '12345678909', email: `invasor-${suffix}@example.invalid`,
    cargoId: Number(ctx.base_cargo.cargo_id), departamentoId: Number(ctx.base_cargo.departamento_id), salario: 9999,
  };
  const writes = [
    ['POST', '/rh/admitir', payload],
    ['DELETE', `/rh/funcionarios/${ctx.teamCollab}`, { versao: 1 }],
    ['POST', '/rh/advertencias', { funcionarioId: ctx.teamCollab, tipo: 'VERBAL', descricao: 'x' }],
    ['POST', '/rh/treinamentos', { nome: 'T', cargaHoraria: 1, modalidade: 'EAD' }],
    ['POST', '/rh/treinamentos/inscrever', { funcionarioId: ctx.teamCollab, treinamentoId: 1 }],
    ['POST', '/core/colaboradores/1/ativar', {}],
    ['POST', '/core/admissoes', {}],
    ['PATCH', '/core/organograma/cargos/1/superior', {}],
  ];
  for (const token of [ctx.tokens.gestor, ctx.tokens.colaborador]) {
    for (const [method, path, body] of writes) {
      const res = await call(method, path, token, body);
      assert.equal(res.status, 403, `${method} ${path} deveria ser 403, veio ${res.status}: ${res.text}`);
    }
  }
  const { all } = await db();
  const [row] = await all('SELECT status FROM colaboradores WHERE id=?', [ctx.teamCollab]);
  assert.equal(row.status, 'ATIVO', 'colaborador nao pode ter sido desligado');
  const created = await all('SELECT id FROM colaboradores WHERE email=?', [payload.email]);
  assert.equal(created.length, 0, 'admissao indevida nao pode criar colaborador');
});

test('beneficios: POST /rh/beneficios e /rh/beneficios/vincular exigem employee.write', opts, async () => {
  const novo = { nome: `Beneficio Authz ${suffix}`, tipo: 'SAUDE', valorMensal: 100 };
  for (const token of [ctx.tokens.gestor, ctx.tokens.colaborador]) {
    const create = await call('POST', '/rh/beneficios', token, novo);
    assert.equal(create.status, 403, create.text);
    const link = await call('POST', '/rh/beneficios/vincular', token, { funcionarioId: ctx.teamCollab, beneficioId: 1 });
    assert.equal(link.status, 403, link.text);
  }
  const noToken = await call('POST', '/rh/beneficios', null, novo);
  assert.equal(noToken.status, 401);

  const { all } = await db();
  assert.equal((await all('SELECT id FROM beneficios WHERE nome=?', [novo.nome])).length, 0);

  const created = await call('POST', '/rh/beneficios', ctx.tokens.admin, novo);
  assert.equal(created.status, 201, created.text);
  const [benefit] = await all('SELECT id FROM beneficios WHERE nome=?', [novo.nome]);
  assert.ok(benefit, 'administrador cria o beneficio');
  try {
    const link = await call('POST', '/rh/beneficios/vincular', ctx.tokens.admin, { funcionarioId: ctx.teamCollab, beneficioId: Number(benefit.id) });
    assert.ok([201, 404, 409, 422].includes(link.status), link.text);
    const invalid = await call('POST', '/rh/beneficios/vincular', ctx.tokens.admin, { funcionarioId: 'abc', beneficioId: 0 });
    assert.equal(invalid.status, 400, invalid.text);
  } finally {
    await all('DELETE FROM funcionario_beneficio WHERE beneficio_id=? RETURNING beneficio_id', [benefit.id]).catch(() => {});
    await all('DELETE FROM beneficios WHERE id=? RETURNING id', [benefit.id]).catch(() => {});
  }
});

test('ferias: gestor nao registra nem decide ferias de colaborador fora da equipe', opts, async () => {
  const outside = await call('POST', '/rh/ferias', ctx.tokens.gestor, {
    funcionarioId: ctx.outsiderCollab, dataInicio: '2031-03-02', dataFim: '2031-03-06',
  });
  assert.equal(outside.status, 403, outside.text);
  assert.equal(outside.json?.codigo, 'LEAVE_MANAGER_FORBIDDEN');

  const { all } = await db();
  const [leave] = await all(
    `INSERT INTO ferias(colaborador_id,data_inicio,data_fim,status) VALUES (?,?,?,'PENDENTE') RETURNING id,versao`,
    [ctx.outsiderCollab, '2031-04-01', '2031-04-05'],
  ).catch(() => [null]);
  if (leave) {
    try {
      const approve = await call('PATCH', `/rh/ferias/${leave.id}/aprovar`, ctx.tokens.gestor, { versao: leave.versao });
      assert.ok([403, 404].includes(approve.status), `aprovar ferias alheias retornou ${approve.status}: ${approve.text}`);
      const reject = await call('PATCH', `/rh/ferias/${leave.id}/reprovar`, ctx.tokens.gestor, { versao: leave.versao, motivo: 'x' });
      assert.ok([403, 404].includes(reject.status), `reprovar ferias alheias retornou ${reject.status}`);
      const close = await call('PATCH', `/rh/ferias/${leave.id}/encerrar`, ctx.tokens.gestor, {});
      assert.equal(close.status, 403, close.text);
      const [after] = await all('SELECT status FROM ferias WHERE id=?', [leave.id]);
      assert.equal(after.status, 'PENDENTE');
    } finally {
      await all('DELETE FROM ferias WHERE id=? RETURNING id', [leave.id]).catch(() => {});
    }
  }

  const colaborador = await call('POST', '/rh/ferias', ctx.tokens.colaborador, {
    funcionarioId: ctx.teamCollab, dataInicio: '2031-03-02', dataFim: '2031-03-06',
  });
  assert.equal(colaborador.status, 403, colaborador.text);
  const listing = await call('GET', '/rh/ferias', ctx.tokens.colaborador);
  assert.equal(listing.status, 403, listing.text);
});

test('ferias: gestor so ve ferias da propria equipe na listagem', opts, async () => {
  const listing = await call('GET', '/rh/ferias', ctx.tokens.gestor);
  assert.equal(listing.status, 200, listing.text);
  assert.ok(listing.json.every((item) => Number(item.funcionarioId) !== ctx.outsiderCollab));
});

test('ponto de terceiros exige permissao de gestao (403 para colaborador)', opts, async () => {
  const mirror = await call('GET', `/rh/ponto/${ctx.managerCollab}`, ctx.tokens.colaborador);
  assert.equal(mirror.status, 403, mirror.text);
  const punch = await call('POST', '/rh/ponto', ctx.tokens.colaborador, { funcionarioId: ctx.managerCollab, tipo: 'ENTRADA' });
  assert.equal(punch.status, 403, punch.text);
});

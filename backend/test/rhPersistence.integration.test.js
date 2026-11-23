import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';

const enabled = process.env.RUN_DB_INTEGRATION === '1';
if (enabled) process.env.NODE_ENV = 'test';

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const suffix = String(Date.now());

async function startServer() {
  const { createApp } = await import('../src/server.js');
  const server = http.createServer(createApp());
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const stop = () => new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  return { base, stop };
}

function request(base, token) {
  return async (method, route, body) => {
    const response = await fetch(`${base}${route}`, {
      method,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* nao JSON */ }
    return { status: response.status, text, json };
  };
}

// Consulta feita em um processo Node separado: prova que os dados estao no PostgreSQL,
// e nao em memoria do processo de teste.
function queryInFreshProcess(sql, params) {
  const script = `
    import 'dotenv/config';
    import { all, getPool } from './src/db/client.js';
    const rows = await all(${JSON.stringify(sql)}, ${JSON.stringify(params)});
    process.stdout.write('@@' + JSON.stringify(rows));
    await (await getPool()).end();`;
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: backendDir, encoding: 'utf8', env: { ...process.env, LOG_LEVEL: 'silent' },
  });
  return JSON.parse(out.slice(out.lastIndexOf('@@') + 2));
}

after(async () => {
  if (!enabled) return;
  const { getPool } = await import('../src/db/client.js');
  await (await getPool()).end();
});

test('fluxo departamento -> funcionario -> periodos -> ferias persiste apos reinicio', { skip: !enabled }, async () => {
  const { all } = await import('../src/db/client.js');
  const { signToken } = await import('../src/middleware/auth.js');
  const [admin] = await all(`SELECT id,email,session_version FROM usuarios WHERE perfil='ADMINISTRADOR' AND ativo ORDER BY id LIMIT 1`);
  assert.ok(admin, 'requer administrador (npm run db:seed)');
  const token = signToken({ sub: admin.id, email: admin.email, sv: admin.session_version });

  const created = { departamento: null, cargo: null, colaborador: null };
  const digits = suffix.slice(-9);
  let first = await startServer();
  let api = request(first.base, token);
  try {
    // 1. Cadastro de departamento e cargo vinculado (nao ha rota HTTP de criacao de departamento)
    const [dept] = await all(
      `INSERT INTO departamentos(nome,sigla,codigo) VALUES (?,?,?) RETURNING id`,
      [`Departamento Persistencia ${suffix}`, `P${digits.slice(-5)}`, `TST-${suffix}`],
    );
    created.departamento = Number(dept.id);
    const [cargo] = await all(
      `INSERT INTO cargos(nome,departamento_id,salario_base) VALUES (?,?,3200) RETURNING id`,
      [`Cargo Persistencia ${suffix}`, dept.id],
    );
    created.cargo = Number(cargo.id);

    const catalog = await api('GET', '/rh/departamentos');
    assert.equal(catalog.status, 200, catalog.text);
    assert.ok(catalog.json.some((d) => Number(d.id) === created.departamento), 'departamento aparece na API');

    // 2/3. Cadastro de funcionario associado ao departamento
    const email = `persist-${suffix}@example.invalid`;
    const admitted = await api('POST', '/rh/admitir', {
      nome: 'Funcionario Persistencia', cpf: `52998224725`, email,
      cargoId: created.cargo, departamentoId: created.departamento, salario: 3200,
      dataAdmissao: '2022-03-01',
    }).catch((e) => ({ status: 0, text: String(e) }));
    if (admitted.status === 409) {
      await all('DELETE FROM colaboradores WHERE cpf=? RETURNING id', ['52998224725']);
    }
    const retry = admitted.status === 409
      ? await api('POST', '/rh/admitir', {
          nome: 'Funcionario Persistencia', cpf: `52998224725`, email,
          cargoId: created.cargo, departamentoId: created.departamento, salario: 3200, dataAdmissao: '2022-03-01',
        })
      : admitted;
    assert.equal(retry.status, 201, retry.text);
    created.colaborador = Number(retry.json.colaboradorId);

    // 4. Periodos aquisitivos gerados pela trigger
    const periods = await all(
      'SELECT inicio_em,disponivel_em,dias_direito,dias_utilizados FROM periodos_aquisitivos_ferias WHERE colaborador_id=? ORDER BY inicio_em',
      [created.colaborador],
    );
    assert.ok(periods.length >= 3, `esperava >=3 periodos desde 2022-03-01, veio ${periods.length}`);
    assert.ok(periods.every((p) => Number(p.dias_direito) === 30 && Number(p.dias_utilizados) === 0));

    // 5. Registro de ferias via API
    const leave = await api('POST', '/rh/ferias', { funcionarioId: created.colaborador, dataInicio: '2031-05-04', dataFim: '2031-05-13' });
    assert.equal(leave.status, 201, leave.text);

    // Conflito: mesmo periodo novamente
    const overlap = await api('POST', '/rh/ferias', { funcionarioId: created.colaborador, dataInicio: '2031-05-10', dataFim: '2031-05-20' });
    assert.equal(overlap.status, 409, overlap.text);

    // 6. Consulta integrada
    const integrated = async (call) => {
      const employees = await call('GET', '/rh/funcionarios?limite=100');
      assert.equal(employees.status, 200, employees.text);
      const employee = employees.json.find((e) => Number(e.id) === created.colaborador);
      assert.ok(employee, 'funcionario listado');
      assert.equal(employee.departamento.nome, `Departamento Persistencia ${suffix}`);
      assert.equal(employee.cargo.nome, `Cargo Persistencia ${suffix}`);
      assert.equal(employee.salario, 3200);
      const leaves = await call('GET', '/rh/ferias');
      assert.equal(leaves.status, 200, leaves.text);
      const own = leaves.json.filter((l) => Number(l.funcionarioId) === created.colaborador);
      assert.equal(own.length, 1);
      assert.equal(own[0].dataInicio, '2031-05-04');
      assert.equal(own[0].dataFim, '2031-05-13');
      assert.equal(own[0].dias, 10);
      assert.equal(own[0].status, 'PENDENTE');
      assert.equal(own[0].funcionario.nome, 'Funcionario Persistencia');
    };
    await integrated(api);

    // 7. Reinicializacao: derruba o servidor HTTP e sobe outra instancia da aplicacao
    await first.stop();
    first = await startServer();
    api = request(first.base, token);

    // 8. Nova consulta pela API reiniciada e por um processo Node totalmente novo
    await integrated(api);
    const [dbEmployee] = queryInFreshProcess(
      'SELECT c.departamento_id,c.cargo_id,c.email,(SELECT COUNT(*) FROM periodos_aquisitivos_ferias p WHERE p.colaborador_id=c.id) AS periodos,(SELECT COUNT(*) FROM ferias f WHERE f.colaborador_id=c.id) AS ferias FROM colaboradores c WHERE c.id=?',
      [created.colaborador],
    );
    assert.equal(Number(dbEmployee.departamento_id), created.departamento);
    assert.equal(Number(dbEmployee.cargo_id), created.cargo);
    assert.equal(Number(dbEmployee.periodos), periods.length);
    assert.equal(Number(dbEmployee.ferias), 1);

    // Entradas invalidas
    const base = { nome: 'Invalido', cpf: '11144477735', email: `inv-${suffix}@example.invalid`, cargoId: created.cargo, departamentoId: created.departamento, salario: 1000 };
    const cases = [
      ['departamento inexistente', { ...base, departamentoId: 99999999 }, [400, 422]],
      ['cargo inexistente', { ...base, cargoId: 99999999 }, [400, 422]],
      ['cpf curto', { ...base, cpf: '123' }, [400]],
      ['email invalido', { ...base, email: 'sem-arroba' }, [400]],
      ['salario negativo', { ...base, salario: -5 }, [400]],
      ['data de nascimento invalida', { ...base, dataNascimento: '2020-13-45' }, [400, 422]],
    ];
    for (const [label, body, expected] of cases) {
      const res = await api('POST', '/rh/admitir', body);
      assert.ok(expected.includes(res.status), `${label}: esperado ${expected}, veio ${res.status} ${res.text}`);
    }
    const rejected = await all('SELECT id FROM colaboradores WHERE email=?', [base.email]);
    assert.equal(rejected.length, 0, 'admissoes invalidas nao podem persistir');

    const leaveCases = [
      ['funcionario inexistente', { funcionarioId: 99999999, dataInicio: '2031-06-01', dataFim: '2031-06-05' }, [404]],
      ['data inexistente', { funcionarioId: created.colaborador, dataInicio: '2031-02-30', dataFim: '2031-03-05' }, [400, 422]],
      ['fim antes do inicio', { funcionarioId: created.colaborador, dataInicio: '2031-06-10', dataFim: '2031-06-01' }, [422]],
      ['periodo acima de 30 dias', { funcionarioId: created.colaborador, dataInicio: '2031-07-01', dataFim: '2031-09-01' }, [422]],
      ['funcionario nao numerico', { funcionarioId: 'abc', dataInicio: '2031-06-01', dataFim: '2031-06-05' }, [400]],
      ['campos ausentes', { funcionarioId: created.colaborador }, [400]],
    ];
    for (const [label, body, expected] of leaveCases) {
      const res = await api('POST', '/rh/ferias', body);
      assert.ok(expected.includes(res.status), `ferias ${label}: esperado ${expected}, veio ${res.status} ${res.text}`);
    }
    assert.equal(
      (await all('SELECT id FROM ferias WHERE colaborador_id=?', [created.colaborador])).length,
      1,
      'ferias invalidas nao podem persistir',
    );
  } finally {
    await first.stop();
    if (created.colaborador) {
      const id = created.colaborador;
      await all(`DELETE FROM audit_outbox WHERE recurso_tipo='FERIAS' AND metadados->>'collaboratorId'=? RETURNING id`, [String(id)]).catch(() => {});
      await all('DELETE FROM ferias WHERE colaborador_id=? RETURNING id', [id]).catch(() => {});
      await all(`DELETE FROM audit_outbox WHERE recurso_tipo='COLABORADOR' AND recurso_id=? RETURNING id`, [String(id)]).catch(() => {});
      await all(`DELETE FROM outbox_eventos WHERE agregado_tipo='COLABORADOR' AND agregado_id=? RETURNING id`, [String(id)]).catch(() => {});
      await all('DELETE FROM periodos_aquisitivos_ferias WHERE colaborador_id=? RETURNING id', [id]).catch(() => {});
      await all('DELETE FROM colaboradores WHERE id=? RETURNING id', [id]).catch(() => {});
    }
    if (created.cargo) await all('DELETE FROM cargos WHERE id=? RETURNING id', [created.cargo]).catch(() => {});
    if (created.departamento) await all('DELETE FROM departamentos WHERE id=? RETURNING id', [created.departamento]).catch(() => {});
  }
});

test('associacao inconsistente cargo x departamento e tratada', { skip: !enabled }, async () => {
  const { all } = await import('../src/db/client.js');
  const { signToken } = await import('../src/middleware/auth.js');
  const [admin] = await all(`SELECT id,email,session_version FROM usuarios WHERE perfil='ADMINISTRADOR' AND ativo ORDER BY id LIMIT 1`);
  const token = signToken({ sub: admin.id, email: admin.email, sv: admin.session_version });
  const departments = await all('SELECT id FROM departamentos ORDER BY id LIMIT 2');
  assert.ok(departments.length >= 2, 'requer ao menos dois departamentos');
  const [cargo] = await all('SELECT id FROM cargos WHERE ativo AND departamento_id=? LIMIT 1', [departments[0].id]);
  assert.ok(cargo, 'requer cargo ativo no primeiro departamento');
  const server = await startServer();
  const email = `inconsistente-${suffix}@example.invalid`;
  try {
    const res = await request(server.base, token)('POST', '/rh/admitir', {
      nome: 'Associacao Inconsistente', cpf: '39053344705', email,
      cargoId: Number(cargo.id), departamentoId: Number(departments[1].id), salario: 1500,
    });
    const rows = await all('SELECT id FROM colaboradores WHERE email=?', [email]);
    for (const row of rows) {
      await all(`DELETE FROM audit_outbox WHERE recurso_tipo='COLABORADOR' AND recurso_id=? RETURNING id`, [String(row.id)]).catch(() => {});
      await all(`DELETE FROM outbox_eventos WHERE agregado_tipo='COLABORADOR' AND agregado_id=? RETURNING id`, [String(row.id)]).catch(() => {});
      await all('DELETE FROM periodos_aquisitivos_ferias WHERE colaborador_id=? RETURNING id', [row.id]).catch(() => {});
      await all('DELETE FROM colaboradores WHERE id=? RETURNING id', [row.id]).catch(() => {});
    }
    assert.ok([400, 422].includes(res.status), `cargo de outro departamento deveria ser rejeitado, veio ${res.status}: ${res.text}`);
    assert.equal(rows.length, 0);
  } finally {
    await server.stop();
  }
});

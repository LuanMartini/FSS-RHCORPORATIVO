import { all, run, isMysql } from '../db/client.js';

export function rowToFuncionario(row) {
  return {
    id: row.id,
    nome: row.nome,
    salario: Number(row.salario),
    cpf: row.cpf,
    email: row.email,
    status: row.status,
    cargo: { nome: row.cargo_nome },
    departamento: { nome: row.dept_nome },
  };
}

export async function listFuncionarios() {
  const rows = await all(
    `SELECT f.id, f.nome, f.salario, f.cpf, f.email, f.status, f.cargo_id,
      c.nome AS cargo_nome, d.nome AS dept_nome
     FROM funcionarios f
     JOIN cargos c ON f.cargo_id = c.id
     JOIN departamentos d ON f.departamento_id = d.id
     ORDER BY f.id`
  );
  return rows.map(rowToFuncionario);
}

export async function getFuncionarioAtivo(id) {
  const rows = await all(
    `SELECT f.*, c.id AS cargo_id FROM funcionarios f
     JOIN cargos c ON f.cargo_id = c.id
     WHERE f.id = ? AND f.status IN ('ATIVO','FERIAS')`,
    [id]
  );
  return rows[0] ?? null;
}

export async function desligarFuncionario(id) {
  await run(`UPDATE funcionarios SET status = 'DESLIGADO' WHERE id = ?`, [id]);
}

export async function listCargos() {
  const rows = await all(
    'SELECT id, nome, departamento_id, salario_base FROM cargos ORDER BY id'
  );
  return rows.map((r) => ({
    id: r.id,
    nome: r.nome,
    departamentoId: r.departamento_id,
    salarioBase: Number(r.salario_base),
  }));
}

export async function listDepartamentos() {
  return all('SELECT id, nome, sigla FROM departamentos ORDER BY id');
}

export async function admitir(body) {
  await run(
    `INSERT INTO funcionarios
      (nome, cpf, email, cargo_id, departamento_id, salario, telefone, data_nascimento, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ATIVO')`,
    [
      body.nome,
      body.cpf,
      body.email,
      body.cargoId,
      body.departamentoId,
      body.salario,
      body.telefone ?? null,
      body.dataNascimento ?? null,
    ]
  );
}

export async function insertPonto(funcionarioId, tipo) {
  if (isMysql) {
    const r = await run(
      'INSERT INTO registros_ponto (funcionario_id, tipo) VALUES (?, ?)',
      [funcionarioId, tipo]
    );
    const rows = await all(
      'SELECT id, tipo, registrado_em FROM registros_ponto WHERE id = ?',
      [r.insertId]
    );
    return rows[0];
  }
  const rows = await all(
    `INSERT INTO registros_ponto (funcionario_id, tipo) VALUES (?, ?)
     RETURNING id, tipo, registrado_em`,
    [funcionarioId, tipo]
  );
  return rows[0];
}

export async function espelhoPonto(funcionarioId) {
  return all(
    `SELECT id, tipo, registrado_em FROM registros_ponto
     WHERE funcionario_id = ? ORDER BY registrado_em DESC LIMIT 200`,
    [funcionarioId]
  );
}

export async function countPontoHoje() {
  const sql = isMysql
    ? `SELECT COUNT(*) AS c FROM registros_ponto WHERE DATE(registrado_em) = CURDATE()`
    : `SELECT COUNT(*) AS c FROM registros_ponto WHERE CAST(registrado_em AS DATE) = CURRENT_DATE`;
  const rows = await all(sql);
  return Number(rows[0]?.c ?? 0);
}

export async function listFerias() {
  const rows = await all(
    `SELECT f.id, f.funcionario_id AS funcionarioId, f.data_inicio AS dataInicio, f.data_fim AS dataFim,
            f.status, fu.nome AS fnome
     FROM ferias f
     LEFT JOIN funcionarios fu ON f.funcionario_id = fu.id
     ORDER BY f.id DESC`
  );
  return rows.map((r) => ({
    id: r.id,
    funcionarioId: r.funcionarioId,
    dataInicio: formatDate(r.dataInicio),
    dataFim: formatDate(r.dataFim),
    status: r.status,
    funcionario: r.fnome ? { nome: r.fnome } : null,
  }));
}

function formatDate(v) {
  if (!v) return '';
  if (typeof v === 'string') return v.slice(0, 10);
  const d = new Date(v);
  return d.toISOString().slice(0, 10);
}

export async function createFeria(body) {
  await run(
    `INSERT INTO ferias (funcionario_id, data_inicio, data_fim, observacao, status)
     VALUES (?, ?, ?, ?, 'PENDENTE')`,
    [body.funcionarioId, body.dataInicio, body.dataFim, body.observacao ?? null]
  );
}

export async function getFeria(id) {
  const rows = await all('SELECT * FROM ferias WHERE id = ?', [id]);
  return rows[0] ?? null;
}

export async function feriasAprovar(id) {
  const f = await getFeria(id);
  if (!f) return false;
  await run(`UPDATE ferias SET status = 'APROVADO' WHERE id = ?`, [id]);
  await run(`UPDATE funcionarios SET status = 'FERIAS' WHERE id = ?`, [f.funcionario_id]);
  return true;
}

export async function feriasReprovar(id, motivo) {
  const f = await getFeria(id);
  if (!f) return false;
  await run(`UPDATE ferias SET status = 'REPROVADO', observacao = ? WHERE id = ?`, [
    motivo ?? null,
    id,
  ]);
  return true;
}

export async function feriasEncerrar(id) {
  const f = await getFeria(id);
  if (!f) return false;
  await run(`UPDATE ferias SET status = 'ENCERRADO' WHERE id = ?`, [id]);
  await run(`UPDATE funcionarios SET status = 'ATIVO' WHERE id = ?`, [f.funcionario_id]);
  return true;
}

export async function listAdvertencias() {
  const rows = await all(
    `SELECT a.id, a.funcionario_id AS funcionarioId, a.tipo, a.descricao,
            a.data_ocorrencia AS dataOcorrencia, fu.nome AS fnome
     FROM advertencias a
     LEFT JOIN funcionarios fu ON a.funcionario_id = fu.id
     ORDER BY a.id DESC`
  );
  return rows.map((r) => ({
    id: r.id,
    funcionarioId: r.funcionarioId,
    tipo: r.tipo,
    descricao: r.descricao,
    dataOcorrencia: r.dataOcorrencia ? formatDate(r.dataOcorrencia) : '',
    funcionario: r.fnome ? { nome: r.fnome } : null,
  }));
}

export async function createAdvertencia(body) {
  await run(
    `INSERT INTO advertencias (funcionario_id, tipo, descricao, data_ocorrencia)
     VALUES (?, ?, ?, ?)`,
    [
      body.funcionarioId,
      body.tipo,
      body.descricao,
      body.dataOcorrencia ?? null,
    ]
  );
}

export async function listBeneficios() {
  const rows = await all('SELECT id, nome, tipo, valor_mensal FROM beneficios ORDER BY id');
  return rows.map((r) => ({
    id: r.id,
    nome: r.nome,
    tipo: r.tipo,
    valorMensal: Number(r.valor_mensal),
  }));
}

export async function createBeneficio(body) {
  await run(
    'INSERT INTO beneficios (nome, tipo, valor_mensal) VALUES (?, ?, ?)',
    [body.nome, body.tipo, body.valorMensal]
  );
}

export async function vincularBeneficio(funcionarioId, beneficioId) {
  try {
    await run(
      'INSERT INTO funcionario_beneficio (funcionario_id, beneficio_id) VALUES (?, ?)',
      [funcionarioId, beneficioId]
    );
  } catch (e) {
    if (e.code !== '23505' && e.errno !== 1062) throw e;
  }
}

export async function listTreinamentos() {
  const rows = await all(
    'SELECT id, nome, carga_horaria, modalidade, descricao FROM treinamentos ORDER BY id'
  );
  return rows.map((r) => ({
    id: r.id,
    nome: r.nome,
    cargaHoraria: r.carga_horaria,
    modalidade: r.modalidade,
    descricao: r.descricao,
  }));
}

export async function createTreinamento(body) {
  await run(
    `INSERT INTO treinamentos (nome, carga_horaria, modalidade, descricao)
     VALUES (?, ?, ?, ?)`,
    [body.nome, body.cargaHoraria, body.modalidade, body.descricao ?? null]
  );
}

export async function inscreverTreinamento(funcionarioId, treinamentoId) {
  try {
    await run(
      `INSERT INTO funcionario_treinamento (funcionario_id, treinamento_id) VALUES (?, ?)`,
      [funcionarioId, treinamentoId]
    );
  } catch (e) {
    if (e.code !== '23505' && e.errno !== 1062) throw e;
  }
}

export async function countsFuncionarios() {
  const rows = await all(`SELECT status, COUNT(*) AS c FROM funcionarios GROUP BY status`);
  const m = { ATIVO: 0, DESLIGADO: 0, FERIAS: 0 };
  for (const r of rows) {
    if (m[r.status] !== undefined) m[r.status] = Number(r.c);
  }
  return m;
}

export async function countsDeptDist() {
  return all(
    `SELECT d.nome AS departamento, d.sigla, COUNT(f.id) AS total
     FROM departamentos d
     LEFT JOIN funcionarios f ON f.departamento_id = d.id AND f.status <> 'DESLIGADO'
     GROUP BY d.id, d.nome, d.sigla
     ORDER BY d.nome`
  );
}

export async function countsCargosDeptos() {
  const c = await all('SELECT COUNT(*) AS c FROM cargos');
  const d = await all('SELECT COUNT(*) AS c FROM departamentos');
  return { cargos: Number(c[0]?.c ?? 0), deptos: Number(d[0]?.c ?? 0) };
}

export async function listFuncionariosComSalario() {
  return all(
    `SELECT id, nome, cpf, salario, cargo_id FROM funcionarios
     WHERE status IN ('ATIVO','FERIAS')`
  );
}

export async function listVagas() {
  const rows = await all(
    `SELECT v.id, v.titulo, v.descricao, v.status, d.nome AS departamento_nome 
     FROM vagas v
     JOIN departamentos d ON v.departamento_id = d.id
     ORDER BY v.id DESC`
  );
  return rows.map(r => ({
    id: r.id,
    titulo: r.titulo,
    descricao: r.descricao,
    status: r.status,
    departamento: { nome: r.departamento_nome }
  }));
}

export async function createVaga(body) {
  await run(
    `INSERT INTO vagas (titulo, departamento_id, descricao) VALUES (?, ?, ?)`,
    [body.titulo, body.departamentoId, body.descricao]
  );
}

export async function createCandidato(body) {
  await run(
    `INSERT INTO candidatos (vaga_id, nome, email, telefone, link_curriculo) VALUES (?, ?, ?, ?, ?)`,
    [body.vagaId, body.nome, body.email, body.telefone ?? null, body.linkCurriculo ?? null]
  );
}

export async function listCandidatos(vagaId) {
  return all(
    `SELECT id, vaga_id AS vagaId, nome, email, telefone, link_curriculo AS linkCurriculo, fase 
     FROM candidatos WHERE vaga_id = ? ORDER BY id DESC`,
    [vagaId]
  );
}

export async function updateFaseCandidato(id, fase) {
  await run(`UPDATE candidatos SET fase = ? WHERE id = ?`, [fase, id]);
}
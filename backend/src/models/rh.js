import { all, run, isMysql, withTransaction } from '../db/client.js';

export function rowToFuncionario(row) {
  return {
    id: row.id,
    nome: row.nome,
    salario: row.salario == null ? undefined : Number(row.salario),
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

export async function listFerias(scope={all:true,managerId:null}) {
  if(!scope.all&&scope.managerId==null)return [];
  const filter=scope.all?'':`WHERE (c.id=? OR c.gestor_id=?)`;
  const params=scope.all?[]:[scope.managerId,scope.managerId];
  const rows = await all(
    `SELECT f.id, f.colaborador_id AS funcionarioId, f.data_inicio AS dataInicio, f.data_fim AS dataFim,
            f.status,f.versao,f.dias,COALESCE(c.nome_social,c.nome_completo) AS fnome
     FROM ferias f
     JOIN colaboradores c ON f.colaborador_id = c.id
     ${filter} ORDER BY f.id DESC LIMIT 200`,params
  );
  return rows.map((r) => ({
    id: r.id,
    funcionarioId: r.funcionarioId,
    dataInicio: formatDate(r.dataInicio),
    dataFim: formatDate(r.dataFim),
      status: r.status,
      versao: Number(r.versao),
      dias: Number(r.dias),
    funcionario: r.fnome ? { nome: r.fnome } : null,
  }));
}

function formatDate(v) {
  if (!v) return '';
  if (typeof v === 'string') return v.slice(0, 10);
  const d = new Date(v);
  return d.toISOString().slice(0, 10);
}

export async function createFeria(body,actor={}) {
  const collaboratorId=Number(body.funcionarioId);
  const start=new Date(`${body.dataInicio}T00:00:00Z`);const end=new Date(`${body.dataFim}T00:00:00Z`);
  const days=Math.floor((end.getTime()-start.getTime())/86400000)+1;
  if(!Number.isInteger(days)||days<1||days>30)throw Object.assign(new Error('Periodo de ferias deve possuir entre 1 e 30 dias.'),{status:422,code:'INVALID_LEAVE_PERIOD'});
  return withTransaction(async(tx)=>{
    const collaborators=await tx.all('SELECT id FROM colaboradores WHERE id=? AND status<>\'DESLIGADO\' FOR UPDATE',[collaboratorId]);
    if(!collaborators[0])throw Object.assign(new Error('Colaborador nao encontrado ou desligado.'),{status:404,code:'COLLABORATOR_NOT_FOUND'});
    const overlaps=await tx.all(`SELECT 1 FROM ferias WHERE colaborador_id=?
      AND status IN ('PENDENTE','APROVADA','EM_GOZO')
      AND daterange(data_inicio,data_fim,'[]') && daterange(?::date,?::date,'[]') LIMIT 1`,[collaboratorId,body.dataInicio,body.dataFim]);
    if(overlaps[0])throw Object.assign(new Error('Existe outro periodo de ferias conflitante.'),{status:409,code:'LEAVE_OVERLAP'});
    const periods=await tx.all(`SELECT * FROM periodos_aquisitivos_ferias WHERE colaborador_id=?
      AND disponivel_em<=?::date AND dias_direito-dias_utilizados>=? ORDER BY inicio_em FOR UPDATE LIMIT 1`,[collaboratorId,body.dataInicio,days]);
    if(!periods[0])throw Object.assign(new Error('Saldo de ferias disponivel insuficiente para o periodo.'),{status:422,code:'INSUFFICIENT_LEAVE_BALANCE'});
    const rows=await tx.all(`INSERT INTO ferias
      (colaborador_id,data_inicio,data_fim,dias,observacao,status,periodo_aquisitivo_id)
      VALUES (?,?,?,?,?,'PENDENTE',?) RETURNING *`,[collaboratorId,body.dataInicio,body.dataFim,days,body.observacao??null,periods[0].id]);
    await tx.run(`INSERT INTO audit_outbox(ator_usuario_id,ator_referencia,acao,recurso_tipo,recurso_id,metadados)
      VALUES (?,?,'LEAVE_REQUESTED','FERIAS',?,?::jsonb)`,[actor.userId??null,actor.reference??'sistema',String(rows[0].id),JSON.stringify({collaboratorId,start:body.dataInicio,end:body.dataFim,days})]);
    return rows[0];
  });
}

export async function isManagedCollaborator(managerId,collaboratorId){
  if(!Number.isInteger(Number(managerId))||!Number.isInteger(Number(collaboratorId)))return false;
  const rows=await all('SELECT 1 FROM colaboradores WHERE id=? AND gestor_id=? LIMIT 1',[collaboratorId,managerId]);
  return Boolean(rows[0]);
}

export async function getFeria(id) {
  const rows = await all('SELECT * FROM ferias WHERE id = ?', [id]);
  return rows[0] ?? null;
}

export async function feriasAprovar(id,input={}) {
  return withTransaction(async(tx)=>{
    const rows=await tx.all('SELECT * FROM ferias WHERE id=? FOR UPDATE',[id]);const f=rows[0];if(!f)return false;
    if(f.status!=='PENDENTE')throw Object.assign(new Error('Solicitacao fora do estado pendente.'),{status:409,code:'LEAVE_STATE_CONFLICT'});
    if(input.versao!=null&&Number(input.versao)!==Number(f.versao))throw Object.assign(new Error('Solicitacao alterada por outra sessao.'),{status:409,code:'LEAVE_VERSION_CONFLICT'});
    if(!input.all){const managed=await tx.all('SELECT 1 FROM colaboradores WHERE id=? AND gestor_id=?',[f.colaborador_id,input.managerId]);if(!managed[0])throw Object.assign(new Error('Somente o gestor responsavel pode aprovar estas ferias.'),{status:403,code:'LEAVE_MANAGER_FORBIDDEN'});}
    const periods=await tx.all('SELECT * FROM periodos_aquisitivos_ferias WHERE id=? FOR UPDATE',[f.periodo_aquisitivo_id]);const period=periods[0];
    if(!period||Number(period.dias_direito)-Number(period.dias_utilizados)<Number(f.dias))throw Object.assign(new Error('Saldo de ferias insuficiente.'),{status:409,code:'INSUFFICIENT_LEAVE_BALANCE'});
    await tx.run('UPDATE periodos_aquisitivos_ferias SET dias_utilizados=dias_utilizados+?,versao=versao+1,atualizado_em=now() WHERE id=?',[f.dias,period.id]);
    await tx.run(`UPDATE ferias SET status='APROVADA',decidido_em=now(),decidido_por=?,versao=versao+1,atualizado_em=now() WHERE id=?`,[input.userId,id]);
    await tx.run(`INSERT INTO audit_outbox(ator_usuario_id,ator_referencia,acao,recurso_tipo,recurso_id,metadados)
      VALUES (?,'usuario:'||?,'LEAVE_APPROVED','FERIAS',?,?::jsonb)`,[input.userId,String(input.userId),String(id),JSON.stringify({collaboratorId:f.colaborador_id,days:f.dias})]);
    return true;
  });
}

export async function feriasReprovar(id, motivo,input={}) {
  return withTransaction(async(tx)=>{const rows=await tx.all('SELECT * FROM ferias WHERE id=? FOR UPDATE',[id]);const f=rows[0];if(!f)return false;
    if(f.status!=='PENDENTE')throw Object.assign(new Error('Solicitacao fora do estado pendente.'),{status:409,code:'LEAVE_STATE_CONFLICT'});
    if(input.versao!=null&&Number(input.versao)!==Number(f.versao))throw Object.assign(new Error('Solicitacao alterada por outra sessao.'),{status:409,code:'LEAVE_VERSION_CONFLICT'});
    if(!input.all){const managed=await tx.all('SELECT 1 FROM colaboradores WHERE id=? AND gestor_id=?',[f.colaborador_id,input.managerId]);if(!managed[0])throw Object.assign(new Error('Somente o gestor responsavel pode reprovar estas ferias.'),{status:403,code:'LEAVE_MANAGER_FORBIDDEN'});}
    await tx.run(`UPDATE ferias SET status='REPROVADA',observacao=?,decidido_em=now(),decidido_por=?,versao=versao+1,atualizado_em=now() WHERE id=?`,[motivo??null,input.userId,id]);
    await tx.run(`INSERT INTO audit_outbox(ator_usuario_id,ator_referencia,acao,recurso_tipo,recurso_id,metadados)
      VALUES (?,'usuario:'||?,'LEAVE_REJECTED','FERIAS',?,'{}'::jsonb)`,[input.userId,String(input.userId),String(id)]);return true;});
}

export async function feriasEncerrar(id) {
  return withTransaction(async(tx)=>{const rows=await tx.all('SELECT * FROM ferias WHERE id=? FOR UPDATE',[id]);const f=rows[0];if(!f)return false;
    if(f.status!=='EM_GOZO'||new Date(`${String(f.data_fim).slice(0,10)}T23:59:59Z`).getTime()>Date.now())throw Object.assign(new Error('Ferias ainda nao podem ser encerradas.'),{status:409,code:'LEAVE_STATE_CONFLICT'});
    await tx.run(`UPDATE ferias SET status='ENCERRADA',versao=versao+1,atualizado_em=now() WHERE id=?`,[id]);
    await tx.run(`UPDATE colaboradores SET status='ATIVO',versao=versao+1,updated_at=now() WHERE id=?
      AND NOT EXISTS(SELECT 1 FROM ferias WHERE colaborador_id=? AND status='EM_GOZO' AND id<>?)`,[f.colaborador_id,f.colaborador_id,id]);return true;});
}

export async function sincronizarFerias() {
  return withTransaction(async(tx)=>{
    const started=await tx.all(`UPDATE ferias SET status='EM_GOZO',versao=versao+1,atualizado_em=now()
      WHERE status='APROVADA' AND current_date BETWEEN data_inicio AND data_fim RETURNING colaborador_id`);
    for(const row of started)await tx.run(`UPDATE colaboradores SET status='AFASTADO',versao=versao+1,updated_at=now() WHERE id=? AND status='ATIVO'`,[row.colaborador_id]);
    const ended=await tx.all(`UPDATE ferias SET status='ENCERRADA',versao=versao+1,atualizado_em=now()
      WHERE status='EM_GOZO' AND data_fim<current_date RETURNING colaborador_id`);
    for(const row of ended)await tx.run(`UPDATE colaboradores SET status='ATIVO',versao=versao+1,updated_at=now() WHERE id=?
      AND NOT EXISTS(SELECT 1 FROM ferias WHERE colaborador_id=? AND status='EM_GOZO')`,[row.colaborador_id,row.colaborador_id]);
    return{started:started.length,ended:ended.length};
  });
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
  const rows = await all(`SELECT status, COUNT(*) AS c FROM colaboradores GROUP BY status`);
  const m = { ATIVO: 0, DESLIGADO: 0, FERIAS: 0 };
  for (const r of rows) {
    if (r.status === 'ATIVO') m.ATIVO = Number(r.c);
    if (r.status === 'DESLIGADO') m.DESLIGADO = Number(r.c);
  }
  const activeLeave = await all(`SELECT COUNT(DISTINCT colaborador_id) AS c FROM ferias WHERE status='EM_GOZO'`);
  m.FERIAS = Number(activeLeave[0]?.c ?? 0);
  return m;
}

export async function countsDeptDist() {
  return all(
    `SELECT d.nome AS departamento, d.sigla, COUNT(f.id) AS total
     FROM departamentos d
     LEFT JOIN colaboradores f ON f.departamento_id = d.id AND f.status <> 'DESLIGADO'
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
    `SELECT id,COALESCE(nome_social,nome_completo) AS nome,cpf,salario,cargo_id FROM colaboradores
     WHERE status IN ('ATIVO','AFASTADO')`
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

export async function listFuncionariosScoped(input) {
  if (!input.canReadAll && input.collaboratorId == null) return [];
  const scope = input.canReadAll
    ? ''
    : `AND (col.id=? OR col.gestor_id=?)`;
  const params = [input.canReadSalary, input.canReadSensitive, input.cursor];
  if (!input.canReadAll) params.push(input.collaboratorId, input.collaboratorId);
  params.push(input.limit);
  const rows = await all(
    `SELECT col.id,COALESCE(col.nome_social,col.nome_completo) AS nome,
            CASE WHEN ? THEN col.salario ELSE NULL END AS salario,
            CASE WHEN ? THEN col.cpf ELSE NULL END AS cpf,
            col.email,col.status,ca.nome AS cargo_nome,d.nome AS dept_nome
       FROM colaboradores col
       LEFT JOIN cargos ca ON ca.id=col.cargo_id
       LEFT JOIN departamentos d ON d.id=col.departamento_id
      WHERE col.id>? ${scope}
      ORDER BY col.id
      LIMIT ?`,
    params,
  );
  return rows.map(rowToFuncionario);
}

import { all } from '../../db/client.js';

export async function listAdmissions() {
  return all(
    `SELECT co.id, co.nome_completo, co.cpf, co.email, co.telefone, co.status,
            co.etapa_admissao, co.created_at, c.nome AS cargo_nome,
            d.nome AS departamento_nome,
            COUNT(da.id)::int AS documentos_total,
            COUNT(da.id) FILTER (WHERE da.status_validacao = 'APROVADO')::int AS documentos_aprovados,
            COUNT(da.id) FILTER (WHERE da.status_validacao = 'PENDENTE')::int AS documentos_pendentes,
            COUNT(da.id) FILTER (WHERE da.status_validacao = 'RECUSADO')::int AS documentos_recusados
       FROM colaboradores co
       LEFT JOIN cargos c ON c.id = co.cargo_id
       LEFT JOIN departamentos d ON d.id = co.departamento_id
       LEFT JOIN documentos_admissao da ON da.colaborador_id = co.id
      WHERE co.status <> 'DESLIGADO'
      GROUP BY co.id, c.nome, d.nome
      ORDER BY co.created_at DESC, co.id DESC`
  );
}

export async function getAdmission(id, client = { all }) {
  const rows = await client.all(
    `SELECT co.*, c.nome AS cargo_nome, d.nome AS departamento_nome
       FROM colaboradores co
       LEFT JOIN cargos c ON c.id = co.cargo_id
       LEFT JOIN departamentos d ON d.id = co.departamento_id
      WHERE co.id = ?`,
    [id]
  );
  if (!rows[0]) return null;
  const documents = await client.all(
    `SELECT id, tipo, nome_original, mime_type, tamanho_bytes, checksum_sha256,
            metadados_ocr, confianca_ocr, status_validacao, justificativa,
            validado_em, created_at
       FROM documentos_admissao WHERE colaborador_id = ?
      ORDER BY created_at DESC`,
    [id]
  );
  return { ...rows[0], documents };
}

export async function createAdmission(input, client) {
  let origin = null;
  if (input.applicationId != null) {
    const origins = await client.all(
      `SELECT ao.*,p.nome AS candidato_nome,p.email AS candidato_email
         FROM admissoes_origens ao
         JOIN candidaturas ca ON ca.id=ao.candidatura_id
         JOIN candidatos_perfil p ON p.id=ca.candidato_perfil_id
        WHERE ao.candidatura_id=? FOR UPDATE`,
      [input.applicationId]
    );
    origin = origins[0];
    if (!origin) throw Object.assign(new Error('Candidatura nao aprovada para admissao.'), { status: 409, code: 'ATS_NOT_APPROVED' });
    if (origin.colaborador_id != null || origin.status !== 'PENDENTE_DADOS') {
      throw Object.assign(new Error('Candidatura ja vinculada a uma admissao.'), { status: 409, code: 'ADMISSION_ALREADY_LINKED' });
    }
    if (String(origin.candidato_email).toLowerCase() !== input.email) {
      throw Object.assign(new Error('E-mail diverge da candidatura aprovada.'), { status: 409, code: 'CANDIDATE_IDENTITY_MISMATCH' });
    }
  }
  const rows = await client.all(
    `INSERT INTO colaboradores
      (nome_completo, nome_social, cpf, email, telefone, data_nascimento,
       cargo_id, departamento_id, salario, data_admissao,lifecycle_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?,'PRE_ADMISSAO')
     RETURNING *`,
    [input.name, input.socialName, input.cpf, input.email, input.phone, input.birthDate,
      input.cargoId, input.departmentId, input.salary, input.admissionDate]
  );
  if (origin) {
    await client.run(
      `UPDATE admissoes_origens SET colaborador_id=?,status='PRE_ADMISSAO',atualizado_em=now()
        WHERE candidatura_id=?`,
      [rows[0].id, input.applicationId]
    );
  }
  await client.run(
    `INSERT INTO outbox_eventos (agregado_tipo,agregado_id,tipo,payload)
     VALUES ('COLABORADOR',?,'employee.preadmission.created.v1',?::jsonb)`,
    [String(rows[0].id), JSON.stringify({ collaboratorId: Number(rows[0].id), applicationId: input.applicationId ?? null })]
  );
  await client.run(
    `INSERT INTO audit_outbox
      (ator_usuario_id,ator_referencia,acao,recurso_tipo,recurso_id,metadados)
     VALUES (?,?,'PRE_ADMISSION_CREATED','COLABORADOR',?,?::jsonb)`,
    [input.userId, input.actorReference, String(rows[0].id), JSON.stringify({ applicationId: input.applicationId ?? null })]
  );
  return rows[0];
}

export async function insertDocument(input, client) {
  await client.run(
    `UPDATE documentos_admissao
        SET status_validacao = 'RECUSADO', justificativa = 'Substituido por novo envio', updated_at = NOW()
      WHERE colaborador_id = ? AND tipo = ? AND status_validacao = 'PENDENTE'`,
    [input.collaboratorId, input.type]
  );
  const rows = await client.all(
    `INSERT INTO documentos_admissao
      (colaborador_id, tipo, nome_original, mime_type, tamanho_bytes, storage_key,
       checksum_sha256, metadados_ocr, confianca_ocr)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?)
     RETURNING id, tipo, nome_original, mime_type, tamanho_bytes, checksum_sha256,
               metadados_ocr, confianca_ocr, status_validacao, created_at`,
    [input.collaboratorId, input.type, input.fileName, input.mimeType, input.size,
      input.storageKey, input.checksum, JSON.stringify(input.ocrMetadata), input.ocrConfidence]
  );
  const counts = await client.all(
    `SELECT COUNT(DISTINCT tipo)::int AS tipos
       FROM documentos_admissao
      WHERE colaborador_id = ? AND status_validacao IN ('PENDENTE','APROVADO')`,
    [input.collaboratorId]
  );
  const stage = Number(counts[0]?.tipos) >= 5 ? 'VALIDACAO_RH' : 'ENVIO_DOCUMENTOS';
  await client.run(
    `UPDATE colaboradores SET etapa_admissao = ?, versao = versao + 1, updated_at = NOW()
      WHERE id = ? AND etapa_admissao <> 'CONCLUIDA'`,
    [stage, input.collaboratorId]
  );
  return rows[0];
}

export async function getDocumentWithCollaborator(id, client = { all }, lock = false) {
  const rows = await client.all(
    `SELECT da.*, co.nome_completo, co.cpf, co.etapa_admissao
       FROM documentos_admissao da
       JOIN colaboradores co ON co.id = da.colaborador_id
      WHERE da.id = ?${lock ? ' FOR UPDATE' : ''}`,
    [id]
  );
  return rows[0] ?? null;
}

export async function validateDocument(id, decision, justification, userId, client) {
  const rows = await client.all(
    `UPDATE documentos_admissao
        SET status_validacao = ?, justificativa = ?, validado_por = ?,
            validado_em = NOW(), updated_at = NOW()
      WHERE id = ?
      RETURNING colaborador_id`,
    [decision, justification, userId, id]
  );
  const collaboratorId = rows[0].colaborador_id;
  const counts = await client.all(
    `SELECT COUNT(DISTINCT tipo) FILTER (WHERE status_validacao = 'APROVADO')::int AS aprovados,
            COUNT(*) FILTER (WHERE status_validacao = 'RECUSADO')::int AS recusados
       FROM documentos_admissao WHERE colaborador_id = ?`,
    [collaboratorId]
  );
  const stage = decision === 'RECUSADO'
    ? 'ENVIO_DOCUMENTOS'
    : Number(counts[0]?.aprovados) >= 5 ? 'INTEGRACAO_SISTEMICA' : 'VALIDACAO_RH';
  await client.run(
    `UPDATE colaboradores SET etapa_admissao = ?, versao = versao + 1, updated_at = NOW()
      WHERE id = ? AND etapa_admissao <> 'CONCLUIDA'`,
    [stage, collaboratorId]
  );
  await client.run(
    `INSERT INTO audit_outbox
      (ator_usuario_id,ator_referencia,acao,recurso_tipo,recurso_id,metadados)
     VALUES (?,COALESCE((SELECT email FROM usuarios WHERE id=?),?),'ADMISSION_DOCUMENT_REVIEWED',
             'DOCUMENTO_ADMISSAO',?,?::jsonb)`,
    [userId,userId,`usuario:${userId}`,String(id),JSON.stringify({ decision, collaboratorId: Number(collaboratorId) })]
  );
  return collaboratorId;
}

export async function listOrganization() {
  return all(
    `SELECT c.id, c.nome, c.departamento_id, c.cargo_superior_id, c.nivel, c.versao,
            d.nome AS departamento_nome, d.codigo AS departamento_codigo,
            COUNT(co.id) FILTER (WHERE co.status <> 'DESLIGADO')::int AS ocupantes
       FROM cargos c
       JOIN departamentos d ON d.id = c.departamento_id
       LEFT JOIN colaboradores co ON co.cargo_id = c.id
      WHERE c.ativo = TRUE
      GROUP BY c.id, d.nome, d.codigo
      ORDER BY c.nivel, c.nome`
  );
}

export async function changeHierarchy(input, client) {
  await client.all('SELECT pg_advisory_xact_lock(?)', [742019]);
  const targetRows = await client.all('SELECT * FROM cargos WHERE id = ? AND ativo = TRUE FOR UPDATE', [input.cargoId]);
  if (!targetRows[0]) return { kind: 'not_found' };
  if (input.newSuperiorId != null) {
    const superiorRows = await client.all('SELECT id FROM cargos WHERE id = ? AND ativo = TRUE FOR UPDATE', [input.newSuperiorId]);
    if (!superiorRows[0]) return { kind: 'superior_not_found' };
    const cycle = await client.all(
      `WITH RECURSIVE descendentes(id) AS (
         SELECT id FROM cargos WHERE cargo_superior_id = ?
         UNION ALL
         SELECT c.id FROM cargos c JOIN descendentes d ON c.cargo_superior_id = d.id
       ) SELECT EXISTS (SELECT 1 FROM descendentes WHERE id = ?) AS ciclo`,
      [input.cargoId, input.newSuperiorId]
    );
    if (cycle[0]?.ciclo || input.cargoId === input.newSuperiorId) return { kind: 'cycle' };
  }

  const oldSuperiorId = targetRows[0].cargo_superior_id;
  if (oldSuperiorId === input.newSuperiorId) return { kind: 'unchanged' };
  const updated = await client.all(
    `UPDATE cargos SET cargo_superior_id = ?, versao = versao + 1, updated_at = NOW()
      WHERE id = ? AND versao = ? RETURNING id`,
    [input.newSuperiorId, input.cargoId, input.version]
  );
  if (!updated[0]) return { kind: 'version_conflict' };
  await client.run(
    `INSERT INTO historico_hierarquico
      (cargo_id, superior_anterior_id, superior_novo_id, alterado_por, motivo)
     VALUES (?, ?, ?, ?, ?)`,
    [input.cargoId, oldSuperiorId, input.newSuperiorId, input.userId, input.reason]
  );
  await client.run(
    `INSERT INTO audit_outbox
      (ator_usuario_id,ator_referencia,acao,recurso_tipo,recurso_id,metadados)
     VALUES (?,COALESCE((SELECT email FROM usuarios WHERE id=?),?),'ORGANIZATION_HIERARCHY_CHANGED',
             'CARGO',?,?::jsonb)`,
    [input.userId,input.userId,`usuario:${input.userId}`,String(input.cargoId),
      JSON.stringify({ previousSuperiorId: oldSuperiorId, newSuperiorId: input.newSuperiorId, reason: input.reason })]
  );
  await client.run(
    `WITH RECURSIVE arvore AS (
       SELECT id, 1 AS novo_nivel FROM cargos WHERE cargo_superior_id IS NULL
       UNION ALL
       SELECT c.id, a.novo_nivel + 1 FROM cargos c JOIN arvore a ON c.cargo_superior_id = a.id
     )
     UPDATE cargos c SET nivel = a.novo_nivel FROM arvore a WHERE c.id = a.id`
  );
  return { kind: 'updated' };
}

export async function insertContract(input, client) {
  const rows = await client.all(
    `INSERT INTO contratos_trabalho (colaborador_id, storage_key, checksum_sha256)
     VALUES (?, ?, ?) RETURNING id, token_publico, status, created_at`,
    [input.collaboratorId, input.storageKey, input.checksum]
  );
  return rows[0];
}

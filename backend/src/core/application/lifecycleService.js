import { withSerializableRetry } from '../../db/client.js';
import { AppError } from '../domain/errors.js';

export async function activateCollaborator(input) {
  return withSerializableRetry(async (tx) => {
    const rows = await tx.all('SELECT * FROM colaboradores WHERE id=? FOR UPDATE', [input.collaboratorId]);
    const collaborator = rows[0];
    if (!collaborator) throw new AppError('Colaborador nao encontrado.', 404, 'NOT_FOUND');
    if (Number(collaborator.versao) !== input.expectedVersion) {
      throw new AppError('Cadastro alterado por outro usuario.', 409, 'VERSION_CONFLICT');
    }
    if (collaborator.lifecycle_status === 'ATIVO') return collaborator;

    const readinessRows = await tx.all(
      `SELECT
        (SELECT count(DISTINCT tipo)=5 FROM documentos_admissao
          WHERE colaborador_id=? AND status_validacao='APROVADO') AS documentos_ok,
        EXISTS(SELECT 1 FROM contratos_trabalho WHERE colaborador_id=? AND status='ASSINADO') AS contrato_ok,
        EXISTS(SELECT 1 FROM escalas_trabalho WHERE id=? AND ativo) AS escala_ok`,
      [input.collaboratorId, input.collaboratorId, input.scheduleId]
    );
    const readiness = readinessRows[0];
    if (!readiness.documentos_ok || !readiness.contrato_ok || !readiness.escala_ok) {
      throw new AppError('Pre-condicoes de ativacao incompletas.', 409, 'ACTIVATION_NOT_READY', readiness);
    }

    await tx.run(
      `UPDATE colaboradores_escalas SET fim=current_date-1
        WHERE colaborador_id=? AND fim IS NULL AND escala_id<>?`,
      [input.collaboratorId, input.scheduleId]
    );
    await tx.run(
      `INSERT INTO colaboradores_escalas (colaborador_id,escala_id,inicio)
       VALUES (?,?,current_date)
       ON CONFLICT DO NOTHING`,
      [input.collaboratorId, input.scheduleId]
    );
    await tx.run(
      `INSERT INTO perfis_folha_colaboradores (colaborador_id,status)
       VALUES (?,'PRONTO') ON CONFLICT (colaborador_id) DO UPDATE SET status='PRONTO',atualizado_em=now()`,
      [input.collaboratorId]
    );
    const updated = await tx.all(
      `UPDATE colaboradores SET status='ATIVO',etapa_admissao='CONCLUIDA',
        lifecycle_status='ATIVO',versao=versao+1,updated_at=now()
       WHERE id=? AND versao=? RETURNING *`,
      [input.collaboratorId, input.expectedVersion]
    );
    if (!updated[0]) throw new AppError('Conflito ao ativar colaborador.', 409, 'VERSION_CONFLICT');
    await tx.run(
      `UPDATE admissoes_origens SET status='ATIVO',atualizado_em=now() WHERE colaborador_id=?`,
      [input.collaboratorId]
    );
    await tx.run(
      `INSERT INTO outbox_eventos (agregado_tipo,agregado_id,tipo,payload)
       VALUES ('COLABORADOR',?,'employee.activated.v1',?::jsonb)`,
      [String(input.collaboratorId), JSON.stringify({ collaboratorId: input.collaboratorId, scheduleId: input.scheduleId })]
    );
    await tx.run(
      `INSERT INTO audit_outbox
        (ator_usuario_id,ator_referencia,acao,recurso_tipo,recurso_id,metadados)
       VALUES (?,?,'EMPLOYEE_ACTIVATED','COLABORADOR',?,?::jsonb)`,
      [input.actorUserId, input.actorReference, String(input.collaboratorId), JSON.stringify(readiness)]
    );
    return updated[0];
  });
}

export async function terminateCollaborator(input) {
  return withSerializableRetry(async (tx) => {
    const rows=await tx.all('SELECT * FROM colaboradores WHERE id=? FOR UPDATE',[input.collaboratorId]);
    const collaborator=rows[0];
    if(!collaborator)throw new AppError('Colaborador nao encontrado.',404,'NOT_FOUND');
    if(collaborator.status==='DESLIGADO')return collaborator;
    if(input.expectedVersion!=null&&Number(input.expectedVersion)!==Number(collaborator.versao))throw new AppError('Cadastro alterado por outra sessao.',409,'VERSION_CONFLICT');
    const updated=await tx.all(`UPDATE colaboradores SET status='DESLIGADO',lifecycle_status='DESLIGADO',
      versao=versao+1,updated_at=now() WHERE id=? RETURNING *`,[input.collaboratorId]);
    await tx.run(`UPDATE colaboradores_escalas SET fim=COALESCE(fim,current_date) WHERE colaborador_id=? AND fim IS NULL`,[input.collaboratorId]);
    await tx.run(`UPDATE perfis_folha_colaboradores SET status='BLOQUEADO',atualizado_em=now() WHERE colaborador_id=?`,[input.collaboratorId]);
    await tx.run(`UPDATE historico_contratos SET data_desligamento=current_date,
      vigencia=daterange(data_admissao,current_date+1,'[)') WHERE colaborador_id=? AND data_desligamento IS NULL`,[input.collaboratorId]);
    await tx.run(`UPDATE usuarios SET ativo=false,session_version=session_version+1 WHERE id IN
      (SELECT usuario_id FROM usuarios_colaboradores WHERE colaborador_id=?)`,[input.collaboratorId]);
    await tx.run(`INSERT INTO outbox_eventos (agregado_tipo,agregado_id,tipo,payload)
      VALUES ('COLABORADOR',?,'employee.terminated.v1',?::jsonb)`,[String(input.collaboratorId),JSON.stringify({collaboratorId:input.collaboratorId})]);
    await tx.run(`INSERT INTO audit_outbox
      (ator_usuario_id,ator_referencia,acao,recurso_tipo,recurso_id,metadados)
      VALUES (?,?,'EMPLOYEE_TERMINATED','COLABORADOR',?,'{}'::jsonb)`,[input.actorUserId,input.actorReference,String(input.collaboratorId)]);
    return updated[0];
  });
}

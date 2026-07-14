import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { withTransaction } from '../../db/client.js';
import { AppError, assertFound } from '../domain/errors.js';
import * as repository from '../infrastructure/coreRepository.js';
import { generateEmploymentContract } from '../infrastructure/pdfGenerator.js';
import { removeEncrypted, saveEncrypted, sha256 } from '../infrastructure/encryptedFileStorage.js';

function pinHash(pin) {
  const secret = process.env.SIGNATURE_PIN_SECRET || process.env.JWT_SECRET || 'signature-development-secret';
  return createHmac('sha256', secret).update(pin).digest('hex');
}

function safeEqualHex(left, right) {
  const a = Buffer.from(left, 'hex');
  const b = Buffer.from(right, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function createContract(collaboratorId, actor) {
  let storageKey;
  const pin = String(randomInt(0, 1_000_000)).padStart(6, '0');
  try {
    const contract = await withTransaction(async (client) => {
      const collaborator = assertFound(await repository.getAdmission(collaboratorId, client), 'Colaborador nao encontrado.');
      if (!['INTEGRACAO_SISTEMICA', 'CONCLUIDA'].includes(collaborator.etapa_admissao)) {
        throw new AppError('Todos os documentos devem estar aprovados antes de gerar o contrato.', 409, 'WORKFLOW_INVALID_STAGE');
      }
      const pdf = generateEmploymentContract(collaborator);
      storageKey = await saveEncrypted(pdf);
      const created = await repository.insertContract({ collaboratorId, storageKey, checksum: sha256(pdf) }, client);
      await client.run(
        `INSERT INTO tokens_assinatura (contrato_id, pin_hash, expira_em)
         VALUES (?, ?, NOW() + INTERVAL '15 minutes')`,
        [created.id, pinHash(pin)]
      );
      await client.run(
        `INSERT INTO fila_emails (tipo, destinatario, payload)
         VALUES ('CONTRATO_ASSINATURA', ?, ?::jsonb)`,
        [collaborator.email, JSON.stringify({
          colaborador: collaborator.nome_completo,
          contratoId: created.id,
          token: created.token_publico,
          assunto: 'Contrato de trabalho para assinatura',
        })]
      );
      await client.run(
      `UPDATE colaboradores SET status = 'PENDENTE_ASSINATURA', versao = versao + 1, updated_at = NOW()
          , lifecycle_status='CONTRATO_PENDENTE' WHERE id = ?`,
        [collaboratorId]
      );
      await client.run(
        `INSERT INTO audit_outbox
          (ator_usuario_id,ator_referencia,acao,recurso_tipo,recurso_id,metadados)
         VALUES (?,?,'EMPLOYMENT_CONTRACT_CREATED','COLABORADOR',?,?::jsonb)`,
        [actor.userId,actor.reference,String(collaboratorId),JSON.stringify({ contractId: Number(created.id) })]
      );
      return created;
    });
    return {
      ...contract,
      expiresInSeconds: 900,
      ...(process.env.NODE_ENV !== 'production' ? { pinParaDemonstracao: pin } : {}),
    };
  } catch (error) {
    if (storageKey) await removeEncrypted(storageKey);
    throw error;
  }
}

export async function confirmSignature(token, pin, ipAddress) {
  const result = await withTransaction(async (client) => {
    const rows = await client.all(
      `SELECT ct.id, ct.colaborador_id, ct.status, ta.id AS token_id, ta.pin_hash,
              ta.expira_em, ta.tentativas, ta.usado_em
         FROM contratos_trabalho ct
         JOIN tokens_assinatura ta ON ta.contrato_id = ct.id
        WHERE ct.token_publico = ?
        ORDER BY ta.id DESC LIMIT 1 FOR UPDATE OF ct, ta`,
      [token]
    );
    if (!rows[0]) return { error: new AppError('Link de assinatura invalido.', 404, 'NOT_FOUND') };
    const current = rows[0];
    if (current.status !== 'PENDENTE' || current.usado_em) {
      return { error: new AppError('Contrato ja processado.', 409, 'SIGNATURE_ALREADY_PROCESSED') };
    }
    if (new Date(current.expira_em).getTime() < Date.now()) {
      await client.run(`UPDATE contratos_trabalho SET status = 'EXPIRADO' WHERE id = ?`, [current.id]);
      return { error: new AppError('PIN expirado. Solicite um novo contrato.', 410, 'PIN_EXPIRED') };
    }
    if (!safeEqualHex(current.pin_hash, pinHash(pin))) {
      const attempts = Number(current.tentativas) + 1;
      await client.run(`UPDATE tokens_assinatura SET tentativas = ? WHERE id = ?`, [attempts, current.token_id]);
      if (attempts >= 5) await client.run(`UPDATE contratos_trabalho SET status = 'EXPIRADO' WHERE id = ?`, [current.id]);
      return { error: new AppError('PIN incorreto.', 401, 'INVALID_PIN', { tentativasRestantes: Math.max(0, 5 - attempts) }) };
    }
    await client.run(`UPDATE tokens_assinatura SET usado_em = NOW() WHERE id = ?`, [current.token_id]);
    await client.run(
      `UPDATE contratos_trabalho SET status = 'ASSINADO', assinado_em = NOW(), ip_assinatura = ? WHERE id = ?`,
      [ipAddress, current.id]
    );
    await client.run(
      `UPDATE colaboradores
          SET status = 'PENDENTE_ASSINATURA', lifecycle_status = 'CONTRATO_PENDENTE',
              versao = versao + 1, updated_at = NOW()
        WHERE id = ?`,
      [current.colaborador_id]
    );
    await client.run(
      `INSERT INTO outbox_eventos (agregado_tipo,agregado_id,tipo,payload)
       VALUES ('COLABORADOR',?,'employment.contract.signed.v1',?::jsonb)`,
      [String(current.colaborador_id), JSON.stringify({ collaboratorId: Number(current.colaborador_id), contractId: Number(current.id) })]
    );
    await client.run(
      `INSERT INTO audit_outbox
        (ator_referencia,acao,recurso_tipo,recurso_id,ip,metadados)
       VALUES (?,'EMPLOYMENT_CONTRACT_SIGNED','CONTRATO',?,?,?::jsonb)`,
      [`assinatura:${String(token).slice(0, 8)}`, String(current.id), ipAddress,
        JSON.stringify({ collaboratorId: Number(current.colaborador_id) })]
    );
    return { contractId: current.id, status: 'ASSINADO', collaboratorStatus: 'CONTRATO_PENDENTE' };
  });
  if (result.error) throw result.error;
  return result;
}

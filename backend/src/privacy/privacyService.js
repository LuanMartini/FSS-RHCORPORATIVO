import { randomUUID } from 'node:crypto';
import { all, withTransaction } from '../db/client.js';

const fail = (message, status = 400, code = 'VALIDATION_ERROR') =>
  Object.assign(new Error(message), { status, code });

function positive(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw fail('Colaborador invalido.');
  return id;
}

export async function exportOwnData(value) {
  const id = positive(value);
  const [profile, leaves, points, consents, requests] = await Promise.all([
    all(
      `SELECT id, nome_completo, nome_social, cpf, email, telefone, data_nascimento,
              data_admissao, status, cargo_id, departamento_id, gestor_id, created_at, updated_at
         FROM colaboradores
        WHERE id = ?`,
      [id],
    ),
    all(
      `SELECT data_inicio, data_fim, dias, status, observacao
         FROM ferias
        WHERE colaborador_id = ?
        ORDER BY data_inicio DESC
        LIMIT 200`,
      [id],
    ),
    all(
      `SELECT nsr, tipo, registrado_em, timezone
         FROM pontos_registrados
        WHERE colaborador_id = ?
        ORDER BY registrado_em DESC
        LIMIT 1000`,
      [id],
    ),
    all(
      `SELECT finalidade_codigo, politica_versao, concedido, registrado_em
         FROM consentimentos_dados
        WHERE colaborador_id = ?
        ORDER BY registrado_em DESC`,
      [id],
    ),
    all(
      `SELECT id, tipo, status, solicitado_em, decidido_em, justificativa_decisao
         FROM solicitacoes_titulares
        WHERE colaborador_id = ?
        ORDER BY solicitado_em DESC`,
      [id],
    ),
  ]);

  if (!profile[0]) throw fail('Colaborador nao encontrado.', 404, 'NOT_FOUND');

  return {
    generatedAt: new Date().toISOString(),
    profile: profile[0],
    leaves,
    points,
    consents,
    requests,
  };
}

export async function createRequest(body) {
  const collaboratorId = positive(body.colaboradorId);
  const type = String(body.tipo ?? '').toUpperCase();
  if (!['EXPORTACAO', 'CORRECAO', 'ANONIMIZACAO', 'ELIMINACAO'].includes(type)) {
    throw fail('Tipo de solicitacao invalido.');
  }

  const key = String(body.idempotencia ?? randomUUID());
  if (!/^[0-9a-f-]{36}$/i.test(key)) throw fail('Idempotencia invalida.');
  const details = body.detalhes && typeof body.detalhes === 'object' ? body.detalhes : {};

  const rows = await all(
    `INSERT INTO solicitacoes_titulares
       (colaborador_id, tipo, detalhes, chave_idempotencia)
     VALUES (?, ?, ?::jsonb, ?::uuid)
     ON CONFLICT (chave_idempotencia)
     DO UPDATE SET chave_idempotencia = EXCLUDED.chave_idempotencia
     RETURNING id, tipo, status, solicitado_em`,
    [collaboratorId, type, JSON.stringify(details), key],
  );
  return rows[0];
}

export async function recordBiometricConsent(body, ip, userAgent) {
  const collaboratorId = positive(body.colaboradorId);
  const granted = body.concedido === true;
  const version = String(body.versaoPolitica ?? '').trim();
  if (!/^BIOMETRIA_V\d+$/.test(version)) {
    throw fail('Versao da politica biometrica invalida.');
  }

  return withTransaction(async (tx) => {
    const rows = await tx.all(
      `INSERT INTO consentimentos_dados
         (colaborador_id, finalidade_codigo, politica_versao, concedido, ip, user_agent)
       VALUES (?, 'BIOMETRIA_PONTO', ?, ?, ?::inet, ?)
       RETURNING id, concedido, registrado_em`,
      [collaboratorId, version, granted, ip ?? null, String(userAgent ?? '').slice(0, 500)],
    );

    if (!granted) {
      await tx.run(
        `UPDATE biometrias_faciais
            SET ativo = false, versao = versao + 1, updated_at = now()
          WHERE colaborador_id = ?`,
        [collaboratorId],
      );
    }
    return rows[0];
  });
}

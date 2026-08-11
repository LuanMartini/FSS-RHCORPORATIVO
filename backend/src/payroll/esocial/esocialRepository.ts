import os from 'node:os';
import { all, withTransaction } from '../../db/client.js';
import type { EsocialOutboxEvent, EsocialQueryResult, EsocialSubmissionResult } from './esocialTypes.js';

export class EsocialClosureBlockedError extends Error {
  readonly status = 409;
  readonly code = 'ESOCIAL_CLOSURE_BLOCKED';
  readonly expose = true;
  constructor(readonly blockers: Array<Record<string, unknown>>) {
    super(blockers.length
      ? `Fechamento S-1299 bloqueado por ${blockers.length} evento(s) nao aceito(s).`
      : 'Fechamento S-1299 bloqueado.');
    this.name = 'EsocialClosureBlockedError';
    Object.assign(this, { details: { blockers } });
  }
}

function payload(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object') return value as Record<string, unknown>;
  if (typeof value === 'string') return JSON.parse(value) as Record<string, unknown>;
  return {};
}

function rowToEvent(row: Record<string, unknown>): EsocialOutboxEvent {
  return {
    id: String(row.id), folha_id: String(row.folha_id),
    contracheque_id: row.contracheque_id == null ? null : String(row.contracheque_id),
    tipo_evento: row.tipo_evento as EsocialOutboxEvent['tipo_evento'],
    chave_idempotencia: String(row.chave_idempotencia), payload: payload(row.payload),
    status: row.status as EsocialOutboxEvent['status'],
    protocolo: row.protocolo == null ? null : String(row.protocolo),
    event_id: row.event_id == null ? null : String(row.event_id),
    recibo: row.recibo == null ? null : String(row.recibo),
    tentativas: Number(row.tentativas), consultas: Number(row.consultas),
    max_tentativas: Number(row.max_tentativas), criado_em: row.criado_em as string | Date,
  };
}

export async function claimNextEsocialEvent(workerId = `${os.hostname()}:${process.pid}`): Promise<EsocialOutboxEvent | null> {
  return withTransaction(async (tx) => {
    await tx.run(
      `UPDATE eventos_esocial_folha SET bloqueado_por=NULL,bloqueado_em=NULL,atualizado_em=now()
       WHERE status IN ('PRONTO_ENVIO','ENVIANDO') AND bloqueado_em < now()-interval '10 minutes'`,
    );
    const rows = await tx.all(
      `WITH candidato AS (
         SELECT id FROM eventos_esocial_folha
         WHERE status IN ('PRONTO_ENVIO','ENVIANDO') AND executar_apos<=now() AND bloqueado_em IS NULL
         ORDER BY CASE tipo_evento WHEN 'S-1200' THEN 1 WHEN 'S-1210' THEN 2 ELSE 3 END,criado_em,id
         FOR UPDATE SKIP LOCKED LIMIT 1
       )
       UPDATE eventos_esocial_folha e SET
         bloqueado_por=?,bloqueado_em=now(),atualizado_em=now(),
         tentativas=tentativas+CASE WHEN status='PRONTO_ENVIO' THEN 1 ELSE 0 END,
         consultas=consultas+CASE WHEN status='ENVIANDO' THEN 1 ELSE 0 END
       FROM candidato WHERE e.id=candidato.id RETURNING e.*`,
      [workerId],
    ) as Array<Record<string, unknown>>;
    return rows[0] ? rowToEvent(rows[0]) : null;
  });
}

export async function assignEventId(id: string, eventId: string): Promise<void> {
  await all(
    `UPDATE eventos_esocial_folha SET event_id=COALESCE(event_id,?),atualizado_em=now()
     WHERE id=? AND (event_id IS NULL OR event_id=?) RETURNING id`,
    [eventId, id, eventId],
  );
}

function safeResponse(result: EsocialSubmissionResult | EsocialQueryResult): Record<string, unknown> {
  return {
    responseCode: result.responseCode,
    description: result.description,
    occurrences: result.occurrences,
    ...(result.rawResponse ? { rawResponseSha256Omitted: true } : {}),
  };
}

async function insertAudit(
  tx: { run(sql: string, params?: unknown[]): Promise<unknown> },
  action: string,
  event: EsocialOutboxEvent,
  metadata: Record<string, unknown>,
): Promise<void> {
  await tx.run(
    `INSERT INTO audit_outbox
      (ator_referencia,acao,recurso_tipo,recurso_id,metadados)
     VALUES ('sistema:esocial-worker',?,'ESOCIAL_EVENT',?,?::jsonb)`,
    [action, event.id, JSON.stringify({ folhaId: event.folha_id, eventType: event.tipo_evento, eventId: event.event_id, ...metadata })],
  );
}

export async function markEsocialSubmitted(event: EsocialOutboxEvent, result: EsocialSubmissionResult): Promise<void> {
  if (!result.protocol) throw new Error('Resposta de envio aceita sem protocolo.');
  await withTransaction(async (tx) => {
    await tx.run(
      `UPDATE eventos_esocial_folha SET status='ENVIANDO',protocolo=?,resposta=?::jsonb,
       enviado_em=COALESCE(enviado_em,now()),executar_apos=now()+interval '15 seconds',
       bloqueado_por=NULL,bloqueado_em=NULL,ultimo_erro=NULL,atualizado_em=now() WHERE id=?`,
      [result.protocol, JSON.stringify(safeResponse(result)), event.id],
    );
    await insertAudit(tx, 'ESOCIAL_EVENT_SUBMITTED', event, { protocol: result.protocol, responseCode: result.responseCode });
  });
}

export async function markEsocialRejected(
  event: EsocialOutboxEvent,
  result: Pick<EsocialSubmissionResult | EsocialQueryResult, 'responseCode' | 'description' | 'occurrences'>,
): Promise<void> {
  await withTransaction(async (tx) => {
    await tx.run(
      `UPDATE eventos_esocial_folha SET status='REJEITADO',resposta=?::jsonb,ultimo_erro=?,
       bloqueado_por=NULL,bloqueado_em=NULL,atualizado_em=now() WHERE id=?`,
      [JSON.stringify({ responseCode: result.responseCode, description: result.description, occurrences: result.occurrences }),
       result.description.slice(0, 4000), event.id],
    );
    await insertAudit(tx, 'ESOCIAL_EVENT_REJECTED', event, {
      responseCode: result.responseCode, description: result.description, occurrences: result.occurrences,
    });
  });
}

export async function markEsocialQueryPending(event: EsocialOutboxEvent, result: EsocialQueryResult, fallbackMs: number): Promise<void> {
  const delaySeconds = Math.max(5, Math.min(3600, result.estimatedSeconds ?? Math.ceil(fallbackMs / 1000)));
  await withTransaction(async (tx) => {
    await tx.run(
      `UPDATE eventos_esocial_folha SET resposta=?::jsonb,executar_apos=now()+(? * interval '1 second'),
       bloqueado_por=NULL,bloqueado_em=NULL,ultimo_erro=NULL,atualizado_em=now() WHERE id=?`,
      [JSON.stringify(safeResponse(result)), delaySeconds, event.id],
    );
  });
}

export async function markEsocialAccepted(event: EsocialOutboxEvent, result: EsocialQueryResult): Promise<void> {
  if (!result.receipt) throw new Error('Evento eSocial aceito sem recibo.');
  await withTransaction(async (tx) => {
    await tx.run(
      `UPDATE eventos_esocial_folha SET status='ACEITO',recibo=?,resposta=?::jsonb,
       bloqueado_por=NULL,bloqueado_em=NULL,ultimo_erro=NULL,atualizado_em=now() WHERE id=?`,
      [result.receipt, JSON.stringify(safeResponse(result)), event.id],
    );
    await insertAudit(tx, 'ESOCIAL_EVENT_ACCEPTED', event, { receipt: result.receipt, responseCode: result.responseCode });
  });
}

export async function releaseEsocialAfterFailure(event: EsocialOutboxEvent, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const exhausted = event.status === 'PRONTO_ENVIO' && event.tentativas >= event.max_tentativas;
  if (exhausted) {
    await markEsocialRejected(event, { responseCode: 'LOCAL_RETRY_EXHAUSTED', description: message, occurrences: [] });
    return;
  }
  const delaySeconds = Math.min(900, 15 * (2 ** Math.min(6, Math.max(0, event.tentativas - 1))));
  await all(
    `UPDATE eventos_esocial_folha SET ultimo_erro=?,executar_apos=now()+(? * interval '1 second'),
     bloqueado_por=NULL,bloqueado_em=NULL,atualizado_em=now() WHERE id=? RETURNING id`,
    [message.slice(0, 4000), delaySeconds, event.id],
  );
}

export async function listEsocialEvents(folhaId: string): Promise<Array<Record<string, unknown>>> {
  return all(
    `SELECT id,folha_id,contracheque_id,tipo_evento,chave_idempotencia,status,event_id,protocolo,recibo,
      tentativas,consultas,ultimo_erro,resposta,criado_em,enviado_em,atualizado_em
     FROM eventos_esocial_folha WHERE folha_id=? ORDER BY criado_em,id`,
    [folhaId],
  ) as Promise<Array<Record<string, unknown>>>;
}

export interface ClosureDeclarations {
  evtComProd: boolean;
  evtContratAvNP: boolean;
  evtInfoComplPer: boolean;
}

export function findEsocialClosureBlockers(events: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return events
    .filter((event) => event.tipo_evento !== 'S-1299' && event.status !== 'ACEITO')
    .map((event) => ({
      id: event.id, tipo_evento: event.tipo_evento, status: event.status,
      chave_idempotencia: event.chave_idempotencia, ultimo_erro: event.ultimo_erro ?? null,
    }));
}

export async function createEsocialClosure(
  folhaId: string,
  declarations: ClosureDeclarations,
  userId: number | null,
): Promise<Record<string, unknown>> {
  return withTransaction(async (tx) => {
    const payrollRows = await tx.all('SELECT id,empresa_id,competencia FROM folhas_processadas WHERE id=? FOR UPDATE', [folhaId]) as Array<Record<string, unknown>>;
    const payroll = payrollRows[0];
    if (!payroll) throw Object.assign(new Error('Processamento nao encontrado.'), { status: 404 });
    const competency = String(payroll.competencia).slice(0, 7);
    await tx.all('SELECT pg_advisory_xact_lock(hashtext(?))', [`esocial-period:${competency}`]);
    const companyId = String(payroll.empresa_id);
    const closureKey = `S1299:${companyId}:${competency}`;
    const existing = await tx.all(`SELECT * FROM eventos_esocial_folha WHERE chave_idempotencia=? FOR UPDATE`, [closureKey]) as Array<Record<string, unknown>>;
    if (existing[0]) return existing[0];
    const periodEvents = await tx.all(
      `SELECT e.id,e.tipo_evento,e.status,e.chave_idempotencia,e.ultimo_erro
       FROM eventos_esocial_folha e JOIN folhas_processadas f ON f.id=e.folha_id
       WHERE f.empresa_id=? AND (
         (e.tipo_evento='S-1200' AND e.payload->>'competencia'=? )
         OR (e.tipo_evento='S-1210' AND left(e.payload->>'dataPagamento',7)=?)
       ) ORDER BY e.tipo_evento,e.id FOR UPDATE OF e`, [companyId, competency, competency],
    ) as Array<Record<string, unknown>>;
    const blockers = findEsocialClosureBlockers(periodEvents);
    if (blockers.length) throw new EsocialClosureBlockedError(blockers);
    const remunerations = periodEvents.filter((event) => event.tipo_evento === 'S-1200' && event.status === 'ACEITO').length;
    const payments = periodEvents.filter((event) => event.tipo_evento === 'S-1210' && event.status === 'ACEITO').length;
    const closePayload = {
      evento: 'S-1299', competencia: competency,
      evtRemun: remunerations > 0,
      evtPgtos: payments > 0,
      ...declarations,
    };
    const rows = await tx.all(
      `INSERT INTO eventos_esocial_folha (folha_id,tipo_evento,chave_idempotencia,payload)
       VALUES (?,'S-1299',?,?::jsonb) RETURNING *`,
      [folhaId, closureKey, JSON.stringify(closePayload)],
    ) as Array<Record<string, unknown>>;
    await tx.run(
      `INSERT INTO audit_outbox
        (ator_usuario_id,ator_referencia,acao,recurso_tipo,recurso_id,metadados)
       VALUES (?,COALESCE((SELECT email FROM usuarios WHERE id=?),?),'ESOCIAL_CLOSURE_REQUESTED','FOLHA',?,?::jsonb)`,
      [userId, userId, userId == null ? 'sistema:esocial' : `usuario:${userId}`, folhaId, JSON.stringify(closePayload)],
    );
    return rows[0] as Record<string, unknown>;
  }, { isolationLevel: 'SERIALIZABLE' });
}

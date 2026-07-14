import { randomUUID } from 'node:crypto';
import { buildTurnoverAlerts, calculatePayEquity, demographicDistribution } from '../domain/analyticsEngine.js';
import { GENESIS_HASH, ledgerHash, ledgerHmac, payloadCipherHash, secureHexEqual, sha256 } from '../domain/auditEngine.js';
import type { AuditEventInput, EquityRecord, LedgerCanonicalEntry, TurnoverAlertInput } from '../domain/types.js';
import { encryptAuditPayload, keyVersion, ledgerSecret, readAnchor, validAnchor, writeAnchor } from './auditSecurity.js';
import * as repository from '../infrastructure/auditRepository.js';
import type { Row } from '../infrastructure/auditRepository.js';

const fail = (message: string, status = 400, code = 'AUDIT_ERROR'): Error => Object.assign(new Error(message), { status, code });

function positiveUserId(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw fail('Identidade autenticada invalida.', 401, 'INVALID_IDENTITY');
  return parsed;
}

async function assertAuditAccess(userId: number): Promise<void> {
  const role = await repository.userRole(positiveUserId(userId));
  if (!role) throw fail('Usuario nao encontrado.', 401, 'INVALID_IDENTITY');
  if (!['ADMINISTRADOR', 'AUDITOR'].includes(role)) throw fail('Acesso restrito a administradores e auditores.', 403, 'AUDIT_ACCESS_DENIED');
}

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}

function canonicalFromRow(row: Row): LedgerCanonicalEntry {
  return {
    eventId: String(row.evento_id), timestamp: iso(row.timestamp_evento),
    actorUserId: row.ator_usuario_id === null ? null : Number(row.ator_usuario_id),
    actorReference: String(row.ator_referencia), action: String(row.acao), resourceType: String(row.recurso_tipo),
    resourceId: row.recurso_id === null ? null : String(row.recurso_id), ip: row.ip === null ? null : String(row.ip),
    userAgentHash: row.user_agent_hash === null ? null : String(row.user_agent_hash),
    correlationId: String(row.correlation_id), payloadHash: String(row.payload_hash), keyVersion: Number(row.chave_versao),
  };
}

function verifyRows(rows: Row[], startingHash = GENESIS_HASH) {
  let previous = startingHash;
  for (const row of rows) {
    if (!secureHexEqual(String(row.hash_anterior), previous)) {
      return { valid: false, brokenAt: Number(row.id), reason: 'HASH_ANTERIOR_DIVERGENTE', lastHash: previous };
    }
    const calculated = ledgerHash(previous, canonicalFromRow(row));
    if (!secureHexEqual(String(row.hash_atual), calculated)) {
      return { valid: false, brokenAt: Number(row.id), reason: 'HASH_ATUAL_INVALIDO', lastHash: previous };
    }
    if (!secureHexEqual(String(row.hmac_integridade), ledgerHmac(ledgerSecret(), calculated))) {
      return { valid: false, brokenAt: Number(row.id), reason: 'HMAC_INVALIDA', lastHash: previous };
    }
    previous = calculated;
  }
  return { valid: true, brokenAt: null, reason: null, lastHash: previous };
}

export async function appendAuditEvent(input: AuditEventInput) {
  const eventId = randomUUID();
  const correlationId = input.correlationId ?? randomUUID();
  const timestamp = new Date().toISOString();
  const version = keyVersion();
  const encrypted = encryptAuditPayload(input.metadata);
  const payloadHash = payloadCipherHash(encrypted.iv, encrypted.tag, encrypted.ciphertext);
  const userAgentHash = input.userAgent ? sha256(input.userAgent) : null;
  const anchor = await readAnchor();
  if (anchor && !validAnchor(anchor)) throw fail('Assinatura da ancora externa invalida.', 503, 'AUDIT_ANCHOR_INVALID');

  const inserted = await repository.insertLedgerSerialized(async (tx) => {
    const rows = await tx.all('SELECT * FROM logs_auditoria_imutaveis ORDER BY id');
    const verification = verifyRows(rows);
    if (!verification.valid) throw fail(`Ledger corrompido na entrada ${verification.brokenAt}.`, 503, 'AUDIT_LEDGER_CORRUPTED');
    const last = rows.at(-1);
    if (!last && anchor) throw fail('Ancora externa aponta para ledger removido.', 503, 'AUDIT_LEDGER_TRUNCATED');
    if (anchor) {
      const anchored = rows.find((row) => Number(row.id) === anchor.ledgerId);
      if (!anchored || !secureHexEqual(String(anchored.hash_atual), anchor.hash)) {
        throw fail('Ancora externa diverge do banco de dados.', 503, 'AUDIT_ANCHOR_DIVERGED');
      }
    }
    const previousHash = last ? String(last.hash_atual) : GENESIS_HASH;
    const canonical: LedgerCanonicalEntry = {
      eventId, timestamp, actorUserId: input.actorUserId, actorReference: input.actorReference.slice(0, 180),
      action: input.action.slice(0, 80), resourceType: input.resourceType.slice(0, 80),
      resourceId: input.resourceId?.slice(0, 160) ?? null, ip: input.ip ?? null, userAgentHash,
      correlationId, payloadHash, keyVersion: version,
    };
    const currentHash = ledgerHash(previousHash, canonical);
    const hmac = ledgerHmac(ledgerSecret(), currentHash);
    const result = await tx.all(`INSERT INTO logs_auditoria_imutaveis
      (evento_id,timestamp_evento,ator_usuario_id,ator_referencia,acao,recurso_tipo,recurso_id,ip,
       user_agent_hash,correlation_id,payload_cifrado,payload_iv,payload_tag,payload_hash,
       hash_anterior,hash_atual,hmac_integridade,chave_versao)
      VALUES (?::uuid,?,?,?,?,?,?,?::inet,?,?::uuid,?,?,?,?,?,?,?,?) RETURNING id`,
      [eventId,timestamp,input.actorUserId,canonical.actorReference,canonical.action,canonical.resourceType,
       canonical.resourceId,canonical.ip,userAgentHash,correlationId,encrypted.ciphertext,encrypted.iv,encrypted.tag,
       payloadHash,previousHash,currentHash,hmac,version]);
    return { id: Number(result[0]?.id), hash: currentHash, eventId, correlationId, timestamp };
  });
  const anchored = await writeAnchor(inserted.id, inserted.hash);
  return { ...inserted, anchor: { ledgerId: anchored.ledgerId, anchoredAt: anchored.anchoredAt } };
}

export async function processAuditOutboxBatch(limit = 25) {
  const items = await repository.claimAuditOutbox(limit);
  let processed = 0;
  for (const item of items) {
    try {
      await appendAuditEvent({
        actorUserId: item.ator_usuario_id == null ? null : Number(item.ator_usuario_id),
        actorReference: String(item.ator_referencia),
        action: String(item.acao),
        resourceType: String(item.recurso_tipo),
        resourceId: item.recurso_id == null ? null : String(item.recurso_id),
        ip: item.ip == null ? null : String(item.ip),
        userAgent: item.user_agent == null ? null : String(item.user_agent),
        correlationId: String(item.correlation_id),
        metadata: item.metadados as import('../domain/types.js').JsonValue,
      });
      await repository.completeAuditOutbox(String(item.id));
      processed += 1;
    } catch (error) {
      await repository.failAuditOutbox(String(item.id), error);
    }
  }
  return processed;
}

export async function verifyLedger(userId: number) {
  await assertAuditAccess(userId);
  const rows = await repository.allLedger();
  const chain = verifyRows(rows);
  const anchor = await readAnchor();
  let anchorStatus = 'AUSENTE';
  if (anchor) {
    if (!validAnchor(anchor)) anchorStatus = 'ASSINATURA_INVALIDA';
    else {
      const anchored = rows.find((row) => Number(row.id) === anchor.ledgerId);
      if (!anchored || !secureHexEqual(String(anchored.hash_atual), anchor.hash)) anchorStatus = 'DIVERGENTE';
      else anchorStatus = Number(rows.at(-1)?.id ?? 0) === anchor.ledgerId ? 'ATUAL' : 'DESATUALIZADA';
    }
  }
  const valid = chain.valid && ((rows.length === 0 && anchor === null) || ['ATUAL', 'DESATUALIZADA'].includes(anchorStatus));
  return { valid, status: valid ? 'INTEGRO' : 'CORROMPIDO', totalEntries: rows.length,
    brokenAt: chain.brokenAt, reason: chain.reason, anchorStatus, verifiedAt: new Date().toISOString(),
    lastHashPrefix: rows.length ? String(rows.at(-1)?.hash_atual).slice(0, 16) : null };
}

export async function ledgerEntries(userId: number, limitInput: unknown) {
  await assertAuditAccess(userId);
  const limit = Math.min(100, Math.max(10, Number(limitInput ?? 50)));
  if (!Number.isInteger(limit)) throw fail('Limite invalido.');
  const rows = await repository.recentLedger(limit);
  return rows.map((row) => ({ id: Number(row.id), eventId: row.evento_id, timestamp: row.timestamp_evento,
    actor: row.ator_referencia, action: row.acao, resourceType: row.recurso_tipo, resourceId: row.recurso_id,
    ip: row.ip, correlationId: row.correlation_id, hash: row.hash_atual, previousHash: row.hash_anterior,
    keyVersion: Number(row.chave_versao) }));
}

export async function dashboard(userId: number, monthsInput: unknown) {
  await assertAuditAccess(userId);
  const months = Math.min(36, Math.max(6, Number(monthsInput ?? 12)));
  if (!Number.isInteger(months)) throw fail('Periodo invalido.');
  const start = new Date();
  start.setUTCDate(1); start.setUTCMonth(start.getUTCMonth() - months + 1);
  const startDate = start.toISOString().slice(0, 10);
  const [monthlyRows, departmentRows, tenure, source, summary, ledger, integrity] = await Promise.all([
    repository.turnoverMonthly(startDate), repository.turnoverDepartments(), repository.turnoverTenure(),
    repository.equitySource(), repository.analyticsSummary(), repository.recentLedger(12), verifyLedger(userId),
  ]);
  const monthly = monthlyRows.map((row) => {
    const headcountStart = Number(row.headcount_inicio); const headcountEnd = Number(row.headcount_fim);
    const average = (headcountStart + headcountEnd) / 2;
    return { month: String(row.mes), admissions: Number(row.admissoes), terminations: Number(row.desligamentos),
      voluntary: Number(row.voluntarios), headcountStart, headcountEnd,
      turnoverRate: average === 0 ? 0 : Number(((Number(row.desligamentos) / average) * 100).toFixed(2)) };
  });
  const departments = departmentRows.map((row) => ({ department: String(row.departamento),
    recentVoluntary: Number(row.recentes_voluntarios), previousVoluntary: Number(row.anteriores_voluntarios),
    averageTenureYears: row.permanencia_media_anos === null ? null : Number(row.permanencia_media_anos),
    terminations12m: Number(row.desligamentos_12m) }));
  const equityRecords: EquityRecord[] = source.map((row) => ({
    anonymousId: ledgerHmac(ledgerSecret(), `equity:${row.colaborador_id}`).slice(0, 12),
    department: String(row.departamento), role: String(row.cargo), salaryCents: Number(row.salario_centavos),
    tenureYears: Number(row.permanencia_anos), gender: row.genero === null ? null : String(row.genero),
    race: row.raca_cor === null ? null : String(row.raca_cor),
    disability: row.pessoa_com_deficiencia === null ? null : Boolean(row.pessoa_com_deficiencia),
  }));
  return {
    generatedAt: new Date().toISOString(), periodMonths: months, summary: {
      headcount: Number(summary.headcount ?? 0), terminationsYear: Number(summary.desligamentos_ano ?? 0),
      auditEvents: Number(summary.eventos_auditoria ?? 0), lastAuditAt: summary.ultima_auditoria ?? null,
      currentTurnoverRate: monthly.at(-1)?.turnoverRate ?? 0,
    },
    integrity, turnover: { monthly, departments, tenure: tenure.map((row) => ({ range: row.faixa, total: Number(row.total) })),
      alerts: buildTurnoverAlerts(departments as TurnoverAlertInput[]) },
    equity: calculatePayEquity(equityRecords), demographics: demographicDistribution(equityRecords),
    ledger: ledger.map((row) => ({ id: Number(row.id), eventId: row.evento_id, timestamp: row.timestamp_evento,
      actor: row.ator_referencia, action: row.acao, resourceType: row.recurso_tipo, resourceId: row.recurso_id,
      ip: row.ip, hashPrefix: String(row.hash_atual).slice(0, 16), previousHashPrefix: String(row.hash_anterior).slice(0, 16) })),
  };
}

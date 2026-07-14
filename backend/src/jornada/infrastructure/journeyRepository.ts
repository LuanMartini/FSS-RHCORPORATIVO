import { all, run } from '../../db/client.js';
import type { MirrorPunch, PunchType, ScheduleConfig, ScheduleType, WorkSchedule } from '../domain/types.ts';

export interface DatabaseClient {
  all<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  run(sql: string, params?: unknown[]): Promise<{ rowCount?: number; affectedRows?: number }>;
}

async function query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  return await all(sql, params) as T[];
}

async function execute(sql: string, params: unknown[] = []): Promise<{ rowCount?: number; affectedRows?: number }> {
  return await run(sql, params) as { rowCount?: number; affectedRows?: number };
}

const defaultClient: DatabaseClient = { all: query, run: execute };

interface ScheduleRow {
  id: number | string;
  nome: string;
  tipo: ScheduleType;
  timezone: string;
  inicio_vigencia: string | Date;
  atribuicao_inicio: string | Date;
  ciclo_offset: number | string;
  minutos_jornada_padrao: number | string;
  minutos_intervalo: number | string;
  tolerancia_atraso_minutos: number | string;
  horario_entrada: string | null;
  horario_saida: string | null;
  inicio_noturno: string;
  fim_noturno: string;
  minutos_hora_noturna: number | string;
  configuracao_ciclo: ScheduleConfig;
}

function dateOnly(value: string | Date): string {
  return typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

export function mapSchedule(row: ScheduleRow): WorkSchedule {
  return {
    id: Number(row.id), name: row.nome, type: row.tipo, timezone: row.timezone,
    validFrom: dateOnly(row.inicio_vigencia), assignmentStart: dateOnly(row.atribuicao_inicio),
    cycleOffset: Number(row.ciclo_offset), defaultMinutes: Number(row.minutos_jornada_padrao),
    breakMinutes: Number(row.minutos_intervalo), lateToleranceMinutes: Number(row.tolerancia_atraso_minutos),
    startTime: row.horario_entrada?.slice(0, 5) ?? null, endTime: row.horario_saida?.slice(0, 5) ?? null,
    nightStart: row.inicio_noturno.slice(0, 5), nightEnd: row.fim_noturno.slice(0, 5),
    reducedNightHourMinutes: Number(row.minutos_hora_noturna), config: row.configuracao_ciclo ?? {},
  };
}

export async function listCollaborators(): Promise<Record<string, unknown>[]> {
  return query(
    `SELECT c.id, c.nome_completo, c.cpf, c.status, c.filial_id,
            f.nome AS filial_nome, f.codigo AS filial_codigo,
            (bf.colaborador_id IS NOT NULL AND bf.ativo = TRUE) AS biometria_cadastrada
       FROM colaboradores c
       LEFT JOIN filiais f ON f.id = c.filial_id
       LEFT JOIN biometrias_faciais bf ON bf.colaborador_id = c.id
      WHERE c.status <> 'DESLIGADO' ORDER BY c.nome_completo`
  );
}

export async function getCollaboratorContext(id: number, client: DatabaseClient = defaultClient): Promise<Record<string, unknown> | null> {
  const rows = await client.all<Record<string, unknown>>(
    `SELECT c.id, c.nome_completo, c.cpf, c.status, c.filial_id, c.gestor_id,
            f.nome AS filial_nome, f.codigo AS filial_codigo, f.timezone AS filial_timezone,
            f.latitude AS filial_latitude, f.longitude AS filial_longitude,
            f.geofence_tipo, f.raio_metros, f.poligono, f.tolerancia_gps_metros,
            bf.template_hash, bf.foto_storage_key AS biometria_storage_key,
            e.id AS escala_id, e.nome AS escala_nome, e.tipo AS escala_tipo,
            e.timezone AS escala_timezone, e.inicio_vigencia,
            ce.inicio AS atribuicao_inicio, ce.ciclo_offset,
            e.minutos_jornada_padrao, e.minutos_intervalo, e.tolerancia_atraso_minutos,
            e.horario_entrada, e.horario_saida, e.inicio_noturno, e.fim_noturno,
            e.minutos_hora_noturna, e.configuracao_ciclo
       FROM colaboradores c
       JOIN filiais f ON f.id = c.filial_id AND f.ativo = TRUE
       LEFT JOIN biometrias_faciais bf ON bf.colaborador_id = c.id AND bf.ativo = TRUE
       LEFT JOIN LATERAL (
         SELECT * FROM colaboradores_escalas x
          WHERE x.colaborador_id = c.id AND x.inicio <= CURRENT_DATE
            AND (x.fim IS NULL OR x.fim >= CURRENT_DATE)
          ORDER BY x.inicio DESC LIMIT 1
       ) ce ON TRUE
       LEFT JOIN escalas_trabalho e ON e.id = ce.escala_id AND e.ativo = TRUE
      WHERE c.id = ? AND c.status <> 'DESLIGADO'`,
    [id]
  );
  return rows[0] ?? null;
}

export async function getScheduleForPeriod(collaboratorId: number, start: string): Promise<WorkSchedule | null> {
  const rows = await query<ScheduleRow>(
    `SELECT e.*, ce.inicio AS atribuicao_inicio, ce.ciclo_offset
       FROM colaboradores_escalas ce JOIN escalas_trabalho e ON e.id = ce.escala_id
      WHERE ce.colaborador_id = ? AND ce.inicio <= ?::date
        AND (ce.fim IS NULL OR ce.fim >= ?::date) AND e.ativo = TRUE
      ORDER BY ce.inicio DESC LIMIT 1`,
    [collaboratorId, start, start]
  );
  return rows[0] ? mapSchedule(rows[0]) : null;
}

interface OriginalPunchRow { id: number | string; nsr: number | string; tipo: PunchType; registrado_em: string | Date }
interface TreatedPunchRow { id: number | string; tipo: PunchType; marcado_em: string | Date; motivo: string; operacao: string }

export async function getPunches(collaboratorId: number, start: string, end: string): Promise<MirrorPunch[]> {
  const originals = await query<OriginalPunchRow>(
    `SELECT id, nsr, tipo, registrado_em FROM pontos_registrados
      WHERE colaborador_id = ? AND registrado_em >= ?::date - INTERVAL '1 day'
        AND registrado_em < ?::date + INTERVAL '2 days' ORDER BY registrado_em`,
    [collaboratorId, start, end]
  );
  const treated = await query<TreatedPunchRow>(
    `SELECT id, tipo, marcado_em, motivo, operacao FROM marcacoes_tratadas
      WHERE colaborador_id = ? AND marcado_em >= ?::date - INTERVAL '1 day'
        AND marcado_em < ?::date + INTERVAL '2 days' ORDER BY marcado_em`,
    [collaboratorId, start, end]
  );
  return [
    ...originals.map((row) => ({ id: Number(row.id), nsr: Number(row.nsr), type: row.tipo, at: new Date(row.registrado_em).toISOString(), source: 'ORIGINAL' as const })),
    ...treated.filter((row) => row.operacao !== 'DESCONSIDERACAO').map((row) => ({
      id: Number(row.id), nsr: null, type: row.tipo, at: new Date(row.marcado_em).toISOString(),
      source: 'TRATADA' as const, treatedReason: row.motivo,
    })),
  ];
}

export async function getHolidays(filialId: number, start: string, end: string): Promise<Array<{ date: string; name: string }>> {
  const rows = await query<{ data: string | Date; nome: string }>(
    `SELECT data, nome FROM feriados WHERE (filial_id = ? OR filial_id IS NULL)
      AND data BETWEEN ?::date AND ?::date ORDER BY data`, [filialId, start, end]
  );
  return rows.map((row) => ({ date: dateOnly(row.data), name: row.nome }));
}

export async function getExcusedDates(collaboratorId: number, start: string, end: string): Promise<string[]> {
  const rows = await query<{ data_referencia: string | Date }>(
    `SELECT DISTINCT data_referencia FROM solicitacoes_ajuste
      WHERE colaborador_id = ? AND status = 'APROVADO' AND tipo IN ('ATESTADO','ABONO')
        AND data_referencia BETWEEN ?::date AND ?::date`, [collaboratorId, start, end]
  );
  return rows.map((row) => dateOnly(row.data_referencia));
}

export async function getInitialBankBalance(collaboratorId: number, start: string): Promise<number> {
  const rows = await query<{ saldo_acumulado_minutos: number | string }>(
    `SELECT saldo_acumulado_minutos FROM banco_horas
      WHERE colaborador_id = ? AND competencia < ?::date
      ORDER BY competencia DESC LIMIT 1`, [collaboratorId, start]
  );
  return Number(rows[0]?.saldo_acumulado_minutos ?? 0);
}

export async function enrollBiometric(input: {
  collaboratorId: number; templateHash: string; storageKey: string; consentIp: string | null;
}, client: DatabaseClient): Promise<string | null> {
  const previous = await client.all<{ foto_storage_key: string }>(
    'SELECT foto_storage_key FROM biometrias_faciais WHERE colaborador_id = ? FOR UPDATE',
    [input.collaboratorId]
  );
  await client.run(
    `INSERT INTO biometrias_faciais
      (colaborador_id, template_hash, foto_storage_key, consentimento_em, consentimento_ip)
     VALUES (?, ?, ?, NOW(), ?)
     ON CONFLICT (colaborador_id) DO UPDATE SET
       template_hash = EXCLUDED.template_hash, foto_storage_key = EXCLUDED.foto_storage_key,
       consentimento_em = NOW(), consentimento_ip = EXCLUDED.consentimento_ip,
       versao = biometrias_faciais.versao + 1, ativo = TRUE, updated_at = NOW()`,
    [input.collaboratorId, input.templateHash, input.storageKey, input.consentIp]
  );
  return previous[0]?.foto_storage_key ?? null;
}

export async function findIdempotentPoint(key: string, client: DatabaseClient): Promise<Record<string, unknown> | null> {
  const rows = await client.all<Record<string, unknown>>(
    `SELECT p.* FROM pontos_idempotencia i
       JOIN pontos_registrados p ON p.nsr = i.nsr AND p.registrado_em = i.registrado_em
      WHERE i.idempotency_key = ?`, [key]
  );
  return rows[0] ?? null;
}

export async function preparePointSequence(registeredAt: Date, client: DatabaseClient): Promise<{ nsr: number; previousHash: string | null }> {
  await client.all('SELECT pg_advisory_xact_lock(?)', [6712021]);
  await client.all('SELECT fn_garantir_particoes_jornada(?::date)', [registeredAt.toISOString().slice(0, 10)]);
  const nsrRows = await client.all<{ nsr: number | string }>(`SELECT nextval('pontos_nsr_seq') AS nsr`);
  const previousRows = await client.all<{ hash_registro: string }>(
    'SELECT hash_registro FROM pontos_registrados ORDER BY nsr DESC LIMIT 1'
  );
  return { nsr: Number(nsrRows[0]?.nsr), previousHash: previousRows[0]?.hash_registro ?? null };
}

export interface PointInsert {
  nsr: number;
  collaboratorId: number;
  filialId: number;
  type: PunchType;
  registeredAt: Date;
  capturedAt: Date | null;
  timezone: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  distanceMeters: number;
  biometricConfidence: number;
  photoStorageKey: string;
  collectorId: string;
  ipAddress: string | null;
  userAgent: string | null;
  idempotencyKey: string;
  previousHash: string | null;
  recordHash: string;
  receipt: Record<string, unknown>;
}

export async function insertPoint(input: PointInsert, client: DatabaseClient): Promise<Record<string, unknown>> {
  const rows = await client.all<Record<string, unknown>>(
    `INSERT INTO pontos_registrados
      (nsr, colaborador_id, filial_id, tipo, registrado_em, capturado_em_dispositivo,
       timezone, latitude, longitude, precisao_gps_metros, distancia_filial_metros,
       dentro_geofence, confianca_biometrica, biometria_aprovada, foto_storage_key,
       coletor_id, endereco_ip, user_agent, idempotency_key, hash_anterior,
       hash_registro, comprovante)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, ?, TRUE, ?, ?, ?, ?, ?::uuid, ?, ?, ?::jsonb)
     RETURNING *`,
    [input.nsr, input.collaboratorId, input.filialId, input.type, input.registeredAt,
      input.capturedAt, input.timezone, input.latitude, input.longitude, input.accuracyMeters,
      input.distanceMeters, input.biometricConfidence, input.photoStorageKey, input.collectorId,
      input.ipAddress, input.userAgent, input.idempotencyKey, input.previousHash,
      input.recordHash, JSON.stringify(input.receipt)]
  );
  await client.run(
    `INSERT INTO pontos_idempotencia (idempotency_key, nsr, registrado_em) VALUES (?::uuid, ?, ?)`,
    [input.idempotencyKey, input.nsr, input.registeredAt]
  );
  return rows[0] ?? {};
}

export async function getReceipt(nsr: number): Promise<Record<string, unknown> | null> {
  const rows = await query<Record<string, unknown>>(
    `SELECT nsr, colaborador_id, tipo, registrado_em, gravado_em, timezone,
            coletor_id, hash_registro, comprovante
       FROM pontos_registrados WHERE nsr = ? ORDER BY registrado_em DESC LIMIT 1`, [nsr]
  );
  return rows[0] ?? null;
}

export async function persistMirror(collaboratorId: number, mirror: import('../domain/types.ts').MonthlyMirror, client: DatabaseClient): Promise<void> {
  const months = new Set(mirror.days.map((day) => `${day.date.slice(0, 7)}-01`));
  for (const month of months) await client.all('SELECT fn_garantir_particoes_jornada(?::date)', [month]);
  for (const day of mirror.days) {
    await client.run(
      `INSERT INTO banco_horas
        (colaborador_id, competencia, minutos_previstos, minutos_trabalhados,
         minutos_extras_50, minutos_extras_100, minutos_negativos, minutos_atraso,
         minutos_noturnos_reduzidos, saldo_dia_minutos, saldo_acumulado_minutos, versao_motor)
       VALUES (?, ?::date, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (colaborador_id, competencia) DO UPDATE SET
         minutos_previstos = EXCLUDED.minutos_previstos,
         minutos_trabalhados = EXCLUDED.minutos_trabalhados,
         minutos_extras_50 = EXCLUDED.minutos_extras_50,
         minutos_extras_100 = EXCLUDED.minutos_extras_100,
         minutos_negativos = EXCLUDED.minutos_negativos,
         minutos_atraso = EXCLUDED.minutos_atraso,
         minutos_noturnos_reduzidos = EXCLUDED.minutos_noturnos_reduzidos,
         saldo_dia_minutos = EXCLUDED.saldo_dia_minutos,
         saldo_acumulado_minutos = EXCLUDED.saldo_acumulado_minutos,
         calculado_em = NOW(), versao_motor = EXCLUDED.versao_motor`,
      [collaboratorId, day.date, day.expectedMinutes, day.workedMinutes, day.extra50Minutes,
        day.extra100Minutes, day.negativeMinutes, day.delayMinutes, day.reducedNightMinutes,
        day.bankDeltaMinutes, day.bankBalanceMinutes, mirror.engineVersion]
    );
  }
}

export interface AdjustmentInsert {
  collaboratorId: number;
  referenceDate: string;
  type: 'INCLUSAO_MARCACAO' | 'DESCONSIDERACAO' | 'ATESTADO' | 'ABONO';
  requestedAt: Date | null;
  punchType: PunchType | null;
  justification: string;
  attachmentStorageKey: string | null;
  attachmentName: string | null;
  attachmentMimeType: string | null;
  managerId: number | null;
}

export async function createAdjustment(input: AdjustmentInsert, client: DatabaseClient): Promise<Record<string, unknown>> {
  await client.all('SELECT fn_garantir_particoes_jornada(?::date)', [new Date().toISOString().slice(0, 10)]);
  const rows = await client.all<Record<string, unknown>>(
    `INSERT INTO solicitacoes_ajuste
      (colaborador_id, data_referencia, tipo, horario_solicitado, tipo_marcacao,
       justificativa, anexo_storage_key, anexo_nome, anexo_mime_type, gestor_id)
     VALUES (?, ?::date, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
    [input.collaboratorId, input.referenceDate, input.type, input.requestedAt, input.punchType,
      input.justification, input.attachmentStorageKey, input.attachmentName,
      input.attachmentMimeType, input.managerId]
  );
  return rows[0] ?? {};
}

export async function listAdjustments(collaboratorId?: number): Promise<Record<string, unknown>[]> {
  return query(
    `SELECT s.*, c.nome_completo AS colaborador_nome
       FROM solicitacoes_ajuste s JOIN colaboradores c ON c.id = s.colaborador_id
      WHERE (? IS NULL OR s.colaborador_id = ?)
      ORDER BY s.solicitado_em DESC LIMIT 200`, [collaboratorId ?? null, collaboratorId ?? null]
  );
}

export async function decideAdjustment(input: {
  id: number; level: 'GESTOR' | 'RH'; decision: 'APROVADO' | 'REPROVADO';
  observation: string | null; userId: number | null; managerCollaboratorId: number | null;
}, client: DatabaseClient): Promise<Record<string, unknown> | null> {
  const rows = await client.all<Record<string, unknown>>(
    'SELECT * FROM solicitacoes_ajuste WHERE id = ? ORDER BY solicitado_em DESC LIMIT 1 FOR UPDATE', [input.id]
  );
  const adjustment = rows[0];
  if (!adjustment) return null;
  const expectedStatus = input.level === 'GESTOR' ? 'PENDENTE_GESTOR' : 'PENDENTE_RH';
  if (adjustment.status !== expectedStatus) return { ...adjustment, conflict: true };
  if (input.level === 'GESTOR' && adjustment.gestor_id != null
      && Number(adjustment.gestor_id) !== input.managerCollaboratorId) {
    return { ...adjustment, forbidden: true };
  }
  const approved = input.decision === 'APROVADO';
  const newStatus = input.level === 'GESTOR'
    ? approved ? 'PENDENTE_RH' : 'REPROVADO_GESTOR'
    : approved ? 'APROVADO' : 'REPROVADO_RH';
  if (input.level === 'GESTOR') {
    await client.run(
      `UPDATE solicitacoes_ajuste SET status = ?, gestor_id = COALESCE(gestor_id, ?),
        gestor_decisao_em = NOW(), gestor_observacao = ?, updated_at = NOW()
       WHERE id = ? AND solicitado_em = ?`,
      [newStatus, input.managerCollaboratorId, input.observation, input.id, adjustment.solicitado_em]
    );
  } else {
    await client.run(
      `UPDATE solicitacoes_ajuste SET status = ?, rh_usuario_id = ?,
        rh_decisao_em = NOW(), rh_observacao = ?, updated_at = NOW()
       WHERE id = ? AND solicitado_em = ?`,
      [newStatus, input.userId, input.observation, input.id, adjustment.solicitado_em]
    );
  }
  await client.run(
    `INSERT INTO aprovacoes_ajuste
      (solicitacao_id, solicitacao_criada_em, nivel, decisao,
       responsavel_usuario_id, responsavel_colaborador_id, observacao)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [input.id, adjustment.solicitado_em, input.level, input.decision, input.userId,
      input.managerCollaboratorId, input.observation]
  );
  if (input.level === 'RH' && approved && adjustment.tipo === 'INCLUSAO_MARCACAO') {
    await client.run(
      `INSERT INTO marcacoes_tratadas
        (colaborador_id, solicitacao_id, solicitacao_criada_em, tipo, marcado_em, motivo)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [adjustment.colaborador_id, input.id, adjustment.solicitado_em,
        adjustment.tipo_marcacao, adjustment.horario_solicitado, adjustment.justificativa]
    );
  }
  const updated = await client.all<Record<string, unknown>>(
    'SELECT * FROM solicitacoes_ajuste WHERE id = ? AND solicitado_em = ?', [input.id, adjustment.solicitado_em]
  );
  return updated[0] ?? null;
}

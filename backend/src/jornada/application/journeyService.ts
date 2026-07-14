import { createHash } from 'node:crypto';
import { withTransaction } from '../../db/client.js';
import { AppError } from '../../core/domain/errors.js';
import { removeEncrypted, saveEncrypted } from '../../core/infrastructure/encryptedFileStorage.js';
import { biometricTemplate, compareBiometric, decodePhotoDataUrl } from '../domain/biometric.ts';
import { validateGeofence } from '../domain/geofence.ts';
import { calculateMonthlyMirror } from '../domain/journeyEngine.ts';
import { PUNCH_TYPES, type Geofence, type PunchType } from '../domain/types.ts';
import * as repository from '../infrastructure/journeyRepository.ts';
import type { DatabaseClient } from '../infrastructure/journeyRepository.ts';

type AdjustmentType = 'INCLUSAO_MARCACAO' | 'DESCONSIDERACAO' | 'ATESTADO' | 'ABONO';
const ADJUSTMENT_TYPES = new Set<AdjustmentType>(['INCLUSAO_MARCACAO', 'DESCONSIDERACAO', 'ATESTADO', 'ABONO']);
const MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);

function detailedError(message: string, status: number, code: string, details: unknown): Error {
  const ErrorConstructor = AppError as unknown as new (
    message: string, status?: number, code?: string, details?: unknown
  ) => Error;
  return new ErrorConstructor(message, status, code, details);
}

function positiveId(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new AppError(`${field} invalido.`);
  return parsed;
}

function date(value: unknown, field: string): string {
  const normalized = String(value ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized) || Number.isNaN(Date.parse(`${normalized}T12:00:00Z`))) {
    throw new AppError(`${field} invalida.`);
  }
  return normalized;
}

function requiredText(value: unknown, field: string, minimum: number, maximum: number): string {
  const normalized = String(value ?? '').trim();
  if (normalized.length < minimum || normalized.length > maximum) {
    throw new AppError(`${field} deve ter entre ${minimum} e ${maximum} caracteres.`);
  }
  return normalized;
}

function numberInRange(value: unknown, field: string, minimum: number, maximum: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) throw new AppError(`${field} invalida.`);
  return parsed;
}

function asClient(client: unknown): DatabaseClient {
  return client as DatabaseClient;
}

function contextGeofence(context: Record<string, unknown>): Geofence {
  const rawPolygon = context.poligono;
  const polygon = Array.isArray(rawPolygon)
    ? rawPolygon.filter((point): point is [number, number] => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite))
    : null;
  return {
    type: context.geofence_tipo === 'POLIGONO' ? 'POLIGONO' : 'RAIO',
    center: { latitude: Number(context.filial_latitude), longitude: Number(context.filial_longitude) },
    radiusMeters: context.raio_metros == null ? null : Number(context.raio_metros),
    polygon,
    gpsToleranceMeters: Number(context.tolerancia_gps_metros),
  };
}

function mapCollaborator(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: Number(row.id), nomeCompleto: row.nome_completo, cpf: row.cpf, status: row.status,
    filialId: row.filial_id == null ? null : Number(row.filial_id), filialNome: row.filial_nome,
    filialCodigo: row.filial_codigo, biometriaCadastrada: Boolean(row.biometria_cadastrada),
  };
}

export async function listCollaborators(): Promise<Record<string, unknown>[]> {
  return (await repository.listCollaborators()).map(mapCollaborator);
}

export async function getConfiguration(collaboratorIdValue: unknown): Promise<Record<string, unknown>> {
  const collaboratorId = positiveId(collaboratorIdValue, 'Colaborador');
  const context = await repository.getCollaboratorContext(collaboratorId);
  if (!context) throw new AppError('Colaborador, filial ou configuracao nao encontrada.', 404, 'NOT_FOUND');
  return {
    collaborator: {
      id: Number(context.id), name: context.nome_completo,
      biometricEnrolled: Boolean(context.template_hash),
      managerId: context.gestor_id == null ? null : Number(context.gestor_id),
    },
    branch: {
      id: Number(context.filial_id), name: context.filial_nome, code: context.filial_codigo,
      timezone: context.filial_timezone, latitude: Number(context.filial_latitude),
      longitude: Number(context.filial_longitude), geofenceType: context.geofence_tipo,
      radiusMeters: context.raio_metros == null ? null : Number(context.raio_metros),
      polygon: context.poligono,
    },
    schedule: context.escala_id ? repository.mapSchedule({
      id: context.escala_id as number, nome: String(context.escala_nome), tipo: context.escala_tipo as never,
      timezone: String(context.escala_timezone), inicio_vigencia: context.inicio_vigencia as string,
      atribuicao_inicio: context.atribuicao_inicio as string, ciclo_offset: context.ciclo_offset as number,
      minutos_jornada_padrao: context.minutos_jornada_padrao as number,
      minutos_intervalo: context.minutos_intervalo as number,
      tolerancia_atraso_minutos: context.tolerancia_atraso_minutos as number,
      horario_entrada: context.horario_entrada as string | null, horario_saida: context.horario_saida as string | null,
      inicio_noturno: String(context.inicio_noturno), fim_noturno: String(context.fim_noturno),
      minutos_hora_noturna: context.minutos_hora_noturna as number,
      configuracao_ciclo: context.configuracao_ciclo as never,
    }) : null,
  };
}

export async function enrollBiometric(input: {
  collaboratorId: unknown; photoBase64: unknown; consent: unknown; ipAddress: string | null;
}): Promise<{ enrolled: true; algorithm: string }> {
  const collaboratorId = positiveId(input.collaboratorId, 'Colaborador');
  if (input.consent !== true) throw new AppError('Consentimento explicito para biometria e obrigatorio.', 422, 'BIOMETRIC_CONSENT_REQUIRED');
  const photo = decodePhotoDataUrl(String(input.photoBase64 ?? ''));
  let storageKey: string | undefined;
  let previousKey: string | null = null;
  try {
    storageKey = await saveEncrypted(photo);
    previousKey = await withTransaction(async (rawClient: unknown) => {
      const client = asClient(rawClient);
      const collaborator = await repository.getCollaboratorContext(collaboratorId, client);
      if (!collaborator) throw new AppError('Colaborador nao encontrado.', 404, 'NOT_FOUND');
      return repository.enrollBiometric({
        collaboratorId, templateHash: biometricTemplate(photo), storageKey: storageKey!, consentIp: input.ipAddress,
      }, client);
    });
    if (previousKey) await removeEncrypted(previousKey);
    return { enrolled: true, algorithm: 'SIMULATED-HASH-V1' };
  } catch (error) {
    if (storageKey) await removeEncrypted(storageKey);
    throw error;
  }
}

export async function registerPoint(input: {
  collaboratorId: unknown; type: unknown; latitude: unknown; longitude: unknown;
  accuracyMeters: unknown; photoBase64: unknown; capturedAt?: unknown;
  idempotencyKey: unknown; collectorId: unknown; ipAddress: string | null; userAgent: string | null;
}): Promise<Record<string, unknown>> {
  const collaboratorId = positiveId(input.collaboratorId, 'Colaborador');
  const type = String(input.type ?? '') as PunchType;
  if (!PUNCH_TYPES.includes(type)) throw new AppError('Tipo de marcacao invalido.');
  const latitude = numberInRange(input.latitude, 'Latitude', -90, 90);
  const longitude = numberInRange(input.longitude, 'Longitude', -180, 180);
  const accuracyMeters = numberInRange(input.accuracyMeters ?? 0, 'Precisao GPS', 0, 10_000);
  const idempotencyKey = String(input.idempotencyKey ?? '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) {
    throw new AppError('Chave de idempotencia UUID v4 invalida.');
  }
  const collectorId = requiredText(input.collectorId, 'Identificador do coletor', 3, 120);
  const livePhoto = decodePhotoDataUrl(String(input.photoBase64 ?? ''));
  const registeredAt = new Date();
  const capturedAt = input.capturedAt ? new Date(String(input.capturedAt)) : null;
  if (capturedAt && Number.isNaN(capturedAt.getTime())) throw new AppError('Data de captura invalida.');
  let photoStorageKey: string | undefined;

  try {
    return await withTransaction(async (rawClient: unknown) => {
      const client = asClient(rawClient);
      const duplicate = await repository.findIdempotentPoint(idempotencyKey, client);
      if (duplicate) return { ...duplicate, duplicate: true };
      const context = await repository.getCollaboratorContext(collaboratorId, client);
      if (!context) throw new AppError('Colaborador ou filial nao encontrada.', 404, 'NOT_FOUND');
      if (!context.template_hash) throw new AppError('Biometria facial ainda nao cadastrada.', 409, 'BIOMETRIC_NOT_ENROLLED');
      const geofence = validateGeofence({ latitude, longitude, accuracyMeters }, contextGeofence(context));
      if (!geofence.allowed) throw detailedError(geofence.reason ?? 'Fora da area permitida.', 422, 'OUTSIDE_GEOFENCE', { distanceMeters: geofence.distanceMeters });
      const biometric = compareBiometric(String(context.template_hash), livePhoto);
      if (!biometric.approved) throw detailedError('Correspondencia facial abaixo do limiar de seguranca.', 422, 'BIOMETRIC_MISMATCH', { confidence: biometric.confidence });
      photoStorageKey = await saveEncrypted(livePhoto);
      const sequence = await repository.preparePointSequence(registeredAt, client);
      const receiptBase = {
        nsr: sequence.nsr, cpf: context.cpf, colaborador: context.nome_completo,
        tipo: type, marcadoEm: registeredAt.toISOString(), gravadoEm: registeredAt.toISOString(),
        timezone: context.filial_timezone, coletorId: collectorId, filial: context.filial_codigo,
        relogio: 'SERVER_UTC_NTP_REQUIRED', hashAnterior: sequence.previousHash,
      };
      const recordHash = createHash('sha256').update(JSON.stringify(receiptBase)).digest('hex');
      const receipt = { ...receiptBase, hashSha256: recordHash, assinaturaPades: 'PENDENTE_INTEGRACAO_ICP_BRASIL' };
      const point = await repository.insertPoint({
        nsr: sequence.nsr, collaboratorId, filialId: Number(context.filial_id), type,
        registeredAt, capturedAt, timezone: String(context.filial_timezone), latitude, longitude,
        accuracyMeters, distanceMeters: geofence.distanceMeters,
        biometricConfidence: biometric.confidence, photoStorageKey, collectorId,
        ipAddress: input.ipAddress, userAgent: input.userAgent, idempotencyKey,
        previousHash: sequence.previousHash, recordHash, receipt,
      }, client);
      return {
        nsr: Number(point.nsr), type: point.tipo, registeredAt: point.registrado_em,
        recordedAt: point.gravado_em, hashSha256: point.hash_registro,
        distanceMeters: Number(point.distancia_filial_metros),
        biometricConfidence: Number(point.confianca_biometrica), receipt,
      };
    }, { isolationLevel: 'SERIALIZABLE' });
  } catch (error) {
    if (photoStorageKey) await removeEncrypted(photoStorageKey);
    throw error;
  }
}

export async function getReceipt(nsrValue: unknown): Promise<Record<string, unknown>> {
  const receipt = await repository.getReceipt(positiveId(nsrValue, 'NSR'));
  if (!receipt) throw new AppError('Comprovante nao encontrado.', 404, 'NOT_FOUND');
  return receipt;
}

export async function getMirror(input: { collaboratorId: unknown; start: unknown; end: unknown }): Promise<Record<string, unknown>> {
  const collaboratorId = positiveId(input.collaboratorId, 'Colaborador');
  const start = date(input.start, 'Data inicial');
  const end = date(input.end, 'Data final');
  const dayCount = Math.floor((Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86_400_000) + 1;
  if (dayCount < 1 || dayCount > 62) throw new AppError('O espelho deve conter entre 1 e 62 dias.');
  const context = await repository.getCollaboratorContext(collaboratorId);
  if (!context) throw new AppError('Colaborador nao encontrado.', 404, 'NOT_FOUND');
  const schedule = await repository.getScheduleForPeriod(collaboratorId, start);
  if (!schedule) throw new AppError('Nenhuma escala vigente para o periodo.', 409, 'SCHEDULE_NOT_FOUND');
  const [punches, holidays, excusedDates, initialBankMinutes] = await Promise.all([
    repository.getPunches(collaboratorId, start, end),
    repository.getHolidays(Number(context.filial_id), start, end),
    repository.getExcusedDates(collaboratorId, start, end),
    repository.getInitialBankBalance(collaboratorId, start),
  ]);
  const mirror = calculateMonthlyMirror({ start, end, schedule, punches, holidays, excusedDates, initialBankMinutes });
  await withTransaction((rawClient: unknown) => repository.persistMirror(collaboratorId, mirror, asClient(rawClient)));
  return { collaborator: mapCollaborator(context), ...mirror };
}

export async function createAdjustment(input: {
  collaboratorId: unknown; referenceDate: unknown; type: unknown; requestedAt?: unknown;
  punchType?: unknown; justification: unknown; file?: Express.Multer.File;
}): Promise<Record<string, unknown>> {
  const collaboratorId = positiveId(input.collaboratorId, 'Colaborador');
  const referenceDate = date(input.referenceDate, 'Data de referencia');
  const type = String(input.type ?? '') as AdjustmentType;
  if (!ADJUSTMENT_TYPES.has(type)) throw new AppError('Tipo de ajuste invalido.');
  const justification = requiredText(input.justification, 'Justificativa', 10, 2000);
  const punchType = input.punchType ? String(input.punchType) as PunchType : null;
  const requestedAt = input.requestedAt ? new Date(String(input.requestedAt)) : null;
  if (type === 'INCLUSAO_MARCACAO' && (!requestedAt || Number.isNaN(requestedAt.getTime()) || !punchType || !PUNCH_TYPES.includes(punchType))) {
    throw new AppError('Inclusao exige horario e tipo de marcacao validos.');
  }
  if (input.file && (!MIME_TYPES.has(input.file.mimetype) || input.file.size > 10 * 1024 * 1024)) {
    throw new AppError('Anexo deve ser PDF, JPEG ou PNG com ate 10 MB.', 415, 'INVALID_ATTACHMENT');
  }
  let storageKey: string | undefined;
  try {
    if (input.file) storageKey = await saveEncrypted(input.file.buffer);
    return await withTransaction(async (rawClient: unknown) => {
      const client = asClient(rawClient);
      const context = await repository.getCollaboratorContext(collaboratorId, client);
      if (!context) throw new AppError('Colaborador nao encontrado.', 404, 'NOT_FOUND');
      return repository.createAdjustment({
        collaboratorId, referenceDate, type, requestedAt, punchType, justification,
        attachmentStorageKey: storageKey ?? null, attachmentName: input.file?.originalname ?? null,
        attachmentMimeType: input.file?.mimetype ?? null,
        managerId: context.gestor_id == null ? null : Number(context.gestor_id),
      }, client);
    });
  } catch (error) {
    if (storageKey) await removeEncrypted(storageKey);
    throw error;
  }
}

export async function listAdjustments(collaboratorIdValue?: unknown): Promise<Record<string, unknown>[]> {
  const collaboratorId = collaboratorIdValue == null ? undefined : positiveId(collaboratorIdValue, 'Colaborador');
  return repository.listAdjustments(collaboratorId);
}

export async function decideAdjustment(input: {
  id: unknown; level: 'GESTOR' | 'RH'; decision: unknown; observation?: unknown;
  userId: number | null; managerCollaboratorId?: unknown;
}): Promise<Record<string, unknown>> {
  const id = positiveId(input.id, 'Solicitacao');
  const decision = String(input.decision ?? '') as 'APROVADO' | 'REPROVADO';
  if (!['APROVADO', 'REPROVADO'].includes(decision)) throw new AppError('Decisao invalida.');
  const observation = input.observation ? requiredText(input.observation, 'Observacao', 3, 1000) : null;
  const managerCollaboratorId = input.level === 'GESTOR'
    ? positiveId(input.managerCollaboratorId, 'Gestor') : null;
  const userId = input.level === 'RH' ? positiveId(input.userId, 'Usuario do RH') : null;
  const result = await withTransaction((rawClient: unknown) => repository.decideAdjustment({
    id, level: input.level, decision, observation, userId,
    managerCollaboratorId,
  }, asClient(rawClient)));
  if (!result) throw new AppError('Solicitacao nao encontrada.', 404, 'NOT_FOUND');
  if (result.forbidden) throw new AppError('Somente o gestor direto pode decidir esta solicitacao.', 403, 'MANAGER_FORBIDDEN');
  if (result.conflict) throw new AppError('Solicitacao ja decidida ou fora da etapa esperada.', 409, 'WORKFLOW_CONFLICT');
  return result;
}

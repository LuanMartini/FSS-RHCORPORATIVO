import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { removeEncrypted, saveEncrypted, sha256 } from '../../core/infrastructure/encryptedFileStorage.js';
import { calculateMatch } from '../domain/matchEngine.js';
import { scanBuffer } from '../../security/malwareScanner.js';
import { ATS_STAGES, type AtsStage, type MoveCardInput } from '../domain/types.js';
import { prepareCalendarEvent } from '../infrastructure/calendarAdapter.js';
import { parseResume, validateResumeFile } from '../infrastructure/resumeParser.js';
import * as repository from '../infrastructure/atsRepository.js';

function positiveInteger(value: unknown, field: string): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw Object.assign(new Error(`${field} invalido.`), { status: 400 });
  return number;
}

function cleanMessage(value: unknown): string {
  const message = String(value ?? '').trim();
  if (message.length < 1 || message.length > 8000) throw Object.assign(new Error('Mensagem deve ter entre 1 e 8000 caracteres.'), { status: 400 });
  return message;
}

function hashToken(token: string): string { return createHash('sha256').update(token).digest('hex'); }

export async function vacancies(userId: number) { return repository.listVacancies(userId); }

export async function vacancyRecruiters(vacancyIdInput:unknown,userId:number) {
  const vacancyId=positiveInteger(vacancyIdInput,'Vaga');
  const access=await repository.assertVacancyPermission(userId,vacancyId);
  if(access.permissao!=='GESTOR') throw Object.assign(new Error('Somente gestores podem administrar permissoes.'),{status:403});
  return repository.listVacancyRecruiters(vacancyId);
}

export async function setVacancyRecruiter(vacancyIdInput:unknown,userId:number,body:Record<string,unknown>) {
  const vacancyId=positiveInteger(vacancyIdInput,'Vaga');
  const access=await repository.assertVacancyPermission(userId,vacancyId);
  if(access.permissao!=='GESTOR') throw Object.assign(new Error('Somente gestores podem administrar permissoes.'),{status:403});
  const permission=String(body.permissao??'').toUpperCase();
  if(!['GESTOR','EDITOR','ENTREVISTADOR','LEITOR'].includes(permission)) throw Object.assign(new Error('Permissao invalida.'),{status:400});
  return repository.setVacancyRecruiter(vacancyId,positiveInteger(body.usuarioId,'Usuario'),permission);
}

export async function board(vacancyIdInput: unknown, userId: number) {
  const vacancyId = positiveInteger(vacancyIdInput, 'Vaga');
  await repository.assertVacancyPermission(userId, vacancyId);
  const vacancy = await repository.getVacancy(vacancyId);
  if (!vacancy) throw Object.assign(new Error('Vaga nao encontrada.'), { status: 404 });
  return { vacancy, cards: await repository.getBoard(vacancyId), stages: ATS_STAGES };
}

export async function uploadResume(vacancyIdInput: unknown, userId: number, file: Express.Multer.File | undefined) {
  const vacancyId = positiveInteger(vacancyIdInput, 'Vaga');
  await repository.assertVacancyPermission(userId, vacancyId, true);
  if (!file) throw Object.assign(new Error('Curriculo obrigatorio.'), { status: 400 });
  validateResumeFile(file.buffer, file.mimetype, file.size);
  await scanBuffer(file.buffer,{filename:file.originalname,mime:file.mimetype});
  const vacancy = await repository.getVacancy(vacancyId);
  if (!vacancy) throw Object.assign(new Error('Vaga nao encontrada.'), { status: 404 });
  const { text, profile } = await parseResume(file.buffer, file.mimetype);
  if (!profile.email) throw Object.assign(new Error('O parser nao identificou um e-mail no curriculo.'), { status: 422 });
  const match = calculateMatch(profile, vacancy.requisitos);
  const portalToken = randomBytes(32).toString('base64url');
  const storageKey = await saveEncrypted(file.buffer);
  try {
    const saved = await repository.createApplication({
      vacancyId,userId,profile,match,text,storageKey,sha256:sha256(file.buffer),mime:file.mimetype,
      filename:file.originalname.slice(0,255),portalTokenHash:hashToken(portalToken),
    });
    if (saved.previousStorageKey && saved.previousStorageKey !== storageKey) {
      await removeEncrypted(saved.previousStorageKey).catch(() => undefined);
    }
    return { ...saved, match, portalToken, parserNotice: 'Extracao deterministica que simula o contrato de um LLM; requer revisao humana.' };
  } catch (error) {
    await removeEncrypted(storageKey).catch(() => undefined);
    throw error;
  }
}

export async function lockCard(vacancyId: unknown, applicationId: unknown, version: unknown, userId: number) {
  const v = positiveInteger(vacancyId, 'Vaga');
  await repository.assertVacancyPermission(userId, v, true);
  return repository.acquireCardLock(v, positiveInteger(applicationId, 'Candidatura'), positiveInteger(version, 'Versao'), userId);
}

export async function unlockCard(applicationId: unknown, userId: number) {
  await repository.releaseCardLock(positiveInteger(applicationId, 'Candidatura'), userId);
}

export async function moveCard(input: Omit<MoveCardInput, 'targetStage'> & { targetStage: unknown }) {
  if (!ATS_STAGES.includes(String(input.targetStage) as AtsStage)) throw Object.assign(new Error('Etapa de destino invalida.'), { status: 400 });
  await repository.assertVacancyPermission(input.userId, input.vagaId, true);
  return repository.moveCard({ ...input, targetStage: String(input.targetStage) as AtsStage });
}

export async function messages(applicationIdInput: unknown, userId: number) {
  const applicationId = positiveInteger(applicationIdInput, 'Candidatura');
  const vacancyId = await repository.applicationVacancy(applicationId);
  if (!vacancyId) throw Object.assign(new Error('Candidatura nao encontrada.'), { status: 404 });
  await repository.assertVacancyPermission(userId, vacancyId);
  return repository.listMessages(applicationId);
}

export async function sendRecruiterMessage(applicationIdInput: unknown, userId: number, messageInput: unknown, idempotencyInput?: unknown) {
  const applicationId = positiveInteger(applicationIdInput, 'Candidatura');
  const vacancyId = await repository.applicationVacancy(applicationId);
  if (!vacancyId) throw Object.assign(new Error('Candidatura nao encontrada.'), { status: 404 });
  await repository.assertVacancyPermission(userId, vacancyId, true);
  return repository.createRecruiterMessage(applicationId, userId, cleanMessage(messageInput), String(idempotencyInput ?? randomUUID()));
}

export async function scheduleInterview(body: Record<string, unknown>, userId: number) {
  const applicationId = positiveInteger(body.candidaturaId, 'Candidatura');
  const vacancyId = await repository.applicationVacancy(applicationId);
  if (!vacancyId) throw Object.assign(new Error('Candidatura nao encontrada.'), { status: 404 });
  await repository.assertVacancyPermission(userId, vacancyId, true);
  const start = new Date(String(body.inicioEm));
  const end = new Date(String(body.fimEm));
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) throw Object.assign(new Error('Periodo da entrevista invalido.'), { status: 400 });
  if (end.getTime() - start.getTime() > 8 * 60 * 60 * 1000) throw Object.assign(new Error('Entrevista nao pode exceder 8 horas.'), { status: 400 });
  const calendar = prepareCalendarEvent(body.provedor);
  const type = String(body.tipo ?? 'TECNICA').toUpperCase();
  if (!['TRIAGEM','TECNICA','FIT_CULTURAL','FINAL'].includes(type)) throw Object.assign(new Error('Tipo de entrevista invalido.'), { status: 400 });
  return repository.createInterview({
    applicationId,vacancyId,userId,title:String(body.titulo ?? 'Entrevista').trim().slice(0,220),type,
    start:start.toISOString(),end:end.toISOString(),timezone:String(body.timezone ?? 'America/Sao_Paulo').slice(0,64),
    provider:calendar.provider,meetingUrl:calendar.meetingUrl,status:calendar.status,
    participants:Array.isArray(body.participantes) ? body.participantes : [],notes:body.observacoes ? String(body.observacoes).slice(0,4000) : null,
  });
}

export async function interviews(vacancyIdInput: unknown, userId: number) {
  const vacancyId = positiveInteger(vacancyIdInput, 'Vaga');
  await repository.assertVacancyPermission(userId, vacancyId);
  return repository.listInterviews(vacancyId);
}

export async function portal(token: string) {
  const access = await repository.getPortalApplication(hashToken(token));
  if (!access) throw Object.assign(new Error('Link do portal invalido ou expirado.'), { status: 401 });
  return { access, messages: await repository.listMessages(Number(access.candidatura_id)) };
}

export async function sendCandidateMessage(token: string, messageInput: unknown, idempotencyInput?: unknown) {
  const access = await repository.getPortalApplication(hashToken(token));
  if (!access) throw Object.assign(new Error('Link do portal invalido ou expirado.'), { status: 401 });
  return repository.createCandidateMessage(Number(access.candidatura_id),Number(access.candidato_id),cleanMessage(messageInput),String(idempotencyInput ?? randomUUID()));
}

import { randomUUID } from 'node:crypto';
import { analyzeSentiment, credentialFingerprint, identityProof, validateEnpsScore } from '../domain/climateEngine.js';
import type { AnonymousBallotClaims, CreatePublicationInput } from '../domain/types.js';
import { ballotSecret, encryptFeedback, fingerprintSecret, issueAnonymousBallot, participationSecret, verifyAnonymousBallot } from './climateSecurity.js';
import * as repository from '../infrastructure/climateRepository.js';

const fail = (message: string, status = 400, code = 'VALIDATION_ERROR'): Error => Object.assign(new Error(message), { status, code });
const positiveId = (value: unknown, field: string): number => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw fail(`${field} invalido.`);
  return parsed;
};
const uuid = (value: unknown): string => {
  const parsed = String(value ?? '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parsed)) throw fail('Chave de idempotencia invalida.');
  return parsed;
};
const content = (value: unknown, maximum: number): string => {
  const parsed = String(value ?? '').trim();
  if (!parsed || parsed.length > maximum) throw fail(`Texto deve possuir entre 1 e ${maximum} caracteres.`);
  return parsed;
};
const mentionIds = (value: unknown): number[] => {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw fail('Mencoes devem ser uma lista.');
  const values = [...new Set(value.map((item) => positiveId(item, 'Colaborador mencionado')))];
  if (values.length > 20) throw fail('Uma publicacao pode mencionar no maximo 20 pessoas.');
  return values;
};

export async function dashboard(userId: number, query: Record<string, unknown>) {
  const actor = await repository.actorByUser(userId);
  const survey = await repository.activeSurvey();
  const proof = survey ? identityProof(participationSecret(), Number(survey.id), userId) : null;
  const limit = Math.min(50, Math.max(5, Number(query.limite ?? 20)));
  const cursor = query.cursor ? positiveId(query.cursor, 'Cursor') : null;
  return repository.dashboard(Number(actor.id), proof, Number.isInteger(limit) ? limit : 20, cursor);
}

export async function searchPeople(userId: number, input: unknown) {
  const actor = await repository.actorByUser(userId);
  const term = String(input ?? '').trim().slice(0, 80);
  return repository.searchPeople(Number(actor.id), term);
}

export async function createPublication(userId: number, body: Record<string, unknown>) {
  const actor = await repository.actorByUser(userId);
  const type = String(body.tipo ?? 'PUBLICACAO').toUpperCase();
  if (!['PUBLICACAO', 'KUDOS'].includes(type)) throw fail('Tipo de publicacao invalido.');
  const parsedContent = content(body.conteudo, 4000);
  let recipientId: number | null = null;
  let category: string | null = null;
  if (type === 'KUDOS') {
    recipientId = positiveId(body.destinatarioId, 'Destinatario');
    const categories = ['COLABORACAO', 'INOVACAO', 'ATITUDE_CLIENTE', 'LIDERANCA', 'ESPIRITO_EQUIPE'];
    category = String(body.categoriaKudos ?? '').toUpperCase();
    if (!categories.includes(category)) throw fail('Categoria de Kudos invalida.');
    if (recipientId === Number(actor.id)) throw fail('Nao e permitido conceder Kudos a si mesmo.', 409, 'SELF_KUDOS');
  }
  const input: CreatePublicationInput = {
    actorId: Number(actor.id),
    type: type as CreatePublicationInput['type'],
    content: parsedContent,
    recipientId,
    kudosCategory: category,
    mentionedIds: mentionIds(body.mencionadosIds),
    idempotencyKey: uuid(body.idempotencia),
    sentiment: analyzeSentiment(parsedContent),
  };
  return repository.createPublication(input);
}

export async function toggleLike(userId: number, publicationInput: unknown) {
  const actor = await repository.actorByUser(userId);
  return repository.toggleLike(Number(actor.id), positiveId(publicationInput, 'Publicacao'));
}

export async function addComment(userId: number, publicationInput: unknown, body: Record<string, unknown>) {
  const actor = await repository.actorByUser(userId);
  const parsedContent = content(body.conteudo, 1500);
  return repository.addComment(Number(actor.id), positiveId(publicationInput, 'Publicacao'), parsedContent,
    mentionIds(body.mencionadosIds), analyzeSentiment(parsedContent));
}

export async function issueBallotCredential(userId: number, pollInput: unknown) {
  const actor = await repository.actorByUser(userId);
  const pollId = positiveId(pollInput, 'Pesquisa');
  const departmentId = positiveId(actor.departamento_id, 'Departamento do colaborador');
  ballotSecret();
  const claims: AnonymousBallotClaims = { jti: randomUUID(), pollId, departmentId, sub: 'anonymous-ballot' };
  const credential = issueAnonymousBallot(claims);
  const proof = identityProof(participationSecret(), pollId, userId);
  await repository.registerParticipation(pollId, proof);
  return { credencial: credential, expiraEmSegundos: 900 };
}

export async function submitAnonymousVote(body: Record<string, unknown>) {
  const credential = String(body.credencial ?? '');
  if (!credential) throw fail('Credencial anonima obrigatoria.', 401, 'BALLOT_REQUIRED');
  const claims = verifyAnonymousBallot(credential);
  const score = validateEnpsScore(body.nota);
  const feedbackText = String(body.feedback ?? '');
  if (feedbackText.length > 2000) throw fail('Feedback deve possuir no maximo 2000 caracteres.');
  const sentiment = analyzeSentiment(feedbackText, true);
  await repository.storeAnonymousVote({
    pollId: claims.pollId,
    departmentId: claims.departmentId,
    credentialFingerprint: credentialFingerprint(fingerprintSecret(), claims.pollId, claims.jti),
    responseId: randomUUID(),
    orderId: randomUUID(),
    score,
    feedback: encryptFeedback(sentiment.sanitizedText),
    sentiment,
  });
  return { recebido: true, anonimato: 'IDENTIDADE_ISOLADA' };
}

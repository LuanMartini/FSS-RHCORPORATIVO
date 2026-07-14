import { createHmac } from 'node:crypto';
import type { SentimentResult } from './types.js';

const POSITIVE = new Set([
  'acolhimento', 'adorei', 'apoio', 'bom', 'colaboração', 'conquista', 'excelente',
  'feliz', 'incrível', 'inovação', 'orgulho', 'obrigado', 'parabéns', 'reconhecimento',
  'respeito', 'satisfeito', 'sucesso', 'transparência', 'ótimo',
]);
const NEGATIVE = new Set([
  'ansioso', 'cansado', 'conflito', 'desmotivado', 'difícil', 'estresse', 'frustração',
  'injusto', 'medo', 'péssimo', 'pressão', 'problema', 'ruim', 'sobrecarga', 'triste',
]);

export function sanitizeAnonymousText(value: string): string {
  return value
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[EMAIL_REMOVIDO]')
    .replace(/\b\d{3}[.\s-]?\d{3}[.\s-]?\d{3}[-\s]?\d{2}\b/g, '[CPF_REMOVIDO]')
    .replace(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?9?\d{4}[-\s]?\d{4}/g, '[TELEFONE_REMOVIDO]')
    .replace(/@[\p{L}\d._-]+/gu, '[MENCAO_REMOVIDA]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 2000);
}

export function analyzeSentiment(value: string, anonymous = false): SentimentResult {
  const sanitizedText = anonymous ? sanitizeAnonymousText(value) : value.trim().slice(0, 4000);
  const tokens = sanitizedText.toLocaleLowerCase('pt-BR').match(/[\p{L}]+/gu) ?? [];
  const positiveSignals = tokens.filter((token) => POSITIVE.has(token)).length;
  const negativeSignals = tokens.filter((token) => NEGATIVE.has(token)).length;
  const totalSignals = positiveSignals + negativeSignals;
  const difference = positiveSignals - negativeSignals;
  const label = difference > 0 ? 'POSITIVO' : difference < 0 ? 'NEGATIVO' : 'NEUTRO';
  const confidence = totalSignals === 0
    ? 0.5
    : Math.min(0.99, 0.55 + (Math.abs(difference) / totalSignals) * 0.4);
  return {
    label,
    confidence: Number(confidence.toFixed(4)),
    model: 'LEXICO_PT_V1',
    sanitizedText,
    positiveSignals,
    negativeSignals,
  };
}

export function validateEnpsScore(value: unknown): number {
  const score = Number(value);
  if (!Number.isInteger(score) || score < 0 || score > 10) {
    throw Object.assign(new Error('A nota eNPS deve ser um inteiro entre 0 e 10.'), { status: 400, code: 'INVALID_ENPS_SCORE' });
  }
  return score;
}

export function remainingKudos(total: number, used: number, requested = 1): number {
  if (![total, used, requested].every(Number.isInteger) || total < 0 || used < 0 || requested <= 0 || used + requested > total) {
    throw Object.assign(new Error('Saldo semanal de Kudos insuficiente.'), { status: 409, code: 'KUDOS_BALANCE_EXHAUSTED' });
  }
  return total - used - requested;
}

export function identityProof(secret: string, pollId: number, userId: number): string {
  if (!secret || !Number.isInteger(pollId) || pollId <= 0 || !Number.isInteger(userId) || userId <= 0) {
    throw new Error('Parametros invalidos para comprovante de participacao.');
  }
  return createHmac('sha256', secret).update(`poll:${pollId}:identity:${userId}`).digest('hex');
}

export function credentialFingerprint(secret: string, pollId: number, jti: string): string {
  return createHmac('sha256', secret).update(`poll:${pollId}:credential:${jti}`).digest('hex');
}

export type SentimentLabel = 'POSITIVO' | 'NEUTRO' | 'NEGATIVO';

export interface SentimentResult {
  label: SentimentLabel;
  confidence: number;
  model: 'LEXICO_PT_V1';
  sanitizedText: string;
  positiveSignals: number;
  negativeSignals: number;
}

export interface AnonymousBallotClaims {
  jti: string;
  pollId: number;
  departmentId: number;
  sub: 'anonymous-ballot';
}

export interface EncryptedFeedback {
  ciphertext: Buffer;
  iv: Buffer;
  tag: Buffer;
}

export interface CreatePublicationInput {
  actorId: number;
  type: 'PUBLICACAO' | 'KUDOS';
  content: string;
  recipientId: number | null;
  kudosCategory: string | null;
  mentionedIds: number[];
  idempotencyKey: string;
  sentiment: SentimentResult;
}

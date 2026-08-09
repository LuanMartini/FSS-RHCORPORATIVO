export const FACIAL_TEMPLATE_VERSION = 'LOCAL-HUMAN-WASM-FACERES-V1';
export const FACIAL_EMBEDDING_DIMENSIONS = 1024;

export interface FacialTemplate {
  version: typeof FACIAL_TEMPLATE_VERSION;
  dimensions: typeof FACIAL_EMBEDDING_DIMENSIONS;
  embedding: number[];
}

export interface BiometricComparison {
  approved: boolean;
  confidence: number;
  similarity: number;
}

export class InvalidFacialTemplateError extends Error {
  constructor(message = 'Template facial invalido ou desatualizado.') {
    super(message);
    this.name = 'InvalidFacialTemplateError';
  }
}

export function decodePhotoDataUrl(photoBase64: string): Buffer {
  const match = photoBase64.match(/^data:image\/(jpeg|jpg|png);base64,([A-Za-z0-9+/=]+)$/);
  if (!match?.[2]) throw new Error('Foto deve ser uma imagem JPEG ou PNG em base64.');
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length < 1_000 || buffer.length > 5 * 1024 * 1024) {
    throw new Error('Foto biometrica deve ter entre 1 KB e 5 MB.');
  }
  return buffer;
}

function normalizedEmbedding(value: unknown): number[] {
  if (!Array.isArray(value) || value.length !== FACIAL_EMBEDDING_DIMENSIONS
      || !value.every((item) => typeof item === 'number' && Number.isFinite(item))) {
    throw new InvalidFacialTemplateError();
  }
  const norm = Math.hypot(...value);
  if (!Number.isFinite(norm) || norm === 0) throw new InvalidFacialTemplateError();
  return value.map((item) => item / norm);
}

export function createFacialTemplate(embedding: number[]): FacialTemplate {
  return {
    version: FACIAL_TEMPLATE_VERSION,
    dimensions: FACIAL_EMBEDDING_DIMENSIONS,
    embedding: normalizedEmbedding(embedding),
  };
}

export function parseFacialTemplate(value: unknown): FacialTemplate {
  let parsed = value;
  if (typeof value === 'string') {
    try { parsed = JSON.parse(value) as unknown; }
    catch { throw new InvalidFacialTemplateError(); }
  }
  if (!parsed || typeof parsed !== 'object') throw new InvalidFacialTemplateError();
  const record = parsed as Record<string, unknown>;
  if (record.version !== FACIAL_TEMPLATE_VERSION || record.dimensions !== FACIAL_EMBEDDING_DIMENSIONS) {
    throw new InvalidFacialTemplateError();
  }
  return {
    version: FACIAL_TEMPLATE_VERSION,
    dimensions: FACIAL_EMBEDDING_DIMENSIONS,
    embedding: normalizedEmbedding(record.embedding),
  };
}

export function compareBiometric(profileTemplate: unknown, liveEmbedding: number[], threshold: number): BiometricComparison {
  if (!Number.isFinite(threshold) || threshold < 0.5 || threshold >= 1) {
    throw new Error('Limiar de reconhecimento facial deve estar entre 0.50 e 0.99.');
  }
  const reference = parseFacialTemplate(profileTemplate).embedding;
  const live = normalizedEmbedding(liveEmbedding);
  const similarity = Math.max(-1, Math.min(1, reference.reduce((total, value, index) => total + value * (live[index] ?? 0), 0)));
  const confidence = Math.round(Math.max(0, similarity) * 10_000) / 100;
  return { approved: similarity >= threshold, confidence, similarity };
}

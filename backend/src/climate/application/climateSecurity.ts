import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { getEnv } from '../../config/env.js';
import type { AnonymousBallotClaims, EncryptedFeedback } from '../domain/types.js';

function scopedSecret(name: string, scope: string): string {
  const configured = process.env[name];
  if (configured) return configured;
  if (getEnv().isProduction) throw Object.assign(new Error(`${name} deve ser configurado em producao.`), { status: 500, code: 'CLIMATE_SECRET_MISSING' });
  return createHash('sha256').update(`${getEnv().jwtSecret}:${scope}`).digest('hex');
}

export const participationSecret = (): string => scopedSecret('ENPS_PARTICIPATION_SECRET', 'enps-participation');
export const ballotSecret = (): string => scopedSecret('ENPS_BALLOT_SECRET', 'enps-ballot');
export const fingerprintSecret = (): string => scopedSecret('ENPS_FINGERPRINT_SECRET', 'enps-fingerprint');

function feedbackKey(): Buffer {
  const configured = process.env.ENPS_FEEDBACK_KEY;
  if (configured) {
    const decoded = Buffer.from(configured, 'base64');
    if (decoded.length !== 32) throw Object.assign(new Error('ENPS_FEEDBACK_KEY deve possuir 32 bytes em base64.'), { status: 500, code: 'INVALID_FEEDBACK_KEY' });
    return decoded;
  }
  if (getEnv().isProduction) throw Object.assign(new Error('ENPS_FEEDBACK_KEY deve ser configurado em producao.'), { status: 500, code: 'CLIMATE_SECRET_MISSING' });
  return createHash('sha256').update(`${getEnv().jwtSecret}:enps-feedback`).digest();
}

export function issueAnonymousBallot(claims: AnonymousBallotClaims): string {
  return jwt.sign(claims, ballotSecret(), {
    algorithm: 'HS256',
    audience: 'enps-ballot',
    issuer: 'rhcorp-climate',
    expiresIn: '15m',
  });
}

export function verifyAnonymousBallot(token: string): AnonymousBallotClaims {
  let value: string | jwt.JwtPayload;
  try {
    value = jwt.verify(token, ballotSecret(), {
      algorithms: ['HS256'], audience: 'enps-ballot', issuer: 'rhcorp-climate',
    });
  } catch {
    throw Object.assign(new Error('Credencial anonima invalida ou expirada.'), { status: 401, code: 'INVALID_BALLOT' });
  }
  if (typeof value === 'string' || value.sub !== 'anonymous-ballot' || typeof value.jti !== 'string') {
    throw Object.assign(new Error('Credencial anonima invalida.'), { status: 401, code: 'INVALID_BALLOT' });
  }
  const pollId = Number(value.pollId);
  const departmentId = Number(value.departmentId);
  if (!Number.isInteger(pollId) || pollId <= 0 || !Number.isInteger(departmentId) || departmentId <= 0) {
    throw Object.assign(new Error('Credencial anonima malformada.'), { status: 401, code: 'INVALID_BALLOT' });
  }
  return { jti: value.jti, pollId, departmentId, sub: 'anonymous-ballot' };
}

export function encryptFeedback(value: string): EncryptedFeedback | null {
  if (!value) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', feedbackKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return { ciphertext, iv, tag: cipher.getAuthTag() };
}

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { JsonValue, LedgerCanonicalEntry } from './types.js';

export const GENESIS_HASH = '0'.repeat(64);

export function stableSerialize(value: JsonValue): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  const pairs = Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key] ?? null)}`);
  return `{${pairs.join(',')}}`;
}

export function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export function ledgerHash(previousHash: string, entry: LedgerCanonicalEntry): string {
  return sha256(`${previousHash}|${stableSerialize(entry as unknown as JsonValue)}`);
}

export function ledgerHmac(secret: string, hash: string): string {
  return createHmac('sha256', secret).update(hash).digest('hex');
}

export function secureHexEqual(left: string, right: string): boolean {
  if (!/^[0-9a-f]+$/i.test(left) || !/^[0-9a-f]+$/i.test(right) || left.length !== right.length) return false;
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

export function payloadCipherHash(iv: Buffer, tag: Buffer, ciphertext: Buffer): string {
  return sha256(Buffer.concat([iv, tag, ciphertext]));
}

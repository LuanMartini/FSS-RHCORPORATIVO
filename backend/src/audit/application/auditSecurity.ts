import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { mkdir, open, readFile, rename, stat, unlink, writeFile, type FileHandle } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { ledgerHmac, secureHexEqual, stableSerialize } from '../domain/auditEngine.js';
import type { JsonValue } from '../domain/types.js';

export interface AuditAnchor { ledgerId: number; hash: string; keyVersion: number; anchoredAt: string; signature: string }

function developmentSecret(purpose: string): string {
  return createHash('sha256').update(`rhcorp-audit-development:${purpose}:${process.env.JWT_SECRET ?? 'local'}`).digest('hex');
}

export function ledgerSecret(): string {
  const configured = process.env.AUDIT_LEDGER_SECRET;
  if (configured && configured.length >= 32) return configured;
  if (process.env.NODE_ENV === 'production') throw new Error('AUDIT_LEDGER_SECRET deve possuir ao menos 32 caracteres.');
  return developmentSecret('ledger');
}

export function keyVersion(): number {
  const value = Number(process.env.AUDIT_KEY_VERSION ?? 1);
  if (!Number.isInteger(value) || value < 1) throw new Error('AUDIT_KEY_VERSION invalida.');
  return value;
}

function payloadKey(): Buffer {
  const configured = process.env.AUDIT_PAYLOAD_KEY;
  if ((!configured || configured.length < 32) && process.env.NODE_ENV === 'production') {
    throw new Error('AUDIT_PAYLOAD_KEY deve possuir ao menos 32 caracteres.');
  }
  return createHash('sha256').update(configured ?? developmentSecret('payload')).digest();
}

export function encryptAuditPayload(payload: JsonValue) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', payloadKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(stableSerialize(payload), 'utf8'), cipher.final()]);
  return { ciphertext, iv, tag: cipher.getAuthTag() };
}

function anchorPath(): string {
  return resolve(process.env.AUDIT_ANCHOR_PATH ?? './storage/audit-ledger-anchor.json');
}

function anchorMessage(anchor: Omit<AuditAnchor, 'signature'>): string {
  return stableSerialize(anchor as unknown as JsonValue);
}

export function signAnchor(anchor: Omit<AuditAnchor, 'signature'>): AuditAnchor {
  return { ...anchor, signature: ledgerHmac(ledgerSecret(), anchorMessage(anchor)) };
}

export function validAnchor(anchor: AuditAnchor): boolean {
  const { signature, ...unsigned } = anchor;
  return secureHexEqual(signature, ledgerHmac(ledgerSecret(), anchorMessage(unsigned)));
}

export async function readAnchor(): Promise<AuditAnchor | null> {
  try {
    return JSON.parse(await readFile(anchorPath(), 'utf8')) as AuditAnchor;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export async function writeAnchor(ledgerId: number, hash: string): Promise<AuditAnchor> {
  const path = anchorPath();
  await mkdir(dirname(path), { recursive: true });
  const lockPath = `${path}.lock`;
  let lock: FileHandle | null = null;
  for (let attempt = 0; attempt < 200 && !lock; attempt += 1) {
    try { lock = await open(lockPath, 'wx', 0o600); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      try {
        if (Date.now() - (await stat(lockPath)).mtimeMs > 30_000) await unlink(lockPath);
      } catch (lockError) {
        if ((lockError as NodeJS.ErrnoException).code !== 'ENOENT') throw lockError;
      }
      await wait(25);
    }
  }
  if (!lock) throw new Error('Nao foi possivel adquirir o lock da ancora de auditoria.');
  try {
    const current = await readAnchor();
    if (current && validAnchor(current) && current.ledgerId > ledgerId) return current;
    const anchor = signAnchor({ ledgerId, hash, keyVersion: keyVersion(), anchoredAt: new Date().toISOString() });
    const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(anchor, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    await rename(temporary, path);
    return anchor;
  } finally {
    await lock.close();
    await unlink(lockPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}

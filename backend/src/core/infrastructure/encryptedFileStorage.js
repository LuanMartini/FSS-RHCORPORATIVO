import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppError } from '../domain/errors.js';

const MAGIC = Buffer.from('RHCORE1');
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function encryptionKey() {
  const configured = process.env.DOCUMENT_ENCRYPTION_KEY;
  if (configured) {
    const key = Buffer.from(configured, 'base64');
    if (key.length !== 32) throw new Error('DOCUMENT_ENCRYPTION_KEY deve ser uma chave base64 de 32 bytes.');
    return key;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('DOCUMENT_ENCRYPTION_KEY e obrigatoria em producao.');
  }
  return createHash('sha256').update('rhcorp-development-key').digest();
}

function storageRoot() {
  return path.resolve(process.env.SECURE_STORAGE_PATH || fileURLToPath(new URL('../../../storage', import.meta.url)));
}

function resolveKey(key) {
  if (!/^[a-f0-9-]+\.enc$/.test(key)) throw new AppError('Chave de storage invalida.', 400);
  const target = path.resolve(storageRoot(), key);
  if (!target.startsWith(`${storageRoot()}${path.sep}`)) throw new AppError('Chave de storage invalida.', 400);
  return target;
}

export function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

export async function saveEncrypted(buffer) {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const tag = cipher.getAuthTag();
  const key = `${randomUUID()}.enc`;
  await mkdir(storageRoot(), { recursive: true });
  await writeFile(resolveKey(key), Buffer.concat([MAGIC, iv, tag, ciphertext]), { flag: 'wx', mode: 0o600 });
  return key;
}

export async function readDecrypted(key) {
  const payload = await readFile(resolveKey(key));
  if (payload.length < MAGIC.length + IV_LENGTH + TAG_LENGTH || !payload.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new AppError('Arquivo criptografado corrompido.', 500, 'STORAGE_CORRUPTED');
  }
  const ivStart = MAGIC.length;
  const tagStart = ivStart + IV_LENGTH;
  const dataStart = tagStart + TAG_LENGTH;
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), payload.subarray(ivStart, tagStart));
  decipher.setAuthTag(payload.subarray(tagStart, dataStart));
  return Buffer.concat([decipher.update(payload.subarray(dataStart)), decipher.final()]);
}

export async function removeEncrypted(key) {
  try {
    await unlink(resolveKey(key));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

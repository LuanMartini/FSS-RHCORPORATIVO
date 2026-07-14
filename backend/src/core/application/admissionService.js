import { withTransaction } from '../../db/client.js';
import { DOCUMENT_TYPES } from '../domain/contracts.js';
import { AppError, assertFound } from '../domain/errors.js';
import * as repository from '../infrastructure/coreRepository.js';
import { simulateOcr } from '../infrastructure/ocrSimulator.js';
import { removeEncrypted, saveEncrypted, sha256 } from '../infrastructure/encryptedFileStorage.js';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const signatures = {
  'application/pdf': (buffer) => buffer.subarray(0, 4).toString() === '%PDF',
  'image/jpeg': (buffer) => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
  'image/png': (buffer) => buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
};

function validateFile(buffer, mimeType) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new AppError('Arquivo vazio.');
  if (buffer.length > MAX_FILE_SIZE) throw new AppError('Arquivo excede o limite de 10 MB.', 413, 'FILE_TOO_LARGE');
  const validator = signatures[mimeType];
  if (!validator) throw new AppError('Formato permitido: PDF, JPEG ou PNG.', 415, 'UNSUPPORTED_MEDIA_TYPE');
  if (!validator(buffer)) throw new AppError('Conteudo do arquivo nao corresponde ao formato informado.', 422, 'INVALID_FILE_SIGNATURE');
}

export const listAdmissions = repository.listAdmissions;
export const getAdmission = async (id) => assertFound(await repository.getAdmission(id), 'Admissao nao encontrada.');

export async function createAdmission(input) {
  return withTransaction((client) => repository.createAdmission(input, client));
}

export async function uploadDocument({ collaboratorId, type, fileName, mimeType, buffer }) {
  if (!DOCUMENT_TYPES.includes(type)) throw new AppError('Tipo de documento invalido.');
  validateFile(buffer, mimeType);
  let storageKey;
  try {
    return await withTransaction(async (client) => {
      const collaborator = assertFound(await repository.getAdmission(collaboratorId, client), 'Colaborador nao encontrado.');
      const ocr = simulateOcr({ type, fileName, collaborator });
      storageKey = await saveEncrypted(buffer);
      return repository.insertDocument({
        collaboratorId, type, fileName, mimeType, size: buffer.length, storageKey,
        checksum: sha256(buffer), ocrMetadata: ocr.metadata, ocrConfidence: ocr.confidence,
      }, client);
    });
  } catch (error) {
    if (storageKey) await removeEncrypted(storageKey);
    throw error;
  }
}

export async function validateDocument({ documentId, decision, justification, userId }) {
  return withTransaction(async (client) => {
    assertFound(await repository.getDocumentWithCollaborator(documentId, client, true), 'Documento nao encontrado.');
    const collaboratorId = await repository.validateDocument(documentId, decision, justification, userId, client);
    return repository.getAdmission(collaboratorId, client);
  });
}

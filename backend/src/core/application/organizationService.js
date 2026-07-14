import { withTransaction } from '../../db/client.js';
import { AppError } from '../domain/errors.js';
import * as repository from '../infrastructure/coreRepository.js';

export const listOrganization = repository.listOrganization;

export async function changeHierarchy(input) {
  await withTransaction(async (client) => {
    const result = await repository.changeHierarchy(input, client);
    if (result.kind === 'not_found') throw new AppError('Cargo nao encontrado.', 404, 'NOT_FOUND');
    if (result.kind === 'superior_not_found') throw new AppError('Cargo superior nao encontrado.', 404, 'NOT_FOUND');
    if (result.kind === 'cycle') throw new AppError('Alteracao recusada: criaria uma dependencia circular.', 409, 'HIERARCHY_CYCLE');
    if (result.kind === 'version_conflict') throw new AppError('O organograma foi alterado por outro usuario. Recarregue e tente novamente.', 409, 'VERSION_CONFLICT');
  }, { isolationLevel: 'SERIALIZABLE' });
  return repository.listOrganization();
}

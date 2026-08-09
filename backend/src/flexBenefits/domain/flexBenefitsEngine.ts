import { createHash } from 'node:crypto';
import { BENEFIT_CATEGORIES, type AllocationInput, type BenefitLimit, type ValidatedAllocation } from './types.js';

const round = (value: number, scale = 4) => Number(value.toFixed(scale));
const appError = (message: string, status = 422, code = 'BUSINESS_RULE_VIOLATION'): Error => Object.assign(new Error(message), { status, code });

export function validateAllocation(totalCents: number, limits: BenefitLimit[], input: AllocationInput[]): {
  allocations: ValidatedAllocation[]; allocatedCents: number; availableCents: number;
} {
  if (!Number.isSafeInteger(totalCents) || totalCents <= 0) throw appError('Saldo total da carteira invalido.');
  const byCategory = new Map(input.map((item) => [item.category, item]));
  if (byCategory.size !== input.length) throw appError('Uma categoria nao pode aparecer mais de uma vez.');
  const allocations: ValidatedAllocation[] = [];
  for (const category of BENEFIT_CATEGORIES) {
    const item = byCategory.get(category) ?? { category, amountCents: 0 };
    if (!Number.isSafeInteger(item.amountCents) || item.amountCents < 0) throw appError(`Valor invalido para ${category}.`);
    const limit = limits.find((candidate) => candidate.category === category);
    if (!limit) throw appError(`Limite vigente nao configurado para ${category}.`, 409, 'BENEFIT_LIMIT_NOT_CONFIGURED');
    const percent = round((item.amountCents / totalCents) * 100);
    if (percent + 0.0001 < limit.minimumPercent || percent - 0.0001 > limit.maximumPercent) {
      throw appError(`${category} deve permanecer entre ${limit.minimumPercent}% e ${limit.maximumPercent}%.`);
    }
    if (item.amountCents < limit.minimumCents || (limit.maximumCents !== null && item.amountCents > limit.maximumCents)) {
      throw appError(`${category} viola os limites financeiros configurados.`);
    }
    allocations.push({ category, amountCents: item.amountCents, percent, limitId: limit.id });
  }
  const allocatedCents = allocations.reduce((sum, item) => sum + item.amountCents, 0);
  if (allocatedCents > totalCents) throw appError('A distribuicao ultrapassa o saldo total da carteira.', 409, 'WALLET_OVERSPEND');
  return { allocations, allocatedCents, availableCents: totalCents - allocatedCents };
}

export function validateReceiptFile(buffer: Buffer, mime: string, size: number): void {
  if (size <= 0 || size > 10 * 1024 * 1024) throw appError('Comprovante deve ter entre 1 byte e 10 MB.', 400, 'INVALID_RECEIPT_SIZE');
  if (!['image/jpeg', 'image/png', 'application/pdf'].includes(mime)) throw appError('Envie comprovante JPG, PNG ou PDF.', 415, 'INVALID_RECEIPT_TYPE');
  const signature = mime === 'image/jpeg'
    ? buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
    : mime === 'image/png'
      ? buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      : buffer.subarray(0, 5).toString('ascii') === '%PDF-';
  if (!signature) throw appError('Assinatura binaria do comprovante invalida.', 400, 'INVALID_RECEIPT_SIGNATURE');
}

export function resolveApprovalLevels(amountCents: number, rules: { minimumCents: number; maximumCents: number | null; levels: string[] }[]): string[] {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw appError('Valor do reembolso invalido.', 400);
  const rule = rules.find((item) => amountCents >= item.minimumCents && (item.maximumCents === null || amountCents <= item.maximumCents));
  if (!rule || rule.levels.length === 0) throw appError('Nenhuma esteira de aprovacao atende ao valor informado.', 409, 'APPROVAL_RULE_NOT_FOUND');
  return [...rule.levels];
}

export function stablePayloadHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

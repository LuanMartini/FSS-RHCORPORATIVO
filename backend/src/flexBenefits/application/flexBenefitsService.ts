import { randomUUID } from 'node:crypto';
import { removeEncrypted, saveEncrypted, sha256 } from '../../core/infrastructure/encryptedFileStorage.js';
import { extractDocument, OcrProviderError, type OcrResult } from '../../core/infrastructure/ocrProvider.ts';
import { BENEFIT_CATEGORIES, EXPENSE_CATEGORIES, type AllocationInput, type BenefitCategory, type ExpenseCategory, type ReceiptOcr } from '../domain/types.js';
import { resolveApprovalLevels, stablePayloadHash, validateReceiptFile } from '../domain/flexBenefitsEngine.js';
import * as repository from '../infrastructure/flexBenefitsRepository.js';
import { scanBuffer } from '../../security/malwareScanner.js';

const appError = (message: string, status: number, code = 'VALIDATION_ERROR'): Error => Object.assign(new Error(message), { status, code });
const positiveInteger = (value: unknown, field: string): number => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw appError(`${field} invalido.`, 400);
  return parsed;
};
const uuid = (value: unknown, field: string): string => {
  const parsed = String(value ?? '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parsed)) throw appError(`${field} deve ser UUID.`, 400);
  return parsed;
};

function competence(value: unknown): string {
  if (value === undefined || value === null || value === '') return `${new Date().toISOString().slice(0, 7)}-01`;
  const parsed = String(value);
  if (!/^\d{4}-\d{2}-01$/.test(parsed)) throw appError('Competencia deve usar YYYY-MM-01.', 400);
  return parsed;
}

function expenseDate(value: unknown): string | null {
  const parsed = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(parsed) || Number.isNaN(Date.parse(`${parsed}T12:00:00Z`))) return null;
  return parsed;
}

function declaredCategory(value: unknown): ExpenseCategory | null {
  const parsed = String(value ?? '').trim().toUpperCase();
  return EXPENSE_CATEGORIES.includes(parsed as ExpenseCategory) ? parsed as ExpenseCategory : null;
}

function receiptOcr(result: OcrResult): ReceiptOcr {
  const metadata = result.metadata;
  const category = declaredCategory(metadata.category) ?? 'OUTROS';
  return {
    cnpj: typeof metadata.cnpj === 'string' ? metadata.cnpj : null,
    detectedDate: typeof metadata.date === 'string' ? metadata.date : null,
    detectedAmountCents: typeof metadata.amountCents === 'number' ? metadata.amountCents : null,
    category,
    merchant: typeof metadata.merchant === 'string' ? metadata.merchant : null,
    confidence: result.confidence,
    algorithm: result.provider,
    requiresManualReview: result.requiresManualReview,
  };
}

export async function dashboard(collaboratorInput: unknown, competenceInput: unknown) {
  const collaboratorId = collaboratorInput === undefined || collaboratorInput === null || collaboratorInput === '' ? null : positiveInteger(collaboratorInput, 'Colaborador');
  return repository.dashboard(collaboratorId, competence(competenceInput));
}

export async function distribute(walletInput: unknown, collaboratorInput: unknown, body: Record<string, unknown>) {
  const walletId = positiveInteger(walletInput, 'Carteira');
  const collaboratorId = positiveInteger(collaboratorInput, 'Colaborador autenticado');
  const expectedVersion = positiveInteger(body.versao, 'Versao');
  const idempotencyKey = uuid(body.idempotencia, 'Idempotencia');
  if (!Array.isArray(body.alocacoes)) throw appError('Alocacoes devem ser uma lista.', 400);
  const allocations: AllocationInput[] = body.alocacoes.map((raw) => {
    const item = raw as Record<string, unknown>;
    const category = String(item.categoria ?? '').toUpperCase();
    if (!BENEFIT_CATEGORIES.includes(category as BenefitCategory)) throw appError(`Categoria ${category} invalida.`, 400);
    const amountCents = Number(item.valorCentavos);
    if (!Number.isSafeInteger(amountCents) || amountCents < 0) throw appError(`Valor invalido para ${category}.`, 400);
    return { category: category as BenefitCategory, amountCents };
  });
  const payload = { walletId, collaboratorId, expectedVersion, allocations };
  return repository.distribute({ walletId, collaboratorId, expectedVersion, idempotencyKey, payloadHash: stablePayloadHash(payload), allocations });
}

export async function submitReimbursement(body: Record<string, unknown>, file: Express.Multer.File | undefined) {
  if (!file) throw appError('Comprovante obrigatorio.', 400);
  validateReceiptFile(file.buffer, file.mimetype, file.size);
  await scanBuffer(file.buffer, { filename: file.originalname, mime: file.mimetype });
  const collaboratorId = positiveInteger(body.colaboradorId, 'Colaborador');
  const idempotencyKey = uuid(body.idempotencia ?? randomUUID(), 'Idempotencia');
  const duplicate = await repository.findReimbursementByKey(idempotencyKey);
  if (duplicate) return { reimbursement: duplicate, reused: true };
  const transactionId = body.transacaoCartaoId ? positiveInteger(body.transacaoCartaoId, 'Transacao') : null;
  const declaredAmount = Number(body.valorCentavos);
  const declaredAmountCents = Number.isSafeInteger(declaredAmount) && declaredAmount > 0 ? declaredAmount : null;
  const declaredExpenseDate = expenseDate(body.dataDespesa);
  const selectedCategory = declaredCategory(body.categoria);
  let extracted: ReceiptOcr;
  try {
    extracted = receiptOcr(await extractDocument(file.buffer, file.mimetype, 'RECIBO'));
  } catch (error) {
    if (error instanceof OcrProviderError) throw appError(error.message, error.code === 'OCR_PROVIDER_UNAVAILABLE' ? 503 : 422, error.code);
    throw error;
  }
  if (extracted.detectedAmountCents !== null && declaredAmountCents !== null && extracted.detectedAmountCents !== declaredAmountCents) {
    throw appError('O valor informado diverge do valor reconhecido no comprovante.', 422, 'RECEIPT_AMOUNT_MISMATCH');
  }
  const amountCents = extracted.detectedAmountCents ?? declaredAmountCents;
  if (!amountCents) throw appError('OCR nao identificou o valor; informe o valor para revisao humana.', 422, 'RECEIPT_AMOUNT_REQUIRED');
  const date = extracted.detectedDate ?? declaredExpenseDate;
  if (!date) throw appError('OCR nao identificou a data; informe a data para revisao humana.', 422, 'RECEIPT_DATE_REQUIRED');
  const category = selectedCategory ?? extracted.category;
  const ocr: ReceiptOcr = {
    ...extracted,
    category,
    requiresManualReview: extracted.requiresManualReview
      || extracted.detectedAmountCents === null || extracted.detectedDate === null
      || (selectedCategory !== null && extracted.category !== 'OUTROS' && selectedCategory !== extracted.category),
  };
  const description = String(body.descricao ?? `Despesa${ocr.merchant ? ` em ${ocr.merchant}` : ''}`).trim();
  if (description.length < 3 || description.length > 2000) throw appError('Descricao deve ter entre 3 e 2000 caracteres.', 400);
  const levels = resolveApprovalLevels(amountCents, await repository.approvalRules());
  const storageKey = await saveEncrypted(file.buffer);
  try {
    const reimbursement = await repository.createReimbursement({
      collaboratorId, transactionId, category, description, amountCents, expenseDate: date,
      ocr: { ...ocr, declaredAmountCents, declaredExpenseDate, declaredCategory: selectedCategory },
      storageKey, sha256: sha256(file.buffer), mime: file.mimetype, filename: file.originalname.slice(0, 255), idempotencyKey, levels,
    });
    const reused = Boolean(reimbursement._idempotent_reuse);
    if (reused) await removeEncrypted(storageKey).catch(() => undefined);
    delete reimbursement._idempotent_reuse;
    return { reimbursement, ocr, approvalFlow: levels, reused };
  } catch (error) {
    await removeEncrypted(storageKey).catch(() => undefined);
    throw error;
  }
}

export async function decide(reimbursementInput: unknown, userId: number, body: Record<string, unknown>) {
  const decision = String(body.decisao ?? '').toUpperCase();
  if (!['APROVAR', 'REJEITAR'].includes(decision)) throw appError('Decisao deve ser APROVAR ou REJEITAR.', 400);
  const note = String(body.observacao ?? '').trim();
  if (decision === 'REJEITAR' && note.length < 10) throw appError('Rejeicao exige justificativa com ao menos 10 caracteres.', 400);
  return repository.decideReimbursement({ reimbursementId: positiveInteger(reimbursementInput, 'Reembolso'), decision: decision as 'APROVAR' | 'REJEITAR', note, expectedVersion: positiveInteger(body.versao, 'Versao'), userId: positiveInteger(userId, 'Usuario') });
}

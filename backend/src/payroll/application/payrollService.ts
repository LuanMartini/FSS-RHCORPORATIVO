import { readDecrypted } from '../../core/infrastructure/encryptedFileStorage.js';
import { PayrollCalculator, BRAZIL_2026_TABLES } from '../domain/payrollCalculator.js';
import { formatCents, parseCents } from '../domain/money.js';
import * as repository from '../infrastructure/payrollRepository.js';

function validateCompetency(value: unknown): string {
  const competency = String(value ?? '');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(competency)) throw Object.assign(new Error('Competencia deve estar no formato AAAA-MM.'), { status: 400 });
  return competency;
}

function serialize(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serialize(item)]));
  return value;
}

export async function startProcessing(competencyInput: unknown, userId: number | null): Promise<Record<string, unknown>> {
  const competency = validateCompetency(competencyInput);
  await repository.loadTaxTables(`${competency}-01`);
  return repository.createPayrollProcessing(competency, userId);
}

export async function dashboard(competencyInput?: unknown): Promise<Record<string, unknown>> {
  const competency = competencyInput == null || competencyInput === '' ? undefined : validateCompetency(competencyInput);
  return repository.payrollDashboard(competency);
}

export async function processing(id: string): Promise<Record<string, unknown>> {
  const row = await repository.getPayrollProcessing(id);
  if (!row) throw Object.assign(new Error('Processamento nao encontrado.'), { status: 404 });
  return row;
}

export async function sendToBank(id: string, paymentDateInput: unknown, userId: number): Promise<void> {
  const paymentDate = String(paymentDateInput ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) throw Object.assign(new Error('Data de pagamento invalida.'), { status: 400 });
  const row = await processing(id);
  if (row.status !== 'CONCLUIDA') {
    throw Object.assign(new Error('A folha precisa estar concluida sem falhas para envio ao banco.'), { status: 409 });
  }
  await repository.markSentToBank(id, paymentDate, userId);
}

export async function payslipPdf(id: string): Promise<{ buffer: Buffer; filename: string; sha256: string }> {
  const row = await repository.getPayslipPdfRecord(id);
  if (!row?.pdf_storage_key) throw Object.assign(new Error('Holerite nao encontrado.'), { status: 404 });
  return {
    buffer: await readDecrypted(String(row.pdf_storage_key)),
    filename: `holerite-${String(row.nome).replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${String(row.competencia).slice(0, 7)}.pdf`,
    sha256: String(row.pdf_sha256),
  };
}

export function simulate(input: Record<string, unknown>): Record<string, unknown> {
  const calculator = new PayrollCalculator(BRAZIL_2026_TABLES);
  const result = calculator.calculate({
    baseSalaryCents: parseCents(String(input.salarioBase ?? '0')),
    dependents: Number(input.dependentes ?? 0),
    unjustifiedAbsenceCents: parseCents(String(input.faltas ?? '0')),
    transportRequestedCents: parseCents(String(input.valeTransporte ?? '0')),
    mealVoucherCents: parseCents(String(input.valeRefeicao ?? '0')),
    alimonyCents: parseCents(String(input.pensao ?? '0')),
    flexibleDeductions: Array.isArray(input.beneficios) ? input.beneficios.map((item, index) => {
      const row = item as Record<string, unknown>;
      return { code: String(row.codigo ?? `BENEFICIO_${index}`), description: String(row.descricao ?? 'Beneficio'), requestedCents: parseCents(String(row.valor ?? '0')), priority: Number(row.prioridade ?? 100) };
    }) : [],
  });
  const serialized = serialize(result) as Record<string, unknown>;
  return { ...serialized, totalBruto: formatCents(result.grossCents), totalDescontos: formatCents(result.totalDeductionsCents), totalLiquido: formatCents(result.netCents), fgts: formatCents(result.fgtsCents) };
}

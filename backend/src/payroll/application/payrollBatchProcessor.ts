import { saveEncrypted, removeEncrypted } from '../../core/infrastructure/encryptedFileStorage.js';
import { PayrollCalculator } from '../domain/payrollCalculator.js';
import { multiplyRatio, parseCents } from '../domain/money.js';
import type { FlexibleDeduction, VariableEarning } from '../domain/types.js';
import { generatePayslipPdf, signPayslip } from '../infrastructure/payslipDocument.js';
import * as repository from '../infrastructure/payrollRepository.js';

function cents(value: unknown): bigint {
  return BigInt(String(value ?? 0));
}

function benefitValue(row: Record<string, unknown>, salary: bigint): bigint {
  if (row.valor_funcionario_centavos != null) return cents(row.valor_funcionario_centavos);
  if (row.percentual_funcionario_milionesimos != null) return multiplyRatio(salary, cents(row.percentual_funcionario_milionesimos), 1_000_000n);
  if (row.percentual_salario_milionesimos != null) return multiplyRatio(salary, cents(row.percentual_salario_milionesimos), 1_000_000n);
  return cents(row.valor_padrao_centavos);
}

export async function processPayrollJob(job: Record<string, unknown>): Promise<void> {
  const folhaId = String(job.folha_id);
  const processing = await repository.getPayrollProcessing(folhaId);
  if (!processing) throw new Error(`Folha ${folhaId} nao encontrada.`);
  const competency = String(processing.competencia).slice(0, 7);
  const [{ tables, inssTableId, irrfTableId }, employees, batch] = await Promise.all([
    repository.loadTaxTables(`${competency}-01`),
    repository.loadEmployees(folhaId),
    repository.loadEmployeeBatchData(folhaId),
  ]);
  const calculator = new PayrollCalculator(tables);

  for (const employee of employees) {
    let storageKey: string | null = null;
    try {
      const salary = parseCents(employee.salario);
      const launches = batch.launches.get(employee.id) ?? [];
      const earnings: VariableEarning[] = launches
        .filter((row) => row.natureza === 'VENCIMENTO' && row.codigo !== 'SALARIO')
        .map((row) => ({
          code: String(row.codigo), description: String(row.descricao), amountCents: cents(row.valor_centavos),
          inss: Boolean(row.incide_inss), irrf: Boolean(row.incide_irrf), fgts: Boolean(row.incide_fgts),
        }));
      const grossForAlimony = salary + earnings.reduce((sum, item) => sum + item.amountCents, 0n);
      const alimony = (batch.alimonies.get(employee.id) ?? []).reduce((sum, row) =>
        sum + (row.valor_fixo_centavos != null
          ? cents(row.valor_fixo_centavos)
          : multiplyRatio(grossForAlimony, cents(row.percentual_milionesimos), 1_000_000n)), 0n);
      const benefitRows = batch.benefits.get(employee.id) ?? [];
      const flexibleDeductions: FlexibleDeduction[] = benefitRows
        .filter((row) => ['PLANO_SAUDE', 'PREVIDENCIA_PRIVADA', 'OUTRO'].includes(String(row.tipo)))
        .map((row) => ({
          code: String(row.codigo), description: String(row.nome), requestedCents: benefitValue(row, salary),
          priority: Number(row.prioridade ?? row.prioridade_margem ?? 100), irDeductible: Boolean(row.dedutivel_irrf),
        }));
      const findLaunch = (code: string): bigint => launches.filter((row) => row.codigo === code).reduce((sum, row) => sum + cents(row.valor_centavos), 0n);
      const findBenefit = (type: string): bigint => benefitRows.filter((row) => row.tipo === type).reduce((sum, row) => sum + benefitValue(row, salary), 0n);
      const result = calculator.calculate({
        baseSalaryCents: salary,
        dependents: batch.dependents.get(employee.id) ?? 0,
        earnings,
        unjustifiedAbsenceCents: findLaunch('FALTA'),
        transportRequestedCents: findLaunch('VALE_TRANSPORTE') + findBenefit('VALE_TRANSPORTE'),
        mealVoucherCents: findLaunch('VALE_REFEICAO') + findBenefit('VALE_REFEICAO'),
        alimonyCents: alimony,
        flexibleDeductions,
      });
      const pdf = generatePayslipPdf(employee, competency, result);
      const signature = signPayslip(pdf);
      storageKey = await saveEncrypted(pdf);
      const persisted = await repository.persistPayslip({
        folhaId, employee, result, inssTableId, irrfTableId, pdfStorageKey: storageKey,
        pdfSha256: signature.sha256, signatureStatus: signature.status,
        signatureAlgorithm: signature.algorithm, signatureBase64: signature.signatureBase64, competency,
      });
      if (!persisted.created) {
        await removeEncrypted(storageKey);
        storageKey = null;
      }
    } catch (error) {
      if (storageKey) await removeEncrypted(storageKey).catch(() => undefined);
      await repository.registerEmployeeFailure(folhaId, employee.id, error);
    }
  }
  await repository.completeJob(String(job.id), folhaId);
}

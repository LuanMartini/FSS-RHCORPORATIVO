import test from 'node:test';
import assert from 'node:assert/strict';
import { BRAZIL_2026_TABLES, PayrollCalculator } from '../src/payroll/domain/payrollCalculator.js';
import { formatCents, parseCents } from '../src/payroll/domain/money.js';

const calculator = new PayrollCalculator(BRAZIL_2026_TABLES);

test('usa centavos inteiros sem erro binario', () => {
  assert.equal(parseCents('0.10') + parseCents('0.20'), 30n);
  assert.equal(formatCents(30n), '0.30');
});

test('aplica INSS progressivo de 2026 e respeita o teto', () => {
  const result = calculator.calculate({ baseSalaryCents: parseCents('12000.00'), dependents: 0 });
  assert.equal(formatCents(result.inssCents), '988.09');
  assert.equal(result.inssBaseCents, 1_200_000n);
});

test('zera IRRF em 2026 para rendimentos tributaveis ate cinco mil', () => {
  const result = calculator.calculate({ baseSalaryCents: 500_000n, dependents: 0 });
  assert.equal(result.irrfCents, 0n);
  assert.ok(result.irrfReductionCents > 0n);
});

test('reproduz exemplo oficial de IRRF sem deducoes para 7607,20', () => {
  const noInss = new PayrollCalculator({ ...BRAZIL_2026_TABLES, inss: [] });
  const result = noInss.calculate({ baseSalaryCents: 760_720n, dependents: 0 });
  assert.equal(result.irDeductionMethod, 'SIMPLIFICADO');
  assert.equal(result.irrfBaseCents, 700_000n);
  assert.equal(formatCents(result.irrfCents), '1016.27');
});

test('limita vale-transporte a seis por cento do salario base', () => {
  const result = calculator.calculate({ baseSalaryCents: 300_000n, dependents: 0, transportRequestedCents: 50_000n });
  assert.equal(result.lines.find((line) => line.code === 'VALE_TRANSPORTE')?.amountCents, 18_000n);
});

test('prioriza beneficios e limita descontos flexiveis a margem de trinta por cento', () => {
  const result = calculator.calculate({
    baseSalaryCents: 100_000n,
    dependents: 0,
    flexibleDeductions: [
      { code: 'SAUDE', description: 'Saude', requestedCents: 20_000n, priority: 10 },
      { code: 'PREV', description: 'Previdencia', requestedCents: 20_000n, priority: 20 },
    ],
  });
  assert.equal(result.consignableMarginCents, 30_000n);
  assert.equal(result.consignableUsedCents, 30_000n);
  assert.equal(result.lines.find((line) => line.code === 'SAUDE')?.amountCents, 20_000n);
  assert.equal(result.lines.find((line) => line.code === 'PREV')?.amountCents, 10_000n);
});

test('faltas reduzem bases previdenciaria, fiscal e fundiaria', () => {
  const result = calculator.calculate({ baseSalaryCents: 400_000n, dependents: 1, unjustifiedAbsenceCents: 20_000n });
  assert.equal(result.inssBaseCents, 380_000n);
  assert.equal(result.irTaxableEarningsCents, 380_000n);
  assert.equal(result.fgtsBaseCents, 380_000n);
});

test('recusa folha inconsistente em vez de produzir liquido artificialmente zerado', () => {
  assert.throws(
    () => calculator.calculate({ baseSalaryCents: 100_000n, dependents: 0, alimonyCents: 120_000n }),
    /excedem a remuneracao bruta/
  );
});

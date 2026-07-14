import { maxMoney, minMoney, multiplyRatio } from './money.js';
import type { PayrollInput, PayrollLine, PayrollResult, PayrollTaxTables, TaxBracket } from './types.js';

const ONE_MILLION = 1_000_000n;

function validateNonNegative(name: string, value: bigint): void {
  if (value < 0n) throw new Error(`${name} nao pode ser negativo.`);
}

function progressiveInss(base: bigint, brackets: TaxBracket[]): bigint {
  let contributionNumerator = 0n;
  for (const bracket of brackets) {
    if (base <= bracket.lowerCents) continue;
    const upper = bracket.upperCents ?? base;
    const taxableSlice = minMoney(base, upper) - bracket.lowerCents;
    if (taxableSlice > 0n) contributionNumerator += taxableSlice * bracket.rateMillionths;
  }
  // O arredondamento ocorre uma unica vez depois da soma de todas as faixas.
  return (contributionNumerator + ONE_MILLION / 2n) / ONE_MILLION;
}

function tableTax(base: bigint, brackets: TaxBracket[]): bigint {
  const bracket = brackets.find((item) =>
    base > item.lowerCents && (item.upperCents === null || base <= item.upperCents)
  ) ?? brackets[0];
  if (!bracket) return 0n;
  return maxMoney(0n, multiplyRatio(base, bracket.rateMillionths, ONE_MILLION) - (bracket.deductionCents ?? 0n));
}

function irrfReduction(taxBeforeReduction: bigint, taxableEarnings: bigint, tables: PayrollTaxTables): bigint {
  if (taxableEarnings <= tables.irReductionZeroUntilCents) return taxBeforeReduction;
  if (taxableEarnings > tables.irReductionEndsAtCents) return 0n;
  // Lei 15.270/2025: 978,62 - (0,133145 x rendimentos tributaveis).
  const calculated = 97_862n - multiplyRatio(taxableEarnings, 133_145n, ONE_MILLION);
  return minMoney(taxBeforeReduction, maxMoney(0n, calculated));
}

export class PayrollCalculator {
  constructor(private readonly tables: PayrollTaxTables) {}

  calculate(input: PayrollInput): PayrollResult {
    validateNonNegative('Salario base', input.baseSalaryCents);
    if (!Number.isInteger(input.dependents) || input.dependents < 0) throw new Error('Quantidade de dependentes invalida.');

    const earnings = input.earnings ?? [];
    earnings.forEach((earning) => validateNonNegative(earning.code, earning.amountCents));
    const absence = input.unjustifiedAbsenceCents ?? 0n;
    validateNonNegative('Faltas', absence);

    const gross = input.baseSalaryCents + earnings.reduce((sum, earning) => sum + earning.amountCents, 0n);
    const inssBase = maxMoney(0n, input.baseSalaryCents + earnings.filter((e) => e.inss).reduce((s, e) => s + e.amountCents, 0n) - absence);
    const irTaxableEarnings = maxMoney(0n, input.baseSalaryCents + earnings.filter((e) => e.irrf).reduce((s, e) => s + e.amountCents, 0n) - absence);
    const fgtsBase = maxMoney(0n, input.baseSalaryCents + earnings.filter((e) => e.fgts).reduce((s, e) => s + e.amountCents, 0n) - absence);
    const flexible = [...(input.flexibleDeductions ?? [])].sort((a, b) => a.priority - b.priority || a.code.localeCompare(b.code));
    const margin = multiplyRatio(gross, input.consignableMarginRateMillionths ?? 300_000n, ONE_MILLION);
    let availableMargin = margin;
    const appliedFlexible = flexible.map((item) => {
      validateNonNegative(item.code, item.requestedCents);
      const appliedCents = minMoney(item.requestedCents, availableMargin);
      availableMargin -= appliedCents;
      return { ...item, appliedCents };
    });
    const consignableUsed = margin - availableMargin;

    const inss = progressiveInss(inssBase, this.tables.inss);
    const alimony = input.alimonyCents ?? 0n;
    validateNonNegative('Pensao', alimony);
    const legalFlexibleDeduction = appliedFlexible.filter((item) => item.irDeductible).reduce((sum, item) => sum + item.appliedCents, 0n);
    const legalDeductions = inss + alimony + BigInt(input.dependents) * this.tables.dependentDeductionCents + legalFlexibleDeduction;
    const useSimplified = this.tables.simplifiedDeductionCents > legalDeductions;
    const irrfBase = maxMoney(0n, irTaxableEarnings - (useSimplified ? this.tables.simplifiedDeductionCents : legalDeductions));
    const irBeforeReduction = tableTax(irrfBase, this.tables.irrf);
    const reduction = irrfReduction(irBeforeReduction, irTaxableEarnings, this.tables);
    const irrf = maxMoney(0n, irBeforeReduction - reduction);
    const fgts = multiplyRatio(fgtsBase, this.tables.fgtsRateMillionths, ONE_MILLION);

    const transport = minMoney(input.transportRequestedCents ?? 0n, multiplyRatio(input.baseSalaryCents, 60_000n, ONE_MILLION));
    const meal = input.mealVoucherCents ?? 0n;
    const other = input.otherNonConsignableDeductionsCents ?? 0n;
    [transport, meal, other].forEach((value) => validateNonNegative('Desconto', value));

    const flexibleLines: PayrollLine[] = [];
    for (const item of appliedFlexible) {
      if (item.appliedCents > 0n || item.requestedCents > 0n) {
        flexibleLines.push({
          code: item.code,
          description: item.description,
          nature: 'DESCONTO',
          amountCents: item.appliedCents,
          requestedCents: item.requestedCents,
        });
      }
    }
    const lines: PayrollLine[] = [
      { code: 'SALARIO', description: 'Salario base', nature: 'VENCIMENTO', amountCents: input.baseSalaryCents },
      ...earnings.map((earning) => ({ code: earning.code, description: earning.description, nature: 'VENCIMENTO' as const, amountCents: earning.amountCents })),
    ];
    if (absence > 0n) lines.push({ code: 'FALTA', description: 'Faltas nao justificadas', nature: 'DESCONTO', amountCents: absence });
    lines.push({ code: 'INSS', description: 'Contribuicao previdenciaria', nature: 'DESCONTO', amountCents: inss });
    if (irrf > 0n) lines.push({ code: 'IRRF', description: 'Imposto de renda retido', nature: 'DESCONTO', amountCents: irrf });
    if (transport > 0n) lines.push({ code: 'VALE_TRANSPORTE', description: 'Vale-transporte', nature: 'DESCONTO', amountCents: transport });
    if (meal > 0n) lines.push({ code: 'VALE_REFEICAO', description: 'Vale-refeicao', nature: 'DESCONTO', amountCents: meal });
    if (alimony > 0n) lines.push({ code: 'PENSAO', description: 'Pensao alimenticia', nature: 'DESCONTO', amountCents: alimony });
    lines.push(...flexibleLines);
    if (other > 0n) lines.push({ code: 'OUTROS_DESCONTOS', description: 'Outros descontos', nature: 'DESCONTO', amountCents: other });
    lines.push({ code: 'FGTS', description: 'Deposito de FGTS', nature: 'INFORMATIVA', amountCents: fgts });

    const totalDeductions = absence + inss + irrf + transport + meal + alimony + consignableUsed + other;
    if (totalDeductions > gross) {
      throw new Error('Descontos totais excedem a remuneracao bruta; revise pensao, faltas e lancamentos.');
    }
    return {
      lines,
      grossCents: gross,
      inssBaseCents: inssBase,
      inssCents: inss,
      irTaxableEarningsCents: irTaxableEarnings,
      irrfBaseCents: irrfBase,
      irrfBeforeReductionCents: irBeforeReduction,
      irrfReductionCents: reduction,
      irrfCents: irrf,
      irDeductionMethod: useSimplified ? 'SIMPLIFICADO' : 'LEGAL',
      legalIrDeductionsCents: legalDeductions,
      fgtsBaseCents: fgtsBase,
      fgtsCents: fgts,
      consignableMarginCents: margin,
      consignableUsedCents: consignableUsed,
      totalDeductionsCents: totalDeductions,
      netCents: gross - totalDeductions,
    };
  }
}

export const BRAZIL_2026_TABLES: PayrollTaxTables = {
  inss: [
    { lowerCents: 0n, upperCents: 162_100n, rateMillionths: 75_000n },
    { lowerCents: 162_100n, upperCents: 290_284n, rateMillionths: 90_000n },
    { lowerCents: 290_284n, upperCents: 435_427n, rateMillionths: 120_000n },
    { lowerCents: 435_427n, upperCents: 847_555n, rateMillionths: 140_000n },
  ],
  irrf: [
    { lowerCents: 0n, upperCents: 242_880n, rateMillionths: 0n, deductionCents: 0n },
    { lowerCents: 242_880n, upperCents: 282_665n, rateMillionths: 75_000n, deductionCents: 18_216n },
    { lowerCents: 282_665n, upperCents: 375_105n, rateMillionths: 150_000n, deductionCents: 39_416n },
    { lowerCents: 375_105n, upperCents: 466_468n, rateMillionths: 225_000n, deductionCents: 67_549n },
    { lowerCents: 466_468n, upperCents: null, rateMillionths: 275_000n, deductionCents: 90_873n },
  ],
  dependentDeductionCents: 18_959n,
  simplifiedDeductionCents: 60_720n,
  irReductionZeroUntilCents: 500_000n,
  irReductionEndsAtCents: 735_000n,
  fgtsRateMillionths: 80_000n,
};

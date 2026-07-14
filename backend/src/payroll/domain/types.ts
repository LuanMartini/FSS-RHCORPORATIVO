export type Cents = bigint;

export interface TaxBracket {
  lowerCents: Cents;
  upperCents: Cents | null;
  rateMillionths: bigint;
  deductionCents?: Cents;
}

export interface PayrollTaxTables {
  inss: TaxBracket[];
  irrf: TaxBracket[];
  dependentDeductionCents: Cents;
  simplifiedDeductionCents: Cents;
  irReductionZeroUntilCents: Cents;
  irReductionEndsAtCents: Cents;
  fgtsRateMillionths: bigint;
}

export interface VariableEarning {
  code: string;
  description: string;
  amountCents: Cents;
  inss: boolean;
  irrf: boolean;
  fgts: boolean;
}

export interface FlexibleDeduction {
  code: string;
  description: string;
  requestedCents: Cents;
  priority: number;
  irDeductible?: boolean;
}

export interface PayrollInput {
  baseSalaryCents: Cents;
  dependents: number;
  earnings?: VariableEarning[];
  unjustifiedAbsenceCents?: Cents;
  transportRequestedCents?: Cents;
  mealVoucherCents?: Cents;
  alimonyCents?: Cents;
  flexibleDeductions?: FlexibleDeduction[];
  otherNonConsignableDeductionsCents?: Cents;
  consignableMarginRateMillionths?: bigint;
}

export interface PayrollLine {
  code: string;
  description: string;
  nature: 'VENCIMENTO' | 'DESCONTO' | 'INFORMATIVA';
  amountCents: Cents;
  requestedCents?: Cents;
}

export interface PayrollResult {
  lines: PayrollLine[];
  grossCents: Cents;
  inssBaseCents: Cents;
  inssCents: Cents;
  irTaxableEarningsCents: Cents;
  irrfBaseCents: Cents;
  irrfBeforeReductionCents: Cents;
  irrfReductionCents: Cents;
  irrfCents: Cents;
  irDeductionMethod: 'LEGAL' | 'SIMPLIFICADO';
  legalIrDeductionsCents: Cents;
  fgtsBaseCents: Cents;
  fgtsCents: Cents;
  consignableMarginCents: Cents;
  consignableUsedCents: Cents;
  totalDeductionsCents: Cents;
  netCents: Cents;
}

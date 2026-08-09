export const BENEFIT_CATEGORIES=['VALE_REFEICAO','MOBILIDADE','SAUDE','EDUCACAO'] as const;
export type BenefitCategory=typeof BENEFIT_CATEGORIES[number];
export const EXPENSE_CATEGORIES=['MOBILIDADE','PASSAGEM','ALIMENTACAO','HOSPEDAGEM','SAUDE','EDUCACAO','OUTROS'] as const;
export type ExpenseCategory=typeof EXPENSE_CATEGORIES[number];

export interface BenefitLimit {id:number;category:BenefitCategory;minimumPercent:number;maximumPercent:number;minimumCents:number;maximumCents:number|null;taxable:boolean}
export interface AllocationInput {category:BenefitCategory;amountCents:number}
export interface ValidatedAllocation extends AllocationInput {percent:number;limitId:number}
export interface ReceiptOcr {
  cnpj: string | null;
  detectedDate: string | null;
  detectedAmountCents: number | null;
  category: ExpenseCategory;
  merchant: string | null;
  confidence: number;
  algorithm: 'TESSERACT_LOCAL_V1' | 'OCR_SIMULADO_DEV_ONLY_V1';
  requiresManualReview: boolean;
}

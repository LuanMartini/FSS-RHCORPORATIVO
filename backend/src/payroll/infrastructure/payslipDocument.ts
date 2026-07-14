import { createHash, createSign } from 'node:crypto';
import { formatCents } from '../domain/money.js';
import type { PayrollResult } from '../domain/types.js';
import type { PayrollEmployeeRow } from './payrollRepository.js';

function ascii(value: unknown): string {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E]/g, '');
}

function escapePdf(value: unknown): string {
  return ascii(value).replace(/([\\()])/g, '\\$1');
}

function money(value: bigint): string {
  return `R$ ${formatCents(value).replace('.', ',')}`;
}

export function generatePayslipPdf(employee: PayrollEmployeeRow, competency: string, result: PayrollResult): Buffer {
  const lines = [
    'DEMONSTRATIVO DE PAGAMENTO',
    `Competencia: ${competency}`,
    `Colaborador: ${employee.nome}`,
    `CPF: ${employee.cpf}   Cargo: ${employee.cargo_nome}`,
    `Departamento: ${employee.departamento_nome}`,
    '',
    'RUBRICA                              TIPO              VALOR',
    ...result.lines.map((line) => `${line.description.slice(0, 34).padEnd(36)} ${line.nature.padEnd(14)} ${money(line.amountCents)}`),
    '',
    `Total bruto: ${money(result.grossCents)}`,
    `Total descontos: ${money(result.totalDeductionsCents)}`,
    `Liquido: ${money(result.netCents)}`,
    `Base INSS: ${money(result.inssBaseCents)}   Base IRRF: ${money(result.irrfBaseCents)}`,
    `Base FGTS: ${money(result.fgtsBaseCents)}   FGTS: ${money(result.fgtsCents)}`,
    `Margem consignavel: ${money(result.consignableMarginCents)}   Utilizada: ${money(result.consignableUsedCents)}`,
    '',
    'Documento gerado eletronicamente. A validacao criptografica consta no sistema.',
  ];
  const content = lines.slice(0, 42).map((line, index) =>
    `BT /F1 ${index === 0 ? 15 : 8} Tf 44 ${800 - index * 18} Td (${escapePdf(line)}) Tj ET`
  ).join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index += 1) pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, 'ascii');
}

export function signPayslip(pdf: Buffer): {
  sha256: string;
  status: string;
  algorithm: string | null;
  signatureBase64: string | null;
} {
  const sha256 = createHash('sha256').update(pdf).digest('hex');
  const configuredKey = process.env.PAYROLL_SIGNING_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!configuredKey) return { sha256, status: 'PENDENTE_CERTIFICADO', algorithm: null, signatureBase64: null };
  const signer = createSign('RSA-SHA256');
  signer.update(pdf);
  signer.end();
  return {
    sha256,
    status: 'ASSINADO_DESTACADO',
    algorithm: 'RSA-SHA256',
    signatureBase64: signer.sign(configuredKey).toString('base64'),
  };
}

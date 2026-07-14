// Adaptador de compatibilidade das rotas legadas /rh/folha.
// O motor oficial fica isolado e opera exclusivamente em centavos (BigInt).
import { BRAZIL_2026_TABLES, PayrollCalculator } from '../payroll/domain/payrollCalculator.ts';
import { formatCents, multiplyRatio, parseCents } from '../payroll/domain/money.ts';

const calculator = new PayrollCalculator(BRAZIL_2026_TABLES);

export function fmt(value) {
  return Number(value ?? 0).toFixed(2);
}

export function calcularINSS(salary) {
  return Number(calculator.calculate({ baseSalaryCents: parseCents(String(salary)), dependents: 0 }).inssCents) / 100;
}

export function calcularIRRF(taxableEarnings) {
  return Number(calculator.calculate({ baseSalaryCents: parseCents(String(taxableEarnings)), dependents: 0 }).irrfCents) / 100;
}

export function calcularFGTS(salary) {
  return Number(multiplyRatio(parseCents(String(salary)), 80_000n, 1_000_000n)) / 100;
}

export function montarHolerite(employee, reference = new Date()) {
  const result = calculator.calculate({ baseSalaryCents: parseCents(String(employee.salario)), dependents: 0 });
  return {
    funcionario: { id: employee.id, nome: employee.nome, cpf: employee.cpf, cargo: employee.cargo_id ?? 0 },
    mesReferencia: reference.getMonth() + 1,
    anoReferencia: reference.getFullYear(),
    vencimentos: { salarioBase: formatCents(result.grossCents) },
    descontos: { inss: formatCents(result.inssCents), irrf: formatCents(result.irrfCents) },
    provisoes: { fgts: formatCents(result.fgtsCents) },
    totalBruto: formatCents(result.grossCents),
    totalDescontos: formatCents(result.totalDeductionsCents),
    totalLiquido: formatCents(result.netCents),
    __fgts: Number(result.fgtsCents) / 100,
  };
}

export function holeritePublico(payslip) {
  const { __fgts, ...publicData } = payslip;
  return publicData;
}

export interface FuncionarioView {
  id: string;
  nome: string;
  cargoLabel: string;
  departamentoLabel: string;
  salario?: number;
  cpf?: string;
  email?: string;
  ativo: boolean;
  status?: string;
}

export function labelNome(val: unknown): string {
  if (val == null) return '—';
  if (typeof val === 'string') return val;
  if (typeof val === 'object' && val !== null && 'nome' in val) {
    return String((val as { nome: string }).nome);
  }
  return '—';
}

export function mapFuncionarioApi(raw: Record<string, unknown>): FuncionarioView {
  return {
    id: String(raw.id ?? ''),
    nome: String(raw.nome ?? ''),
    cargoLabel: labelNome(raw.cargo),
    departamentoLabel: labelNome(raw.departamento),
    salario: typeof raw.salario === 'number' ? raw.salario : Number(raw.salario),
    cpf: raw.cpf != null ? String(raw.cpf) : undefined,
    email: raw.email != null ? String(raw.email) : undefined,
    ativo: raw.status === 'ATIVO' || raw.status === 'FERIAS',
    status: raw.status != null ? String(raw.status) : undefined,
  };
}

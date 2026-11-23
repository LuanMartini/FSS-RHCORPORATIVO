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

const statusLabels: Record<string, string> = {
  ATIVO: 'Ativo', DESLIGADO: 'Desligado', FERIAS: 'Em férias', AFASTADO: 'Afastado', INATIVO: 'Inativo',
};

export function employeeStatusLabel(status?: string) {
  return status ? (statusLabels[status] ?? status.replaceAll('_', ' ')) : 'Não informado';
}

export function labelNome(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'nome' in value && typeof value.nome === 'string') return value.nome;
  return '—';
}

export function mapFuncionarioApi(raw: Record<string, unknown>): FuncionarioView {
  const salario = raw.salario == null || raw.salario === '' ? undefined : Number(raw.salario);
  return {
    id: String(raw.id ?? ''),
    nome: String(raw.nome ?? ''),
    cargoLabel: labelNome(raw.cargo),
    departamentoLabel: labelNome(raw.departamento),
    salario: Number.isFinite(salario) ? salario : undefined,
    cpf: raw.cpf != null ? String(raw.cpf) : undefined,
    email: raw.email != null ? String(raw.email) : undefined,
    ativo: raw.status === 'ATIVO' || raw.status === 'FERIAS',
    status: raw.status != null ? String(raw.status) : undefined,
  };
}

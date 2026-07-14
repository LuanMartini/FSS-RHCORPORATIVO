export type PayrollStatus = 'PENDENTE' | 'PROCESSANDO' | 'CONCLUIDA' | 'CONCLUIDA_COM_ERROS' | 'ENVIADA_BANCO' | 'CANCELADA';

export interface PayrollProcessing {
  id: string | number;
  competencia: string;
  versao: number;
  status: PayrollStatus;
  total_funcionarios: number;
  processados: number;
  falhas: number;
  progresso_percentual: string | number;
  total_bruto_centavos: string;
  total_descontos_centavos: string;
  total_liquido_centavos: string;
  total_fgts_centavos: string;
  custo_empresa_centavos: string;
  eventos_esocial_pendentes: string | number;
  criado_em: string;
  concluido_em?: string | null;
}

export interface DepartmentCost {
  departamento: string;
  custo_centavos: string;
  colaboradores: number;
}

export interface PayrollDashboardResponse {
  atual: PayrollProcessing | null;
  distribuicaoDepartamentos: DepartmentCost[];
  processamentos: PayrollProcessing[];
}

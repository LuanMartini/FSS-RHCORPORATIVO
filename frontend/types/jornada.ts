export type TipoMarcacao = 'ENTRADA' | 'INTERVALO_INICIO' | 'INTERVALO_FIM' | 'SAIDA';

export interface JornadaColaborador {
  id: number;
  nomeCompleto: string;
  cpf: string;
  status: string;
  filialId: number | null;
  filialNome: string | null;
  filialCodigo: string | null;
  biometriaCadastrada: boolean;
}

export interface JornadaConfig {
  collaborator: { id: number; name: string; biometricEnrolled: boolean; managerId: number | null };
  branch: {
    id: number;
    name: string;
    code: string;
    timezone: string;
    latitude: number;
    longitude: number;
    geofenceType: 'RAIO' | 'POLIGONO';
    radiusMeters: number | null;
    polygon: [number, number][] | null;
  };
  schedule: {
    id: number;
    name: string;
    type: '12X36' | '6X1' | '5X2' | 'ROTATIVA' | 'FLEXIVEL';
    defaultMinutes: number;
    startTime: string | null;
    endTime: string | null;
    timezone: string;
  } | null;
}

export interface EspelhoMarcacao {
  id: number;
  nsr: number | null;
  type: TipoMarcacao;
  at: string;
  source: 'ORIGINAL' | 'TRATADA' | 'PRE_ASSINALADA';
  treatedReason?: string;
}

export interface EspelhoDia {
  date: string;
  weekday: number;
  expectedMinutes: number;
  workedMinutes: number;
  extra50Minutes: number;
  extra100Minutes: number;
  negativeMinutes: number;
  delayMinutes: number;
  reducedNightMinutes: number;
  bankDeltaMinutes: number;
  bankBalanceMinutes: number;
  absence: boolean;
  excused: boolean;
  holiday: string | null;
  inconsistencies: string[];
  punches: EspelhoMarcacao[];
}

export interface EspelhoPonto {
  collaborator: JornadaColaborador;
  period: { start: string; end: string };
  schedule: NonNullable<JornadaConfig['schedule']> & { config: Record<string, unknown> };
  days: EspelhoDia[];
  totals: Omit<EspelhoDia, 'date' | 'weekday' | 'absence' | 'excused' | 'holiday' | 'inconsistencies' | 'punches'> & { absences: number };
  generatedAt: string;
  engineVersion: string;
}

export interface SolicitacaoAjuste {
  id: number;
  colaborador_id: number;
  colaborador_nome: string;
  data_referencia: string;
  tipo: 'INCLUSAO_MARCACAO' | 'DESCONSIDERACAO' | 'ATESTADO' | 'ABONO';
  justificativa: string;
  status: 'PENDENTE_GESTOR' | 'PENDENTE_RH' | 'APROVADO' | 'REPROVADO_GESTOR' | 'REPROVADO_RH' | 'CANCELADO';
  solicitado_em: string;
}

export interface RegistroPontoResposta {
  nsr: number;
  type: TipoMarcacao;
  registeredAt: string;
  hashSha256: string;
  distanceMeters: number;
  biometricConfidence: number;
  receipt: Record<string, unknown>;
}

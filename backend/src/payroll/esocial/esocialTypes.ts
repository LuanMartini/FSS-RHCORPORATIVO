export type EsocialEventType = 'S-1200' | 'S-1210' | 'S-1299';
export type EsocialOutboxStatus = 'PRONTO_ENVIO' | 'ENVIANDO' | 'ACEITO' | 'REJEITADO' | 'CANCELADO';

export interface EsocialParty {
  tpInsc: 1 | 2;
  nrInsc: string;
}

export interface EsocialRuntimeConfig {
  environment: 'restrita' | 'producao';
  tpAmb: 1 | 2;
  employer: EsocialParty;
  transmitter: EsocialParty;
  appVersion: string;
  sendUrl: string;
  queryUrl: string;
  xsdDirectory: string;
  xsdValidatorBinary: string;
  requestTimeoutMs: number;
  pollingIntervalMs: number;
}

export interface EsocialOutboxEvent {
  id: string;
  folha_id: string;
  contracheque_id: string | null;
  tipo_evento: EsocialEventType;
  chave_idempotencia: string;
  payload: Record<string, unknown>;
  status: EsocialOutboxStatus;
  protocolo: string | null;
  event_id: string | null;
  recibo: string | null;
  tentativas: number;
  consultas: number;
  max_tentativas: number;
  criado_em: string | Date;
}

export interface EsocialOccurrence {
  code: string;
  description: string;
  type?: string;
  location?: string;
}

export interface EsocialSubmissionResult {
  accepted: boolean;
  protocol?: string;
  responseCode: string;
  description: string;
  occurrences: EsocialOccurrence[];
  rawResponse: string;
}

export interface EsocialQueryResult {
  processed: boolean;
  accepted: boolean;
  responseCode: string;
  description: string;
  receipt?: string;
  estimatedSeconds?: number;
  occurrences: EsocialOccurrence[];
  rawResponse: string;
}

export interface EsocialClientPort {
  submit(event: EsocialOutboxEvent): Promise<EsocialSubmissionResult>;
  query(protocol: string, eventId: string): Promise<EsocialQueryResult>;
}

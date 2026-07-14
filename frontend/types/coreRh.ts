export type EtapaAdmissao =
  | 'PRE_ADMISSAO'
  | 'ENVIO_DOCUMENTOS'
  | 'VALIDACAO_RH'
  | 'INTEGRACAO_SISTEMICA'
  | 'CONCLUIDA';

export type TipoDocumento = 'RG' | 'CPF' | 'PIS' | 'COMPROVANTE_RESIDENCIA' | 'DIPLOMA';
export type StatusDocumento = 'PENDENTE' | 'APROVADO' | 'RECUSADO';

export interface DocumentoAdmissao {
  id: number;
  tipo: TipoDocumento;
  nomeOriginal: string;
  mimeType: string;
  tamanhoBytes: number;
  checksumSha256: string;
  metadadosOcr: Record<string, string>;
  confiancaOcr: number;
  statusValidacao: StatusDocumento;
  justificativa: string | null;
  validadoEm: string | null;
  criadoEm: string;
}

export interface Admissao {
  id: number;
  nomeCompleto: string;
  cpf: string;
  email: string;
  telefone: string | null;
  status: string;
  etapaAdmissao: EtapaAdmissao;
  cargoNome: string | null;
  departamentoNome: string | null;
  documentosTotal: number;
  documentosAprovados: number;
  documentosPendentes: number;
  documentosRecusados: number;
  criadoEm: string;
  documentos?: DocumentoAdmissao[];
}

export interface NovaAdmissao {
  nomeCompleto: string;
  cpf: string;
  email: string;
  telefone?: string;
  cargoId?: number;
  departamentoId?: number;
  salario?: number;
  dataAdmissao?: string;
}

export interface CargoOrganograma {
  id: number;
  nome: string;
  departamentoId: number;
  superiorId: number | null;
  nivel: number;
  versao: number;
  departamentoNome: string;
  departamentoCodigo: string;
  ocupantes: number;
}

export interface UploadProgress {
  file: File;
  type: TipoDocumento;
  progress: number;
  status: 'AGUARDANDO' | 'ENVIANDO' | 'CONCLUIDO' | 'ERRO';
  error?: string;
}

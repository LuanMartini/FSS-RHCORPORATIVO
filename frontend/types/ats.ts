export const ATS_STAGES = ['APLICACAO','TRIAGEM','ENTREVISTA_TECNICA','FIT_CULTURAL','PROPOSTA','CONTRATADO'] as const;
export type AtsStage = typeof ATS_STAGES[number];

export interface AtsVacancy {
  id:number;
  titulo:string;
  descricao:string;
  status:string;
  modalidade:string;
  localizacao:string|null;
  departamento:string;
  permissao:'GESTOR'|'EDITOR'|'ENTREVISTADOR'|'LEITOR';
  total_candidatos:number;
  contratados:number;
  requisitos:Record<string,unknown>;
}

export interface AtsCard {
  candidatura_id:number;
  vaga_id:number;
  candidato_id:number;
  nome:string;
  email:string;
  telefone:string|null;
  headline:string|null;
  localizacao:string|null;
  skills:string[];
  experiencias:Array<{title:string}>;
  idiomas:Array<{language:string;level:string|null}>;
  educacao:string[];
  match_score:number;
  match_detalhes:{ missingRequired?:string[]; matchedRequired?:string[] };
  origem:string;
  etapa:AtsStage;
  posicao:string;
  versao:number;
  bloqueado_por:number|null;
  bloqueado_por_nome:string|null;
  bloqueado_ate:string|null;
  mensagens:number;
  proxima_entrevista:string|null;
}

export interface AtsBoardResponse { vacancy:AtsVacancy; cards:AtsCard[]; stages:AtsStage[]; }
export interface PresenceUser { id:number; name:string; email:string; color:string; }
export interface RemoteCursor { userId:number; name:string; color:string; x:number; y:number; at:number; }
export interface ChatMessage { id:number; candidatura_id:number; remetente_tipo:'RECRUTADOR'|'CANDIDATO'|'SISTEMA'; mensagem:string; recrutador_nome?:string; candidato_nome?:string; criada_em:string; }

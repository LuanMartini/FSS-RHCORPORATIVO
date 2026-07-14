export interface ClimateActor { id:number; nome:string; departamento_id:number; departamento:string }
export interface KudosBalance { quantidade_total:number; quantidade_utilizada:number; disponiveis:number; semana_inicio:string }
export interface ClimateComment { id:number; publicacao_id:number; conteudo:string; criado_em:string; autor_colaborador_id:number; autor_nome:string; sentimento:'POSITIVO'|'NEUTRO'|'NEGATIVO' }
export interface ClimateMention { publicacao_id:number; colaborador_mencionado_id:number; nome:string }
export interface ClimatePublication {
  id:number; tipo:'PUBLICACAO'|'KUDOS'|'COMUNICADO'; conteudo:string; categoria_kudos:string|null;
  sentimento:'POSITIVO'|'NEUTRO'|'NEGATIVO'; criado_em:string; autor_colaborador_id:number; autor_nome:string;
  departamento_id:number; destinatario_kudos_id:number|null; destinatario_nome:string|null;
  curtidas:number; comentarios_total:number; curtiu:boolean; versao:number;
}
export interface PulseSurvey { id:number; titulo:string; pergunta:string; inicio:string; fim:string; minimo_grupo:number; ja_respondeu:boolean; participacoes:number; elegiveis:number; taxa_participacao:number }
export interface ClimateMetrics { respostas:number; media:number; enps:number; positivos:number; neutros:number; negativos:number }
export interface ClimateHeatmap { departamento_id:number; departamento:string; respostas:number; enps:number; media:number; positivos:number; neutros:number; negativos:number }
export interface KudosRank { destinatario_id:number; nome:string; kudos:number }
export interface CommunicationMood { departamento_id:number; departamento:string; sinais:number; positivos:number; neutros:number; negativos:number }
export interface PersonSuggestion { id:number; nome:string; email:string; departamento_id:number }
export interface ClimateDashboard {
  actor:ClimateActor; balance:KudosBalance; feed:ClimatePublication[]; comments:ClimateComment[]; mentions:ClimateMention[];
  survey:PulseSurvey|null; climateMetrics:ClimateMetrics|null; heatmap:ClimateHeatmap[]; kudosRanking:KudosRank[];
  communicationMood:CommunicationMood[]; nextCursor:number|null;
}

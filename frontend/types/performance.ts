export interface PerformanceCycle {id:number;nome:string;descricao?:string;inicio_em:string;fim_em:string;status:string;pesos_avaliadores:Record<string,number>;minimo_anonimato:number}
export interface PerformanceDepartment {id:number;nome:string;sigla:string}
export interface TalentResult {
  resultado_id:number;ciclo_id:number;colaborador_id:number;nome:string;email:string;foto_url?:string|null;
  departamento_id:number;departamento:string;cargo?:string|null;desempenho:number;potencial:number;
  desempenho_calculado:number;potencial_calculado:number;desempenho_calibrado?:number|null;potencial_calibrado?:number|null;
  quadrante_x:1|2|3;quadrante_y:1|2|3;total_avaliacoes:number;distribuicao_avaliadores:Record<string,number>;
  versao:number;calibrado_em?:string|null;ultima_justificativa?:string|null;ultima_calibracao?:string|null;
}
export interface OkrItem {id:number;objetivo_pai_id:number|null;nivel:'CORPORATIVO'|'DEPARTAMENTO'|'INDIVIDUAL';titulo:string;descricao?:string;departamento_id?:number|null;colaborador_id?:number|null;departamento?:string|null;colaborador?:string|null;unidade:string;valor_atual:number;valor_meta:number;peso:number;progresso:number;status:string;versao:number}
export interface CalibrationLog {id:number;colaborador_id:number;colaborador:string;quadrante_x_anterior:number;quadrante_y_anterior:number;quadrante_x_novo:number;quadrante_y_novo:number;justificativa:string;calibrado_em:string;calibrado_por?:string|null}
export interface PerformanceDashboard {cycles:PerformanceCycle[];departments:PerformanceDepartment[];talents:TalentResult[];okrs:OkrItem[];calibrations:CalibrationLog[];selectedCycleId:number|null}

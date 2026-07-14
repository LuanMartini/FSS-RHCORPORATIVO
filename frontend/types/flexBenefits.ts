export type BenefitCategory='VALE_REFEICAO'|'MOBILIDADE'|'SAUDE'|'EDUCACAO';
export interface FlexCollaborator{id:number;nome:string;email:string;departamento_id:number}
export interface FlexWallet{id:number;colaborador_id:number;competencia:string;saldo_total_centavos:number;saldo_alocado_centavos:number;saldo_consumido_centavos:number;status:string;versao:number;colaborador:string;departamento_id:number}
export interface BenefitLimit{id:number;category:BenefitCategory;minimumPercent:number;maximumPercent:number;minimumCents:number;maximumCents:number|null;taxable:boolean}
export interface BenefitAllocation{id:number;carteira_id:number;categoria:BenefitCategory;valor_centavos:number;percentual:number;tributavel:boolean;fundamento_tributario?:string}
export interface CardTransaction{id:number;colaborador_id:number;identificador_externo:string;estabelecimento:string;valor_centavos:number;moeda:string;transacionado_em:string;cartao_final:string;categoria_sugerida:string;status:string;versao:number}
export interface Reimbursement{id:number;categoria:string;descricao:string;valor_solicitado_centavos:number;status:string;nivel_atual:number;total_niveis:number;versao:number;solicitado_em:string;ocr_confianca:number;aprovacoes?:{nivel:number;papel:string;status:string}[]}
export interface FlexBenefitsDashboard{collaborators:FlexCollaborator[];wallet:FlexWallet|null;limits:BenefitLimit[];allocations:BenefitAllocation[];transactions:CardTransaction[];reimbursements:Reimbursement[];approvalRules:unknown[]}

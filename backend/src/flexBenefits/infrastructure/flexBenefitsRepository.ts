import {all,withTransaction} from '../../db/client.js';
import {validateAllocation} from '../domain/flexBenefitsEngine.js';
import type {AllocationInput,BenefitCategory,ReceiptOcr} from '../domain/types.js';

type Row=Record<string,unknown>;
const appError=(message:string,status:number,code:string):Error=>Object.assign(new Error(message),{status,code});
const mapLimit=(row:Row)=>({id:Number(row.id),category:String(row.categoria) as BenefitCategory,minimumPercent:Number(row.minimo_percentual),maximumPercent:Number(row.maximo_percentual),minimumCents:Number(row.minimo_centavos),maximumCents:row.maximo_centavos===null?null:Number(row.maximo_centavos),taxable:Boolean(row.tributavel)});

export async function dashboard(collaboratorId:number|null,competence:string):Promise<Record<string,unknown>>{
  const collaborators=await all(`SELECT id,COALESCE(nome_social,nome_completo) AS nome,email,departamento_id
    FROM colaboradores WHERE status='ATIVO' ORDER BY nome_completo`) as Row[];
  const selectedId=collaboratorId??Number(collaborators[0]?.id??0);
  if(!selectedId)return{collaborators,wallet:null,limits:[],allocations:[],transactions:[],reimbursements:[],approvalRules:[]};
  const wallets=await all(`SELECT c.*,COALESCE(col.nome_social,col.nome_completo) AS colaborador,col.departamento_id
    FROM carteira_colaborador c JOIN colaboradores col ON col.id=c.colaborador_id
    WHERE c.colaborador_id=? AND c.competencia=?::date`,[selectedId,competence]) as Row[];
  const wallet=wallets[0]??null;
  const departmentId=Number(wallet?.departamento_id??collaborators.find((item)=>Number(item.id)===selectedId)?.departamento_id??0);
  const [limitRows,allocations,transactions,reimbursements,approvalRules]=await Promise.all([
    all(`SELECT DISTINCT ON (categoria) * FROM limites_beneficios
      WHERE ativo AND vigencia_inicio<=?::date AND (vigencia_fim IS NULL OR vigencia_fim>=?::date)
        AND (departamento_id=? OR departamento_id IS NULL)
      ORDER BY categoria,(departamento_id IS NOT NULL) DESC,vigencia_inicio DESC`,[competence,competence,departmentId]) as Promise<Row[]>,
    wallet?all(`SELECT a.*,l.tributavel,l.fundamento_tributario FROM alocacoes_beneficios a
      JOIN limites_beneficios l ON l.id=a.limite_id WHERE a.carteira_id=? ORDER BY a.categoria`,[wallet.id]) as Promise<Row[]>:Promise.resolve([]),
    all(`SELECT * FROM transacoes_cartao WHERE colaborador_id=? ORDER BY transacionado_em DESC LIMIT 100`,[selectedId]) as Promise<Row[]>,
    all(`SELECT r.*,(SELECT jsonb_agg(jsonb_build_object('nivel',a.nivel,'papel',a.papel,'status',a.status) ORDER BY a.nivel)
      FROM reembolsos_aprovacoes a WHERE a.reembolso_id=r.id) AS aprovacoes
      FROM reembolsos_solicitacoes r WHERE r.colaborador_id=? ORDER BY r.solicitado_em DESC LIMIT 50`,[selectedId]) as Promise<Row[]>,
    all(`SELECT * FROM regras_aprovacao_reembolso WHERE ativo AND vigencia_inicio<=current_date
      AND (vigencia_fim IS NULL OR vigencia_fim>=current_date) ORDER BY valor_minimo_centavos`) as Promise<Row[]>,
  ]);
  return{collaborators,wallet,limits:limitRows.map(mapLimit),allocations,transactions,reimbursements,approvalRules};
}

export async function distribute(input:{walletId:number;collaboratorId:number;expectedVersion:number;idempotencyKey:string;payloadHash:string;allocations:AllocationInput[]}):Promise<Row>{
  return withTransaction(async(tx)=>{
    const existing=await tx.all(`SELECT o.payload_sha256,o.resposta FROM operacoes_carteira o
      JOIN carteira_colaborador c ON c.id=o.carteira_id
      WHERE o.chave_idempotencia=?::uuid AND c.colaborador_id=?`,[input.idempotencyKey,input.collaboratorId]) as Row[];
    if(existing[0]){
      if(existing[0].payload_sha256!==input.payloadHash)throw appError('Chave de idempotencia reutilizada com outro conteudo.',409,'IDEMPOTENCY_CONFLICT');
      return existing[0].resposta as Row;
    }
    const wallets=await tx.all(`SELECT c.*,col.departamento_id FROM carteira_colaborador c
      JOIN colaboradores col ON col.id=c.colaborador_id WHERE c.id=? AND c.colaborador_id=? FOR UPDATE`,[input.walletId,input.collaboratorId]) as Row[];
    const wallet=wallets[0];if(!wallet)throw appError('Carteira nao pertence ao colaborador autenticado.',403,'WALLET_OWNER_FORBIDDEN');
    if(wallet.status!=='ABERTA')throw appError('Carteira fechada ou bloqueada.',409,'WALLET_NOT_OPEN');
    if(Number(wallet.versao)!==input.expectedVersion)throw appError('A carteira foi alterada em outra sessao.',409,'WALLET_VERSION_CONFLICT');
    const limitRows=await tx.all(`SELECT DISTINCT ON (categoria) * FROM limites_beneficios
      WHERE ativo AND vigencia_inicio<=?::date AND (vigencia_fim IS NULL OR vigencia_fim>=?::date)
        AND (departamento_id=? OR departamento_id IS NULL)
      ORDER BY categoria,(departamento_id IS NOT NULL) DESC,vigencia_inicio DESC`,[wallet.competencia,wallet.competencia,wallet.departamento_id]) as Row[];
    const validated=validateAllocation(Number(wallet.saldo_total_centavos),limitRows.map(mapLimit),input.allocations);
    await tx.run(`DELETE FROM alocacoes_beneficios WHERE carteira_id=?`,[input.walletId]);
    for(const allocation of validated.allocations)await tx.run(`INSERT INTO alocacoes_beneficios
      (carteira_id,categoria,valor_centavos,percentual,limite_id) VALUES (?,?,?,?,?)`,[input.walletId,allocation.category,allocation.amountCents,allocation.percent,allocation.limitId]);
    const updated=await tx.all(`UPDATE carteira_colaborador SET saldo_alocado_centavos=?,versao=versao+1,atualizado_em=now()
      WHERE id=? RETURNING *`,[validated.allocatedCents,input.walletId]) as Row[];
    const response={...updated[0],saldo_disponivel_centavos:validated.availableCents,alocacoes:validated.allocations};
    await tx.run(`INSERT INTO operacoes_carteira (id,carteira_id,chave_idempotencia,payload_sha256,resposta)
      VALUES (?::uuid,?,?::uuid,?,?::jsonb)`,[input.idempotencyKey,input.walletId,input.idempotencyKey,input.payloadHash,JSON.stringify(response)]);
    return response;
  },{isolationLevel:'SERIALIZABLE'});
}

export async function findReimbursementByKey(key:string):Promise<Row|null>{const rows=await all(`SELECT * FROM reembolsos_solicitacoes WHERE chave_idempotencia=?::uuid`,[key]) as Row[];return rows[0]??null;}

export async function approvalRules():Promise<{minimumCents:number;maximumCents:number|null;levels:string[]}[]>{
  const rows=await all(`SELECT valor_minimo_centavos,valor_maximo_centavos,niveis FROM regras_aprovacao_reembolso
    WHERE ativo AND vigencia_inicio<=current_date AND (vigencia_fim IS NULL OR vigencia_fim>=current_date)`) as Row[];
  return rows.map((row)=>({minimumCents:Number(row.valor_minimo_centavos),maximumCents:row.valor_maximo_centavos===null?null:Number(row.valor_maximo_centavos),levels:Array.isArray(row.niveis)?row.niveis.map(String):[]}));
}

export async function createReimbursement(input:{collaboratorId:number;transactionId:number|null;category:string;description:string;amountCents:number;ocr:ReceiptOcr;storageKey:string;sha256:string;mime:string;filename:string;idempotencyKey:string;levels:string[]}):Promise<Row>{
  return withTransaction(async(tx)=>{
    const duplicate=await tx.all(`SELECT * FROM reembolsos_solicitacoes WHERE chave_idempotencia=?::uuid`,[input.idempotencyKey]) as Row[];
    if(duplicate[0])return {...duplicate[0],_idempotent_reuse:true} as Row;
    let transaction:Row|null=null;
    if(input.transactionId!==null){
      const transactions=await tx.all(`SELECT * FROM transacoes_cartao WHERE id=? FOR UPDATE`,[input.transactionId]) as Row[];transaction=transactions[0]??null;
      if(!transaction)throw appError('Transacao de cartao nao encontrada.',404,'CARD_TRANSACTION_NOT_FOUND');
      if(Number(transaction.colaborador_id)!==input.collaboratorId)throw appError('Transacao pertence a outro colaborador.',403,'CARD_TRANSACTION_OWNER_MISMATCH');
      if(transaction.status!=='PENDENTE')throw appError('Transacao ja esta vinculada ou conciliada.',409,'CARD_TRANSACTION_NOT_PENDING');
      if(Number(transaction.valor_centavos)!==input.amountCents)throw appError('O valor do comprovante deve ser exatamente igual ao da transacao.',422,'CARD_AMOUNT_MISMATCH');
    }
    const status=input.levels[0]==='DIRETORIA'?'PENDENTE_DIRETORIA':'PENDENTE_GESTOR';
    const rows=await tx.all(`INSERT INTO reembolsos_solicitacoes
      (colaborador_id,transacao_cartao_id,categoria,descricao,valor_solicitado_centavos,data_despesa,cnpj_fornecedor,
       comprovante_storage_key,comprovante_sha256,comprovante_mime,comprovante_nome,ocr_resultado,ocr_confianca,
       status,total_niveis,chave_idempotencia)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?::uuid) RETURNING *`,[input.collaboratorId,input.transactionId,input.category,input.description,input.amountCents,input.ocr.date,input.ocr.cnpj,input.storageKey,input.sha256,input.mime,input.filename,JSON.stringify(input.ocr),input.ocr.confidence,status,input.levels.length,input.idempotencyKey]) as Row[];
    const reimbursement=rows[0] as Row;
    for(let index=0;index<input.levels.length;index++)await tx.run(`INSERT INTO reembolsos_aprovacoes
      (reembolso_id,nivel,papel,aprovador_colaborador_id) VALUES (?,?,?,CASE WHEN ?='GESTOR' THEN (SELECT gestor_id FROM colaboradores WHERE id=?) ELSE NULL END)`,[reimbursement.id,index+1,input.levels[index],input.levels[index],input.collaboratorId]);
    if(transaction)await tx.run(`UPDATE transacoes_cartao SET status='EM_CONCILIACAO',versao=versao+1 WHERE id=?`,[input.transactionId]);
    return reimbursement;
  },{isolationLevel:'SERIALIZABLE'});
}

export async function decideReimbursement(input:{reimbursementId:number;decision:'APROVAR'|'REJEITAR';note:string;expectedVersion:number;userId:number}):Promise<Row>{
  return withTransaction(async(tx)=>{
    const rows=await tx.all(`SELECT * FROM reembolsos_solicitacoes WHERE id=? FOR UPDATE`,[input.reimbursementId]) as Row[];const reimbursement=rows[0];
    if(!reimbursement)throw appError('Reembolso nao encontrado.',404,'REIMBURSEMENT_NOT_FOUND');
    if(Number(reimbursement.versao)!==input.expectedVersion)throw appError('A solicitacao foi decidida em outra sessao.',409,'REIMBURSEMENT_VERSION_CONFLICT');
    if(!['PENDENTE_GESTOR','PENDENTE_DIRETORIA'].includes(String(reimbursement.status)))throw appError('Solicitacao nao esta pendente de decisao.',409,'REIMBURSEMENT_NOT_PENDING');
    const level=Number(reimbursement.nivel_atual);
    const authorization=await tx.all(`SELECT a.papel,
      (EXISTS(SELECT 1 FROM permissoes_beneficios p WHERE p.usuario_id=? AND p.papel=a.papel)
       OR EXISTS(SELECT 1 FROM colaboradores c JOIN usuarios u ON lower(u.email)=lower(c.email)
         WHERE u.id=? AND c.id=a.aprovador_colaborador_id)) AS autorizado
      FROM reembolsos_aprovacoes a WHERE a.reembolso_id=? AND a.nivel=?`,[input.userId,input.userId,input.reimbursementId,level]) as Row[];
    if(!authorization[0]?.autorizado)throw appError(`Usuario nao autorizado para a alcada ${authorization[0]?.papel??'atual'}.`,403,'REIMBURSEMENT_APPROVER_FORBIDDEN');
    await tx.run(`UPDATE reembolsos_aprovacoes SET status=?,observacao=?,decidido_por_usuario_id=?,decidido_em=now()
      WHERE reembolso_id=? AND nivel=? AND status='PENDENTE'`,[input.decision==='APROVAR'?'APROVADO':'REJEITADO',input.note||null,input.userId,input.reimbursementId,level]);
    let nextStatus:string;let nextLevel=level;
    if(input.decision==='REJEITAR')nextStatus='REJEITADO';
    else if(level>=Number(reimbursement.total_niveis))nextStatus='APROVADO';
    else{nextLevel=level+1;const next=await tx.all(`SELECT papel FROM reembolsos_aprovacoes WHERE reembolso_id=? AND nivel=?`,[input.reimbursementId,nextLevel]) as Row[];nextStatus=next[0]?.papel==='DIRETORIA'?'PENDENTE_DIRETORIA':'PENDENTE_GESTOR';}
    const updated=await tx.all(`UPDATE reembolsos_solicitacoes SET status=?,nivel_atual=?,versao=versao+1,atualizado_em=now() WHERE id=? RETURNING *`,[nextStatus,nextLevel,input.reimbursementId]) as Row[];
    if(reimbursement.transacao_cartao_id&&['APROVADO','REJEITADO'].includes(nextStatus))await tx.run(`UPDATE transacoes_cartao SET status=?,versao=versao+1 WHERE id=?`,[nextStatus==='APROVADO'?'CONCILIADA':'PENDENTE',reimbursement.transacao_cartao_id]);
    return updated[0] as Row;
  },{isolationLevel:'SERIALIZABLE'});
}

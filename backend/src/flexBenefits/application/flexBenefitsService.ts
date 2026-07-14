import {randomUUID} from 'node:crypto';
import {removeEncrypted,saveEncrypted,sha256} from '../../core/infrastructure/encryptedFileStorage.js';
import {BENEFIT_CATEGORIES,type AllocationInput,type BenefitCategory} from '../domain/types.js';
import {resolveApprovalLevels,simulateReceiptOcr,stablePayloadHash,validateReceiptFile} from '../domain/flexBenefitsEngine.js';
import * as repository from '../infrastructure/flexBenefitsRepository.js';

const appError=(message:string,status:number,code='VALIDATION_ERROR'):Error=>Object.assign(new Error(message),{status,code});
const positiveInteger=(value:unknown,field:string):number=>{const parsed=Number(value);if(!Number.isInteger(parsed)||parsed<=0)throw appError(`${field} invalido.`,400);return parsed;};
const uuid=(value:unknown,field:string):string=>{const parsed=String(value??'');if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parsed))throw appError(`${field} deve ser UUID.`,400);return parsed;};
function competence(value:unknown):string{if(value===undefined||value===null||value==='')return`${new Date().toISOString().slice(0,7)}-01`;const parsed=String(value);if(!/^\d{4}-\d{2}-01$/.test(parsed))throw appError('Competencia deve usar YYYY-MM-01.',400);return parsed;}

export async function dashboard(collaboratorInput:unknown,competenceInput:unknown){const collaboratorId=collaboratorInput===undefined||collaboratorInput===null||collaboratorInput===''?null:positiveInteger(collaboratorInput,'Colaborador');return repository.dashboard(collaboratorId,competence(competenceInput));}

export async function distribute(walletInput:unknown,body:Record<string,unknown>){
  const walletId=positiveInteger(walletInput,'Carteira');const expectedVersion=positiveInteger(body.versao,'Versao');const idempotencyKey=uuid(body.idempotencia,'Idempotencia');
  if(!Array.isArray(body.alocacoes))throw appError('Alocacoes devem ser uma lista.',400);
  const allocations:AllocationInput[]=body.alocacoes.map((raw)=>{const item=raw as Record<string,unknown>;const category=String(item.categoria??'').toUpperCase();if(!BENEFIT_CATEGORIES.includes(category as BenefitCategory))throw appError(`Categoria ${category} invalida.`,400);const amountCents=Number(item.valorCentavos);if(!Number.isSafeInteger(amountCents)||amountCents<0)throw appError(`Valor invalido para ${category}.`,400);return{category:category as BenefitCategory,amountCents};});
  const payload={walletId,expectedVersion,allocations};
  return repository.distribute({walletId,expectedVersion,idempotencyKey,payloadHash:stablePayloadHash(payload),allocations});
}

export async function submitReimbursement(body:Record<string,unknown>,file:Express.Multer.File|undefined){
  if(!file)throw appError('Comprovante obrigatorio.',400);validateReceiptFile(file.buffer,file.mimetype,file.size);
  const collaboratorId=positiveInteger(body.colaboradorId,'Colaborador');const idempotencyKey=uuid(body.idempotencia??randomUUID(),'Idempotencia');
  const duplicate=await repository.findReimbursementByKey(idempotencyKey);if(duplicate)return{reimbursement:duplicate,reused:true};
  const transactionId=body.transacaoCartaoId?positiveInteger(body.transacaoCartaoId,'Transacao'):null;
  const declaredAmount=Number(body.valorCentavos);const amountCents=Number.isSafeInteger(declaredAmount)&&declaredAmount>0?declaredAmount:undefined;
  const ocr=simulateReceiptOcr(file.buffer,file.originalname,{...(amountCents?{amountCents}:{}),date:String(body.dataDespesa??''),category:String(body.categoria??''),merchant:String(body.fornecedor??'')});
  const description=String(body.descricao??`Despesa em ${ocr.merchant}`).trim();if(description.length<3||description.length>2000)throw appError('Descricao deve ter entre 3 e 2000 caracteres.',400);
  const levels=resolveApprovalLevels(ocr.amountCents,await repository.approvalRules());const storageKey=await saveEncrypted(file.buffer);
  try{const reimbursement=await repository.createReimbursement({collaboratorId,transactionId,category:ocr.category,description,amountCents:ocr.amountCents,ocr,storageKey,sha256:sha256(file.buffer),mime:file.mimetype,filename:file.originalname.slice(0,255),idempotencyKey,levels});const reused=Boolean(reimbursement._idempotent_reuse);if(reused)await removeEncrypted(storageKey).catch(()=>undefined);delete reimbursement._idempotent_reuse;return{reimbursement,ocr,approvalFlow:levels,reused};}
  catch(error){await removeEncrypted(storageKey).catch(()=>undefined);throw error;}
}

export async function decide(reimbursementInput:unknown,userId:number,body:Record<string,unknown>){const decision=String(body.decisao??'').toUpperCase();if(!['APROVAR','REJEITAR'].includes(decision))throw appError('Decisao deve ser APROVAR ou REJEITAR.',400);const note=String(body.observacao??'').trim();if(decision==='REJEITAR'&&note.length<10)throw appError('Rejeicao exige justificativa com ao menos 10 caracteres.',400);return repository.decideReimbursement({reimbursementId:positiveInteger(reimbursementInput,'Reembolso'),decision:decision as 'APROVAR'|'REJEITAR',note,expectedVersion:positiveInteger(body.versao,'Versao'),userId:positiveInteger(userId,'Usuario')});}

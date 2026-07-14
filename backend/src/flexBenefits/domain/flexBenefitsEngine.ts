import {createHash} from 'node:crypto';
import {BENEFIT_CATEGORIES,EXPENSE_CATEGORIES,type AllocationInput,type BenefitLimit,type ExpenseCategory,type ReceiptOcr,type ValidatedAllocation} from './types.js';

const round=(value:number,scale=4)=>Number(value.toFixed(scale));
const appError=(message:string,status=422,code='BUSINESS_RULE_VIOLATION'):Error=>Object.assign(new Error(message),{status,code});

export function validateAllocation(totalCents:number,limits:BenefitLimit[],input:AllocationInput[]):{allocations:ValidatedAllocation[];allocatedCents:number;availableCents:number}{
  if(!Number.isSafeInteger(totalCents)||totalCents<=0) throw appError('Saldo total da carteira invalido.');
  const byCategory=new Map(input.map((item)=>[item.category,item]));
  if(byCategory.size!==input.length) throw appError('Uma categoria nao pode aparecer mais de uma vez.');
  const allocations:ValidatedAllocation[]=[];
  for(const category of BENEFIT_CATEGORIES){
    const item=byCategory.get(category)??{category,amountCents:0};
    if(!Number.isSafeInteger(item.amountCents)||item.amountCents<0) throw appError(`Valor invalido para ${category}.`);
    const limit=limits.find((candidate)=>candidate.category===category);
    if(!limit) throw appError(`Limite vigente nao configurado para ${category}.`,409,'BENEFIT_LIMIT_NOT_CONFIGURED');
    const percent=round((item.amountCents/totalCents)*100);
    if(percent+0.0001<limit.minimumPercent||percent-0.0001>limit.maximumPercent) throw appError(`${category} deve permanecer entre ${limit.minimumPercent}% e ${limit.maximumPercent}%.`);
    if(item.amountCents<limit.minimumCents||(limit.maximumCents!==null&&item.amountCents>limit.maximumCents)) throw appError(`${category} viola os limites financeiros configurados.`);
    allocations.push({category,amountCents:item.amountCents,percent,limitId:limit.id});
  }
  const allocatedCents=allocations.reduce((sum,item)=>sum+item.amountCents,0);
  if(allocatedCents>totalCents) throw appError('A distribuicao ultrapassa o saldo total da carteira.',409,'WALLET_OVERSPEND');
  return {allocations,allocatedCents,availableCents:totalCents-allocatedCents};
}

export function validateReceiptFile(buffer:Buffer,mime:string,size:number):void{
  if(size<=0||size>10*1024*1024) throw appError('Comprovante deve ter entre 1 byte e 10 MB.',400,'INVALID_RECEIPT_SIZE');
  const valid=['image/jpeg','image/png','application/pdf'];
  if(!valid.includes(mime)) throw appError('Envie comprovante JPG, PNG ou PDF.',415,'INVALID_RECEIPT_TYPE');
  const signature=mime==='image/jpeg'?buffer.subarray(0,3).equals(Buffer.from([0xff,0xd8,0xff])):mime==='image/png'?buffer.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])):buffer.subarray(0,5).toString('ascii')==='%PDF-';
  if(!signature) throw appError('Assinatura binaria do comprovante invalida.',400,'INVALID_RECEIPT_SIGNATURE');
}

function validDate(value:string|undefined):string|null{
  if(!value)return null;const normalized=value.replace(/_/g,'-');const iso=/^\d{4}-\d{2}-\d{2}$/.test(normalized)?normalized:null;
  if(!iso||Number.isNaN(new Date(`${iso}T12:00:00Z`).getTime()))return null;return iso;
}
function categoryFrom(value:string):ExpenseCategory{
  const text=value.toLowerCase();if(/uber|99|taxi|mobil/.test(text))return'MOBILIDADE';if(/passagem|aereo|voo|bus/.test(text))return'PASSAGEM';if(/restaurante|aliment|refeic/.test(text))return'ALIMENTACAO';if(/hotel|hosped/.test(text))return'HOSPEDAGEM';if(/saude|farmacia|medic/.test(text))return'SAUDE';if(/curso|educa|livro/.test(text))return'EDUCACAO';return'OUTROS';
}

/** OCR determinístico: interpreta metadados do nome e usa hash somente como fallback reproduzível. */
export function simulateReceiptOcr(buffer:Buffer,filename:string,declared:{amountCents?:number;date?:string;category?:string;merchant?:string}={}):ReceiptOcr{
  const source=filename.normalize('NFD').replace(/[\u0300-\u036f]/g,' ');
  const hash=createHash('sha256').update(buffer).digest('hex');
  const cnpjMatch=source.match(/(?:^|\D)(\d{14})(?:\D|$)/);const dateMatch=source.match(/(20\d{2}[-_]\d{2}[-_]\d{2})/);
  const amountSource=source.replace(/20\d{2}[-_]\d{2}[-_]\d{2}/g,'').replace(/\d{14}/g,'');
  const amountMatch=amountSource.match(/(?:R\$|valor[-_ ]?)?(\d{1,7})[-_,.](\d{2})(?:\D|$)/i);
  const extractedAmount=amountMatch?Number(amountMatch[1])*100+Number(amountMatch[2]):null;
  const amountCents=Number.isSafeInteger(declared.amountCents)&&Number(declared.amountCents)>0?Number(declared.amountCents):extractedAmount??(1000+parseInt(hash.slice(0,6),16)%49000);
  const date=validDate(declared.date)??validDate(dateMatch?.[1])??new Date().toISOString().slice(0,10);
  const requestedCategory=String(declared.category??'').toUpperCase();
  const category=EXPENSE_CATEGORIES.includes(requestedCategory as ExpenseCategory)?requestedCategory as ExpenseCategory:categoryFrom(source);
  const merchant=String(declared.merchant??source.replace(/\.[^.]+$/,'').split(/[_-]/)[0]??'Fornecedor').trim().slice(0,180)||'Fornecedor';
  const evidence=[Boolean(cnpjMatch),Boolean(dateMatch||declared.date),Boolean(amountMatch||declared.amountCents),category!=='OUTROS'].filter(Boolean).length;
  return {cnpj:cnpjMatch?.[1]??null,date,amountCents,category,merchant,confidence:round(58+evidence*9.5,2),algorithm:'SIMULATED_RECEIPT_OCR_V1'};
}

export function resolveApprovalLevels(amountCents:number,rules:{minimumCents:number;maximumCents:number|null;levels:string[]}[]):string[]{
  if(!Number.isSafeInteger(amountCents)||amountCents<=0) throw appError('Valor do reembolso invalido.',400);
  const rule=rules.find((item)=>amountCents>=item.minimumCents&&(item.maximumCents===null||amountCents<=item.maximumCents));
  if(!rule||rule.levels.length===0) throw appError('Nenhuma esteira de aprovacao atende ao valor informado.',409,'APPROVAL_RULE_NOT_FOUND');
  return [...rule.levels];
}

export function stablePayloadHash(value:unknown):string{return createHash('sha256').update(JSON.stringify(value)).digest('hex');}

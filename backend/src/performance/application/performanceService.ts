import { randomUUID } from 'node:crypto';
import { calculateWeightedEvaluation } from '../domain/performanceEngine.js';
import type { EvaluationAnswer, EvaluatorType, TalentDimension, WeightedScoreResult } from '../domain/types.js';
import * as repository from '../infrastructure/performanceRepository.js';

const appError=(message:string,status:number,code:string):Error=>Object.assign(new Error(message),{status,code});
function positiveInteger(value:unknown,field:string):number {
  const parsed=Number(value);
  if(!Number.isInteger(parsed)||parsed<=0) throw appError(`${field} invalido.`,400,'VALIDATION_ERROR');
  return parsed;
}
function optionalPositiveInteger(value:unknown):number|null {
  if(value===undefined||value===null||value==='') return null;
  return positiveInteger(value,'Departamento');
}

export async function dashboard(cycleInput:unknown,departmentInput:unknown) {
  const cycles=await repository.listCycles();
  const cycleId=cycleInput===undefined||cycleInput===null||cycleInput===''
    ? Number(cycles[0]?.id):positiveInteger(cycleInput,'Ciclo');
  if(!cycleId) return {cycles,departments:[],talents:[],okrs:[],calibrations:[],selectedCycleId:null};
  const result=await repository.dashboard(cycleId,optionalPositiveInteger(departmentInput));
  return {...result,selectedCycleId:cycleId};
}

export async function recalculateCycle(cycleInput:unknown) {
  const cycleId=positiveInteger(cycleInput,'Ciclo');
  const cycle=await repository.getCycle(cycleId);
  if(!cycle) throw appError('Ciclo de avaliacao nao encontrado.',404,'CYCLE_NOT_FOUND');
  const rows=await repository.evaluationRows(cycleId);
  const grouped=new Map<number,EvaluationAnswer[]>();
  for(const row of rows){
    const collaboratorId=Number(row.avaliado_id);
    const answers=grouped.get(collaboratorId)??[];
    answers.push({
      evaluationId:Number(row.avaliacao_id),evaluatorType:String(row.tipo_avaliador) as EvaluatorType,
      dimension:String(row.dimensao) as TalentDimension,score:Number(row.nota),questionWeight:Number(row.pergunta_peso),
    });
    grouped.set(collaboratorId,answers);
  }
  const results=new Map<number,WeightedScoreResult>();
  for(const [collaboratorId,answers] of grouped){
    results.set(collaboratorId,calculateWeightedEvaluation(answers,cycle.pesos_avaliadores));
  }
  await repository.saveCalculatedResults(cycleId,results);
  return {cycleId,collaborators:results.size,recalculatedAt:new Date().toISOString()};
}

export async function calibrate(resultInput:unknown,userId:number,body:Record<string,unknown>) {
  const x=positiveInteger(body.quadranteX,'Quadrante X');
  const y=positiveInteger(body.quadranteY,'Quadrante Y');
  if(x>3||y>3) throw appError('Quadrantes devem estar entre 1 e 3.',400,'INVALID_QUADRANT');
  const reason=String(body.justificativa??'').trim();
  if(reason.length<10||reason.length>2000) throw appError('Justificativa deve ter entre 10 e 2000 caracteres.',400,'INVALID_CALIBRATION_REASON');
  return repository.calibrate({resultId:positiveInteger(resultInput,'Resultado'),x,y,reason,
    expectedVersion:positiveInteger(body.versao,'Versao'),userId:positiveInteger(userId,'Usuario')});
}

export async function updateOkr(okrInput:unknown,userId:number,body:Record<string,unknown>) {
  const currentValue=Number(body.valorAtual);
  if(!Number.isFinite(currentValue)||Math.abs(currentValue)>1e15) throw appError('Valor atual invalido.',400,'INVALID_CURRENT_VALUE');
  return repository.updateOkr({okrId:positiveInteger(okrInput,'OKR'),currentValue,
    expectedVersion:positiveInteger(body.versao,'Versao'),userId:positiveInteger(userId,'Usuario'),correlationId:randomUUID()});
}

import type {
  EvaluationAnswer, EvaluatorType, EvaluatorWeights, OkrChange, OkrNode,
  TalentDimension, WeightedScoreResult,
} from './types.js';

const DEFAULT_WEIGHTS: EvaluatorWeights = { AUTOAVALIACAO:10, GESTOR:40, PAR:30, LIDERADO:20 };
const round = (value:number, scale=2):number => Number(value.toFixed(scale));
const clamp = (value:number,min:number,max:number):number => Math.min(max,Math.max(min,value));

export function sanitizeEvaluatorWeights(value:unknown):EvaluatorWeights {
  const source = value && typeof value === 'object' ? value as Record<string,unknown> : {};
  const result = { ...DEFAULT_WEIGHTS };
  for (const type of Object.keys(result) as EvaluatorType[]) {
    const parsed=Number(source[type]);
    if(Number.isFinite(parsed)&&parsed>=0) result[type]=parsed;
  }
  if(Object.values(result).every((weight)=>weight===0)) return { ...DEFAULT_WEIGHTS };
  return result;
}

function dimensionScore(answers:EvaluationAnswer[],dimension:TalentDimension,weights:EvaluatorWeights):number {
  const relevant=answers.filter((answer)=>answer.dimension===dimension);
  const evaluationGroups=new Map<string,{type:EvaluatorType;weighted:number;questionWeight:number}>();
  for(const answer of relevant){
    if(!Number.isFinite(answer.score)||answer.score<1||answer.score>5||!Number.isFinite(answer.questionWeight)||answer.questionWeight<=0) continue;
    const key=`${answer.evaluatorType}:${answer.evaluationId}`;
    const group=evaluationGroups.get(key)??{type:answer.evaluatorType,weighted:0,questionWeight:0};
    group.weighted+=answer.score*answer.questionWeight;
    group.questionWeight+=answer.questionWeight;
    evaluationGroups.set(key,group);
  }
  const typeScores=new Map<EvaluatorType,number[]>();
  for(const group of evaluationGroups.values()){
    if(group.questionWeight===0) continue;
    const scores=typeScores.get(group.type)??[];
    scores.push(group.weighted/group.questionWeight);
    typeScores.set(group.type,scores);
  }
  let weighted=0;let availableWeight=0;
  for(const [type,scores] of typeScores){
    const typeWeight=weights[type];
    if(typeWeight<=0||scores.length===0) continue;
    weighted+=(scores.reduce((sum,item)=>sum+item,0)/scores.length)*typeWeight;
    availableWeight+=typeWeight;
  }
  return availableWeight===0?0:round(clamp((weighted/availableWeight)*20,0,100));
}

export function calculateWeightedEvaluation(answers:EvaluationAnswer[],weightsInput:unknown):WeightedScoreResult {
  const weights=sanitizeEvaluatorWeights(weightsInput);
  const completed=new Set(answers.map((answer)=>answer.evaluationId));
  const distribution:Partial<Record<EvaluatorType,number>>={};
  const evaluationsByType=new Map<EvaluatorType,Set<number>>();
  for(const answer of answers){
    const ids=evaluationsByType.get(answer.evaluatorType)??new Set<number>();
    ids.add(answer.evaluationId);evaluationsByType.set(answer.evaluatorType,ids);
  }
  for(const [type,ids] of evaluationsByType) distribution[type]=ids.size;
  return {
    desempenho:dimensionScore(answers,'DESEMPENHO',weights),
    potencial:dimensionScore(answers,'POTENCIAL',weights),
    totalAvaliacoes:completed.size,
    distribuicao:distribution,
  };
}

export function scoreToQuadrant(score:number):1|2|3 {
  if(score<=33.333) return 1;
  if(score<=66.666) return 2;
  return 3;
}

export function calculateLeafProgress(current:number,initial:number,target:number):number {
  if(![current,initial,target].every(Number.isFinite)||target===initial) throw new Error('Valores de progresso invalidos.');
  return round(clamp(((current-initial)/(target-initial))*100,0,100),4);
}

export function weightedChildrenProgress(children:Pick<OkrNode,'progress'|'weight'>[]):number {
  const valid=children.filter((child)=>Number.isFinite(child.progress)&&Number.isFinite(child.weight)&&child.weight>0);
  const totalWeight=valid.reduce((sum,child)=>sum+child.weight,0);
  if(totalWeight===0) return 0;
  return round(valid.reduce((sum,child)=>sum+clamp(child.progress,0,100)*child.weight,0)/totalWeight,4);
}

/** Recalcula a cadeia de pais recursivamente e interrompe grafos circulares. */
export function cascadeOkrProgress(nodes:OkrNode[],leafId:number,currentValue:number):{nodes:OkrNode[];changes:OkrChange[]} {
  const state=new Map(nodes.map((node)=>[node.id,{...node}]));
  const leaf=state.get(leafId);
  if(!leaf) throw new Error('Key Result nao encontrado.');
  if(nodes.some((node)=>node.parentId===leafId)) throw new Error('Somente uma meta folha pode receber valor manual.');
  const changes:OkrChange[]=[];
  const previousValue=leaf.currentValue;const previousProgress=leaf.progress;
  leaf.currentValue=currentValue;
  leaf.progress=calculateLeafProgress(currentValue,leaf.initialValue,leaf.targetValue);
  changes.push({id:leaf.id,previousValue,currentValue,previousProgress,progress:leaf.progress,origin:'MANUAL'});

  const recomputeParent=(parentId:number|null,path:Set<number>):void=>{
    if(parentId===null) return;
    if(path.has(parentId)) throw new Error('Dependencia circular de OKR detectada.');
    const parent=state.get(parentId);
    if(!parent) throw new Error('Objetivo pai nao encontrado.');
    const children=[...state.values()].filter((node)=>node.parentId===parentId);
    const nextProgress=weightedChildrenProgress(children);
    changes.push({id:parent.id,previousValue:parent.currentValue,currentValue:parent.currentValue,
      previousProgress:parent.progress,progress:nextProgress,origin:'CASCATA'});
    parent.progress=nextProgress;
    recomputeParent(parent.parentId,new Set([...path,parentId]));
  };
  recomputeParent(leaf.parentId,new Set([leaf.id]));
  return {nodes:[...state.values()],changes};
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateLeafProgress,calculateWeightedEvaluation,cascadeOkrProgress,scoreToQuadrant} from '../src/performance/domain/performanceEngine.js';
import type {EvaluationAnswer,OkrNode} from '../src/performance/domain/types.js';

test('calcula avaliacao 360 por pergunta, avaliacao e tipo de avaliador',()=>{
  const answers:EvaluationAnswer[]=[
    {evaluationId:1,evaluatorType:'GESTOR',dimension:'DESEMPENHO',score:5,questionWeight:1},
    {evaluationId:1,evaluatorType:'GESTOR',dimension:'DESEMPENHO',score:4,questionWeight:1},
    {evaluationId:2,evaluatorType:'PAR',dimension:'DESEMPENHO',score:3,questionWeight:1},
    {evaluationId:1,evaluatorType:'GESTOR',dimension:'POTENCIAL',score:4,questionWeight:1},
    {evaluationId:2,evaluatorType:'PAR',dimension:'POTENCIAL',score:5,questionWeight:1},
  ];
  const result=calculateWeightedEvaluation(answers,{AUTOAVALIACAO:10,GESTOR:40,PAR:30,LIDERADO:20});
  assert.equal(result.desempenho,77.14);
  assert.equal(result.potencial,88.57);
  assert.equal(result.totalAvaliacoes,2);
  assert.deepEqual(result.distribuicao,{GESTOR:1,PAR:1});
});

test('normaliza pesos disponiveis sem punir tipos que nao responderam',()=>{
  const result=calculateWeightedEvaluation([
    {evaluationId:7,evaluatorType:'GESTOR',dimension:'DESEMPENHO',score:5,questionWeight:2},
  ],{GESTOR:40,PAR:60,AUTOAVALIACAO:0,LIDERADO:0});
  assert.equal(result.desempenho,100);
  assert.equal(result.potencial,0);
});

test('calcula progresso de meta crescente e decrescente com limites',()=>{
  assert.equal(calculateLeafProgress(60,0,100),60);
  assert.equal(calculateLeafProgress(5,10,0),50);
  assert.equal(calculateLeafProgress(120,0,100),100);
});

test('recalcula recursivamente departamento e objetivo corporativo',()=>{
  const nodes:OkrNode[]=[
    {id:1,parentId:null,currentValue:0,initialValue:0,targetValue:100,weight:1,progress:30},
    {id:2,parentId:1,currentValue:0,initialValue:0,targetValue:100,weight:1,progress:30},
    {id:3,parentId:2,currentValue:20,initialValue:0,targetValue:100,weight:2,progress:20},
    {id:4,parentId:2,currentValue:80,initialValue:0,targetValue:100,weight:1,progress:80},
  ];
  const result=cascadeOkrProgress(nodes,3,60);
  assert.equal(result.nodes.find((node)=>node.id===3)?.progress,60);
  assert.equal(result.nodes.find((node)=>node.id===2)?.progress,66.6667);
  assert.equal(result.nodes.find((node)=>node.id===1)?.progress,66.6667);
  assert.deepEqual(result.changes.map((item)=>item.origin),['MANUAL','CASCATA','CASCATA']);
});

test('interrompe dependencia circular de OKR',()=>{
  const nodes:OkrNode[]=[
    {id:1,parentId:2,currentValue:0,initialValue:0,targetValue:100,weight:1,progress:0},
    {id:2,parentId:1,currentValue:0,initialValue:0,targetValue:100,weight:1,progress:0},
    {id:3,parentId:2,currentValue:20,initialValue:0,targetValue:100,weight:1,progress:20},
  ];
  assert.throws(()=>cascadeOkrProgress(nodes,3,40),/circular/);
  assert.equal(scoreToQuadrant(33.333),1);assert.equal(scoreToQuadrant(66.666),2);assert.equal(scoreToQuadrant(66.667),3);
});

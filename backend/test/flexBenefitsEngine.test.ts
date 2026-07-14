import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveApprovalLevels,simulateReceiptOcr,validateAllocation,validateReceiptFile} from '../src/flexBenefits/domain/flexBenefitsEngine.js';
import type {BenefitLimit} from '../src/flexBenefits/domain/types.js';

const limits:BenefitLimit[]=[
  {id:1,category:'VALE_REFEICAO',minimumPercent:20,maximumPercent:60,minimumCents:0,maximumCents:null,taxable:false},
  {id:2,category:'MOBILIDADE',minimumPercent:10,maximumPercent:40,minimumCents:0,maximumCents:null,taxable:true},
  {id:3,category:'SAUDE',minimumPercent:10,maximumPercent:50,minimumCents:0,maximumCents:null,taxable:false},
  {id:4,category:'EDUCACAO',minimumPercent:0,maximumPercent:30,minimumCents:0,maximumCents:null,taxable:true},
];

test('valida distribuicao em centavos e calcula saldo disponivel',()=>{
  const result=validateAllocation(100000,limits,[
    {category:'VALE_REFEICAO',amountCents:40000},{category:'MOBILIDADE',amountCents:30000},
    {category:'SAUDE',amountCents:20000},{category:'EDUCACAO',amountCents:10000},
  ]);
  assert.equal(result.allocatedCents,100000);assert.equal(result.availableCents,0);assert.equal(result.allocations[0]?.percent,40);
});

test('impede gasto duplo e violacao de limite tributario parametrizado',()=>{
  assert.throws(()=>validateAllocation(100000,limits,[
    {category:'VALE_REFEICAO',amountCents:60000},{category:'MOBILIDADE',amountCents:40000},
    {category:'SAUDE',amountCents:30000},{category:'EDUCACAO',amountCents:0},
  ]),/ultrapassa/);
  assert.throws(()=>validateAllocation(100000,limits,[
    {category:'VALE_REFEICAO',amountCents:10000},{category:'MOBILIDADE',amountCents:40000},
    {category:'SAUDE',amountCents:30000},{category:'EDUCACAO',amountCents:20000},
  ]),/VALE_REFEICAO/);
});

test('OCR simulado extrai CNPJ, data, valor e categoria sem confundir a data com valor',()=>{
  const buffer=Buffer.from([0xff,0xd8,0xff,0x01,0x02]);
  validateReceiptFile(buffer,'image/jpeg',buffer.length);
  const result=simulateReceiptOcr(buffer,'Uber_12345678000190_2026-07-14_32-40.jpg');
  assert.equal(result.cnpj,'12345678000190');assert.equal(result.date,'2026-07-14');assert.equal(result.amountCents,3240);assert.equal(result.category,'MOBILIDADE');assert.ok(result.confidence>=90);
  assert.throws(()=>validateReceiptFile(Buffer.from('arquivo'),'image/png',7),/assinatura/i);
});

test('seleciona esteira dinamica pelo valor solicitado',()=>{
  const rules=[{minimumCents:1,maximumCents:50000,levels:['GESTOR']},{minimumCents:50001,maximumCents:null,levels:['GESTOR','DIRETORIA']}];
  assert.deepEqual(resolveApprovalLevels(50000,rules),['GESTOR']);
  assert.deepEqual(resolveApprovalLevels(50001,rules),['GESTOR','DIRETORIA']);
});

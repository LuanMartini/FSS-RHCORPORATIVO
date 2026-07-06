import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularFGTS, calcularINSS, calcularIRRF, montarHolerite } from '../src/services/payrollService.js';

test('calcula FGTS sobre salario base', () => {
  assert.equal(calcularFGTS(5000), 400);
});

test('calcula INSS progressivo com teto', () => {
  assert.equal(calcularINSS(12000).toFixed(2), '908.86');
  assert.equal(calcularINSS(1412).toFixed(2), '105.90');
});

test('calcula IRRF zerado para base isenta', () => {
  assert.equal(calcularIRRF(2000), 0);
});

test('monta holerite publico com totais consistentes', () => {
  const holerite = montarHolerite({
    id: 1,
    nome: 'Amanda Souza',
    cpf: '12345678901',
    salario: 4200,
    cargo_id: 1,
  }, new Date('2026-07-01T00:00:00'));

  assert.equal(holerite.funcionario.nome, 'Amanda Souza');
  assert.equal(holerite.mesReferencia, 7);
  assert.equal(holerite.anoReferencia, 2026);
  assert.equal(holerite.vencimentos.salarioBase, '4200.00');
  assert.ok(Number(holerite.totalLiquido) < Number(holerite.totalBruto));
});

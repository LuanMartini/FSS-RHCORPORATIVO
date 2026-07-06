import test from 'node:test';
import assert from 'node:assert/strict';
import {
  optionalDate,
  positiveInteger,
  positiveNumber,
  requiredString,
  validEmail,
  validate,
} from '../src/utils/validation.js';

test('valida campos obrigatorios e limites', () => {
  assert.equal(requiredString('', 'Nome'), 'Nome e obrigatorio.');
  assert.equal(requiredString('Ana', 'Nome'), '');
});

test('valida e-mail', () => {
  assert.equal(validEmail('ana@empresa.com'), '');
  assert.equal(validEmail('ana'), 'E-mail invalido.');
});

test('valida numeros positivos', () => {
  assert.equal(positiveNumber(10, 'Salario'), '');
  assert.equal(positiveNumber(0, 'Salario'), 'Salario deve ser maior que zero.');
  assert.equal(positiveInteger(2, 'Cargo'), '');
  assert.equal(positiveInteger(2.5, 'Cargo'), 'Cargo deve ser um inteiro positivo.');
});

test('valida datas opcionais', () => {
  assert.equal(optionalDate('', 'Data'), '');
  assert.equal(optionalDate('2026-07-06', 'Data'), '');
  assert.equal(optionalDate('06/07/2026', 'Data'), 'Data deve estar no formato AAAA-MM-DD.');
});

test('agrega erros', () => {
  assert.deepEqual(validate(['', 'Erro']), ['Erro']);
  assert.equal(validate(['', '']), null);
});

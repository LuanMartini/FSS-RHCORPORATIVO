import assert from 'node:assert/strict';
import test from 'node:test';
import { benefitValue, cents } from '../src/payroll/application/payrollBatchProcessor.ts';

test('calcula valores de benefícios com valor fixo, percentual e valor padrão', () => {
  const salary = 1_000_000n;

  assert.equal(cents('1500'), 1500n);
  assert.equal(benefitValue({ valor_funcionario_centavos: 12_345 }, salary), 12_345n);
  assert.equal(benefitValue({ percentual_funcionario_milionesimos: 150_000 }, salary), 150_000n);
  assert.equal(benefitValue({ percentual_salario_milionesimos: 80_000 }, salary), 80_000n);
  assert.equal(benefitValue({ valor_padrao_centavos: 9_999 }, salary), 9_999n);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { dashboard, ledgerEntries, verifyLedger } from '../src/audit/application/auditService.ts';

test('bloqueia consultas de auditoria sem identidade autenticada', async () => {
  await assert.rejects(() => verifyLedger(0), { code: 'INVALID_IDENTITY' });
  await assert.rejects(() => ledgerEntries(0, 50), { code: 'INVALID_IDENTITY' });
  await assert.rejects(() => dashboard(0, 12), { code: 'INVALID_IDENTITY' });
});

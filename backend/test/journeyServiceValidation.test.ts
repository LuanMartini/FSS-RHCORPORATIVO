import assert from 'node:assert/strict';
import test from 'node:test';
import { createAdjustment, decideAdjustment, getMirror, getReceipt, registerPoint } from '../src/jornada/application/journeyService.ts';

test('rejeita entradas inválidas antes de persistir eventos de jornada', async () => {
  await assert.rejects(() => getReceipt(0), /NSR invalido/);
  await assert.rejects(() => getMirror({ collaboratorId: 0, start: '2026-01-01', end: '2026-01-31' }), /Colaborador invalido/);
  await assert.rejects(() => createAdjustment({
    collaboratorId: 1, referenceDate: 'invalida', type: 'ABONO', justification: 'Justificativa válida para teste',
  }), /Data de referencia invalida/);
  await assert.rejects(() => decideAdjustment({ id: 1, level: 'RH', decision: 'PENDENTE', userId: 1 }), /Decisao invalida/);
  await assert.rejects(() => registerPoint({
    collaboratorId: 1, type: 'INVALIDO', latitude: 0, longitude: 0, accuracyMeters: 0,
    photoBase64: '', idempotencyKey: '', collectorId: '', ipAddress: null, userAgent: null,
  }), /Tipo de marcacao invalido/);
});

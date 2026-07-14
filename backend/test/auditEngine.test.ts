import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildTurnoverAlerts, calculatePayEquity } from '../src/audit/domain/analyticsEngine.js';
import { GENESIS_HASH, ledgerHash, ledgerHmac, stableSerialize } from '../src/audit/domain/auditEngine.js';
import type { EquityRecord, LedgerCanonicalEntry } from '../src/audit/domain/types.js';
import { readAnchor, writeAnchor } from '../src/audit/application/auditSecurity.js';

const entry = (eventId: string, payloadHash = 'a'.repeat(64)): LedgerCanonicalEntry => ({
  eventId, timestamp: '2026-07-14T12:00:00.000Z', actorUserId: 1, actorReference: 'usuario:1',
  action: 'ALTERACAO_SALARIAL', resourceType: 'COLABORADOR', resourceId: '42', ip: '127.0.0.1',
  userAgentHash: 'b'.repeat(64), correlationId: 'f7d9121f-35cd-451c-a7cc-9ebff268b002',
  payloadHash, keyVersion: 1,
});

test('serializacao canonica independe da ordem das chaves', () => {
  assert.equal(stableSerialize({ b: 2, a: { d: 4, c: 3 } }), stableSerialize({ a: { c: 3, d: 4 }, b: 2 }));
});

test('ledger encadeia hashes e evidencia adulteracao de qualquer payload', () => {
  const first = ledgerHash(GENESIS_HASH, entry('3f1b2f56-522b-489b-9a84-4ecba202a033'));
  const second = ledgerHash(first, entry('5e556cc5-a71f-4983-b4f7-37bfd9076988'));
  const tamperedFirst = ledgerHash(GENESIS_HASH, entry('3f1b2f56-522b-489b-9a84-4ecba202a033', 'c'.repeat(64)));
  assert.notEqual(first, tamperedFirst);
  assert.notEqual(second, ledgerHash(tamperedFirst, entry('5e556cc5-a71f-4983-b4f7-37bfd9076988')));
  assert.notEqual(ledgerHmac('secret-1', second), ledgerHmac('secret-2', second));
});

test('alerta de turnover compara duas janelas de 90 dias', () => {
  const alerts = buildTurnoverAlerts([{ department: 'Tecnologia', recentVoluntary: 6, previousVoluntary: 4, averageTenureYears: 1.2 }]);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0]?.changePercent, 50);
  assert.match(alerts[0]?.message ?? '', /1.2 anos/);
});

test('pay equity ajusta por tempo de casa e suprime grupos pequenos', () => {
  const records: EquityRecord[] = [
    { anonymousId: 'a', department: 'TI', role: 'Dev', salaryCents: 600000, tenureYears: 1, gender: 'FEMININO', race: null, disability: null },
    { anonymousId: 'b', department: 'TI', role: 'Dev', salaryCents: 700000, tenureYears: 2, gender: 'FEMININO', race: null, disability: null },
    { anonymousId: 'c', department: 'TI', role: 'Dev', salaryCents: 800000, tenureYears: 3, gender: 'FEMININO', race: null, disability: null },
    { anonymousId: 'd', department: 'TI', role: 'Dev', salaryCents: 900000, tenureYears: 4, gender: 'MASCULINO', race: null, disability: null },
  ];
  const result = calculatePayEquity(records, 3);
  assert.equal(result.points.length, 4);
  assert.equal(result.gaps.filter((gap) => gap.dimension === 'Genero').length, 1);
  assert.equal(result.gaps[0]?.group, 'FEMININO');
});

test('ancora atomica nunca regride sob escritas concorrentes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'rhcorp-audit-'));
  const previousPath = process.env.AUDIT_ANCHOR_PATH;
  process.env.AUDIT_ANCHOR_PATH = join(directory, 'anchor.json');
  try {
    await Promise.all([
      writeAnchor(4, '4'.repeat(64)), writeAnchor(6, '6'.repeat(64)), writeAnchor(5, '5'.repeat(64)),
    ]);
    const anchor = await readAnchor();
    assert.equal(anchor?.ledgerId, 6);
    assert.equal(anchor?.hash, '6'.repeat(64));
  } finally {
    if (previousPath === undefined) delete process.env.AUDIT_ANCHOR_PATH;
    else process.env.AUDIT_ANCHOR_PATH = previousPath;
    await rm(directory, { recursive: true, force: true });
  }
});

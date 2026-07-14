import test from 'node:test';
import assert from 'node:assert/strict';
import { compareBiometric, biometricTemplate } from '../src/jornada/domain/biometric.ts';
import { validateGeofence } from '../src/jornada/domain/geofence.ts';
import { calculateMonthlyMirror } from '../src/jornada/domain/journeyEngine.ts';
import type { MirrorPunch, WorkSchedule } from '../src/jornada/domain/types.ts';

function schedule(overrides: Partial<WorkSchedule> = {}): WorkSchedule {
  return {
    id: 1, name: 'Administrativo', type: '5X2', timezone: 'America/Sao_Paulo',
    validFrom: '2020-01-01', assignmentStart: '2026-01-01', cycleOffset: 0,
    defaultMinutes: 480, breakMinutes: 60, lateToleranceMinutes: 5,
    startTime: '08:00', endTime: '17:00', nightStart: '22:00', nightEnd: '05:00',
    reducedNightHourMinutes: 52.5, config: { diasSemana: [1, 2, 3, 4, 5] },
    ...overrides,
  };
}

function punch(id: number, type: MirrorPunch['type'], at: string): MirrorPunch {
  return { id, nsr: id, type, at, source: 'ORIGINAL' };
}

test('valida geofence radial considerando distancia e precisao do GPS', () => {
  const geofence = {
    type: 'RAIO' as const,
    center: { latitude: -23.55052, longitude: -46.633308 },
    radiusMeters: 200,
    polygon: null,
    gpsToleranceMeters: 50,
  };
  assert.equal(validateGeofence({ latitude: -23.5505, longitude: -46.6333, accuracyMeters: 8 }, geofence).allowed, true);
  assert.equal(validateGeofence({ latitude: -23.56, longitude: -46.64, accuracyMeters: 8 }, geofence).allowed, false);
  assert.match(validateGeofence({ latitude: -23.5505, longitude: -46.6333, accuracyMeters: 90 }, geofence).reason ?? '', /Precisao/);
});

test('calcula jornada 5x2 com intervalo, extra 50 e atraso', () => {
  const mirror = calculateMonthlyMirror({
    start: '2026-07-13', end: '2026-07-13', schedule: schedule(),
    punches: [
      punch(1, 'ENTRADA', '2026-07-13T08:15:00-03:00'),
      punch(2, 'INTERVALO_INICIO', '2026-07-13T12:00:00-03:00'),
      punch(3, 'INTERVALO_FIM', '2026-07-13T13:00:00-03:00'),
      punch(4, 'SAIDA', '2026-07-13T18:15:00-03:00'),
    ],
    now: new Date('2026-07-14T00:00:00Z'),
  });
  assert.equal(mirror.days[0]?.workedMinutes, 540);
  assert.equal(mirror.days[0]?.extra50Minutes, 60);
  assert.equal(mirror.days[0]?.delayMinutes, 10);
  assert.equal(mirror.totals.bankDeltaMinutes, 60);
});

test('aplica hora noturna reduzida de 52m30s em jornada que cruza meia-noite', () => {
  const nightSchedule = schedule({
    type: 'FLEXIVEL', name: 'Noturna flexivel', defaultMinutes: 420,
    startTime: '22:00', endTime: '05:00', config: { diasSemana: [2] },
  });
  const mirror = calculateMonthlyMirror({
    start: '2026-07-14', end: '2026-07-14', schedule: nightSchedule,
    punches: [
      punch(1, 'ENTRADA', '2026-07-14T22:00:00-03:00'),
      punch(2, 'SAIDA', '2026-07-15T05:00:00-03:00'),
    ],
  });
  assert.equal(mirror.days[0]?.workedMinutes, 420);
  assert.equal(mirror.days[0]?.reducedNightMinutes, 480);
  assert.equal(mirror.days[0]?.inconsistencies.length, 0);
});

test('escala 12x36 alterna trabalho e folga e marca ausencia somente no plantao', () => {
  const shift = schedule({ type: '12X36', defaultMinutes: 720, assignmentStart: '2026-07-14', startTime: '07:00', endTime: '19:00' });
  const mirror = calculateMonthlyMirror({ start: '2026-07-14', end: '2026-07-15', schedule: shift, punches: [] });
  assert.equal(mirror.days[0]?.absence, true);
  assert.equal(mirror.days[0]?.negativeMinutes, 720);
  assert.equal(mirror.days[1]?.absence, false);
  assert.equal(mirror.days[1]?.expectedMinutes, 0);
});

test('biometria simulada aprova template identico com alta confianca', () => {
  const photo = Buffer.alloc(2_000, 7);
  const comparison = compareBiometric(biometricTemplate(photo), photo);
  assert.equal(comparison.approved, true);
  assert.equal(comparison.confidence, 99.9);
});

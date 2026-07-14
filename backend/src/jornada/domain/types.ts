export const PUNCH_TYPES = ['ENTRADA', 'INTERVALO_INICIO', 'INTERVALO_FIM', 'SAIDA'] as const;
export type PunchType = typeof PUNCH_TYPES[number];
export type ScheduleType = '12X36' | '6X1' | '5X2' | 'ROTATIVA' | 'FLEXIVEL';
export type PunchSource = 'ORIGINAL' | 'TRATADA' | 'PRE_ASSINALADA';

export interface Coordinates {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
}

export interface Geofence {
  type: 'RAIO' | 'POLIGONO';
  center: Coordinates;
  radiusMeters: number | null;
  polygon: ReadonlyArray<readonly [number, number]> | null;
  gpsToleranceMeters: number;
}

export interface GeofenceResult {
  allowed: boolean;
  distanceMeters: number;
  reason: string | null;
}

export interface CycleDay {
  trabalha: boolean;
  minutos?: number;
  entrada?: string;
  saida?: string;
  extra100?: boolean;
}

export interface ScheduleConfig {
  diasSemana?: number[];
  cicloDias?: number;
  diasTrabalho?: number[];
  ciclo?: CycleDay[];
  extra100DomingoFeriado?: boolean;
  extra100Folga?: boolean;
  trabalhaFeriado?: boolean;
}

export interface WorkSchedule {
  id: number;
  name: string;
  type: ScheduleType;
  timezone: string;
  validFrom: string;
  assignmentStart: string;
  cycleOffset: number;
  defaultMinutes: number;
  breakMinutes: number;
  lateToleranceMinutes: number;
  startTime: string | null;
  endTime: string | null;
  nightStart: string;
  nightEnd: string;
  reducedNightHourMinutes: number;
  config: ScheduleConfig;
}

export interface MirrorPunch {
  id: number;
  nsr: number | null;
  type: PunchType;
  at: string;
  source: PunchSource;
  treatedReason?: string;
}

export interface DayMirror {
  date: string;
  weekday: number;
  expectedMinutes: number;
  workedMinutes: number;
  extra50Minutes: number;
  extra100Minutes: number;
  negativeMinutes: number;
  delayMinutes: number;
  reducedNightMinutes: number;
  bankDeltaMinutes: number;
  bankBalanceMinutes: number;
  absence: boolean;
  excused: boolean;
  holiday: string | null;
  inconsistencies: string[];
  punches: MirrorPunch[];
}

export interface MirrorTotals {
  expectedMinutes: number;
  workedMinutes: number;
  extra50Minutes: number;
  extra100Minutes: number;
  negativeMinutes: number;
  delayMinutes: number;
  reducedNightMinutes: number;
  bankDeltaMinutes: number;
  bankBalanceMinutes: number;
  absences: number;
}

export interface MonthlyMirror {
  period: { start: string; end: string };
  schedule: WorkSchedule;
  days: DayMirror[];
  totals: MirrorTotals;
  generatedAt: string;
  engineVersion: string;
}

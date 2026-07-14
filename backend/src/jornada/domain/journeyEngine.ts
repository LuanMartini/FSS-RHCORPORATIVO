import type { DayMirror, MirrorPunch, MonthlyMirror, WorkSchedule } from './types.ts';

export const JOURNEY_ENGINE_VERSION = '2.0.0';

interface Holiday { date: string; name: string }
interface Segment { start: Date; end: Date }

function dateParts(date: Date, timezone: string): Record<string, string> {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function localDateKey(date: Date, timezone: string): string {
  const parts = dateParts(date, timezone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function localMinute(date: Date, timezone: string): number {
  const parts = dateParts(date, timezone);
  return Number(parts.hour) * 60 + Number(parts.minute);
}

function addDays(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function weekday(dateKey: string): number {
  return new Date(`${dateKey}T12:00:00Z`).getUTCDay();
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

function timeMinutes(time: string | null): number | null {
  if (!time) return null;
  const [hours = '0', minutes = '0'] = time.slice(0, 5).split(':');
  return Number(hours) * 60 + Number(minutes);
}

function zonedLocalToUtc(dateKey: string, time: string, timezone: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  const [hour = 0, minute = 0, second = 0] = time.split(':').map(Number);
  const guess = Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1, hour, minute, second);
  const guessedParts = dateParts(new Date(guess), timezone);
  const representedAsUtc = Date.UTC(
    Number(guessedParts.year), Number(guessedParts.month) - 1, Number(guessedParts.day),
    Number(guessedParts.hour), Number(guessedParts.minute), Number(guessedParts.second),
  );
  return new Date(guess - (representedAsUtc - guess));
}

function plannedDay(date: string, schedule: WorkSchedule): { works: boolean; minutes: number; extra100: boolean } {
  const dayOfWeek = weekday(date);
  const elapsed = daysBetween(schedule.assignmentStart, date) + schedule.cycleOffset;
  if (schedule.type === '12X36') {
    const works = ((elapsed % 2) + 2) % 2 === 0;
    return { works, minutes: works ? schedule.defaultMinutes : 0, extra100: !works };
  }
  if (schedule.type === '6X1') {
    const works = ((elapsed % 7) + 7) % 7 < 6;
    return { works, minutes: works ? schedule.defaultMinutes : 0, extra100: !works };
  }
  if (schedule.type === 'ROTATIVA' && schedule.config.ciclo?.length) {
    const cycleIndex = ((elapsed % schedule.config.ciclo.length) + schedule.config.ciclo.length) % schedule.config.ciclo.length;
    const rule = schedule.config.ciclo[cycleIndex];
    return { works: rule?.trabalha ?? false, minutes: rule?.trabalha ? (rule.minutos ?? schedule.defaultMinutes) : 0, extra100: rule?.extra100 ?? false };
  }
  const workdays = schedule.config.diasSemana ?? [1, 2, 3, 4, 5];
  const works = workdays.includes(dayOfWeek);
  return { works, minutes: works ? schedule.defaultMinutes : 0, extra100: !works && (schedule.config.extra100Folga ?? true) };
}

function pairSegments(punches: MirrorPunch[]): { segments: Segment[]; inconsistencies: string[] } {
  const segments: Segment[] = [];
  const inconsistencies: string[] = [];
  let open: Date | null = null;
  for (const punch of punches) {
    const at = new Date(punch.at);
    const opens = punch.type === 'ENTRADA' || punch.type === 'INTERVALO_FIM';
    if (opens) {
      if (open) inconsistencies.push(`Entrada duplicada as ${at.toISOString()}.`);
      else open = at;
      continue;
    }
    if (!open) {
      inconsistencies.push(`Saida sem entrada as ${at.toISOString()}.`);
      continue;
    }
    if (at <= open) inconsistencies.push('Marcacoes fora de ordem cronologica.');
    else segments.push({ start: open, end: at });
    open = null;
  }
  if (open) inconsistencies.push('Jornada aberta sem marcacao de saida.');
  return { segments, inconsistencies };
}

function segmentMinutes(segment: Segment): number {
  return Math.max(0, Math.round((segment.end.getTime() - segment.start.getTime()) / 60_000));
}

function overlapMinutes(segment: Segment, start: Date, end: Date): number {
  const overlap = Math.min(segment.end.getTime(), end.getTime()) - Math.max(segment.start.getTime(), start.getTime());
  return Math.max(0, overlap / 60_000);
}

function reducedNightMinutes(segments: Segment[], schedule: WorkSchedule): number {
  let actualNightMinutes = 0;
  for (const segment of segments) {
    const localStart = localDateKey(segment.start, schedule.timezone);
    for (let offset = -1; offset <= 2; offset += 1) {
      const nightDate = addDays(localStart, offset);
      const nightStart = zonedLocalToUtc(nightDate, schedule.nightStart, schedule.timezone);
      const crossesMidnight = (timeMinutes(schedule.nightStart) ?? 0) >= (timeMinutes(schedule.nightEnd) ?? 0);
      const nightEndDate = crossesMidnight ? addDays(nightDate, 1) : nightDate;
      const nightEnd = zonedLocalToUtc(nightEndDate, schedule.nightEnd, schedule.timezone);
      actualNightMinutes += overlapMinutes(segment, nightStart, nightEnd);
    }
  }
  return Math.round(actualNightMinutes * 60 / schedule.reducedNightHourMinutes);
}

function sumDays(days: DayMirror[]): MonthlyMirror['totals'] {
  return days.reduce((totals, day) => ({
    expectedMinutes: totals.expectedMinutes + day.expectedMinutes,
    workedMinutes: totals.workedMinutes + day.workedMinutes,
    extra50Minutes: totals.extra50Minutes + day.extra50Minutes,
    extra100Minutes: totals.extra100Minutes + day.extra100Minutes,
    negativeMinutes: totals.negativeMinutes + day.negativeMinutes,
    delayMinutes: totals.delayMinutes + day.delayMinutes,
    reducedNightMinutes: totals.reducedNightMinutes + day.reducedNightMinutes,
    bankDeltaMinutes: totals.bankDeltaMinutes + day.bankDeltaMinutes,
    bankBalanceMinutes: day.bankBalanceMinutes,
    absences: totals.absences + (day.absence ? 1 : 0),
  }), {
    expectedMinutes: 0, workedMinutes: 0, extra50Minutes: 0, extra100Minutes: 0,
    negativeMinutes: 0, delayMinutes: 0, reducedNightMinutes: 0,
    bankDeltaMinutes: 0, bankBalanceMinutes: 0, absences: 0,
  });
}

export function calculateMonthlyMirror(input: {
  start: string;
  end: string;
  schedule: WorkSchedule;
  punches: MirrorPunch[];
  holidays?: Holiday[];
  excusedDates?: string[];
  initialBankMinutes?: number;
  now?: Date;
}): MonthlyMirror {
  const { start, end, schedule } = input;
  if (start > end) throw new Error('Periodo do espelho invalido.');
  const holidays = new Map((input.holidays ?? []).map((holiday) => [holiday.date, holiday.name]));
  const excusedDates = new Set(input.excusedDates ?? []);
  const grouped = new Map<string, MirrorPunch[]>();
  const overnight = (timeMinutes(schedule.startTime) ?? 0) > (timeMinutes(schedule.endTime) ?? 1_440);
  const overnightEnd = timeMinutes(schedule.endTime) ?? 0;
  for (const punch of input.punches) {
    const at = new Date(punch.at);
    let key = localDateKey(at, schedule.timezone);
    if (overnight && localMinute(at, schedule.timezone) <= overnightEnd) key = addDays(key, -1);
    const current = grouped.get(key) ?? [];
    current.push(punch);
    grouped.set(key, current);
  }

  const days: DayMirror[] = [];
  let balance = input.initialBankMinutes ?? 0;
  for (let date = start; date <= end; date = addDays(date, 1)) {
    const punches = [...(grouped.get(date) ?? [])].sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
    const plan = plannedDay(date, schedule);
    const holiday = holidays.get(date) ?? null;
    const excused = excusedDates.has(date);
    const expectedMinutes = holiday && !schedule.config.trabalhaFeriado ? 0 : plan.minutes;
    const { segments, inconsistencies } = pairSegments(punches);
    const workedMinutes = segments.reduce((total, segment) => total + segmentMinutes(segment), 0);
    const overtime = Math.max(0, workedMinutes - expectedMinutes);
    const isExtra100 = holiday != null || plan.extra100 || weekday(date) === 0 && (schedule.config.extra100DomingoFeriado ?? true);
    const extra100Minutes = isExtra100 ? overtime : 0;
    const extra50Minutes = isExtra100 ? 0 : overtime;
    const negativeMinutes = excused ? 0 : Math.max(0, expectedMinutes - workedMinutes);
    const firstEntry = punches.find((punch) => punch.type === 'ENTRADA');
    const plannedStart = timeMinutes(schedule.startTime);
    const delayMinutes = schedule.type !== 'FLEXIVEL' && firstEntry && plannedStart != null
      ? Math.max(0, localMinute(new Date(firstEntry.at), schedule.timezone) - plannedStart - schedule.lateToleranceMinutes)
      : 0;
    const nightMinutes = reducedNightMinutes(segments, schedule);
    const bankDeltaMinutes = overtime - negativeMinutes;
    balance += bankDeltaMinutes;
    days.push({
      date, weekday: weekday(date), expectedMinutes, workedMinutes, extra50Minutes,
      extra100Minutes, negativeMinutes, delayMinutes, reducedNightMinutes: nightMinutes,
      bankDeltaMinutes, bankBalanceMinutes: balance,
      absence: !excused && expectedMinutes > 0 && workedMinutes === 0,
      excused,
      holiday, inconsistencies, punches,
    });
  }
  const totals = sumDays(days);
  totals.bankBalanceMinutes = balance;
  return {
    period: { start, end }, schedule, days, totals,
    generatedAt: (input.now ?? new Date()).toISOString(), engineVersion: JOURNEY_ENGINE_VERSION,
  };
}

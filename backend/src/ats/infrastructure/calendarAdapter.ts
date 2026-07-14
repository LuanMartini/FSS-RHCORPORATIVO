import { randomUUID } from 'node:crypto';

export function prepareCalendarEvent(providerInput: unknown): { provider: 'INTERNO' | 'GOOGLE' | 'OUTLOOK'; status: string; meetingUrl: string | null } {
  const provider = String(providerInput ?? 'INTERNO').toUpperCase();
  if (provider === 'INTERNO') {
    return { provider, status: 'AGENDADA', meetingUrl: `https://meet.jit.si/rhcorp-${randomUUID()}` };
  }
  if (provider === 'GOOGLE' || provider === 'OUTLOOK') {
    const configured = provider === 'GOOGLE' ? process.env.GOOGLE_CALENDAR_CLIENT_ID : process.env.OUTLOOK_CALENDAR_CLIENT_ID;
    return { provider, status: configured ? 'PENDENTE_SINCRONIZACAO' : 'PENDENTE_SINCRONIZACAO', meetingUrl: null };
  }
  throw Object.assign(new Error('Provedor de calendario invalido.'), { status: 400 });
}

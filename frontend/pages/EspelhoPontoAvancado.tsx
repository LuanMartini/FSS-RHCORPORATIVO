import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import ClockModal from '../components/jornada/ClockModal';
import { apiFetch, apiFormData } from '../services/api';
import type { EspelhoPonto, JornadaColaborador, JornadaConfig, RegistroPontoResposta, SolicitacaoAjuste, TipoMarcacao } from '../types/jornada';

const week = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function isoDate(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function currentMonth(): { start: string; end: string } {
  const now = new Date();
  return { start: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)), end: isoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)) };
}

function hours(minutes: number, signed = false): string {
  const sign = minutes < 0 ? '−' : signed && minutes > 0 ? '+' : '';
  const absolute = Math.abs(Math.round(minutes));
  return `${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`;
}

function time(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).format(new Date(value));
}

function statusStyle(status: SolicitacaoAjuste['status']): string {
  if (status === 'APROVADO') return 'bg-emerald-50 text-emerald-700';
  if (status.startsWith('REPROVADO')) return 'bg-red-50 text-red-700';
  if (status === 'PENDENTE_RH') return 'bg-violet-50 text-violet-700';
  return 'bg-amber-50 text-amber-700';
}

interface AdjustmentForm {
  type: 'INCLUSAO_MARCACAO' | 'ATESTADO' | 'ABONO';
  referenceDate: string;
  requestedAt: string;
  punchType: TipoMarcacao;
  justification: string;
  file: File | null;
}

export default function EspelhoPontoAvancado() {
  const bounds = useMemo(currentMonth, []);
  const [collaborators, setCollaborators] = useState<JornadaColaborador[]>([]);
  const [collaboratorId, setCollaboratorId] = useState<number | null>(null);
  const [start, setStart] = useState(bounds.start);
  const [end, setEnd] = useState(bounds.end);
  const [mirror, setMirror] = useState<EspelhoPonto | null>(null);
  const [config, setConfig] = useState<JornadaConfig | null>(null);
  const [adjustments, setAdjustments] = useState<SolicitacaoAjuste[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [clockOpen, setClockOpen] = useState(false);
  const [adjustmentOpen, setAdjustmentOpen] = useState(false);
  const [savingAdjustment, setSavingAdjustment] = useState(false);
  const [receipt, setReceipt] = useState<RegistroPontoResposta | null>(null);
  const [form, setForm] = useState<AdjustmentForm>({
    type: 'INCLUSAO_MARCACAO', referenceDate: isoDate(new Date()), requestedAt: '',
    punchType: 'ENTRADA', justification: '', file: null,
  });

  useEffect(() => {
    void apiFetch<JornadaColaborador[]>('/jornada/colaboradores')
      .then((data) => { setCollaborators(data); setCollaboratorId((current) => current ?? data[0]?.id ?? null); })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Falha ao carregar colaboradores.'));
  }, []);

  const load = useCallback(async () => {
    if (!collaboratorId) return;
    setLoading(true);
    setError('');
    try {
      const [mirrorData, configData, adjustmentData] = await Promise.all([
        apiFetch<EspelhoPonto>(`/jornada/espelho/${collaboratorId}?inicio=${start}&fim=${end}`),
        apiFetch<JornadaConfig>(`/jornada/configuracao/${collaboratorId}`),
        apiFetch<SolicitacaoAjuste[]>(`/jornada/ajustes?colaboradorId=${collaboratorId}`),
      ]);
      setMirror(mirrorData);
      setConfig(configData);
      setAdjustments(adjustmentData);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao calcular espelho de ponto.');
      setMirror(null);
    } finally { setLoading(false); }
  }, [collaboratorId, start, end]);

  useEffect(() => { void load(); }, [load]);

  const clientAudit = useMemo(() => {
    if (!mirror) return { worked: 0, bankDelta: 0, consistent: false };
    const worked = mirror.days.reduce((total, day) => total + day.workedMinutes, 0);
    const bankDelta = mirror.days.reduce((total, day) => total + day.bankDeltaMinutes, 0);
    return { worked, bankDelta, consistent: worked === mirror.totals.workedMinutes && bankDelta === mirror.totals.bankDeltaMinutes };
  }, [mirror]);

  async function submitAdjustment(event: FormEvent) {
    event.preventDefault();
    if (!collaboratorId) return;
    setSavingAdjustment(true);
    setError('');
    try {
      const data = new FormData();
      data.set('colaboradorId', String(collaboratorId));
      data.set('dataReferencia', form.referenceDate);
      data.set('tipo', form.type);
      data.set('justificativa', form.justification);
      if (form.type === 'INCLUSAO_MARCACAO') {
        data.set('tipoMarcacao', form.punchType);
        data.set('horarioSolicitado', new Date(form.requestedAt).toISOString());
      }
      if (form.file) data.set('anexo', form.file);
      await apiFormData('/jornada/ajustes', data);
      setAdjustmentOpen(false);
      setForm({ type: 'INCLUSAO_MARCACAO', referenceDate: isoDate(new Date()), requestedAt: '', punchType: 'ENTRADA', justification: '', file: null });
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Falha ao solicitar ajuste.'); }
    finally { setSavingAdjustment(false); }
  }

  async function decide(adjustment: SolicitacaoAjuste, level: 'gestor' | 'rh', decision: 'APROVADO' | 'REPROVADO') {
    const manager = config?.collaborator.managerId
      ?? collaborators.find((item) => item.id !== adjustment.colaborador_id)?.id
      ?? adjustment.colaborador_id;
    setError('');
    try {
      await apiFetch(`/jornada/ajustes/${adjustment.id}/${level}`, {
        method: 'PATCH', body: JSON.stringify({
          decisao: decision, observacao: `${decision === 'APROVADO' ? 'Aprovado' : 'Reprovado'} pelo painel`,
          ...(level === 'gestor' ? { gestorColaboradorId: manager } : {}),
        }),
      });
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Falha ao processar aprovação.'); }
  }

  function registered(result: RegistroPontoResposta) {
    setReceipt(result);
    setClockOpen(false);
    void load();
  }

  return (
    <div className="space-y-6 pb-24">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-700">Jornada & IoT</p><h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Espelho de ponto</h1><p className="mt-2 max-w-2xl text-sm text-slate-500">Marcações originais imutáveis, tratamento auditável e banco de horas calculado pelo motor de jornada.</p></div>
        <div className="flex flex-wrap gap-2"><button type="button" onClick={() => setAdjustmentOpen(true)} disabled={!collaboratorId} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50">Solicitar ajuste</button><button type="button" onClick={() => void load()} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white">Recalcular</button></div>
      </header>

      {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {receipt && <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><div><p className="text-sm font-semibold text-emerald-900">Marcação registrada · NSR {receipt.nsr}</p><p className="mt-1 text-xs text-emerald-700">Biometria {receipt.biometricConfidence.toFixed(1)}% · distância {receipt.distanceMeters.toFixed(0)} m · hash {receipt.hashSha256.slice(0, 16)}…</p></div><button type="button" onClick={() => setReceipt(null)} className="text-xs font-semibold text-emerald-800">Ocultar</button></div>}

      <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[1.5fr_1fr_1fr_auto]">
        <label className="text-xs font-semibold text-slate-500">Colaborador<select value={collaboratorId ?? ''} onChange={(event) => setCollaboratorId(Number(event.target.value))} className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800">{collaborators.map((item) => <option key={item.id} value={item.id}>{item.nomeCompleto} · {item.filialCodigo}</option>)}</select></label>
        <label className="text-xs font-semibold text-slate-500">Início<input type="date" value={start} onChange={(event) => setStart(event.target.value)} className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800" /></label>
        <label className="text-xs font-semibold text-slate-500">Fim<input type="date" value={end} onChange={(event) => setEnd(event.target.value)} className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800" /></label>
        <div className="flex items-end"><span className={`rounded-xl px-3 py-2.5 text-xs font-semibold ${clientAudit.consistent ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{clientAudit.consistent ? '✓ Front/back conferidos' : 'Aguardando cálculo'}</span></div>
      </section>

      {mirror && <>
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-8">
          {[
            ['Trabalhadas', hours(mirror.totals.workedMinutes), 'text-slate-950'],
            ['Previstas', hours(mirror.totals.expectedMinutes), 'text-slate-950'],
            ['Extra 50%', hours(mirror.totals.extra50Minutes), 'text-sky-700'],
            ['Extra 100%', hours(mirror.totals.extra100Minutes), 'text-violet-700'],
            ['Negativas', hours(mirror.totals.negativeMinutes), 'text-red-700'],
            ['Atrasos', hours(mirror.totals.delayMinutes), 'text-amber-700'],
            ['Noturnas', hours(mirror.totals.reducedNightMinutes), 'text-indigo-700'],
            ['Banco', hours(mirror.totals.bankBalanceMinutes, true), mirror.totals.bankBalanceMinutes >= 0 ? 'text-emerald-700' : 'text-red-700'],
          ].map(([label, value, color]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-[11px] font-medium text-slate-400">{label}</p><p className={`mt-1 text-xl font-semibold ${color}`}>{value}</p></div>)}
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4"><div><h2 className="text-base font-semibold text-slate-950">Cartão mensal detalhado</h2><p className="text-xs text-slate-500">{mirror.schedule.name} · {mirror.schedule.type} · motor v{mirror.engineVersion}</p></div><span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">Hora noturna: 52m30s</span></div>
          <div className="overflow-x-auto"><table className="min-w-[1040px] w-full text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400"><tr><th className="px-4 py-3">Data</th><th className="px-4 py-3">Marcações</th><th className="px-4 py-3 text-right">Prev.</th><th className="px-4 py-3 text-right">Trab.</th><th className="px-4 py-3 text-right">50%</th><th className="px-4 py-3 text-right">100%</th><th className="px-4 py-3 text-right">Atraso</th><th className="px-4 py-3 text-right">Noturno</th><th className="px-4 py-3 text-right">Saldo</th><th className="px-4 py-3">Situação</th></tr></thead><tbody className="divide-y divide-slate-100">{mirror.days.map((day) => (
            <tr key={day.date} className={`${day.absence ? 'bg-red-50/50' : day.holiday ? 'bg-violet-50/40' : 'hover:bg-slate-50/60'}`}><td className="px-4 py-3"><p className="font-semibold text-slate-800">{day.date.slice(8, 10)}/{day.date.slice(5, 7)}</p><p className="text-[10px] text-slate-400">{week[day.weekday]}</p></td><td className="px-4 py-3"><div className="flex flex-wrap gap-1">{day.punches.map((punch) => <span key={`${punch.source}-${punch.id}`} title={punch.treatedReason} className={`rounded-md px-2 py-1 font-semibold ${punch.source === 'ORIGINAL' ? 'bg-slate-100 text-slate-700' : 'bg-violet-100 text-violet-700'}`}>{time(punch.at)}<sup className="ml-1 text-[8px]">{punch.source === 'ORIGINAL' ? `#${punch.nsr}` : 'T'}</sup></span>)}{day.punches.length === 0 && <span className="text-slate-300">—</span>}</div></td><td className="px-4 py-3 text-right text-slate-500">{hours(day.expectedMinutes)}</td><td className="px-4 py-3 text-right font-semibold text-slate-800">{hours(day.workedMinutes)}</td><td className="px-4 py-3 text-right text-sky-700">{hours(day.extra50Minutes)}</td><td className="px-4 py-3 text-right text-violet-700">{hours(day.extra100Minutes)}</td><td className="px-4 py-3 text-right text-amber-700">{hours(day.delayMinutes)}</td><td className="px-4 py-3 text-right text-indigo-700">{hours(day.reducedNightMinutes)}</td><td className={`px-4 py-3 text-right font-semibold ${day.bankDeltaMinutes >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{hours(day.bankDeltaMinutes, true)}</td><td className="px-4 py-3">{day.absence ? <span className="rounded-full bg-red-100 px-2 py-1 text-[10px] font-bold text-red-700">AUSÊNCIA</span> : day.excused ? <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold text-emerald-700">ABONADO</span> : day.inconsistencies.length ? <span title={day.inconsistencies.join(' ')} className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-700">INCONSISTENTE</span> : day.holiday ? <span className="text-violet-700">{day.holiday}</span> : <span className="text-emerald-600">Regular</span>}</td></tr>
          ))}</tbody></table></div>
        </section>
      </>}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="text-base font-semibold text-slate-950">Solicitações e aprovações</h2><p className="text-xs text-slate-500">Fluxo sequencial: gestor direto → Recursos Humanos.</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">{adjustments.length}</span></div><div className="mt-4 space-y-2">{adjustments.map((item) => <article key={`${item.id}-${item.solicitado_em}`} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 lg:flex-row lg:items-center"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold text-slate-800">{item.tipo.replaceAll('_', ' ')}</p><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusStyle(item.status)}`}>{item.status.replaceAll('_', ' ')}</span></div><p className="mt-1 truncate text-xs text-slate-500">{item.data_referencia.slice(0, 10)} · {item.justificativa}</p></div>{item.status === 'PENDENTE_GESTOR' && <div className="flex gap-2"><button type="button" onClick={() => void decide(item, 'gestor', 'APROVADO')} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">Gestor aprova</button><button type="button" onClick={() => void decide(item, 'gestor', 'REPROVADO')} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700">Reprovar</button></div>}{item.status === 'PENDENTE_RH' && <div className="flex gap-2"><button type="button" onClick={() => void decide(item, 'rh', 'APROVADO')} className="rounded-lg bg-violet-700 px-3 py-2 text-xs font-semibold text-white">RH aprova</button><button type="button" onClick={() => void decide(item, 'rh', 'REPROVADO')} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700">Reprovar</button></div>}</article>)}{adjustments.length === 0 && <p className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-400">Nenhuma solicitação no período.</p>}</div></section>

      <button type="button" onClick={() => setClockOpen(true)} disabled={!collaboratorId || !config} className="fixed bottom-6 right-6 z-30 flex h-16 items-center gap-3 rounded-full bg-sky-600 px-5 text-white shadow-2xl shadow-sky-600/30 transition hover:-translate-y-1 hover:bg-sky-700 disabled:opacity-40"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-xl">◉</span><span className="pr-2 text-sm font-bold">Bater ponto</span></button>

      {clockOpen && collaboratorId && config && <ClockModal collaboratorId={collaboratorId} config={config} onClose={() => setClockOpen(false)} onRegistered={registered} onBiometricEnrolled={() => setConfig({ ...config, collaborator: { ...config.collaborator, biometricEnrolled: true } })} />}

      {adjustmentOpen && <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/60 p-4" role="dialog" aria-modal="true"><form onSubmit={submitAdjustment} className="w-full max-w-lg space-y-4 rounded-3xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-violet-700">Tratamento de ponto</p><h2 className="text-xl font-semibold text-slate-950">Solicitar ajuste</h2></div><button type="button" onClick={() => setAdjustmentOpen(false)} className="text-slate-400">✕</button></div><label className="block text-xs font-semibold text-slate-500">Motivo<select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as AdjustmentForm['type'] })} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value="INCLUSAO_MARCACAO">Inclusão de marcação esquecida</option><option value="ATESTADO">Atestado médico</option><option value="ABONO">Solicitação de abono</option></select></label><label className="block text-xs font-semibold text-slate-500">Data de referência<input required type="date" value={form.referenceDate} onChange={(event) => setForm({ ...form, referenceDate: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label>{form.type === 'INCLUSAO_MARCACAO' && <div className="grid grid-cols-2 gap-3"><label className="text-xs font-semibold text-slate-500">Horário<input required type="datetime-local" value={form.requestedAt} onChange={(event) => setForm({ ...form, requestedAt: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label><label className="text-xs font-semibold text-slate-500">Marcação<select value={form.punchType} onChange={(event) => setForm({ ...form, punchType: event.target.value as TipoMarcacao })} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value="ENTRADA">Entrada</option><option value="INTERVALO_INICIO">Início intervalo</option><option value="INTERVALO_FIM">Fim intervalo</option><option value="SAIDA">Saída</option></select></label></div>}<label className="block text-xs font-semibold text-slate-500">Justificativa<textarea required minLength={10} value={form.justification} onChange={(event) => setForm({ ...form, justification: event.target.value })} className="mt-1 min-h-24 w-full rounded-xl border border-slate-200 p-3 text-sm" placeholder="Descreva o ocorrido com pelo menos 10 caracteres" /></label><label className="block text-xs font-semibold text-slate-500">Atestado ou comprovante (opcional)<input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(event) => setForm({ ...form, file: event.target.files?.[0] ?? null })} className="mt-1 block w-full rounded-xl border border-slate-200 p-2 text-xs" /></label><div className="flex gap-2 pt-2"><button disabled={savingAdjustment} className="flex-1 rounded-xl bg-slate-950 py-3 text-sm font-semibold text-white disabled:opacity-50">{savingAdjustment ? 'Enviando...' : 'Enviar para o gestor'}</button><button type="button" onClick={() => setAdjustmentOpen(false)} className="rounded-xl border border-slate-200 px-4 text-sm text-slate-600">Cancelar</button></div></form></div>}
      {loading && <div className="fixed inset-x-0 top-0 z-50 h-1 overflow-hidden bg-sky-100"><div className="h-full w-1/2 animate-pulse bg-sky-600" /></div>}
    </div>
  );
}

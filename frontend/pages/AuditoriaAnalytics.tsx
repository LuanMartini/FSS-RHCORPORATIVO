import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart,
  ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis,
} from 'recharts';
import { apiFetch } from '../services/api';
import type { AuditDashboardData, IntegrityStatus } from '../types/audit';

const money = (cents: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(cents / 100);
const shortDate = (value: string | null) => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : 'Ainda sem eventos';
const colors = ['#14b8a6', '#6366f1', '#f59e0b', '#f43f5e', '#38bdf8', '#a855f7'];

function Icon({ path }: { path: string }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d={path} /></svg>;
}

function ChartCard({ title, eyebrow, children, className = '' }: { title: string; eyebrow: string; children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_12px_40px_-28px_rgba(15,23,42,.45)] ${className}`}>
    <p className="text-[10px] font-bold uppercase tracking-[.2em] text-slate-400">{eyebrow}</p>
    <h2 className="mt-1 text-base font-bold text-slate-900">{title}</h2>
    <div className="mt-5">{children}</div>
  </section>;
}

function EmptyChart({ message }: { message: string }) {
  return <div className="flex h-[260px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-8 text-center text-sm text-slate-500">{message}</div>;
}

function IntegrityPill({ integrity }: { integrity: IntegrityStatus }) {
  return <div className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold ${integrity.valid ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100' : 'border-rose-400/30 bg-rose-400/10 text-rose-100'}`}>
    <span className={`h-2 w-2 rounded-full ${integrity.valid ? 'bg-emerald-400 shadow-[0_0_12px_#34d399]' : 'bg-rose-400 shadow-[0_0_12px_#fb7185]'}`} />
    {integrity.valid ? 'Cadeia íntegra' : 'Integridade comprometida'}
  </div>;
}

export default function AuditoriaAnalytics() {
  const [period, setPeriod] = useState(12);
  const [data, setData] = useState<AuditDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setData(await apiFetch<AuditDashboardData>(`/auditoria/dashboard?meses=${period}`)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao carregar analytics.'); }
    finally { setLoading(false); }
  }, [period]);

  useEffect(() => { void load(); }, [load]);

  const verify = async () => {
    setVerifying(true);
    try {
      const integrity = await apiFetch<IntegrityStatus>('/auditoria/ledger/verificar', { method: 'POST' });
      setData((current) => current ? { ...current, integrity } : current);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao verificar o ledger.'); }
    finally { setVerifying(false); }
  };

  const departmentChart = useMemo(() => data?.turnover.departments.map((item) => ({
    name: item.department, desligamentos: item.terminations12m, voluntarios90d: item.recentVoluntary,
  })) ?? [], [data]);

  if (loading && !data) return <div className="space-y-4"><div className="h-44 animate-pulse rounded-3xl bg-slate-900" /><div className="grid gap-4 md:grid-cols-3">{[1,2,3].map((item) => <div key={item} className="h-40 animate-pulse rounded-2xl bg-slate-200" />)}</div></div>;
  if (error && !data) return <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-800"><p className="font-bold">Painel indisponível</p><p className="mt-1 text-sm">{error}</p><button onClick={() => void load()} className="mt-4 rounded-lg bg-rose-700 px-4 py-2 text-sm font-bold text-white">Tentar novamente</button></div>;
  if (!data) return null;

  const cards = [
    { label: 'Headcount atual', value: data.summary.headcount.toLocaleString('pt-BR'), detail: 'vínculos ativos', icon: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75' },
    { label: 'Turnover do mês', value: `${data.summary.currentTurnoverRate.toFixed(1)}%`, detail: 'sobre headcount médio', icon: 'M3 3v18h18M7 16l4-5 4 3 5-7' },
    { label: 'Saídas no ano', value: data.summary.terminationsYear.toLocaleString('pt-BR'), detail: 'voluntárias e involuntárias', icon: 'M17 16l4-4-4-4M21 12H9M13 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8' },
    { label: 'Eventos protegidos', value: data.summary.auditEvents.toLocaleString('pt-BR'), detail: shortDate(data.summary.lastAuditAt), icon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10M9 12l2 2 4-4' },
  ];

  return <div className="mx-auto max-w-[1600px] space-y-5 pb-12">
    <header className="relative overflow-hidden rounded-3xl bg-[#0b1324] px-6 py-7 text-white shadow-2xl shadow-slate-900/20 sm:px-8">
      <div className="absolute -right-20 -top-28 h-72 w-72 rounded-full bg-indigo-500/20 blur-3xl" />
      <div className="absolute bottom-0 left-1/3 h-32 w-64 bg-teal-400/10 blur-3xl" />
      <div className="relative flex flex-col justify-between gap-6 xl:flex-row xl:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-3"><p className="text-[11px] font-bold uppercase tracking-[.25em] text-teal-300">Control room · RH estratégico</p><IntegrityPill integrity={data.integrity} /></div>
          <h1 className="mt-3 max-w-3xl text-2xl font-semibold tracking-tight sm:text-3xl">Auditoria imutável & inteligência de pessoas</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">Integridade criptográfica, sinais de rotatividade e equidade salarial em uma visão executiva com privacidade por desenho.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border border-white/10 bg-white/5 p-1">{[6,12,24].map((item) => <button key={item} onClick={() => setPeriod(item)} className={`rounded-lg px-3 py-2 text-xs font-bold transition ${period === item ? 'bg-white text-slate-900 shadow' : 'text-slate-300 hover:bg-white/10'}`}>{item} meses</button>)}</div>
          <button onClick={() => void verify()} disabled={verifying} className="flex items-center gap-2 rounded-xl bg-teal-400 px-4 py-2.5 text-xs font-extrabold text-slate-950 transition hover:bg-teal-300 disabled:opacity-60"><Icon path="M20 6 9 17l-5-5" />{verifying ? 'Verificando…' : 'Verificar ledger'}</button>
        </div>
      </div>
    </header>

    {error && <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"><span>{error}</span><button onClick={() => setError('')} className="font-bold">Fechar</button></div>}

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map((card) => <article key={card.label} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_12px_35px_-28px_rgba(15,23,42,.5)]"><div className="flex items-start justify-between"><div><p className="text-xs font-semibold text-slate-500">{card.label}</p><p className="mt-2 text-3xl font-black tracking-tight text-slate-900">{card.value}</p></div><span className="rounded-xl bg-slate-100 p-2.5 text-slate-600"><Icon path={card.icon} /></span></div><p className="mt-3 truncate text-[11px] text-slate-400">{card.detail}</p></article>)}</section>

    {data.turnover.alerts.length > 0 && <section className="grid gap-3 lg:grid-cols-2">{data.turnover.alerts.slice(0,4).map((alert) => <article key={`${alert.department}-${alert.changePercent}`} className="flex gap-4 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-white p-4"><span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700"><Icon path="M12 9v4m0 4h.01M10.3 3.8 2.5 17.3A2 2 0 0 0 4.2 20h15.6a2 2 0 0 0 1.7-2.7L13.7 3.8a2 2 0 0 0-3.4 0Z" /></span><div><p className="text-xs font-black uppercase tracking-wider text-amber-700">Sinal {alert.severity.toLowerCase()}</p><p className="mt-1 text-sm leading-6 text-slate-700">{alert.message}</p></div></article>)}</section>}

    <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
      <ChartCard eyebrow="Movimentação histórica" title="Turnover, admissões e desligamentos">
        <div className="h-[300px]"><ResponsiveContainer width="100%" height="100%"><LineChart data={data.turnover.monthly} margin={{ top: 8, right: 10, bottom: 0, left: -18 }}><CartesianGrid stroke="#e2e8f0" strokeDasharray="3 5" vertical={false} /><XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} /><YAxis yAxisId="count" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} allowDecimals={false} /><YAxis yAxisId="rate" orientation="right" tickFormatter={(value) => `${value}%`} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} /><Tooltip contentStyle={{ borderRadius: 12, borderColor: '#e2e8f0', fontSize: 12 }} /><Legend wrapperStyle={{ fontSize: 11, paddingTop: 12 }} /><Line yAxisId="rate" type="monotone" dataKey="turnoverRate" name="Turnover %" stroke="#14b8a6" strokeWidth={3} dot={{ r: 3, fill: '#14b8a6' }} activeDot={{ r: 5 }} /><Line yAxisId="count" type="monotone" dataKey="admissions" name="Admissões" stroke="#6366f1" strokeWidth={2} dot={false} /><Line yAxisId="count" type="monotone" dataKey="terminations" name="Desligamentos" stroke="#f43f5e" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div>
      </ChartCard>
      <ChartCard eyebrow="Últimos 12 meses" title="Saídas por departamento">
        {departmentChart.length ? <div className="h-[300px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={departmentChart} layout="vertical" margin={{ left: 5, right: 12 }}><CartesianGrid stroke="#e2e8f0" strokeDasharray="3 5" horizontal={false} /><XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis dataKey="name" type="category" width={86} tick={{ fontSize: 10, fill: '#475569' }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ borderRadius: 12, borderColor: '#e2e8f0', fontSize: 12 }} /><Legend wrapperStyle={{ fontSize: 11 }} /><Bar dataKey="desligamentos" name="Total 12m" fill="#6366f1" radius={[0,5,5,0]} /><Bar dataKey="voluntarios90d" name="Voluntários 90d" fill="#f59e0b" radius={[0,5,5,0]} /></BarChart></ResponsiveContainer></div> : <EmptyChart message="Ainda não existem desligamentos históricos segmentados." />}
      </ChartCard>
    </div>

    <div className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
      <ChartCard eyebrow="Pay equity · dados anonimizados" title="Salário observado × tempo de casa">
        {data.equity.points.length ? <div className="h-[320px]"><ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{ top: 10, right: 15, bottom: 12, left: 5 }}><CartesianGrid stroke="#e2e8f0" strokeDasharray="3 5" /><XAxis type="number" dataKey="tenureYears" name="Tempo de casa" unit=" anos" tick={{ fontSize: 11 }} /><YAxis type="number" dataKey="salaryCents" name="Salário" tickFormatter={money} width={80} tick={{ fontSize: 10 }} /><ZAxis range={[70,70]} /><Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ borderRadius: 12, borderColor: '#e2e8f0', fontSize: 12 }} /><Scatter name="Colaboradores anonimizados" data={data.equity.points} fill="#6366f1">{data.equity.points.map((point, index) => <Cell key={point.anonymousId} fill={colors[index % colors.length]} />)}</Scatter></ScatterChart></ResponsiveContainer></div> : <EmptyChart message={`Amostra insuficiente para comparar pares do mesmo cargo e departamento. ${data.equity.privacy.suppressedRecords} registro(s) foram suprimidos.`} />}
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-500"><Icon path="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />Sem nomes ou IDs internos · grupos com menos de {data.equity.privacy.minimumGroupSize} pessoas são ocultados.</div>
      </ChartCard>
      <ChartCard eyebrow="Distribuição" title="Faixas salariais">
        {data.equity.salaryBands.length ? <div className="h-[320px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.equity.salaryBands} margin={{ left: -20, bottom: 35 }}><CartesianGrid stroke="#e2e8f0" strokeDasharray="3 5" vertical={false} /><XAxis dataKey="band" angle={-28} textAnchor="end" height={70} tick={{ fontSize: 9 }} axisLine={false} tickLine={false} /><YAxis allowDecimals={false} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ borderRadius: 12, borderColor: '#e2e8f0', fontSize: 12 }} /><Bar dataKey="total" name="Pessoas" fill="#14b8a6" radius={[6,6,0,0]} /></BarChart></ResponsiveContainer></div> : <EmptyChart message="Sem vínculos salariais ativos para análise." />}
      </ChartCard>
    </div>

    <div className="grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
      <ChartCard eyebrow="Tempo de casa" title="Desligamentos por faixa">
        {data.turnover.tenure.length ? <div className="h-[260px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.turnover.tenure} margin={{ left: -25 }}><CartesianGrid stroke="#e2e8f0" strokeDasharray="3 5" vertical={false} /><XAxis dataKey="range" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis allowDecimals={false} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ borderRadius: 12, borderColor: '#e2e8f0', fontSize: 12 }} /><Bar dataKey="total" name="Desligamentos" radius={[6,6,0,0]}>{data.turnover.tenure.map((item, index) => <Cell key={item.range} fill={colors[index % colors.length]} />)}</Bar></BarChart></ResponsiveContainer></div> : <EmptyChart message="Nenhum desligamento no período de 12 meses." />}
      </ChartCard>
      <ChartCard eyebrow="Audit trail ledger" title="Eventos críticos mais recentes">
        <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-xs"><thead><tr className="border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-400"><th className="pb-3 font-bold">Evento</th><th className="pb-3 font-bold">Ator / recurso</th><th className="pb-3 font-bold">Horário</th><th className="pb-3 font-bold">Hash encadeado</th></tr></thead><tbody>{data.ledger.map((entry) => <tr key={entry.eventId} className="border-b border-slate-100 last:border-0"><td className="py-3 pr-4"><p className="font-bold text-slate-800">{entry.action.replaceAll('_',' ')}</p><p className="mt-0.5 text-[10px] text-slate-400">#{entry.id}</p></td><td className="py-3 pr-4 text-slate-600"><p>{entry.actor}</p><p className="text-[10px] text-slate-400">{entry.resourceType}{entry.resourceId ? ` · ${entry.resourceId}` : ''}</p></td><td className="whitespace-nowrap py-3 pr-4 text-slate-500">{shortDate(entry.timestamp)}</td><td className="py-3 font-mono text-[10px] text-teal-700">{entry.hashPrefix}…</td></tr>)}</tbody></table>{data.ledger.length === 0 && <div className="py-12 text-center text-sm text-slate-500">O primeiro evento crítico iniciará o bloco gênese.</div>}</div>
      </ChartCard>
    </div>

    <section className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-xs text-slate-500"><div className="flex flex-col justify-between gap-2 sm:flex-row"><span>Atualizado em {shortDate(data.generatedAt)} · Âncora externa: <strong className="text-slate-700">{data.integrity.anchorStatus}</strong></span><span className="font-mono">hash {data.integrity.lastHashPrefix ?? 'gênese'}{data.integrity.lastHashPrefix ? '…' : ''}</span></div></section>
  </div>;
}

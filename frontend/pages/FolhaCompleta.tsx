import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../services/api';
import type { PayrollDashboardResponse, PayrollProcessing, PayrollStatus } from '../types/payroll';

const statusMeta: Record<PayrollStatus, { label: string; dot: string; pill: string }> = {
  PENDENTE: { label: 'Pendente', dot: 'bg-amber-400', pill: 'bg-amber-50 text-amber-700 ring-amber-200' },
  PROCESSANDO: { label: 'Processando', dot: 'bg-blue-500', pill: 'bg-blue-50 text-blue-700 ring-blue-200' },
  CONCLUIDA: { label: 'Concluída', dot: 'bg-emerald-500', pill: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  CONCLUIDA_COM_ERROS: { label: 'Concluída com alertas', dot: 'bg-orange-500', pill: 'bg-orange-50 text-orange-700 ring-orange-200' },
  ENVIADA_BANCO: { label: 'Enviada ao banco', dot: 'bg-violet-500', pill: 'bg-violet-50 text-violet-700 ring-violet-200' },
  CANCELADA: { label: 'Cancelada', dot: 'bg-slate-400', pill: 'bg-slate-100 text-slate-600 ring-slate-200' },
};

function currentCompetency(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function brl(cents: string | number | undefined): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(String(cents ?? '0')) / 100);
}

function period(value: string): string {
  const [year, month] = value.slice(0, 7).split('-').map(Number);
  if (!year || !month) return value.slice(0, 7);
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function StatusPill({ status }: { status: PayrollStatus }) {
  const meta = statusMeta[status];
  return <span className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${meta.pill}`}><span className={`h-1.5 w-1.5 rounded-full ${meta.dot} ${status === 'PROCESSANDO' ? 'animate-pulse' : ''}`} />{meta.label}</span>;
}

function MetricCard({ label, value, detail, tone = 'navy' }: { label: string; value: string; detail: string; tone?: 'navy' | 'green' | 'orange' | 'purple' }) {
  const tones = { navy: 'from-[#102a43] to-[#183f5f]', green: 'from-emerald-700 to-emerald-600', orange: 'from-orange-600 to-amber-500', purple: 'from-violet-700 to-indigo-600' };
  return <article className={`overflow-hidden rounded-2xl bg-gradient-to-br ${tones[tone]} p-5 text-white shadow-sm`}><p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/65">{label}</p><p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p><p className="mt-1 text-xs text-white/65">{detail}</p></article>;
}

export default function FolhaCompleta() {
  const [competency, setCompetency] = useState(currentCompetency());
  const [data, setData] = useState<PayrollDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try { setData(await apiFetch<PayrollDashboardResponse>(`/payroll/dashboard?competencia=${competency}`)); setError(''); }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Não foi possível carregar a folha.'); }
    finally { if (!quiet) setLoading(false); }
  }, [competency]);

  useEffect(() => { void load(); }, [load]);
  const isLive = data?.processamentos.some((item) => item.status === 'PENDENTE' || item.status === 'PROCESSANDO') ?? false;
  useEffect(() => {
    if (!isLive) return undefined;
    const timer = window.setInterval(() => void load(true), 1800);
    return () => window.clearInterval(timer);
  }, [isLive, load]);

  const startProcessing = async () => {
    setActionLoading(true); setNotice(''); setError('');
    try {
      await apiFetch('/payroll/processamentos', { method: 'POST', body: JSON.stringify({ competencia: competency }) });
      setNotice('Processamento enviado para a fila. O painel será atualizado automaticamente.'); await load(true);
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Falha ao iniciar a folha.'); }
    finally { setActionLoading(false); }
  };

  const sendBank = async (processing: PayrollProcessing) => {
    if (!window.confirm(`Confirmar o envio da folha v${processing.versao} ao banco?`)) return;
    setActionLoading(true); setError('');
    try {
      await apiFetch(`/payroll/processamentos/${processing.id}/enviar-banco`, { method: 'POST', body: JSON.stringify({ dataPagamento: new Date().toISOString().slice(0, 10) }) });
      setNotice('Remessa bancária registrada e eventos S-1210 preparados na outbox.'); await load(true);
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Falha no envio ao banco.'); }
    finally { setActionLoading(false); }
  };

  const selected = data?.atual;
  const maximumCost = useMemo(() => Math.max(1, ...(data?.distribuicaoDepartamentos.map((item) => Number(item.custo_centavos)) ?? [1])), [data]);
  const counts = useMemo(() => (data?.processamentos ?? []).reduce((sum, item) => {
    if (item.status === 'PENDENTE') sum.pending += 1; else if (item.status === 'PROCESSANDO') sum.processing += 1; else if (item.status === 'ENVIADA_BANCO') sum.bank += 1; else if (item.status.startsWith('CONCLUIDA')) sum.done += 1;
    return sum;
  }, { pending: 0, processing: 0, done: 0, bank: 0 }), [data]);

  return <div className="mx-auto max-w-[1500px] space-y-6 text-slate-800">
    <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
      <div><div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700"><span className="h-2 w-2 rounded-full bg-emerald-500" />Payroll control center</div><h1 className="font-serif text-3xl font-semibold text-[#102a43]">Folha de pagamento</h1><p className="mt-1 max-w-2xl text-sm text-slate-500">Gross-to-net, benefícios, encargos, holerites e eventos periódicos em uma única operação auditável.</p></div>
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm"><label className="px-2 text-xs font-semibold text-slate-500" htmlFor="competency">Competência</label><input id="competency" type="month" value={competency} onChange={(event) => setCompetency(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-500" /><button type="button" onClick={startProcessing} disabled={actionLoading || isLive} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">{actionLoading ? 'Aguarde…' : isLive ? 'Processamento em curso' : 'Processar folha'}</button></div>
    </header>
    {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}{notice && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div>}
    {loading ? <div className="h-72 animate-pulse rounded-2xl bg-slate-200/70" /> : <>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="Custo empresa" value={brl(selected?.custo_empresa_centavos)} detail="Bruto + FGTS modelado" /><MetricCard label="Folha bruta" value={brl(selected?.total_bruto_centavos)} detail={`${selected?.total_funcionarios ?? 0} colaboradores`} tone="green" /><MetricCard label="Líquido a pagar" value={brl(selected?.total_liquido_centavos)} detail={`${brl(selected?.total_descontos_centavos)} em descontos`} tone="purple" /><MetricCard label="FGTS" value={brl(selected?.total_fgts_centavos)} detail="Alíquota geral CLT de 8%" tone="orange" /></section>
      <section className="grid gap-5 xl:grid-cols-[1.4fr_0.9fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-serif text-xl font-semibold text-[#102a43]">Distribuição de custos</h2><p className="mt-1 text-xs text-slate-500">Bruto e FGTS por departamento · {period(competency)}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">Valores consolidados</span></div><div className="mt-7 space-y-5">{(data?.distribuicaoDepartamentos ?? []).length === 0 && <p className="py-14 text-center text-sm text-slate-400">Processe esta competência para visualizar a distribuição.</p>}{(data?.distribuicaoDepartamentos ?? []).map((item, index) => <div key={item.departamento}><div className="mb-2 flex items-center justify-between gap-3 text-sm"><span className="font-semibold text-slate-700"><span className="mr-2 text-xs text-slate-400">{String(index + 1).padStart(2, '0')}</span>{item.departamento}</span><span className="font-semibold text-[#102a43]">{brl(item.custo_centavos)}</span></div><div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-700" style={{ width: `${Math.max(4, (Number(item.custo_centavos) / maximumCost) * 100)}%` }} /></div><p className="mt-1 text-right text-[11px] text-slate-400">{item.colaboradores} colaborador(es)</p></div>)}</div></article>
        <div className="space-y-5"><article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-serif text-lg font-semibold text-[#102a43]">Fila de processamento</h2><div className="mt-4 grid grid-cols-2 gap-3">{[['Pendentes', counts.pending, 'text-amber-600'], ['Processando', counts.processing, 'text-blue-600'], ['Concluídas', counts.done, 'text-emerald-600'], ['Banco', counts.bank, 'text-violet-600']].map(([label, value, tone]) => <div key={String(label)} className="rounded-xl bg-slate-50 p-3"><p className={`text-2xl font-semibold ${tone}`}>{value}</p><p className="text-xs text-slate-500">{label}</p></div>)}</div></article><article className="rounded-2xl border border-slate-200 bg-[#102a43] p-5 text-white shadow-sm"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-emerald-300">Integração conceitual</p><h3 className="mt-1 font-serif text-lg">eSocial</h3></div><span className="rounded-full bg-white/10 px-2 py-1 text-xs">Outbox</span></div><p className="mt-3 text-sm leading-6 text-white/65">Eventos S-1200 são preparados por demonstrativo. Após a remessa bancária, o sistema cria os S-1210 correspondentes.</p><div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4 text-sm"><span className="text-white/60">Aguardando transmissão</span><strong>{Number(selected?.eventos_esocial_pendentes ?? 0)}</strong></div></article></div>
      </section>
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6"><div><h2 className="font-serif text-xl font-semibold text-[#102a43]">Histórico de execuções</h2><p className="text-xs text-slate-500">Versões preservadas para auditoria e reprocessamento</p></div><span className="text-xs font-medium text-slate-400">Atualização automática {isLive ? 'ativa' : 'em espera'}</span></div><div className="overflow-x-auto"><table className="min-w-[850px] w-full text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500"><tr><th className="px-6 py-3">Competência</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Progresso</th><th className="px-4 py-3">Líquido</th><th className="px-4 py-3">eSocial</th><th className="px-6 py-3 text-right">Ação</th></tr></thead><tbody className="divide-y divide-slate-100">{(data?.processamentos ?? []).map((item) => { const progress = Number(item.progresso_percentual ?? 0); const canSend = item.status === 'CONCLUIDA'; return <tr key={item.id} className="hover:bg-slate-50/70"><td className="px-6 py-4"><p className="font-semibold capitalize text-slate-700">{period(item.competencia)}</p><p className="text-xs text-slate-400">Versão {item.versao}</p></td><td className="px-4 py-4"><StatusPill status={item.status} />{item.falhas > 0 && <p className="mt-1 text-[11px] text-orange-600">{item.falhas} falha(s)</p>}</td><td className="w-48 px-4 py-4"><div className="mb-1 flex justify-between text-xs text-slate-500"><span>{item.processados}/{item.total_funcionarios}</span><span>{progress.toFixed(0)}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} /></div></td><td className="px-4 py-4 font-semibold text-slate-700">{brl(item.total_liquido_centavos)}</td><td className="px-4 py-4 text-slate-500">{Number(item.eventos_esocial_pendentes)} evento(s)</td><td className="px-6 py-4 text-right">{canSend ? <button type="button" onClick={() => sendBank(item)} disabled={actionLoading} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-violet-300 hover:text-violet-700 disabled:opacity-50">Enviar ao banco</button> : <span className="text-xs text-slate-400">—</span>}</td></tr>; })}{(data?.processamentos ?? []).length === 0 && <tr><td colSpan={6} className="px-6 py-12 text-center text-sm text-slate-400">Nenhuma folha processada.</td></tr>}</tbody></table></div></section>
    </>}
  </div>;
}

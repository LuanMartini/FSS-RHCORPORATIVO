import { useState, useEffect, type FormEvent } from 'react';
import { apiFetch } from '../services/api';
import type { FuncionarioView } from '../utils/funcionario';
import { useAuth } from '../context/useAuth';
import { EmptyState, Feedback, Loading, PageHeading, StatusBadge, SubmitForm, TableRegion } from '../components/ui';

interface FeriasItem {
  id: number;
  funcionarioId: number;
  dataInicio: string;
  dataFim: string;
  status: string;
  versao: number;
  funcionario?: { nome: string } | null;
}

interface Props {
  funcionarios: FuncionarioView[];
  onRefresh: () => void;
}

const statusLabels: Record<string, [string, 'success' | 'warning' | 'danger' | 'neutral']> = {
  PENDENTE: ['Pendente', 'warning'], APROVADA: ['Aprovada', 'success'],
  REPROVADA: ['Reprovada', 'danger'], EM_GOZO: ['Em gozo', 'success'], ENCERRADA: ['Encerrada', 'neutral'],
};

const dateLabel = (value: string) => value.slice(0, 10).split('-').reverse().join('/');

export default function Ferias({ funcionarios, onRefresh }: Props) {
  const canClose = useAuth().user?.permissoes.includes('time.manage.all');
  const ativos = funcionarios.filter(f => f.ativo);
  const [lista, setLista] = useState<FeriasItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    funcionarioId: '',
    dataInicio: '',
    dataFim: '',
    observacao: '',
  });
  const [erro, setErro] = useState('');
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState<number | null>(null);

  async function carregar() {
    setLoadError('');
    try {
      const data = await apiFetch<FeriasItem[]>('/rh/ferias');
      setLista(data);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Erro ao listar férias');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  async function solicitar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro('');
    setNotice('');
    const fields = new FormData(e.currentTarget);
    const dataInicio = String(fields.get('dataInicio') ?? '');
    const dataFim = String(fields.get('dataFim') ?? '');
    if (dataFim < dataInicio) {
      setErro('A data final deve ser igual ou posterior à data inicial.');
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch('/rh/ferias', {
        method: 'POST',
        body: JSON.stringify({
          funcionarioId: Number(form.funcionarioId),
          dataInicio,
          dataFim,
          observacao: form.observacao || undefined,
        }),
      });
      setForm({ funcionarioId: '', dataInicio: '', dataFim: '', observacao: '' });
      setNotice('Solicitação enviada.');
      await carregar();
      onRefresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao solicitar');
    } finally { setSubmitting(false); }
  }

  async function acao(id: number, tipo: 'aprovar' | 'reprovar' | 'encerrar') {
    setBusy(id);
    setErro('');
    setNotice('');
    try {
      const path =
        tipo === 'aprovar' ? `/rh/ferias/${id}/aprovar`
          : tipo === 'reprovar' ? `/rh/ferias/${id}/reprovar`
            : `/rh/ferias/${id}/encerrar`;
      const versao=lista.find((item)=>item.id===id)?.versao;
      const body = JSON.stringify({ ...(tipo === 'reprovar' ? { motivo: 'Reprovado pelo gestor' } : {}), versao });
      await apiFetch(path, { method: 'PATCH', body });
      setNotice('Status da solicitação atualizado.');
      await carregar();
      onRefresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro na operação');
    } finally {
      setBusy(null);
    }
  }

  const visible = lista.filter((row) => !filter || row.status === filter);

  return (
    <div className="page-stack">
      <PageHeading title="Férias" description="Solicite férias e acompanhe as aprovações da sua equipe." />
      {erro && <Feedback>{erro}</Feedback>}
      {notice && <Feedback kind="success">{notice}</Feedback>}

      <SubmitForm submit={solicitar} className="panel form-panel" aria-busy={submitting}>
        <h2>Nova solicitação</h2>
        <div className="form-grid">
          <div className="form-label">
          <label htmlFor="ferias-funcionario">Funcionário *</label>
          <select
            id="ferias-funcionario"
            required
            value={form.funcionarioId}
            onChange={e => setForm({ ...form, funcionarioId: e.target.value })}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Selecione</option>
            {ativos.map(f => (
              <option key={f.id} value={f.id}>{f.nome}</option>
            ))}
          </select></div>
          <div className="form-label">
          <label htmlFor="ferias-inicio">Início *</label>
          <input
            id="ferias-inicio"
            name="dataInicio"
            type="date"
            required
            value={form.dataInicio}
            onChange={e => setForm({ ...form, dataInicio: e.target.value })}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
          /></div>
          <div className="form-label">
          <label htmlFor="ferias-fim">Fim *</label>
          <input
            id="ferias-fim"
            name="dataFim"
            type="date"
            min={form.dataInicio || undefined}
            required
            value={form.dataFim}
            onChange={e => setForm({ ...form, dataFim: e.target.value })}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
          /></div>
          <div className="form-label field-wide">
          <label htmlFor="ferias-observacao">Observação (opcional)</label>
          <input
            id="ferias-observacao"
            placeholder="Observação (opcional)"
            value={form.observacao}
            onChange={e => setForm({ ...form, observacao: e.target.value })}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
          /></div>
        </div>
        <button type="submit" className="ui-button" disabled={submitting || !ativos.length}>
          {submitting ? 'Enviando…' : 'Enviar solicitação'}
        </button>
      </SubmitForm>

      <section className="panel">
        <div className="panel-heading panel-heading--action"><h2>Solicitações de férias</h2>
          {lista.length > 0 && <label className="form-label">Filtrar por status<select value={filter} onChange={(event) => setFilter(event.target.value)}>
            <option value="">Todos os status</option>{[...new Set(lista.map((row) => row.status))].map((status) => <option key={status} value={status}>{statusLabels[status]?.[0] ?? status}</option>)}
          </select></label>}</div>
        {loading ? <Loading label="Carregando férias" /> : loadError ? <Feedback retry={carregar}>{loadError}</Feedback> : visible.length === 0 ? <EmptyState title={filter ? 'Nenhuma solicitação com esse status' : 'Nenhuma solicitação de férias'} /> : <TableRegion label="Solicitações de férias">
        <table className="w-full text-sm">
          <caption className="sr-only">Solicitações de férias</caption>
          <thead className="bg-slate-50">
            <tr>
              <th scope="col" className="text-left px-4 py-2">Funcionário</th>
              <th scope="col" className="text-left px-4 py-2">Início</th>
              <th scope="col" className="text-left px-4 py-2">Fim</th>
              <th scope="col" className="text-left px-4 py-2">Status</th>
              <th scope="col" className="text-left px-4 py-2">Ações</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(row => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="px-4 py-2">{row.funcionario?.nome ?? `#${row.funcionarioId}`}</td>
                <td className="numeric">{dateLabel(row.dataInicio)}</td>
                <td className="numeric">{dateLabel(row.dataFim)}</td>
                <td><StatusBadge tone={statusLabels[row.status]?.[1]}>{statusLabels[row.status]?.[0] ?? row.status}</StatusBadge></td>
                <td><div className="action-row">
                  {row.status === 'PENDENTE' && (
                    <>
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => acao(row.id, 'aprovar')}
                        className="ui-button ui-button--secondary ui-button--small"
                      >
                        Aprovar
                      </button>
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => acao(row.id, 'reprovar')}
                        className="ui-button ui-button--danger ui-button--small"
                      >
                        Reprovar
                      </button>
                    </>
                  )}
                  {row.status === 'EM_GOZO' && canClose && (
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => acao(row.id, 'encerrar')}
                      className="ui-button ui-button--secondary ui-button--small"
                    >
                      Encerrar
                    </button>
                  )}
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
        </TableRegion>}
      </section>
    </div>
  );
}

import { useState, useEffect, type FormEvent } from 'react';
import { apiFetch } from '../services/api';
import type { FuncionarioView } from '../utils/funcionario';

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

export default function Ferias({ funcionarios, onRefresh }: Props) {
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
  const [busy, setBusy] = useState<number | null>(null);

  async function carregar() {
    try {
      const data = await apiFetch<FeriasItem[]>('/rh/ferias');
      setLista(data);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao listar férias');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  async function solicitar(e: FormEvent) {
    e.preventDefault();
    setErro('');
    try {
      await apiFetch('/rh/ferias', {
        method: 'POST',
        body: JSON.stringify({
          funcionarioId: Number(form.funcionarioId),
          dataInicio: form.dataInicio,
          dataFim: form.dataFim,
          observacao: form.observacao || undefined,
        }),
      });
      setForm({ funcionarioId: '', dataInicio: '', dataFim: '', observacao: '' });
      await carregar();
      onRefresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao solicitar');
    }
  }

  async function acao(id: number, tipo: 'aprovar' | 'reprovar' | 'encerrar') {
    setBusy(id);
    setErro('');
    try {
      const path =
        tipo === 'aprovar' ? `/rh/ferias/${id}/aprovar`
          : tipo === 'reprovar' ? `/rh/ferias/${id}/reprovar`
            : `/rh/ferias/${id}/encerrar`;
      const versao=lista.find((item)=>item.id===id)?.versao;
      const body = JSON.stringify({ ...(tipo === 'reprovar' ? { motivo: 'Reprovado pelo gestor' } : {}), versao });
      await apiFetch(path, { method: 'PATCH', body });
      await carregar();
      onRefresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro na operação');
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <p className="text-slate-500">Carregando...</p>;

  return (
    <div className="space-y-8 max-w-4xl">
      <h2 className="font-serif text-2xl text-[#0f2340]">Férias</h2>
      {erro && <p className="text-red-600 text-sm">{erro}</p>}

      <form onSubmit={solicitar} className="bg-white border border-slate-200 rounded-lg p-6 space-y-3">
        <h3 className="font-semibold text-slate-800">Nova solicitação</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <select
            required
            value={form.funcionarioId}
            onChange={e => setForm({ ...form, funcionarioId: e.target.value })}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Funcionário</option>
            {ativos.map(f => (
              <option key={f.id} value={f.id}>{f.nome}</option>
            ))}
          </select>
          <input
            type="date"
            required
            value={form.dataInicio}
            onChange={e => setForm({ ...form, dataInicio: e.target.value })}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
          />
          <input
            type="date"
            required
            value={form.dataFim}
            onChange={e => setForm({ ...form, dataFim: e.target.value })}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
          />
          <input
            placeholder="Observação (opcional)"
            value={form.observacao}
            onChange={e => setForm({ ...form, observacao: e.target.value })}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm md:col-span-2"
          />
        </div>
        <button type="submit" className="px-4 py-2 bg-[#0f2340] text-white rounded-lg text-sm font-semibold">
          Enviar solicitação
        </button>
      </form>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left px-4 py-2">Funcionário</th>
              <th className="text-left px-4 py-2">Início</th>
              <th className="text-left px-4 py-2">Fim</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="text-left px-4 py-2">Ações</th>
            </tr>
          </thead>
          <tbody>
            {lista.map(row => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="px-4 py-2">{row.funcionario?.nome ?? `#${row.funcionarioId}`}</td>
                <td className="px-4 py-2">{row.dataInicio}</td>
                <td className="px-4 py-2">{row.dataFim}</td>
                <td className="px-4 py-2">{row.status}</td>
                <td className="px-4 py-2 space-x-2">
                  {row.status === 'PENDENTE' && (
                    <>
                      <button
                        type="button"
                        disabled={busy === row.id}
                        onClick={() => acao(row.id, 'aprovar')}
                        className="text-emerald-700 text-xs font-semibold"
                      >
                        Aprovar
                      </button>
                      <button
                        type="button"
                        disabled={busy === row.id}
                        onClick={() => acao(row.id, 'reprovar')}
                        className="text-red-600 text-xs font-semibold"
                      >
                        Reprovar
                      </button>
                    </>
                  )}
                  {row.status === 'EM_GOZO' && (
                    <button
                      type="button"
                      disabled={busy === row.id}
                      onClick={() => acao(row.id, 'encerrar')}
                      className="text-slate-700 text-xs font-semibold"
                    >
                      Encerrar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {lista.length === 0 && <p className="p-6 text-slate-500 text-center">Nenhuma solicitação.</p>}
      </div>
    </div>
  );
}

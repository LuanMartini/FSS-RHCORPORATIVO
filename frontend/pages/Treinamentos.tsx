import { useState, useEffect, FormEvent } from 'react';
import { apiFetch } from '../services/api';
import type { FuncionarioView } from '../utils/funcionario';

interface Treinamento {
  id: number;
  nome: string;
  cargaHoraria: number;
  modalidade?: string;
  descricao?: string | null;
}

interface Props {
  funcionarios: FuncionarioView[];
  onRefresh: () => void;
}

export default function Treinamentos({ funcionarios, onRefresh }: Props) {
  const [lista, setLista] = useState<Treinamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [novo, setNovo] = useState({ nome: '', cargaHoraria: '', descricao: '', modalidade: 'PRESENCIAL' });
  const [insc, setInsc] = useState({ funcionarioId: '', treinamentoId: '' });

  async function carregar() {
    try {
      const data = await apiFetch<Treinamento[]>('/rh/treinamentos');
      setLista(data);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao listar treinamentos');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  async function criar(e: FormEvent) {
    e.preventDefault();
    setErro('');
    try {
      await apiFetch('/rh/treinamentos', {
        method: 'POST',
        body: JSON.stringify({
          nome: novo.nome,
          cargaHoraria: Number(novo.cargaHoraria),
          descricao: novo.descricao || undefined,
          modalidade: novo.modalidade,
        }),
      });
      setNovo({ nome: '', cargaHoraria: '', descricao: '', modalidade: 'PRESENCIAL' });
      await carregar();
      onRefresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao criar');
    }
  }

  async function inscrever(e: FormEvent) {
    e.preventDefault();
    setErro('');
    try {
      await apiFetch('/rh/treinamentos/inscrever', {
        method: 'POST',
        body: JSON.stringify({
          funcionarioId: Number(insc.funcionarioId),
          treinamentoId: Number(insc.treinamentoId),
        }),
      });
      setInsc({ funcionarioId: '', treinamentoId: '' });
      onRefresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro na inscrição');
    }
  }

  if (loading) return <p className="text-slate-500">Carregando...</p>;

  return (
    <div className="space-y-8 max-w-4xl">
      <h2 className="font-serif text-2xl text-[#0f2340]">Treinamentos</h2>
      {erro && <p className="text-red-600 text-sm">{erro}</p>}

      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
        <h3 className="font-semibold">Novo treinamento</h3>
        <form onSubmit={criar} className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <input
            required
            placeholder="Nome"
            value={novo.nome}
            onChange={e => setNovo({ ...novo, nome: e.target.value })}
            className="border rounded-lg px-3 py-2 text-sm md:col-span-2"
          />
          <input
            required
            type="number"
            placeholder="Carga horária"
            value={novo.cargaHoraria}
            onChange={e => setNovo({ ...novo, cargaHoraria: e.target.value })}
            className="border rounded-lg px-3 py-2 text-sm"
          />
          <select
            value={novo.modalidade}
            onChange={e => setNovo({ ...novo, modalidade: e.target.value })}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            <option value="PRESENCIAL">Presencial</option>
            <option value="ONLINE">Online</option>
            <option value="HIBRIDO">Híbrido</option>
          </select>
          <input
            placeholder="Descrição (opcional)"
            value={novo.descricao}
            onChange={e => setNovo({ ...novo, descricao: e.target.value })}
            className="border rounded-lg px-3 py-2 text-sm md:col-span-2"
          />
          <button type="submit" className="px-4 py-2 bg-[#0f2340] text-white rounded-lg text-sm w-fit">Criar</button>
        </form>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
        <h3 className="font-semibold">Inscrever funcionário</h3>
        <form onSubmit={inscrever} className="flex flex-wrap gap-2 items-end">
          <select
            required
            value={insc.funcionarioId}
            onChange={e => setInsc({ ...insc, funcionarioId: e.target.value })}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Funcionário</option>
            {funcionarios.map(f => (
              <option key={f.id} value={f.id}>{f.nome}</option>
            ))}
          </select>
          <select
            required
            value={insc.treinamentoId}
            onChange={e => setInsc({ ...insc, treinamentoId: e.target.value })}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Treinamento</option>
            {lista.map(t => (
              <option key={t.id} value={t.id}>{t.nome}</option>
            ))}
          </select>
          <button type="submit" className="px-4 py-2 bg-slate-700 text-white rounded-lg text-sm">Inscrever</button>
        </form>
      </div>

      <table className="w-full text-sm bg-white border border-slate-200 rounded-xl overflow-hidden">
        <thead className="bg-slate-50">
          <tr>
            <th className="text-left px-4 py-2">Nome</th>
            <th className="text-left px-4 py-2">Horas</th>
            <th className="text-left px-4 py-2">Modalidade</th>
          </tr>
        </thead>
        <tbody>
          {lista.map(t => (
            <tr key={t.id} className="border-t border-slate-100">
              <td className="px-4 py-2">{t.nome}</td>
              <td className="px-4 py-2">{t.cargaHoraria} h</td>
              <td className="px-4 py-2">{t.modalidade ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

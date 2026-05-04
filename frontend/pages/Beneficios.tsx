import { useState, useEffect, FormEvent } from 'react';
import { apiFetch } from '../services/api';
import type { FuncionarioView } from '../utils/funcionario';

interface Beneficio {
  id: number;
  nome: string;
  tipo: string;
  valorMensal: number;
}

interface Props {
  funcionarios: FuncionarioView[];
  onRefresh: () => void;
}

export default function Beneficios({ funcionarios, onRefresh }: Props) {
  const [lista, setLista] = useState<Beneficio[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [novo, setNovo] = useState({ nome: '', tipo: '', valorMensal: '' });
  const [vinc, setVinc] = useState({ funcionarioId: '', beneficioId: '' });

  async function carregar() {
    try {
      const data = await apiFetch<Beneficio[]>('/rh/beneficios');
      setLista(data);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar benefícios');
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
      await apiFetch('/rh/beneficios', {
        method: 'POST',
        body: JSON.stringify({
          nome: novo.nome,
          tipo: novo.tipo,
          valorMensal: Number(novo.valorMensal),
        }),
      });
      setNovo({ nome: '', tipo: '', valorMensal: '' });
      await carregar();
      onRefresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao criar');
    }
  }

  async function vincular(e: FormEvent) {
    e.preventDefault();
    setErro('');
    try {
      await apiFetch('/rh/beneficios/vincular', {
        method: 'POST',
        body: JSON.stringify({
          funcionarioId: Number(vinc.funcionarioId),
          beneficioId: Number(vinc.beneficioId),
        }),
      });
      setVinc({ funcionarioId: '', beneficioId: '' });
      onRefresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao vincular');
    }
  }

  if (loading) return <p className="text-slate-500">Carregando...</p>;

  return (
    <div className="space-y-8 max-w-4xl">
      <h2 className="font-serif text-2xl text-[#0f2340]">Benefícios</h2>
      {erro && <p className="text-red-600 text-sm">{erro}</p>}

      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
        <h3 className="font-semibold">Cadastrar benefício</h3>
        <form onSubmit={criar} className="flex flex-wrap gap-2 items-end">
          <input
            required
            placeholder="Nome"
            value={novo.nome}
            onChange={e => setNovo({ ...novo, nome: e.target.value })}
            className="border rounded-lg px-3 py-2 text-sm flex-1 min-w-[140px]"
          />
          <input
            required
            placeholder="Tipo (ex: VR)"
            value={novo.tipo}
            onChange={e => setNovo({ ...novo, tipo: e.target.value })}
            className="border rounded-lg px-3 py-2 text-sm w-28"
          />
          <input
            required
            type="number"
            placeholder="Valor mensal"
            value={novo.valorMensal}
            onChange={e => setNovo({ ...novo, valorMensal: e.target.value })}
            className="border rounded-lg px-3 py-2 text-sm w-36"
          />
          <button type="submit" className="px-4 py-2 bg-[#0f2340] text-white rounded-lg text-sm">Incluir</button>
        </form>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
        <h3 className="font-semibold">Vincular a funcionário</h3>
        <form onSubmit={vincular} className="flex flex-wrap gap-2 items-end">
          <select
            required
            value={vinc.funcionarioId}
            onChange={e => setVinc({ ...vinc, funcionarioId: e.target.value })}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Funcionário</option>
            {funcionarios.map(f => (
              <option key={f.id} value={f.id}>{f.nome}</option>
            ))}
          </select>
          <select
            required
            value={vinc.beneficioId}
            onChange={e => setVinc({ ...vinc, beneficioId: e.target.value })}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Benefício</option>
            {lista.map(b => (
              <option key={b.id} value={b.id}>{b.nome}</option>
            ))}
          </select>
          <button type="submit" className="px-4 py-2 bg-slate-700 text-white rounded-lg text-sm">Vincular</button>
        </form>
      </div>

      <table className="w-full text-sm bg-white border border-slate-200 rounded-xl overflow-hidden">
        <thead className="bg-slate-50">
          <tr>
            <th className="text-left px-4 py-2">Nome</th>
            <th className="text-left px-4 py-2">Tipo</th>
            <th className="text-left px-4 py-2">Valor mensal</th>
          </tr>
        </thead>
        <tbody>
          {lista.map(b => (
            <tr key={b.id} className="border-t border-slate-100">
              <td className="px-4 py-2">{b.nome}</td>
              <td className="px-4 py-2">{b.tipo}</td>
              <td className="px-4 py-2">{b.valorMensal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

import { useState, useEffect, type FormEvent } from 'react';
import { apiFetch } from '../services/api';
import type { FuncionarioView } from '../utils/funcionario';

const TIPOS = [
  { value: 'VERBAL', label: 'Verbal' },
  { value: 'ESCRITA', label: 'Escrita' },
  { value: 'SUSPENSAO', label: 'Suspensão' },
];

interface AdvertenciaRow {
  id: number;
  funcionarioId: number;
  tipo: string;
  descricao: string;
  dataOcorrencia: string;
  funcionario?: { nome: string } | null;
}

interface Props {
  funcionarios: FuncionarioView[];
  onRefresh: () => void;
}

export default function Advertencias({ funcionarios, onRefresh }: Props) {
  const [lista, setLista] = useState<AdvertenciaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [form, setForm] = useState({
    funcionarioId: '',
    tipo: 'VERBAL',
    descricao: '',
    dataOcorrencia: '',
  });

  async function carregar() {
    try {
      const data = await apiFetch<AdvertenciaRow[]>('/rh/advertencias');
      setLista(data);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao listar');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  async function registrar(e: FormEvent) {
    e.preventDefault();
    setErro('');
    try {
      await apiFetch('/rh/advertencias', {
        method: 'POST',
        body: JSON.stringify({
          funcionarioId: Number(form.funcionarioId),
          tipo: form.tipo,
          descricao: form.descricao,
          dataOcorrencia: form.dataOcorrencia || undefined,
        }),
      });
      setForm({ funcionarioId: '', tipo: 'VERBAL', descricao: '', dataOcorrencia: '' });
      await carregar();
      onRefresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao registrar');
    }
  }

  if (loading) return <p className="text-slate-500">Carregando...</p>;

  return (
    <div className="space-y-8 max-w-4xl">
      <h2 className="font-serif text-2xl text-[#0f2340]">Advertências</h2>
      {erro && <p className="text-red-600 text-sm">{erro}</p>}

      <form onSubmit={registrar} className="bg-white border border-slate-200 rounded-lg p-6 space-y-3">
        <h3 className="font-semibold">Registrar</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <select
            required
            value={form.funcionarioId}
            onChange={e => setForm({ ...form, funcionarioId: e.target.value })}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Funcionário</option>
            {funcionarios.map(f => (
              <option key={f.id} value={f.id}>{f.nome}</option>
            ))}
          </select>
          <select
            value={form.tipo}
            onChange={e => setForm({ ...form, tipo: e.target.value })}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            {TIPOS.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <input
            type="date"
            value={form.dataOcorrencia}
            onChange={e => setForm({ ...form, dataOcorrencia: e.target.value })}
            className="border rounded-lg px-3 py-2 text-sm"
          />
          <textarea
            required
            placeholder="Descrição"
            value={form.descricao}
            onChange={e => setForm({ ...form, descricao: e.target.value })}
            className="border rounded-lg px-3 py-2 text-sm md:col-span-2 min-h-[80px]"
          />
        </div>
        <button type="submit" className="px-4 py-2 bg-[#0f2340] text-white rounded-lg text-sm font-semibold">
          Salvar
        </button>
      </form>

      <table className="w-full text-sm bg-white border border-slate-200 rounded-lg overflow-hidden">
        <thead className="bg-slate-50">
          <tr>
            <th className="text-left px-4 py-2">Funcionário</th>
            <th className="text-left px-4 py-2">Tipo</th>
            <th className="text-left px-4 py-2">Data</th>
            <th className="text-left px-4 py-2">Descrição</th>
          </tr>
        </thead>
        <tbody>
          {lista.map(a => (
            <tr key={a.id} className="border-t border-slate-100 align-top">
              <td className="px-4 py-2">{a.funcionario?.nome ?? `#${a.funcionarioId}`}</td>
              <td className="px-4 py-2">{a.tipo}</td>
              <td className="px-4 py-2">{a.dataOcorrencia}</td>
              <td className="px-4 py-2 max-w-md">{a.descricao}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {lista.length === 0 && <p className="text-slate-500 text-sm">Nenhuma advertência registrada.</p>}
    </div>
  );
}

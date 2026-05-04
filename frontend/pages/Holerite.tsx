import { useState } from 'react';
import { apiFetch } from '../services/api';
import type { FuncionarioView } from '../utils/funcionario';

interface HoleriteRes {
  funcionario: { id: number; nome: string; cpf: string; cargo: number };
  mesReferencia: number;
  anoReferencia: number;
  vencimentos: { salarioBase: string };
  descontos: { inss: string; irrf: string };
  provisoes: { fgts: string };
  totalBruto: string;
  totalDescontos: string;
  totalLiquido: string;
}

interface Props {
  funcionarios: FuncionarioView[];
}

export default function Holerite({ funcionarios }: Props) {
  const ativos = funcionarios.filter(f => f.ativo);
  const [id, setId] = useState('');
  const [h, setH] = useState<HoleriteRes | null>(null);
  const [erro, setErro] = useState('');

  async function carregar() {
    if (!id) return;
    setErro('');
    setH(null);
    try {
      const data = await apiFetch<HoleriteRes>(`/rh/folha/${id}`);
      setH(data);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar holerite');
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="font-serif text-2xl text-[#0f2340]">Holerite</h2>

      <div className="flex flex-wrap gap-3 items-end bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-semibold text-slate-500 mb-1">Funcionário</label>
          <select
            value={id}
            onChange={e => setId(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
          >
            <option value="">Selecione</option>
            {ativos.map(f => (
              <option key={f.id} value={f.id}>{f.nome}</option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={carregar}
          disabled={!id}
          className="px-4 py-2 bg-[#0f2340] text-white rounded-lg text-sm font-semibold disabled:opacity-50"
        >
          Gerar
        </button>
      </div>

      {erro && <p className="text-red-600 text-sm">{erro}</p>}

      {h && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-2 text-sm">
          <p><strong>Referência:</strong> {h.mesReferencia}/{h.anoReferencia}</p>
          <p><strong>Nome:</strong> {h.funcionario.nome}</p>
          <p><strong>CPF:</strong> {h.funcionario.cpf}</p>
          <hr className="my-3" />
          <p><strong>Salário base:</strong> R$ {h.vencimentos.salarioBase}</p>
          <p><strong>INSS:</strong> R$ {h.descontos.inss}</p>
          <p><strong>IRRF:</strong> R$ {h.descontos.irrf}</p>
          <p><strong>FGTS (provisão):</strong> R$ {h.provisoes.fgts}</p>
          <hr className="my-3" />
          <p><strong>Total bruto:</strong> R$ {h.totalBruto}</p>
          <p><strong>Total descontos:</strong> R$ {h.totalDescontos}</p>
          <p className="text-lg font-semibold text-[#0f2340]"><strong>Líquido:</strong> R$ {h.totalLiquido}</p>
        </div>
      )}
    </div>
  );
}

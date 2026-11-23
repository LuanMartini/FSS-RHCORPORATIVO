import { EmptyState, Feedback, Loading, PageHeading } from '../components/ui';
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

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export default function Holerite({ funcionarios }: Props) {
  const ativos = funcionarios.filter(f => f.ativo);
  const [id, setId] = useState('');
  const [h, setH] = useState<HoleriteRes | null>(null);
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(false);

  async function carregar() {
    if (!id || loading) return;
    setLoading(true);
    setErro('');
    setH(null);
    try {
      const data = await apiFetch<HoleriteRes>(`/rh/folha/${id}`);
      setH(data);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar holerite');
    } finally { setLoading(false); }
  }

  return (
    <div className="page-stack max-w-4xl">
      <PageHeading title="Holerite" description="Consulte o demonstrativo de pagamento de um funcionário." />

      <div className="panel compact-panel flex flex-wrap items-end gap-3">
        <div className="form-label flex-1 min-w-[min(100%,200px)]">
          <label htmlFor="holerite-funcionario" className="block text-xs font-semibold text-slate-500 mb-1">Funcionário</label>
          <select
            value={id}
            id="holerite-funcionario"
            onChange={e => { setId(e.target.value); setH(null); setErro(''); }}
            disabled={loading}
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
          disabled={loading || !id}
          className="ui-button"
        >
          {loading ? 'Gerando…' : 'Gerar'}
        </button>
      </div>

      {erro && <Feedback retry={carregar}>{erro}</Feedback>}
      {loading && <Loading label="Gerando holerite" />}
      {!ativos.length && <section className="panel"><EmptyState title="Nenhum funcionário disponível para consulta" /></section>}

      {h && (
        <section aria-live="polite" aria-labelledby="holerite-gerado" className="panel compact-panel page-stack">
          <div><h2 id="holerite-gerado">Holerite gerado</h2><p>{h.funcionario.nome} · {String(h.mesReferencia).padStart(2, "0")}/{h.anoReferencia}</p>{h.funcionario.cpf && <p>CPF {h.funcionario.cpf}</p>}</div>
          <dl className="detail-grid">
            <div><dt>Salário base</dt><dd>{brl.format(Number(h.vencimentos.salarioBase))}</dd></div>
            <div><dt>INSS</dt><dd>{brl.format(Number(h.descontos.inss))}</dd></div>
            <div><dt>IRRF</dt><dd>{brl.format(Number(h.descontos.irrf))}</dd></div>
            <div><dt>FGTS (provisão)</dt><dd>{brl.format(Number(h.provisoes.fgts))}</dd></div>
            <div><dt>Total bruto</dt><dd>{brl.format(Number(h.totalBruto))}</dd></div>
            <div><dt>Total de descontos</dt><dd>{brl.format(Number(h.totalDescontos))}</dd></div>
          </dl>
          <div className="payroll-total"><h3>Líquido a receber</h3><strong>{brl.format(Number(h.totalLiquido))}</strong></div>
        </section>
      )}
    </div>
  );
}

import { useState, useEffect } from 'react';
import { apiFetch } from '../services/api';

interface FolhaRes {
  mesReferencia: number;
  anoReferencia: number;
  totalFuncionarios: number;
  resumo: {
    totalBruto: string;
    totalDescontos: string;
    totalLiquido: string;
    totalFGTS: string;
    custoTotalEmpresa: string;
  };
  holerites: unknown[];
}

export default function FolhaCompleta() {
  const [data, setData] = useState<FolhaRes | null>(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const f = await apiFetch<FolhaRes>('/rh/folha');
        setData(f);
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não foi possível carregar a folha');
      }
    })();
  }, []);

  if (erro) {
    return <p className="text-red-600">{erro}</p>;
  }

  if (!data) {
    return <p className="text-slate-500">Carregando folha consolidada...</p>;
  }

  return (
    <div className="space-y-4">
      <h2 className="font-serif text-2xl text-[#0f2340]">Folha do mês</h2>
      <p className="text-slate-600 text-sm">
        Referência: {data.mesReferencia}/{data.anoReferencia} — {data.totalFuncionarios} funcionário(s) ativo(s)
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs text-slate-500">Total bruto</p>
          <p className="text-lg font-semibold">R$ {data.resumo.totalBruto}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs text-slate-500">Descontos</p>
          <p className="text-lg font-semibold">R$ {data.resumo.totalDescontos}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs text-slate-500">Líquido</p>
          <p className="text-lg font-semibold">R$ {data.resumo.totalLiquido}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs text-slate-500">FGTS</p>
          <p className="text-lg font-semibold">R$ {data.resumo.totalFGTS}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs text-slate-500">Custo total empresa</p>
          <p className="text-lg font-semibold">R$ {data.resumo.custoTotalEmpresa}</p>
        </div>
      </div>
      <details className="bg-slate-100 rounded-lg p-4">
        <summary className="cursor-pointer font-medium text-slate-700">Detalhe (holerites)</summary>
        <pre className="mt-3 text-xs overflow-auto max-h-96 whitespace-pre-wrap">
          {JSON.stringify(data.holerites, null, 2)}
        </pre>
      </details>
    </div>
  );
}

import { useState } from 'react';
import { apiFetch } from '../services/api';
import type { FuncionarioView } from '../utils/funcionario';

interface Props {
  funcionarios: FuncionarioView[];
  onRefresh: () => void;
}

export default function ListarFuncionarios({ funcionarios, onRefresh }: Props) {
  const [erro, setErro] = useState('');
  const [idDesligar, setIdDesligar] = useState<string | null>(null);

  async function desligar(id: string) {
    if (!confirm('Confirma o desligamento deste funcionário?')) return;
    setErro('');
    setIdDesligar(id);
    try {
      await apiFetch(`/rh/funcionarios/${id}`, { method: 'DELETE' });
      onRefresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao desligar');
    } finally {
      setIdDesligar(null);
    }
  }

  return (
    <div>
      <h2 className="font-serif text-2xl text-[#0f2340] mb-4">Funcionários</h2>
      {erro && <p className="text-red-600 text-sm mb-3">{erro}</p>}

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Nome</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Cargo</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Departamento</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Salário</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">CPF</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Status</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Ações</th>
            </tr>
          </thead>
          <tbody>
            {funcionarios.map((f) => (
              <tr key={f.id} className="border-b border-slate-100 hover:bg-slate-50/80">
                <td className="px-4 py-3 font-medium text-[#0f2340]">{f.nome}</td>
                <td className="px-4 py-3">{f.cargoLabel}</td>
                <td className="px-4 py-3">{f.departamentoLabel}</td>
                <td className="px-4 py-3">
                  {f.salario != null && !Number.isNaN(f.salario)
                    ? f.salario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                    : '—'}
                </td>
                <td className="px-4 py-3">{f.cpf ?? '—'}</td>
                <td className="px-4 py-3">{f.status ?? '—'}</td>
                <td className="px-4 py-3">
                  {f.ativo && (
                    <button
                      type="button"
                      onClick={() => desligar(f.id)}
                      disabled={idDesligar === f.id}
                      className="text-xs text-red-600 hover:underline disabled:opacity-50"
                    >
                      {idDesligar === f.id ? '...' : 'Desligar'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {funcionarios.length === 0 && (
          <p className="px-4 py-8 text-center text-slate-500">Nenhum funcionário cadastrado.</p>
        )}
      </div>
    </div>
  );
}

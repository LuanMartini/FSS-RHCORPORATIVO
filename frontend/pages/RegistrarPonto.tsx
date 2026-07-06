import { useState, type FormEvent } from 'react';
import { apiFetch } from '../services/api';
import type { FuncionarioView } from '../utils/funcionario';

const TIPOS = [
  { value: 'ENTRADA', label: 'Entrada' },
  { value: 'SAIDA', label: 'Saída' },
  { value: 'INTERVALO_INICIO', label: 'Início intervalo' },
  { value: 'INTERVALO_FIM', label: 'Fim intervalo' },
] as const;

interface Props {
  funcionarios: FuncionarioView[];
  onSuccess: () => void;
}

interface PontoRegistro {
  id: number;
  tipo: string;
  registrado_em: string;
}

export default function RegistrarPonto({ funcionarios, onSuccess }: Props) {
  const ativos = funcionarios.filter(f => f.ativo);
  const [funcionarioId, setFuncionarioId] = useState('');
  const [tipo, setTipo] = useState<string>('ENTRADA');
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');
  const [espelho, setEspelho] = useState<PontoRegistro[]>([]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro('');
    setOk('');
    setSaving(true);
    try {
      const reg = await apiFetch<Record<string, unknown>>('/rh/ponto', {
        method: 'POST',
        body: JSON.stringify({
          funcionarioId: Number(funcionarioId),
          tipo,
        }),
      });
      setOk(`Registro ${reg.tipo as string} gravado às ${String(reg.hora)}.`);
      onSuccess();
      const esp = await apiFetch<PontoRegistro[]>(`/rh/ponto/${funcionarioId}`);
      setEspelho(esp);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao registrar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      <h2 className="font-serif text-2xl text-[#0f2340]">Registrar ponto</h2>

      {erro && (
        <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{erro}</div>
      )}
      {ok && (
        <div className="px-4 py-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">{ok}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Funcionário</label>
          <select
            required
            value={funcionarioId}
            onChange={e => setFuncionarioId(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
          >
            <option value="">Selecione</option>
            {ativos.map(f => (
              <option key={f.id} value={f.id}>{f.nome}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Tipo</label>
          <select
            value={tipo}
            onChange={e => setTipo(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
          >
            {TIPOS.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={saving || !funcionarioId}
          className="w-full py-2.5 bg-[#0f2340] text-white rounded-lg text-sm font-semibold disabled:opacity-50"
        >
          {saving ? 'Registrando...' : 'Registrar'}
        </button>
      </form>

      {espelho.length > 0 && (
        <div className="bg-slate-100 rounded-lg p-4 text-xs overflow-auto max-h-64">
          <p className="font-semibold text-slate-700 mb-2">Espelho de ponto (JSON)</p>
          <pre className="whitespace-pre-wrap">{JSON.stringify(espelho, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

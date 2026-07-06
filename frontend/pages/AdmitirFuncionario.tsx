import { useState, useEffect, type ChangeEvent, type FormEvent } from 'react';
import { apiFetch } from '../services/api';

interface Cargo {
  id: number;
  nome: string;
  departamentoId: number;
  salarioBase: number;
}

interface Departamento {
  id: number;
  nome: string;
  sigla: string;
}

interface Props {
  onSuccess: () => void;
}

export default function AdmitirFuncionario({ onSuccess }: Props) {
  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [departamentos, setDepartamentos] = useState<Departamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');

  const [form, setForm] = useState({
    nome: '',
    cpf: '',
    email: '',
    cargoId: '',
    departamentoId: '',
    salario: '',
    telefone: '',
    dataNascimento: '',
  });

  useEffect(() => {
    (async () => {
      try {
        const [c, d] = await Promise.all([
          apiFetch<Cargo[]>('/rh/cargos'),
          apiFetch<Departamento[]>('/rh/departamentos'),
        ]);
        setCargos(c);
        setDepartamentos(d);
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não foi possível carregar cargos e departamentos');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function handleChange(e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = e.target;
    setForm(prev => {
      const next = { ...prev, [name]: value };
      if (name === 'cargoId') {
        const cg = cargos.find(x => String(x.id) === value);
        if (cg) {
          next.salario = String(cg.salarioBase);
          next.departamentoId = String(cg.departamentoId);
        }
      }
      return next;
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro('');
    setOk('');
    setSaving(true);
    try {
      await apiFetch('/rh/admitir', {
        method: 'POST',
        body: JSON.stringify({
          nome: form.nome.trim(),
          cpf: form.cpf.replace(/\D/g, ''),
          email: form.email.trim(),
          cargoId: Number(form.cargoId),
          departamentoId: form.departamentoId ? Number(form.departamentoId) : undefined,
          salario: Number(form.salario),
          telefone: form.telefone.trim() || undefined,
          dataNascimento: form.dataNascimento || undefined,
        }),
      });
      setOk('Funcionário admitido com sucesso.');
      setForm({
        nome: '', cpf: '', email: '', cargoId: '', departamentoId: '', salario: '',
        telefone: '', dataNascimento: '',
      });
      onSuccess();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao admitir');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-slate-500">Carregando cargos e departamentos...</p>;
  }

  return (
    <div className="max-w-xl">
      <h2 className="font-serif text-2xl text-[#0f2340] mb-6">Admitir funcionário</h2>

      {erro && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          {erro}
        </div>
      )}
      {ok && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">
          {ok}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Nome completo</label>
          <input
            name="nome"
            required
            value={form.nome}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">CPF (somente números)</label>
          <input
            name="cpf"
            required
            value={form.cpf}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">E-mail</label>
          <input
            name="email"
            type="email"
            required
            value={form.email}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Cargo</label>
          <select
            name="cargoId"
            required
            value={form.cargoId}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
          >
            <option value="">Selecione</option>
            {cargos.map(c => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Departamento</label>
          <select
            name="departamentoId"
            value={form.departamentoId}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
          >
            <option value="">(padrão do cargo)</option>
            {departamentos.map(d => (
              <option key={d.id} value={d.id}>{d.nome} ({d.sigla})</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Salário</label>
          <input
            name="salario"
            type="number"
            min={0}
            step={0.01}
            required
            value={form.salario}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Telefone (opcional)</label>
          <input
            name="telefone"
            value={form.telefone}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Data de nascimento (opcional)</label>
          <input
            name="dataNascimento"
            type="date"
            value={form.dataNascimento}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full py-2.5 bg-[#0f2340] text-white rounded-lg text-sm font-semibold disabled:opacity-50"
        >
          {saving ? 'Salvando...' : 'Cadastrar'}
        </button>
      </form>
    </div>
  );
}

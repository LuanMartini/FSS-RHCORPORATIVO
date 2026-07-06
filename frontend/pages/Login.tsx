import { useState, type FormEvent } from 'react';
import { useAuth } from '../context/useAuth';
import { apiFetch } from '../services/api';

interface Props {
  onSwitch: () => void;
  canRegister: boolean;
}

export default function Login({ onSwitch, canRegister }: Props) {
  const { login } = useAuth();
  const [form, setForm] = useState({ email: '', senha: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handle = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await apiFetch<{ token: string; usuario: { nome: string; email: string } }>('/login', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      login(data.token, data.usuario);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao entrar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      {/* Painel esquerdo */}
      <div className="relative flex flex-col items-start justify-center overflow-hidden bg-[#0f2340] px-6 py-10 lg:px-16">
        {/* Círculo decorativo */}

        <div className="relative z-10">
          <div className="font-serif text-3xl text-white mb-14 tracking-tight">
            RH<span className="text-[#c8973a]">Corp</span>
          </div>
          <h1 className="font-serif text-5xl text-white leading-tight mb-5">
            Gestão de pessoas<br />com precisão<br />e cuidado.
          </h1>
          <p className="text-white/45 text-base leading-relaxed max-w-sm">
            Sistema integrado de recursos humanos para empresas que valorizam seus colaboradores.
          </p>
        </div>
      </div>

      {/* Formulário */}
      <div className="flex flex-col items-center justify-center bg-white px-6 py-10 lg:px-16">
        <div className="w-full max-w-sm">
          <h2 className="font-serif text-4xl text-[#0f2340] mb-2">Bem-vindo de volta</h2>
          <p className="text-sm text-slate-400 mb-9">Acesse o painel administrativo</p>

          {error && (
            <div className="mb-5 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handle} className="space-y-5">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                E-mail
              </label>
              <input
                type="email"
                placeholder="admin@empresa.com"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                required
                className="w-full px-4 py-3 border-[1.5px] border-slate-200 rounded-lg text-sm text-slate-800 outline-none focus:border-[#0f2340] focus:ring-2 focus:ring-[#0f2340]/8 transition-all"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                Senha
              </label>
              <input
                type="password"
                placeholder="••••••••"
                value={form.senha}
                onChange={e => setForm({ ...form, senha: e.target.value })}
                required
                className="w-full px-4 py-3 border-[1.5px] border-slate-200 rounded-lg text-sm text-slate-800 outline-none focus:border-[#0f2340] focus:ring-2 focus:ring-[#0f2340]/8 transition-all"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-[#0f2340] hover:bg-[#1a3560] text-white text-sm font-semibold rounded-lg transition-all hover:-translate-y-px hover:shadow-lg disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none"
            >
              {loading ? (
                <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : 'Entrar'}
            </button>
          </form>

          {canRegister && <p className="mt-6 text-center text-sm text-slate-400">
            Não tem conta?{' '}
            <button onClick={onSwitch} className="text-[#c8973a] font-semibold hover:text-[#e8b84b] transition-colors">
              Cadastrar administrador
            </button>
          </p>}
        </div>
      </div>
    </div>
  );
}

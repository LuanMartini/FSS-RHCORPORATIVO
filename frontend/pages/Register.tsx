import { useState, FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../services/api';

interface Props {
  onSwitch: () => void;
}

export default function Register({ onSwitch }: Props) {
  const { login } = useAuth();
  const [form, setForm] = useState({ nome: '', email: '', senha: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handle = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await apiFetch('/registrar', { method: 'POST', body: JSON.stringify(form) });
      const data = await apiFetch<{ token: string; usuario: { nome: string; email: string } }>('/login', {
        method: 'POST',
        body: JSON.stringify({ email: form.email, senha: form.senha }),
      });
      login(data.token, data.usuario);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid grid-cols-2">
      {/* Painel esquerdo */}
      <div className="relative bg-[#0f2340] flex flex-col justify-center items-start px-16 overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse at 20% 80%, rgba(200,151,58,0.18) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(200,151,58,0.08) 0%, transparent 50%)',
          }}
        />
        <div className="absolute -bottom-16 -right-16 w-80 h-80 rounded-full border border-[#c8973a]/20 pointer-events-none" />
        <div className="absolute -bottom-4 -right-4 w-56 h-56 rounded-full border border-[#c8973a]/10 pointer-events-none" />

        <div className="relative z-10">
          <div className="font-serif text-3xl text-white mb-14 tracking-tight">
            RH<span className="text-[#c8973a]">Corp</span>
          </div>
          <h1 className="font-serif text-5xl text-white leading-tight mb-5">
            Configure seu<br />ambiente de<br />gestão.
          </h1>
          <p className="text-white/45 text-base leading-relaxed max-w-sm">
            Crie a conta de administrador para começar a gerenciar sua equipe com eficiência.
          </p>
        </div>
      </div>

      {/* Formulário */}
      <div className="bg-white flex flex-col justify-center items-center px-16">
        <div className="w-full max-w-sm">
          <h2 className="font-serif text-4xl text-[#0f2340] mb-2">Novo administrador</h2>
          <p className="text-sm text-slate-400 mb-9">Preencha os dados para criar sua conta</p>

          {error && (
            <div className="mb-5 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2">
              ⚠ {error}
            </div>
          )}

          <form onSubmit={handle} className="space-y-5">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                Nome completo
              </label>
              <input
                type="text"
                placeholder="João Silva"
                value={form.nome}
                onChange={e => setForm({ ...form, nome: e.target.value })}
                required
                className="w-full px-4 py-3 border-[1.5px] border-slate-200 rounded-lg text-sm text-slate-800 outline-none focus:border-[#0f2340] focus:ring-2 focus:ring-[#0f2340]/8 transition-all"
              />
            </div>
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
                placeholder="Mínimo 6 caracteres"
                value={form.senha}
                onChange={e => setForm({ ...form, senha: e.target.value })}
                required
                minLength={6}
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
              ) : 'Criar conta e entrar'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-400">
            Já tem conta?{' '}
            <button onClick={onSwitch} className="text-[#c8973a] font-semibold hover:text-[#e8b84b] transition-colors">
              Fazer login
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
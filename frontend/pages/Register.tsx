import { useState, type FormEvent } from 'react';
import { useAuth } from '../context/useAuth';
import type { User } from '../context/authState';
import { apiFetch } from '../services/api';
import { AuthLayout, Feedback, SubmitForm } from '../components/ui';

export default function Register({ onSwitch }: { onSwitch: () => void }) {
  const { login } = useAuth();
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState(false);
  const [error, setError] = useState('');

  async function handle(event: FormEvent<HTMLFormElement>) {
    const fields = new FormData(event.currentTarget);
    const nome = fields.get('nome');
    const email = fields.get('email');
    const senha = fields.get('senha');
    setLoading(true);
    setError('');
    try {
      await apiFetch('/registrar', { method: 'POST', body: JSON.stringify({ nome, email, senha }) });
      setCreated(true);
      const data = await apiFetch<{ token: string; usuario: User }>('/login', { method: 'POST', body: JSON.stringify({ email, senha }) });
      login(data.token, data.usuario);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível concluir o acesso.');
    } finally {
      setLoading(false);
    }
  }

  return <AuthLayout title="Novo administrador" description="Cadastre a conta inicial para acessar o FSS RH.">
    {created && <Feedback kind="success">Conta criada. Você pode entrar pela tela de login.</Feedback>}
    {error && <Feedback>{error}</Feedback>}
    {!created && <SubmitForm submit={handle} className="auth-form" aria-busy={loading}>
      <label htmlFor="register-nome">Nome completo <span aria-hidden="true">*</span>
        <input id="register-nome" name="nome" autoComplete="name" required />
      </label>
      <label htmlFor="register-email">E-mail <span aria-hidden="true">*</span>
        <input id="register-email" name="email" type="email" autoComplete="username" required />
      </label>
      <label htmlFor="register-senha">Senha <span aria-hidden="true">*</span>
        <input id="register-senha" name="senha" type="password" autoComplete="new-password" required minLength={12} aria-describedby="password-length" />
      </label>
      <small id="password-length">Use pelo menos 12 caracteres.</small>
      <button className="ui-button" type="submit" disabled={loading}>{loading ? 'Criando conta…' : 'Criar conta e entrar'}</button>
    </SubmitForm>}
    <button className="auth-link" type="button" onClick={onSwitch} disabled={loading}>Voltar ao login</button>
  </AuthLayout>;
}

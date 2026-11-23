import { useState, type FormEvent } from 'react';
import { useAuth } from '../context/useAuth';
import type { User } from '../context/authState';
import { apiFetch } from '../services/api';
import Icon from '../components/Icon';
import { AuthLayout, Feedback, SubmitForm } from '../components/ui';

interface Props {
  onSwitch: () => void;
  canRegister: boolean;
  sessionExpired?: boolean;
}

export default function Login({ onSwitch, canRegister, sessionExpired }: Props) {
  const { login } = useAuth();
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handle(event: FormEvent<HTMLFormElement>) {
    const fields = new FormData(event.currentTarget);
    setError('');
    setLoading(true);
    try {
      const data = await apiFetch<{ token: string; usuario: User }>('/login', {
        method: 'POST',
        body: JSON.stringify({ email: fields.get('email'), senha: fields.get('senha') }),
      });
      login(data.token, data.usuario);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível entrar.');
    } finally {
      setLoading(false);
    }
  }

  return <AuthLayout title="Acesse sua conta" description="Entre com seu e-mail e senha para acessar o FSS RH.">
    {sessionExpired && <Feedback kind="warning">Sua sessão expirou. Entre novamente para continuar.</Feedback>}
    {error && <Feedback>{error}</Feedback>}
    <SubmitForm submit={handle} className="auth-form" aria-busy={loading}>
      <label htmlFor="login-email">E-mail <span aria-hidden="true">*</span>
        <input autoComplete="username" id="login-email" name="email" type="email" placeholder="voce@empresa.com" required />
      </label>
      <label htmlFor="login-senha">Senha <span aria-hidden="true">*</span></label>
      <div className="password-field">
        <input id="login-senha" name="senha" type={visible ? 'text' : 'password'} autoComplete="current-password" required />
        <button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}><Icon name={visible ? 'eyeOff' : 'eye'} size={18} /></button>
      </div>
      <button className="ui-button" type="submit" disabled={loading}>{loading ? 'Entrando…' : 'Entrar'}<Icon name="arrow" size={17} /></button>
    </SubmitForm>
    {canRegister && <button className="auth-link" type="button" onClick={onSwitch}>Cadastrar administrador</button>}
  </AuthLayout>;
}

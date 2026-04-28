import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { apiFetch } from './services/api';
import Sidebar, { Page } from './components/Sidebar';
import Login      from './pages/Login';
import Register   from './pages/Register';
import Dashboard  from './pages/Dashboard';
//import Funcionarios from './pages/Funcionarios';
//import Admitir    from './pages/Admitir';
//import Ponto      from './pages/Ponto';
//import Holerite   from './pages/Holerite';

interface Funcionario {
  id?: string;
  nome: string;
  cargo?: string;
  departamento?: string;
  salario?: number;
  cpf?: string;
  ativo?: boolean;
  dataAdmissao?: string;
}

//Shell autenticado
function AppShell() {
  const [page, setPage]               = useState<Page>('dashboard');
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [loadingFunc, setLoadingFunc] = useState(false);

  const fetchFuncionarios = async () => {
    setLoadingFunc(true);
    try {
      const data = await apiFetch<Funcionario[] | { funcionarios: Funcionario[] }>('/rh/funcionarios');
      setFuncionarios(Array.isArray(data) ? data : data.funcionarios ?? []);
    } catch {
      // silently fail — token pode estar expirado
    } finally {
      setLoadingFunc(false);
    }
  };

  useEffect(() => { fetchFuncionarios(); }, []);

  const renderPage = () => {
    switch (page) {
      case 'dashboard':    return <Dashboard    funcionarios={funcionarios} setPage={setPage} />;
      default:             return <Dashboard    funcionarios={funcionarios} setPage={setPage} />;
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar page={page} setPage={setPage} />
      <main className="ml-64 flex-1 px-12 py-10">
        {renderPage()}
      </main>
    </div>
  );
}

//Auth gate
function AuthGate() {
  const { token } = useAuth();
  const [authScreen, setAuthScreen] = useState<'login' | 'register'>('login');

  if (!token) {
    return authScreen === 'login'
      ? <Login    onSwitch={() => setAuthScreen('register')} />
      : <Register onSwitch={() => setAuthScreen('login')}    />;
  }

  return <AppShell />;
}

//Root
export default function App() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}
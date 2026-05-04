import { useState, useEffect, useCallback } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { apiFetch } from './services/api';
import Sidebar from './components/Sidebar';

import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard, { type MetricasDashboard } from './pages/Dashboard';
import ListarFuncionarios from './pages/ListarFuncionarios';
import AdmitirFuncionario from './pages/AdmitirFuncionario';
import RegistrarPonto from './pages/RegistrarPonto';
import Holerite from './pages/Holerite';
import FolhaCompleta from './pages/FolhaCompleta';
import Ferias from './pages/Ferias';
import Beneficios from './pages/Beneficios';
import Treinamentos from './pages/Treinamentos';
import Advertencias from './pages/Advertencias';

import type { Page } from './types/page';
import { mapFuncionarioApi, type FuncionarioView } from './utils/funcionario';

function AppShell() {
  const [page, setPage] = useState<Page>('dashboard');
  const [funcionarios, setFuncionarios] = useState<FuncionarioView[]>([]);
  const [metricas, setMetricas] = useState<MetricasDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshDados = useCallback(async () => {
    setLoading(true);
    try {
      const [dash, raw] = await Promise.all([
        apiFetch<MetricasDashboard>('/rh/dashboard'),
        apiFetch<Record<string, unknown>[]>('/rh/funcionarios'),
      ]);
      setMetricas(dash);
      setFuncionarios(raw.map(mapFuncionarioApi));
    } catch {
      setMetricas(null);
      setFuncionarios([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshDados();
  }, [refreshDados]);

  const renderPage = () => {
    if (loading) {
      return <p className="text-slate-500">Carregando...</p>;
    }

    switch (page) {
      case 'dashboard':
        return (
          <Dashboard
            metricas={metricas}
            funcionarios={funcionarios}
            setPage={setPage}
          />
        );
      case 'funcionarios':
        return (
          <ListarFuncionarios
            funcionarios={funcionarios}
            onRefresh={refreshDados}
          />
        );
      case 'admitir':
        return <AdmitirFuncionario onSuccess={refreshDados} />;
      case 'ponto':
        return <RegistrarPonto funcionarios={funcionarios} onSuccess={refreshDados} />;
      case 'holerite':
        return <Holerite funcionarios={funcionarios} />;
      case 'folha':
        return <FolhaCompleta />;
      case 'ferias':
        return <Ferias funcionarios={funcionarios} onRefresh={refreshDados} />;
      case 'beneficios':
        return <Beneficios funcionarios={funcionarios} onRefresh={refreshDados} />;
      case 'treinamentos':
        return <Treinamentos funcionarios={funcionarios} onRefresh={refreshDados} />;
      case 'advertencias':
        return <Advertencias funcionarios={funcionarios} onRefresh={refreshDados} />;
      default:
        return (
          <Dashboard metricas={metricas} funcionarios={funcionarios} setPage={setPage} />
        );
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar page={page} setPage={setPage} />

      <main className="ml-[220px] flex-1 px-12 py-10">
        {renderPage()}
      </main>
    </div>
  );
}

function AuthGate() {
  const { token } = useAuth();
  const [authScreen, setAuthScreen] = useState<'login' | 'register'>('login');

  if (!token) {
    return authScreen === 'login'
      ? <Login onSwitch={() => setAuthScreen('register')} />
      : <Register onSwitch={() => setAuthScreen('login')} />;
  }

  return <AppShell />;
}

export default function App() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}

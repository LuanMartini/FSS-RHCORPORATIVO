import { lazy, Suspense, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './context/useAuth';
import { CoreRhProvider } from './context/CoreRhContext';
import { apiFetch } from './services/api';
import Sidebar from './components/Sidebar';

import Login from './pages/Login';
import Register from './pages/Register';
import type { MetricasDashboard } from './pages/Dashboard';
const Dashboard = lazy(() => import('./pages/Dashboard'));
const ListarFuncionarios = lazy(() => import('./pages/ListarFuncionarios'));
const AdmissaoDigital = lazy(() => import('./pages/AdmissaoDigital'));
const Organograma = lazy(() => import('./pages/Organograma'));
const EspelhoPontoAvancado = lazy(() => import('./pages/EspelhoPontoAvancado'));
const Holerite = lazy(() => import('./pages/Holerite'));
const FolhaCompleta = lazy(() => import('./pages/FolhaCompleta'));
const AtsRecrutamento = lazy(() => import('./pages/AtsRecrutamento'));
const GestaoDesempenho = lazy(() => import('./pages/GestaoDesempenho'));
const Beneficios = lazy(() => import('./pages/Beneficios'));
const Ferias = lazy(() => import('./pages/Ferias'));
const Treinamentos = lazy(() => import('./pages/Treinamentos'));
const ClimaComunicacao = lazy(() => import('./pages/ClimaComunicacao'));
const AuditoriaAnalytics = lazy(() => import('./pages/AuditoriaAnalytics'));
const Advertencias = lazy(() => import('./pages/Advertencias'));

import type { Page } from './types/page';
import { mapFuncionarioApi, type FuncionarioView } from './utils/funcionario';

function DeferredPage({ children }: { children: ReactNode }) {
  return <Suspense fallback={<p className="text-sm text-slate-500">Carregando tela…</p>}>{children}</Suspense>;
}

function AppShell() {
  const { user, logout } = useAuth();
  const permissions = useMemo(() => user?.permissoes ?? [], [user?.permissoes]);
  const [page, setPage] = useState<Page>(() => permissions.includes('rh.dashboard.read') ? 'dashboard' : 'ponto');
  const [funcionarios, setFuncionarios] = useState<FuncionarioView[]>([]);
  const [metricas, setMetricas] = useState<MetricasDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');

  const refreshDados = useCallback(async () => {
    if (!permissions.includes('rh.dashboard.read') && !permissions.includes('employee.read')) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setErro('');
    try {
      const [dash, raw] = await Promise.all([
        permissions.includes('rh.dashboard.read')
          ? apiFetch<MetricasDashboard>('/rh/dashboard')
          : Promise.resolve(null),
        permissions.includes('employee.read')
          ? apiFetch<Record<string, unknown>[]>('/rh/funcionarios')
          : Promise.resolve([]),
      ]);
      setMetricas(dash);
      setFuncionarios(raw.map(mapFuncionarioApi));
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Nao foi possivel carregar os dados.');
      setMetricas(null);
      setFuncionarios([]);
    } finally {
      setLoading(false);
    }
  }, [permissions]);

  useEffect(() => {
    refreshDados();
  }, [refreshDados]);

  const renderPage = () => {
    if (loading) {
      return <p className="text-slate-500">Carregando...</p>;
    }

    if (erro) {
      return (
        <div className="max-w-lg rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          <p className="font-semibold">Nao foi possivel carregar o painel.</p>
          <p className="mt-1">{erro}</p>
          <button
            type="button"
            onClick={refreshDados}
            className="mt-4 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800"
          >
            Tentar novamente
          </button>
        </div>
      );
    }

    switch (page) {
      case 'dashboard':
        return <DeferredPage>
          <Dashboard
            metricas={metricas}
            funcionarios={funcionarios}
            setPage={setPage}
          />
        </DeferredPage>;
      case 'funcionarios':
        return <DeferredPage>
          <ListarFuncionarios
            funcionarios={funcionarios}
            onRefresh={refreshDados}
          />
        </DeferredPage>;
      case 'admitir':
        return <DeferredPage><AdmissaoDigital /></DeferredPage>;
      case 'organograma':
        return <DeferredPage><Organograma /></DeferredPage>;
      case 'ponto':
        return <DeferredPage><EspelhoPontoAvancado /></DeferredPage>;
      case 'holerite':
        return <DeferredPage><Holerite funcionarios={funcionarios} /></DeferredPage>;
      case 'folha':
        return <DeferredPage><FolhaCompleta /></DeferredPage>;
      case 'ats':
        return <DeferredPage><AtsRecrutamento /></DeferredPage>;
      case 'performance':
        return <DeferredPage><GestaoDesempenho /></DeferredPage>;
      case 'ferias':
        return <DeferredPage><Ferias funcionarios={funcionarios} onRefresh={refreshDados} /></DeferredPage>;
      case 'beneficios':
        return <DeferredPage><Beneficios /></DeferredPage>;
      case 'treinamentos':
        return <DeferredPage><Treinamentos /></DeferredPage>;
      case 'clima':
        return <DeferredPage><ClimaComunicacao /></DeferredPage>;
      case 'auditoria':
        return <DeferredPage><AuditoriaAnalytics /></DeferredPage>;
      case 'advertencias':
        return <DeferredPage><Advertencias funcionarios={funcionarios} onRefresh={refreshDados} /></DeferredPage>;
      default:
        return <DeferredPage>
          <Dashboard metricas={metricas} funcionarios={funcionarios} setPage={setPage} />
        </DeferredPage>;
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 lg:flex-row">
      <Sidebar page={page} setPage={setPage} userName={user?.nome} permissions={permissions} onLogout={logout} />

      <main className="flex-1 px-4 py-6 sm:px-6 lg:ml-[220px] lg:px-12 lg:py-10">
        {renderPage()}
      </main>
    </div>
  );
}

function AuthGate() {
  const { token } = useAuth();
  const [authScreen, setAuthScreen] = useState<'login' | 'register'>('login');
  const canRegister = import.meta.env.VITE_ADMIN_REGISTRATION_ENABLED === 'true';

  if (!token) {
    return authScreen === 'login' || !canRegister
      ? <Login canRegister={canRegister} onSwitch={() => setAuthScreen('register')} />
      : <Register onSwitch={() => setAuthScreen('login')} />;
  }

  return (
    <CoreRhProvider>
      <AppShell />
    </CoreRhProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}

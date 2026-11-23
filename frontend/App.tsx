import { lazy, Suspense, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './context/useAuth';
import { CoreRhProvider } from './context/CoreRhContext';
import { apiFetch, type ApiError } from './services/api';
import Sidebar from './components/Sidebar';
import { EmptyState, Feedback, Loading } from './components/ui';
import { canOpenPage, employeePermissions, navigation } from './navigation';
import Login from './pages/Login';
import Register from './pages/Register';
import type { MetricasDashboard } from './pages/Dashboard';
import type { Page } from './types/page';
import { mapFuncionarioApi, type FuncionarioView } from './utils/funcionario';

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

interface Resource<T> {
  data: T;
  loading: boolean;
  error?: string;
}

function resourceError(error: unknown) {
  return (error as ApiError | undefined)?.status === 403
    ? 'Seu perfil não tem acesso a estes dados.'
    : 'Não foi possível carregar os dados. Verifique sua conexão e tente novamente.';
}

function AppShell() {
  const { user, logout } = useAuth();
  const permissions = useMemo(() => user?.permissoes ?? [], [user?.permissoes]);
  const available = navigation.flatMap((group) => group.items.map((item) => ({ ...item, group: group.label })));
  const [selected, setSelected] = useState<Page>();
  const item = available.find((entry) => entry.key === selected && canOpenPage(entry.key, permissions))
    ?? available.find((entry) => canOpenPage(entry.key, permissions));
  const page = item?.key;
  const [people, setPeople] = useState<Resource<FuncionarioView[]>>({ data: [], loading: true });
  const [dashboard, setDashboard] = useState<Resource<MetricasDashboard | null>>({ data: null, loading: true });
  const peopleRequest = useRef<AbortController | null>(null);
  const dashboardRequest = useRef<AbortController | null>(null);
  const peopleReady = useRef(false);
  const main = useRef<HTMLElement>(null);

  const loadPeople = useCallback(async () => {
    if (!employeePermissions.some((permission) => permissions.includes(permission))) return;
    peopleRequest.current?.abort();
    const request = new AbortController();
    peopleRequest.current = request;
    if (!peopleReady.current) setPeople({ data: [], loading: true });
    try {
      const records: FuncionarioView[] = [];
      let cursor = '';
      while (true) {
        const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
        const rows = await apiFetch<Record<string, unknown>[]>(`/rh/funcionarios${query}`, { signal: request.signal });
        records.push(...rows.map(mapFuncionarioApi));
        const nextCursor = String(rows.at(-1)?.id ?? '');
        if (rows.length < 100 || !nextCursor || nextCursor === cursor) break;
        cursor = nextCursor;
      }
      if (!request.signal.aborted) {
        peopleReady.current = true;
        setPeople({ data: records, loading: false });
      }
    } catch (error) {
      if (!request.signal.aborted) setPeople({ data: [], loading: false, error: resourceError(error) });
    }
  }, [permissions]);

  const loadDashboard = useCallback(async () => {
    if (!canOpenPage('dashboard', permissions)) return;
    dashboardRequest.current?.abort();
    const request = new AbortController();
    dashboardRequest.current = request;
    setDashboard({ data: null, loading: true });
    try {
      const result = await apiFetch<MetricasDashboard>('/rh/dashboard', { signal: request.signal, cache: 'no-store' });
      if (!request.signal.aborted) setDashboard({ data: result, loading: false });
    } catch (error) {
      if (!request.signal.aborted) setDashboard({ data: null, loading: false, error: resourceError(error) });
    }
  }, [permissions]);

  useEffect(() => {
    const start = window.setTimeout(loadPeople, 0);
    return () => {
      window.clearTimeout(start);
      peopleRequest.current?.abort();
    };
  }, [loadPeople]);

  useEffect(() => {
    if (page !== 'dashboard') return;
    const start = window.setTimeout(loadDashboard, 0);
    return () => {
      window.clearTimeout(start);
      dashboardRequest.current?.abort();
    };
  }, [page, loadDashboard]);

  function goTo(next: Page) {
    if (!canOpenPage(next, permissions)) return;
    if (next === 'dashboard' && page !== next) setDashboard({ data: null, loading: true });
    setSelected(next);
    main.current?.focus();
    window.scrollTo(0, 0);
  }

  const canReadPeople = employeePermissions.some((permission) => permissions.includes(permission));
  const funcionarios = canReadPeople ? people.data : [];
  const usesPeople = page === 'funcionarios' || page === 'holerite' || page === 'ferias' || page === 'advertencias';

  function renderPage() {
    if (usesPeople && canReadPeople) {
      if (people.loading) return <Loading label="Carregando funcionários" />;
      if (people.error) return <Feedback retry={loadPeople}>{people.error}</Feedback>;
    }
    switch (page) {
      case 'dashboard':
        if (dashboard.loading) return <Loading label="Carregando dashboard" />;
        if (dashboard.error) return <Feedback retry={loadDashboard}>{dashboard.error}</Feedback>;
        return <Dashboard metricas={dashboard.data} funcionarios={funcionarios} setPage={goTo} />;
      case 'funcionarios': return <ListarFuncionarios funcionarios={funcionarios} onRefresh={loadPeople} />;
      case 'admitir': return <AdmissaoDigital onCreated={loadPeople} />;
      case 'organograma': return <Organograma />;
      case 'ponto': return <EspelhoPontoAvancado />;
      case 'holerite': return <Holerite funcionarios={funcionarios} />;
      case 'folha': return <FolhaCompleta />;
      case 'ats': return <AtsRecrutamento />;
      case 'performance': return <GestaoDesempenho />;
      case 'ferias': return <Ferias funcionarios={funcionarios} onRefresh={loadPeople} />;
      case 'beneficios': return <Beneficios />;
      case 'treinamentos': return <Treinamentos />;
      case 'clima': return <ClimaComunicacao />;
      case 'auditoria': return <AuditoriaAnalytics />;
      case 'advertencias': return <Advertencias funcionarios={funcionarios} onRefresh={loadPeople} />;
      default: return <EmptyState icon="shield" title="Sem acesso aos módulos" description="Seu perfil não possui permissões para acessar os módulos do FSS RH." />;
    }
  }

  const initials = user?.nome.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();

  return <div className="app-layout">
    <a className="skip-link" href="#conteudo">Ir para o conteúdo</a>
    <Sidebar page={page} setPage={goTo} permissions={permissions} onLogout={logout} />
    <header className="topbar">
      <div className="breadcrumb"><span>{item?.group ?? 'FSS RH'}</span><span aria-hidden="true">/</span><strong>{item?.label ?? 'Acesso'}</strong></div>
      {user && <div className="user-summary"><span className="avatar" aria-hidden="true">{initials}</span><div><strong>{user.nome}</strong><span>{user.perfil.toLocaleLowerCase('pt-BR').replaceAll('_', ' ')}</span></div></div>}
    </header>
    <main className="app-main" id="conteudo" tabIndex={-1} ref={main}>
      <div className={`module module--${page ?? 'access'}`}>
        <Suspense fallback={<Loading label="Carregando módulo" />}>{renderPage()}</Suspense>
      </div>
    </main>
  </div>;
}

function AuthGate() {
  const { token, sessionExpired } = useAuth();
  const [authScreen, setAuthScreen] = useState<'login' | 'register'>('login');
  const canRegister = import.meta.env.VITE_ADMIN_REGISTRATION_ENABLED === 'true';

  if (!token) {
    return authScreen === 'login' || !canRegister || sessionExpired
      ? <Login canRegister={canRegister} sessionExpired={sessionExpired} onSwitch={() => setAuthScreen('register')} />
      : <Register onSwitch={() => setAuthScreen('login')} />;
  }

  return <CoreRhProvider key={token}><AppShell /></CoreRhProvider>;
}

export default function App() {
  return <AuthProvider><AuthGate /></AuthProvider>;
}

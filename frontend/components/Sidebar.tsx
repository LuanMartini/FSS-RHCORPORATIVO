import type { Page } from '../types/page';

interface Props {
  page: Page;
  setPage: (page: Page) => void;
  userName?: string;
  permissions: string[];
  onLogout: () => void;
}

const navItems: Array<{ key: Page; label: string; anyOf?: string[] }> = [
  { key: 'dashboard', label: 'Dashboard', anyOf: ['rh.dashboard.read'] },
  { key: 'funcionarios', label: 'Funcionários', anyOf: ['employee.read'] },
  { key: 'admitir', label: 'Admitir', anyOf: ['onboarding.read'] },
  { key: 'ats', label: 'Recrutamento ATS', anyOf: ['ats.use'] },
  { key: 'performance', label: 'Desempenho & Sucessão', anyOf: ['performance.read'] },
  { key: 'organograma', label: 'Organograma', anyOf: ['organization.read'] },
  { key: 'ponto', label: 'Ponto & Jornada', anyOf: ['time.self', 'time.manage'] },
  { key: 'holerite', label: 'Holerite' },
  { key: 'folha', label: 'Folha & Payroll', anyOf: ['payroll.read'] },
  { key: 'ferias', label: 'Férias', anyOf: ['time.self', 'time.manage'] },
  { key: 'beneficios', label: 'Benefícios', anyOf: ['benefits.self', 'benefits.approve'] },
  { key: 'treinamentos', label: 'Treinamentos', anyOf: ['lms.use'] },
  { key: 'clima', label: 'Clima & Mural', anyOf: ['climate.use', 'climate.analytics'] },
  { key: 'auditoria', label: 'Auditoria & Analytics', anyOf: ['audit.read'] },
  { key: 'advertencias', label: 'Advertências', anyOf: ['employee.read'] },
];

export default function Sidebar({ page, setPage, userName, permissions, onLogout }: Props) {
  const allowedItems = navItems.filter(
    (item) => !item.anyOf || item.anyOf.some((permission) => permissions.includes(permission)),
  );

  return (
    <aside className="sticky top-0 z-20 flex w-full flex-col gap-4 bg-[#1e1e2f] px-4 py-4 text-white shadow-sm lg:fixed lg:left-0 lg:top-0 lg:h-screen lg:w-[220px] lg:px-5 lg:py-5">
      <div className="flex items-center justify-between gap-3 lg:block">
        <h2 className="font-serif text-xl font-semibold">RH Corporativo</h2>
        {userName && (
          <span className="max-w-[140px] truncate text-xs text-white/60 lg:mt-1 lg:block">
            {userName}
          </span>
        )}
      </div>

      <nav aria-label="Módulos do ERP" className="flex gap-2 overflow-x-auto pb-1 lg:block lg:space-y-2 lg:overflow-visible lg:pb-0">
        {allowedItems.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setPage(item.key)}
            aria-current={page === item.key ? 'page' : undefined}
            className={`min-h-11 shrink-0 rounded-lg px-3 py-2 text-left text-sm transition-colors lg:block lg:w-full ${
              page === item.key
                ? 'bg-[#34345a] text-white'
                : 'text-white/80 hover:bg-white/10 hover:text-white'
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <button
        type="button"
        onClick={onLogout}
        className="min-h-11 rounded-lg border border-white/15 px-3 py-2 text-left text-sm font-semibold text-white/80 transition-colors hover:bg-white/10 hover:text-white lg:mt-auto"
      >
        Sair
      </button>
    </aside>
  );
}

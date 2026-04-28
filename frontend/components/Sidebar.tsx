import { useAuth } from '../context/AuthContext';

type Page = 'dashboard' | 'funcionarios' | 'admitir' | 'ponto' | 'holerite';

interface SidebarProps {
  page: Page;
  setPage: (p: Page) => void;
}

const navItems: { key: Page; icon: string; label: string }[] = [
  { key: 'dashboard',    icon: '⊞',  label: 'Dashboard'           },
  { key: 'funcionarios', icon: '👥', label: 'Funcionários'         },
  { key: 'admitir',      icon: '＋', label: 'Admitir Funcionário'  },
  { key: 'ponto',        icon: '⏱', label: 'Registrar Ponto'      },
  { key: 'holerite',     icon: '📄', label: 'Holerite'             },
];

export default function Sidebar({ page, setPage }: SidebarProps) {
  const { user, logout } = useAuth();
  const initial = user?.nome?.[0]?.toUpperCase() ?? 'A';

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-64 bg-[#0f2340] flex flex-col z-50">
      {/* Logo */}
      <div className="px-7 py-7 border-b border-white/5">
        <div className="font-serif text-xl text-white tracking-tight">
          RH<span className="text-[#c8973a]">Corp</span>
        </div>
        <div className="text-[10px] text-white/30 uppercase tracking-widest mt-1">
          Recursos Humanos
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-white/20 px-4 mb-3">
          Menu Principal
        </p>
        {navItems.map(item => (
          <button
            key={item.key}
            onClick={() => setPage(item.key)}
            className={`
              w-full flex items-center gap-3 px-4 py-[10px] rounded-md text-sm font-medium
              transition-all duration-150 mb-0.5 text-left font-sans
              ${page === item.key
                ? 'bg-[#c8973a]/15 text-white'
                : 'text-white/50 hover:bg-white/5 hover:text-white/80'}
            `}
          >
            <span className="w-5 text-center text-base">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-3 py-4 border-t border-white/5">
        <div className="flex items-center gap-3 px-4 py-3 mb-1">
          <div className="w-9 h-9 rounded-full bg-[#c8973a] flex items-center justify-center text-sm font-bold text-white shrink-0">
            {initial}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white truncate">{user?.nome ?? 'Administrador'}</div>
            <div className="text-[11px] text-white/30">Admin</div>
          </div>
        </div>
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-4 py-[10px] rounded-md text-sm text-white/35 hover:bg-white/5 hover:text-white/60 transition-all duration-150 font-sans"
        >
          <span className="w-5 text-center">⎋</span> Sair
        </button>
      </div>
    </aside>
  );
}

export type { Page };
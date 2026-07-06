import type { Page } from "../types/page";

interface Props {
  page: Page;
  setPage: (p: Page) => void;
  userName?: string;
  onLogout: () => void;
}

const navItems: { key: Page; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "funcionarios", label: "Funcionários" },
  { key: "admitir", label: "Admitir" },
  { key: "ponto", label: "Ponto" },
  { key: "holerite", label: "Holerite" },
  { key: "folha", label: "Folha do mês" },
  { key: "ferias", label: "Férias" },
  { key: "beneficios", label: "Benefícios" },
  { key: "treinamentos", label: "Treinamentos" },
  { key: "advertencias", label: "Advertências" },
];

export default function Sidebar({ page, setPage, userName, onLogout }: Props) {
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

      <nav className="flex gap-2 overflow-x-auto pb-1 lg:block lg:space-y-2 lg:overflow-visible lg:pb-0">
        {navItems.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setPage(item.key)}
            className={`shrink-0 rounded-lg px-3 py-2 text-left text-sm transition-colors lg:block lg:w-full ${
              page === item.key
                ? "bg-[#34345a] text-white"
                : "text-white/80 hover:bg-white/10 hover:text-white"
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <button
        type="button"
        onClick={onLogout}
        className="rounded-lg border border-white/15 px-3 py-2 text-left text-sm font-semibold text-white/80 transition-colors hover:bg-white/10 hover:text-white lg:mt-auto"
      >
        Sair
      </button>
    </aside>
  );
}

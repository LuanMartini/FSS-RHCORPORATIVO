import { useAuth } from '../context/AuthContext';
import { Page } from '../components/Sidebar';

interface Funcionario {
  id?: string;
  nome: string;
  cargo?: string;
  departamento?: string;
  salario?: number;
  cpf?: string;
  ativo?: boolean;
}

interface Props {
  funcionarios: Funcionario[];
  setPage: (p: Page) => void;
}

export default function Dashboard({ funcionarios, setPage }: Props) {
  const { user } = useAuth();
  const hora = new Date().getHours();
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
  const primeiroNome = user?.nome?.split(' ')[0] ?? 'Admin';
  const dataHoje = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  const totalAtivos = funcionarios.filter(f => f.ativo !== false).length;
  const departamentos = new Set(funcionarios.map(f => f.departamento).filter(Boolean)).size;

  const stats = [
    { label: 'Total de Funcionários', value: funcionarios.length, icon: '👥', accent: '#0f2340' },
    { label: 'Colaboradores Ativos',  value: totalAtivos,          icon: '✓',  accent: '#2d7a4f' },
    { label: 'Departamentos',         value: departamentos,        icon: '🏢', accent: '#c8973a' },
  ];

  const acoes = [
    { label: '＋ Admitir Funcionário', page: 'admitir' as Page, primary: true },
    { label: '⏱ Registrar Ponto',     page: 'ponto'   as Page, primary: false },
    { label: '📄 Gerar Holerite',      page: 'holerite' as Page, primary: false },
    { label: '👥 Ver Todos',           page: 'funcionarios' as Page, primary: false },
  ];

  return (
    <div>
      {/* Header */}
      <div className="mb-9">
        <h1 className="font-serif text-4xl text-[#0f2340] tracking-tight mb-1">
          {saudacao}, {primeiroNome}
        </h1>
        <p className="text-slate-400 text-sm capitalize">{dataHoje}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-5 mb-8">
        {stats.map(s => (
          <div key={s.label} className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm relative overflow-hidden">
            <div
              className="absolute top-0 left-0 right-0 h-[3px]"
              style={{ background: s.accent }}
            />
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3">{s.label}</p>
            <p className="font-serif text-5xl text-[#0f2340] tracking-tight leading-none">{s.value}</p>
            <span className="absolute top-5 right-6 text-3xl opacity-[0.07]">{s.icon}</span>
          </div>
        ))}
      </div>

      {/* Ações rápidas */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm mb-6">
        <div className="px-7 py-5 border-b border-slate-100">
          <h2 className="font-serif text-xl text-[#0f2340]">Ações Rápidas</h2>
        </div>
        <div className="px-7 py-6 flex flex-wrap gap-3">
          {acoes.map(a => (
            <button
              key={a.label}
              onClick={() => setPage(a.page)}
              className={`
                px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-150 hover:-translate-y-px
                ${a.primary
                  ? 'bg-[#0f2340] text-white hover:bg-[#1a3560] hover:shadow-md'
                  : 'bg-white text-[#0f2340] border-[1.5px] border-slate-200 hover:border-[#0f2340] hover:bg-slate-50'}
              `}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {/* Últimos admitidos */}
      {funcionarios.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="px-7 py-5 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-serif text-xl text-[#0f2340]">Últimos Admitidos</h2>
            <button
              onClick={() => setPage('funcionarios')}
              className="text-sm text-[#c8973a] font-semibold hover:text-[#e8b84b] transition-colors"
            >
              Ver todos →
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-slate-100">
                  <th className="px-7 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-400">Nome</th>
                  <th className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-400">Cargo</th>
                  <th className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-400">Departamento</th>
                  <th className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-400">Status</th>
                </tr>
              </thead>
              <tbody>
                {[...funcionarios].reverse().slice(0, 5).map((f, i) => (
                  <tr key={f.id ?? i} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors">
                    <td className="px-7 py-4 font-semibold text-[#0f2340] text-sm">{f.nome}</td>
                    <td className="px-5 py-4 text-sm text-slate-600">{f.cargo ?? '—'}</td>
                    <td className="px-5 py-4 text-sm text-slate-600">{f.departamento ?? '—'}</td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700">
                        ● Ativo
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
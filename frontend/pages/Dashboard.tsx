import { useAuth } from '../context/useAuth';
import type { Page } from '../types/page';
import type { FuncionarioView } from '../utils/funcionario';

export interface MetricasDashboard {
  colaboradores: {
    total: number;
    ativos: number;
    desligados: number;
    emFerias: number;
  };
  folha: {
    custoMensalBruto: string;
    mediaSalarial: string;
    maiorSalario: string;
    menorSalario: string;
    custoFGTS: string;
    custoTotalEmpresa: string;
  };
  estrutura: {
    totalDepartamentos: number;
    totalCargos: number;
    distribuicaoPorDepto: { departamento: string; sigla: string; total: number }[];
  };
  pontoDoDia: { registrosHoje: number };
}

interface Props {
  metricas: MetricasDashboard | null;
  funcionarios: FuncionarioView[];
  setPage: (p: Page) => void;
}

export default function Dashboard({ metricas, funcionarios, setPage }: Props) {
  const { user } = useAuth();
  const hora = new Date().getHours();
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
  const primeiroNome = user?.nome?.split(' ')[0] ?? 'Admin';
  const dataHoje = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  const total = metricas?.colaboradores.total ?? funcionarios.length;
  const ativos = metricas?.colaboradores.ativos ?? funcionarios.filter(f => f.ativo).length;
  const deptos = metricas?.estrutura.totalDepartamentos
    ?? new Set(funcionarios.map(f => f.departamentoLabel).filter(d => d !== '—')).size;

  const stats = [
    { label: 'Total de Funcionários', value: total, accent: '#0f2340' },
    { label: 'Colaboradores Ativos',  value: ativos,          accent: '#2d7a4f' },
    { label: 'Departamentos',         value: deptos,          accent: '#c8973a' },
  ];

  const acoes: { label: string; page: Page; primary: boolean }[] = [
    { label: 'Admitir funcionário', page: 'admitir', primary: true },
    { label: 'Registrar ponto', page: 'ponto', primary: false },
    { label: 'Holerite', page: 'holerite', primary: false },
    { label: 'Folha do mês', page: 'folha', primary: false },
    { label: 'Ver funcionários', page: 'funcionarios', primary: false },
    { label: 'Férias', page: 'ferias', primary: false },
    { label: 'Benefícios', page: 'beneficios', primary: false },
    { label: 'Treinamentos', page: 'treinamentos', primary: false },
    { label: 'Advertências', page: 'advertencias', primary: false },
  ];

  return (
    <div>
      <div className="mb-9">
        <h1 className="font-serif text-4xl text-[#0f2340] tracking-tight mb-1">
          {saudacao}, {primeiroNome}
        </h1>
        <p className="text-slate-400 text-sm capitalize">{dataHoje}</p>
        {metricas && (
          <p className="text-slate-500 text-sm mt-2">
            Registros de ponto hoje: <strong>{metricas.pontoDoDia.registrosHoje}</strong>
            {' · '}
            Custo folha bruto: R$ {metricas.folha.custoMensalBruto}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 mb-8 sm:grid-cols-3">
        {stats.map(s => (
          <div key={s.label} className="bg-white rounded-lg p-6 border border-slate-200 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: s.accent }} />
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3">{s.label}</p>
            <p className="font-serif text-5xl text-[#0f2340] tracking-tight leading-none">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-lg border border-slate-200 shadow-sm mb-6">
        <div className="px-7 py-5 border-b border-slate-100">
          <h2 className="font-serif text-xl text-[#0f2340]">Ações rápidas</h2>
        </div>
        <div className="px-7 py-6 flex flex-wrap gap-3">
          {acoes.map(a => (
            <button
              key={a.label}
              type="button"
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

      {funcionarios.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
          <div className="px-7 py-5 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-serif text-xl text-[#0f2340]">Últimos admitidos</h2>
            <button
              type="button"
              onClick={() => setPage('funcionarios')}
              className="text-sm text-[#c8973a] font-semibold hover:text-[#e8b84b] transition-colors"
            >
              Ver todos
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
                  <tr key={f.id || i} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors">
                    <td className="px-7 py-4 font-semibold text-[#0f2340] text-sm">{f.nome}</td>
                    <td className="px-5 py-4 text-sm text-slate-600">{f.cargoLabel}</td>
                    <td className="px-5 py-4 text-sm text-slate-600">{f.departamentoLabel}</td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700">
                        {f.status ?? (f.ativo ? 'Ativo' : 'Inativo')}
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

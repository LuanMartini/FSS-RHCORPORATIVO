import { useAuth } from '../context/useAuth';
import Icon, { type IconName } from '../components/Icon';
import { EmptyState, PageHeading, TableRegion } from '../components/ui';
import { canOpenPage } from '../navigation';
import type { Page } from '../types/page';
import type { FuncionarioView } from '../utils/funcionario';
import EmployeeStatus from '../components/EmployeeStatus';

export interface MetricasDashboard {
  colaboradores: { total: number; ativos: number; desligados: number; emFerias: number };
  folha?: {
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
  setPage: (page: Page) => void;
}

const shortcuts: { label: string; page: Page; icon: IconName }[] = [
  { label: 'Admitir funcionário', page: 'admitir', icon: 'userPlus' },
  { label: 'Ponto e jornada', page: 'ponto', icon: 'clock' },
  { label: 'Holerite', page: 'holerite', icon: 'receipt' },
  { label: 'Folha do mês', page: 'folha', icon: 'card' },
  { label: 'Ver funcionários', page: 'funcionarios', icon: 'people' },
  { label: 'Férias', page: 'ferias', icon: 'calendar' },
  { label: 'Benefícios', page: 'beneficios', icon: 'card' },
  { label: 'Treinamentos', page: 'treinamentos', icon: 'book' },
  { label: 'Advertências', page: 'advertencias', icon: 'alert' },
];

const number = new Intl.NumberFormat('pt-BR');
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function formatBudget(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? money.format(parsed) : '—';
}

export default function Dashboard({ metricas, funcionarios, setPage }: Props) {
  const { user } = useAuth();
  const permissions = user?.permissoes ?? [];
  const date = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const actions = shortcuts.filter((action) => canOpenPage(action.page, permissions)
    && (action.page !== 'admitir' || permissions.includes('onboarding.write'))
    && (!['folha', 'holerite'].includes(action.page) || metricas?.folha));
  const canSeeEmployees = canOpenPage('funcionarios', permissions);
  const payroll = permissions.includes('payroll.read') ? metricas?.folha : undefined;
  const departments = metricas?.estrutura.distribuicaoPorDepto ?? [];
  const peak = Math.max(1, ...departments.map((department) => department.total));
  const indicators: { label: string; value: number; detail: string; icon: IconName; tone: string }[] = metricas ? [
    { label: 'Total de funcionários', value: metricas.colaboradores.total, detail: `${number.format(metricas.colaboradores.desligados)} desligados`, icon: 'people', tone: 'blue' },
    { label: 'Colaboradores ativos', value: metricas.colaboradores.ativos, detail: `${number.format(metricas.colaboradores.emFerias)} em férias`, icon: 'check', tone: 'green' },
    { label: 'Departamentos', value: metricas.estrutura.totalDepartamentos, detail: `${number.format(metricas.estrutura.totalCargos)} cargos cadastrados`, icon: 'building', tone: 'purple' },
    { label: 'Registros de ponto', value: metricas.pontoDoDia.registrosHoje, detail: 'Marcações de hoje', icon: 'clock', tone: 'amber' },
  ] : [];

  return <div className="dashboard-layout">
    <PageHeading title="Dashboard" description="Acompanhe os principais indicadores de pessoas e operações de RH."
      action={<span className="dashboard-date"><Icon name="calendar" size={17} />{date}</span>} />

    <section className="dashboard-welcome" aria-label="Boas-vindas">
      <div><p>Visão geral do RH</p><h2>Olá{user?.nome ? `, ${user.nome.trim().split(/\s+/)[0]}` : ''}!</h2>
        <p>{canSeeEmployees ? 'Consulte o quadro de pessoas e os módulos disponíveis para o seu perfil.' : 'Consulte os indicadores disponíveis para o seu perfil.'}</p>
        {canSeeEmployees && <button type="button" className="ui-button welcome-button" onClick={() => setPage('funcionarios')}>Ver quadro de pessoas <Icon name="arrow" size={17} /></button>}
      </div>
      <div className="dashboard-art" aria-hidden="true"><span className="art-tile art-tile--top"><Icon name="building" size={25} /></span><span className="art-tile art-tile--main"><Icon name="people" size={42} /></span><span className="art-tile art-tile--bottom"><Icon name="check" size={26} /></span></div>
    </section>

    {metricas ? <section aria-label="Indicadores do RH" className="dashboard-metrics">
      {indicators.map((stat) => <article className="metric-card" key={stat.label}>
        <span className={`icon-tile tone-${stat.tone}`}><Icon name={stat.icon} /></span>
        <div><h3>{stat.label}</h3><strong>{number.format(stat.value)}</strong><p>{stat.detail}</p></div>
      </article>)}
    </section> : <EmptyState title="Indicadores indisponíveis" description="Nenhum indicador foi retornado para esta sessão." />}

    <div className="dashboard-columns">
      {metricas && <section className="panel department-panel">
        <div className="panel-heading"><h2>Pessoas por departamento</h2><p>Distribuição do quadro de colaboradores</p></div>
        {departments.length > 0 ? <ul className="department-list">
          {departments.map((department) => <li key={`${department.sigla}-${department.departamento}`}>
            <div><span>{department.departamento}</span><strong>{number.format(department.total)}</strong></div>
            <div className="chart-track" aria-hidden="true"><span style={{ width: `${department.total / peak * 100}%` }} /></div>
          </li>)}
        </ul> : <EmptyState title="Sem dados por departamento" description="A distribuição aparecerá aqui quando estiver disponível." icon="building" />}
      </section>}
      {actions.length > 0 && <section className="panel">
        <div className="panel-heading"><h2>Acessos rápidos</h2><p>Atalhos para as operações de RH</p></div>
        <div className="shortcut-list">{actions.map((action) => <button type="button" key={action.page} onClick={() => setPage(action.page)}>
          <span className="icon-tile"><Icon name={action.icon} size={17} /></span><span>{action.label}</span><Icon name="chevron" size={16} />
        </button>)}</div>
      </section>}
    </div>

    {payroll && <section className="panel payroll-summary">
      <span className="icon-tile tone-green"><Icon name="receipt" /></span>
      <div><h2>Custo bruto da folha</h2><p>Valor mensal informado pela API</p></div>
      <strong>{formatBudget(payroll.custoMensalBruto)}</strong>
      <button type="button" className="ui-button ui-button--secondary" onClick={() => setPage('folha')}>Abrir folha <Icon name="arrow" size={16} /></button>
    </section>}

    {canSeeEmployees && funcionarios.length > 0 && <section className="panel">
      <div className="panel-heading panel-heading--action"><div><h2>Funcionários</h2><p>Visão rápida dos cadastros disponíveis</p></div>
        <button type="button" className="ui-button ui-button--secondary" onClick={() => setPage('funcionarios')}>Ver todos <Icon name="arrow" size={16} /></button>
      </div>
      <TableRegion label="Resumo de funcionários">
        <table><thead><tr><th scope="col">Nome</th><th scope="col">Cargo</th><th scope="col">Departamento</th><th scope="col">Status</th></tr></thead>
          <tbody>{funcionarios.slice(-5).reverse().map((person) => <tr key={person.id}><th scope="row">{person.nome}</th><td>{person.cargoLabel}</td><td>{person.departamentoLabel}</td><td><EmployeeStatus status={person.status} /></td></tr>)}</tbody>
        </table>
      </TableRegion>
    </section>}
  </div>;
}

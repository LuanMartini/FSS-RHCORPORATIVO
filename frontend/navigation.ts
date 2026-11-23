import type { IconName } from './components/Icon';
import type { Page } from './types/page';

interface NavigationItem {
  key: Page;
  label: string;
  icon: IconName;
  permissions: string[];
}

export const employeePermissions = ['employee.read', 'employee.read.basic', 'employee.read.all'];
export const vacationPermissions = ['time.manage.team', 'time.manage.all'];

export const navigation: { label: string; items: NavigationItem[] }[] = [
  { label: 'Visão geral', items: [
    { key: 'dashboard', label: 'Dashboard', icon: 'dashboard', permissions: ['rh.dashboard.read'] },
  ] },
  { label: 'Gestão de pessoas', items: [
    { key: 'funcionarios', label: 'Funcionários', icon: 'people', permissions: employeePermissions },
    { key: 'admitir', label: 'Admissão digital', icon: 'userPlus', permissions: ['onboarding.read'] },
    { key: 'organograma', label: 'Organograma', icon: 'building', permissions: ['organization.read'] },
    { key: 'ats', label: 'Recrutamento', icon: 'briefcase', permissions: ['ats.use'] },
    { key: 'performance', label: 'Desempenho e sucessão', icon: 'chart', permissions: ['performance.read', 'performance.manage.team', 'performance.manage.all'] },
  ] },
  { label: 'Operações de RH', items: [
    { key: 'ponto', label: 'Ponto e jornada', icon: 'clock', permissions: ['time.self', 'time.manage', 'time.hr.approve', ...vacationPermissions] },
    { key: 'ferias', label: 'Férias', icon: 'calendar', permissions: vacationPermissions },
    { key: 'beneficios', label: 'Benefícios', icon: 'card', permissions: ['benefits.self', 'benefits.approve'] },
    { key: 'treinamentos', label: 'Treinamentos', icon: 'book', permissions: ['lms.use'] },
    { key: 'clima', label: 'Clima e mural', icon: 'chat', permissions: ['climate.use', 'climate.analytics'] },
    { key: 'advertencias', label: 'Advertências', icon: 'alert', permissions: ['employee.read'] },
  ] },
  { label: 'Financeiro', items: [
    { key: 'holerite', label: 'Holerite', icon: 'receipt', permissions: ['payroll.read'] },
    { key: 'folha', label: 'Folha de pagamento', icon: 'card', permissions: ['payroll.read'] },
  ] },
  { label: 'Sistema', items: [
    { key: 'auditoria', label: 'Auditoria e indicadores', icon: 'shield', permissions: ['audit.read'] },
  ] },
];

export function canOpenPage(page: Page, permissions: string[]) {
  return navigation.some(({ items }) => items.some((item) =>
    item.key === page && item.permissions.some((permission) => permissions.includes(permission))));
}

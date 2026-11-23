import { employeeStatusLabel } from '../utils/funcionario';

export default function EmployeeStatus({ status }: { status?: string }) {
  const tone = status === 'ATIVO' ? 'green' : status === 'FERIAS' ? 'blue' : status === 'AFASTADO' ? 'amber' : 'neutral';
  return <span className={`status-badge tone-${tone}`}><span aria-hidden="true" />{employeeStatusLabel(status)}</span>;
}

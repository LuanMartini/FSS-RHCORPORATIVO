import { useRef, useState } from 'react';
import { apiFetch } from '../services/api';
import { employeeStatusLabel, type FuncionarioView } from '../utils/funcionario';
import { useAuth } from '../context/useAuth';
import Icon from '../components/Icon';
import EmployeeStatus from '../components/EmployeeStatus';
import { EmptyState, Feedback, PageHeading, TableRegion } from '../components/ui';

interface Props {
  funcionarios: FuncionarioView[];
  onRefresh: () => void | Promise<void>;
}

const PAGE_SIZE = 12;
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const normalize = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR');

export default function ListarFuncionarios({ funcionarios, onRefresh }: Props) {
  const permissions = useAuth().user?.permissoes ?? [];
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [department, setDepartment] = useState('');
  const [page, setPage] = useState(1);
  const [person, setPerson] = useState<FuncionarioView | null>(null);
  const [termination, setTermination] = useState<FuncionarioView | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const details = useRef<HTMLDialogElement>(null);
  const confirm = useRef<HTMLDialogElement>(null);
  const canTerminate = permissions.includes('employee.terminate');
  const showSalary = permissions.includes('employee.read.salary');
  const showCpf = permissions.includes('employee.read.sensitive');
  const statuses = [...new Set(funcionarios.flatMap((entry) => entry.status ? [entry.status] : []))];
  const departments = [...new Set(funcionarios.map((entry) => entry.departamentoLabel))].sort((a,b) => a.localeCompare(b, 'pt-BR'));
  const query = normalize(search.trim());
  const filtered = funcionarios.filter((entry) =>
    (!status || status === entry.status) && (!department || department === entry.departamentoLabel)
    && normalize([entry.nome, entry.email, entry.cargoLabel, entry.departamentoLabel].join(' ')).includes(query))
    .sort((a,b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const start = (current - 1) * PAGE_SIZE;
  const visible = filtered.slice(start, start + PAGE_SIZE);

  async function desligar() {
    if (!termination || busy || !canTerminate) return;
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await apiFetch(`/rh/funcionarios/${encodeURIComponent(termination.id)}`, { method: 'DELETE' });
      confirm.current?.close();
      setNotice(`Desligamento de ${termination.nome} registrado.`);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível desligar o funcionário.');
    } finally { setBusy(false); }
  }

  return <div className="page-stack">
    <PageHeading title="Funcionários" description="Consulte cadastros, departamentos, cargos e status dos colaboradores." />
    {notice && <Feedback kind="success">{notice}</Feedback>}
    <section className="panel">
      <div className="list-toolbar">
        <div className="search-field"><label htmlFor="employee-search">Buscar funcionário</label><div><Icon name="search" size={18} />
          <input id="employee-search" type="search" placeholder="Nome, e-mail, cargo ou departamento" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
        </div></div>
        <label>Departamento<select value={department} onChange={(event) => { setDepartment(event.target.value); setPage(1); }}>
          <option value="">Todos os departamentos</option>{departments.map((entry) => <option key={entry}>{entry}</option>)}
        </select></label>
        <label>Status<select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
          <option value="">Todos os status</option>{statuses.map((entry) => <option value={entry} key={entry}>{employeeStatusLabel(entry)}</option>)}
        </select></label>
      </div>
      {visible.length ? <>
        <TableRegion label="Lista de funcionários">
          <table className="employee-table"><thead><tr><th scope="col">Nome</th><th scope="col">Cargo e departamento</th>
            {showSalary && <th scope="col">Salário</th>}
            <th scope="col">Status</th><th scope="col">Ações</th>
          </tr></thead><tbody>
            {visible.map((entry) => <tr key={entry.id}><th scope="row">
              <button type="button" className="table-name" onClick={() => { setPerson(entry); details.current?.showModal(); }}>{entry.nome}</button>
              {entry.email && <small>{entry.email}</small>}</th>
              <td>{entry.cargoLabel}<small>{entry.departamentoLabel}</small></td>
              {showSalary && <td className="numeric">{entry.salario == null ? '—' : money.format(entry.salario)}</td>}
              <td><EmployeeStatus status={entry.status} /></td>
              <td><button type="button" className="ui-button ui-button--secondary ui-button--small" aria-label={`Ver detalhes de ${entry.nome}`} onClick={() => { setPerson(entry); details.current?.showModal(); }}>Detalhes</button>
                {entry.ativo && canTerminate && <button type="button" className="ui-button ui-button--danger ui-button--small" onClick={() => { setTermination(entry); setError(''); confirm.current?.showModal(); }}>Desligar</button>}</td>
            </tr>)}
          </tbody></table>
        </TableRegion>
        <footer className="pagination"><span aria-live="polite">{start + 1}–{start + visible.length} de {filtered.length} funcionários</span>
          <div><button type="button" className="ui-button ui-button--secondary ui-button--small" disabled={current <= 1} onClick={() => setPage(current - 1)}>Anterior</button>
            <button type="button" className="ui-button ui-button--secondary ui-button--small" disabled={current >= pages} onClick={() => setPage(current + 1)}>Próxima</button></div>
        </footer>
      </> : <EmptyState title={funcionarios.length ? 'Nenhum resultado para esses filtros' : 'Nenhum funcionário disponível'} description={funcionarios.length ? 'Altere a busca, o departamento ou o status.' : 'Os cadastros disponíveis para seu perfil aparecerão aqui.'} />}
    </section>

    <dialog ref={details} className="ui-dialog" aria-labelledby="employee-detail-title">
      {person && <><header><h2 id="employee-detail-title">{person.nome}</h2><button type="button" className="ui-button ui-button--secondary ui-button--small" onClick={() => details.current?.close()} aria-label="Fechar detalhes"><Icon name="close" size={18} /></button></header>
        <dl className="detail-grid"><div><dt>Status</dt><dd><EmployeeStatus status={person.status} /></dd></div>
          <div><dt>Cargo</dt><dd>{person.cargoLabel}</dd></div><div><dt>Departamento</dt><dd>{person.departamentoLabel}</dd></div>
          {person.email && <div><dt>E-mail</dt><dd>{person.email}</dd></div>}
          {showCpf && person.cpf && <div><dt>CPF</dt><dd>{person.cpf}</dd></div>}
          {showSalary && person.salario != null && <div><dt>Salário</dt><dd>{money.format(person.salario)}</dd></div>}
        </dl></>}
    </dialog>

    <dialog ref={confirm} className="ui-dialog" aria-labelledby="employee-termination-title" onCancel={(event) => { if (busy) event.preventDefault(); }}>
      <header><h2 id="employee-termination-title">Confirmar desligamento</h2></header>
      <p>Deseja registrar o desligamento de <strong>{termination?.nome}</strong>?</p>
      {error && <Feedback>{error}</Feedback>}
      <footer><button type="button" className="ui-button ui-button--secondary" disabled={busy} onClick={() => confirm.current?.close()}>Cancelar</button>
        <button type="button" className="ui-button ui-button--danger" disabled={busy} onClick={() => void desligar()}>{busy ? 'Registrando…' : 'Confirmar desligamento'}</button></footer>
    </dialog>
  </div>;
}

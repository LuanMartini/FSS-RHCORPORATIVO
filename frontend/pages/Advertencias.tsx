import { EmptyState, Feedback, Loading, PageHeading, StatusBadge, SubmitForm, TableRegion } from '../components/ui';
import { useAuth } from '../context/useAuth';
import { useState, useEffect, type FormEvent } from 'react';
import { apiFetch } from '../services/api';
import type { FuncionarioView } from '../utils/funcionario';

const TIPOS = [
  { value: 'VERBAL', label: 'Verbal' },
  { value: 'ESCRITA', label: 'Escrita' },
  { value: 'SUSPENSAO', label: 'Suspensão' },
];

interface AdvertenciaRow {
  id: number;
  funcionarioId: number;
  tipo: string;
  descricao: string;
  dataOcorrencia: string;
  funcionario?: { nome: string } | null;
}

interface Props {
  funcionarios: FuncionarioView[];
  onRefresh: () => void;
}

export default function Advertencias({ funcionarios, onRefresh }: Props) {
  const canWrite = useAuth().user?.permissoes.includes('employee.write');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [loadError, setLoadError] = useState('');
  const [lista, setLista] = useState<AdvertenciaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [form, setForm] = useState({
    funcionarioId: '',
    tipo: 'VERBAL',
    descricao: '',
    dataOcorrencia: '',
  });

  async function carregar() {
    setLoadError('');
    try {
      const data = await apiFetch<AdvertenciaRow[]>('/rh/advertencias');
      setLista(data);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Erro ao listar');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  async function registrar(e: FormEvent) {
    e.preventDefault();
    setErro('');
    setNotice('');
    setSaving(true);
    try {
      await apiFetch('/rh/advertencias', {
        method: 'POST',
        body: JSON.stringify({
          funcionarioId: Number(form.funcionarioId),
          tipo: form.tipo,
          descricao: form.descricao,
          dataOcorrencia: form.dataOcorrencia || undefined,
        }),
      });
      setForm({ funcionarioId: '', tipo: 'VERBAL', descricao: '', dataOcorrencia: '' });
      setNotice('Advertência registrada.');
      await carregar();
      onRefresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao registrar');
    } finally { setSaving(false); }
  }

  return <div className="page-stack">
    <PageHeading title="Advertências" description="Consulte ocorrências e registre medidas disciplinares." />
    {erro && <Feedback>{erro}</Feedback>}
    {notice && <Feedback kind="success">{notice}</Feedback>}
    {canWrite && <SubmitForm submit={registrar} className="panel form-panel" aria-busy={saving}>
      <h2>Nova advertência</h2>
      <div className="form-grid">
        <label className="form-label">Funcionário *<select required value={form.funcionarioId} onChange={(event) => setForm({ ...form, funcionarioId: event.target.value })}>
          <option value="">Selecione</option>{funcionarios.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}
        </select></label>
        <label className="form-label">Tipo<select value={form.tipo} onChange={(event) => setForm({ ...form, tipo: event.target.value })}>
          {TIPOS.map((tipo) => <option key={tipo.value} value={tipo.value}>{tipo.label}</option>)}
        </select></label>
        <label className="form-label">Data da ocorrência<input type="date" value={form.dataOcorrencia} onChange={(event) => setForm({ ...form, dataOcorrencia: event.target.value })} /></label>
        <label className="form-label field-wide">Descrição *<textarea required rows={3} value={form.descricao} onChange={(event) => setForm({ ...form, descricao: event.target.value })} /></label>
      </div>
      <button type="submit" className="ui-button" disabled={saving || !funcionarios.length}>{saving ? "Salvando…" : "Salvar advertência"}</button>
    </SubmitForm>}
    <section className="panel">
      <div className="panel-heading"><h2>Histórico de advertências</h2></div>
      {loading ? <Loading label="Carregando advertências" /> : loadError ? <Feedback retry={carregar}>{loadError}</Feedback> : lista.length ? <TableRegion label="Histórico de advertências">
        <table><thead><tr><th scope="col">Funcionário</th><th scope="col">Tipo</th><th scope="col">Data</th><th scope="col">Descrição</th></tr></thead>
          <tbody>{lista.map((item) => <tr key={item.id}>
            <th scope="row">{item.funcionario?.nome ?? "#" + item.funcionarioId}</th>
            <td><StatusBadge tone={item.tipo === "SUSPENSAO" ? "warning" : "neutral"}>{TIPOS.find((tipo) => tipo.value === item.tipo)?.label ?? item.tipo}</StatusBadge></td>
            <td className="numeric">{item.dataOcorrencia ? item.dataOcorrencia.split("-").reverse().join("/") : "—"}</td>
            <td>{item.descricao}</td>
          </tr>)}</tbody>
        </table>
      </TableRegion> : <EmptyState title="Nenhuma advertência registrada" />}
    </section>
  </div>;
}

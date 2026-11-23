import { useMemo, useState, type DragEvent, type ReactNode } from 'react';
import { useCoreRh } from '../context/useCoreRh';
import { useAuth } from '../context/useAuth';
import { EmptyState, Feedback, Loading, PageHeading, SubmitForm } from '../components/ui';
import { useRef } from 'react';
import type { CargoOrganograma } from '../types/coreRh';

interface TreeNode extends CargoOrganograma { children: TreeNode[] }

function buildTree(items: CargoOrganograma[]): TreeNode[] {
  const nodes = new Map(items.map((item) => [item.id, { ...item, children: [] as TreeNode[] }]));
  const roots: TreeNode[] = [];
  nodes.forEach((node) => {
    const parent = node.superiorId == null ? undefined : nodes.get(node.superiorId);
    if (parent && parent.id !== node.id) parent.children.push(node);
    else roots.push(node);
  });
  const sort = (list: TreeNode[]) => list.sort((a, b) => a.nome.localeCompare(b.nome)).forEach((node) => sort(node.children));
  sort(roots);
  return roots;
}

export default function Organograma() {
  const { organization, loadingOrganization, organizationError, moveCargo, refreshOrganization } = useCoreRh();
  const canMove = useAuth().user?.permissoes.includes('organization.write');
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [moving, setMoving] = useState<number | null>(null);
  const [editing, setEditing] = useState<CargoOrganograma | null>(null);
  const [superior, setSuperior] = useState('');
  const [notice, setNotice] = useState('');
  const [department, setDepartment] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const tree = useMemo(() => buildTree(organization), [organization]);
  const departments = [...new Set(organization.map((item) => item.departamentoNome))].sort((a, b) => a.localeCompare(b, 'pt-BR'));

  async function saveMove(cargo: CargoOrganograma, targetId: number | null) {
    if (!canMove || moving !== null || cargo.id === targetId || cargo.superiorId === targetId) return;
    setNotice('');
    setMoving(cargo.id);
    try {
      await moveCargo(cargo, targetId, 'Reorganização pelo organograma');
      setNotice(`Superior de ${cargo.nome} atualizado.`);
      dialog.current?.close();
    } catch {
      // O contexto publica o erro para a página e para o diálogo.
    }
    finally { setMoving(null); setDraggedId(null); }
  }

  function handleMove(targetId: number | null) {
    const cargo = organization.find((item) => item.id === draggedId);
    if (cargo) void saveMove(cargo, targetId);
  }

  function allowDrop(event: DragEvent) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }

  function renderNode(node: TreeNode, ancestry: Set<number>): ReactNode {
    if (ancestry.has(node.id)) return <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-xs text-red-700">Ciclo detectado no cliente</div>;
    const nextAncestry = new Set(ancestry).add(node.id);
    return (
      <div key={node.id} className="flex flex-col items-center">
        <article draggable={canMove && moving === null} onDragStart={(event) => { setDraggedId(node.id); event.dataTransfer.setData('text/plain', String(node.id)); }} onDragEnd={() => setDraggedId(null)} onDragOver={canMove ? allowDrop : undefined} onDrop={(event) => { event.preventDefault(); handleMove(node.id); }} className={`panel relative w-60 p-4 ${canMove ? 'cursor-grab' : ''} ${draggedId === node.id ? 'border-sky-400 opacity-50' : ''} ${moving === node.id ? 'animate-pulse' : ''}`}>
          <div className="flex items-start justify-between gap-2"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-950 text-xs font-bold text-white">{node.departamentoCodigo}</div><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-500">Nível {node.nivel}</span></div>
          <h3 className="mt-3 text-sm font-semibold text-slate-950">{node.nome}</h3><p className="mt-1 text-xs text-slate-500">{node.departamentoNome}</p>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500"><span>{node.ocupantes} ocupante{node.ocupantes === 1 ? '' : 's'}</span>
            {canMove && <button className="ui-button ui-button--secondary ui-button--small" type="button" disabled={moving !== null} onClick={() => { setEditing(node); setSuperior(String(node.superiorId ?? '')); dialog.current?.showModal(); }}>Alterar superior</button>}
          </div>
        </article>
        {node.children.length > 0 && <><div className="h-7 w-px bg-slate-300" /><div className="relative flex gap-8 pt-4 before:absolute before:left-[120px] before:right-[120px] before:top-0 before:h-px before:bg-slate-300">{node.children.map((child) => <div key={child.id} className="relative before:absolute before:left-1/2 before:top-[-16px] before:h-4 before:w-px before:bg-slate-300">{renderNode(child, nextAncestry)}</div>)}</div></>}
      </div>
    );
  }

  return (
    <div className="page-stack">
      <PageHeading title="Organograma" description="Consulte a hierarquia de cargos e a composição de cada departamento." action={<button type="button" onClick={() => void refreshOrganization()} className="ui-button ui-button--secondary">Atualizar árvore</button>} />
      {organizationError && <Feedback retry={refreshOrganization}>{organizationError}</Feedback>}
      {notice && <Feedback kind="success">{notice}</Feedback>}
      {loadingOrganization ? <Loading label="Carregando organograma" /> : tree.length === 0 ? <section className="panel"><EmptyState title="Nenhum cargo encontrado" /></section> : <>
        <section className="panel compact-panel page-stack"><h2>Departamentos</h2>
          <label className="form-label max-w-sm">Consultar cargos por departamento<select value={department} onChange={(event) => setDepartment(event.target.value)}><option value="">Selecione</option>{departments.map((name) => <option key={name}>{name}</option>)}</select></label>
          {department && <ul className="module-grid">{organization.filter((item) => item.departamentoNome === department).map((item) => <li key={item.id} className="rounded-lg bg-slate-50 p-3 text-sm"><strong>{item.nome}</strong><p>{item.ocupantes} {item.ocupantes === 1 ? 'ocupante' : 'ocupantes'}</p></li>)}</ul>}
        </section>
        {canMove && <div onDragOver={allowDrop} onDrop={(event) => { event.preventDefault(); handleMove(null); }} className="rounded-xl border-2 border-dashed border-slate-300 bg-white p-3 text-center text-sm text-slate-600">Solte aqui um cargo para deixá-lo sem superior.</div>}
        {/* The scrollable tree must be keyboard reachable. */}
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
        <section aria-label="Árvore de cargos" tabIndex={0} className="panel overflow-auto bg-slate-100 p-4 sm:p-8">
          <div className="flex min-w-max gap-8">{tree.map((root) => renderNode(root, new Set()))}</div>
        </section>
      </>}
      <dialog ref={dialog} className="ui-dialog" aria-labelledby="org-dialog-title" onCancel={(event) => { if (moving !== null) event.preventDefault(); }}>
        {editing && <SubmitForm submit={async () => saveMove(editing, superior ? Number(superior) : null)}>
          <header><h2 id="org-dialog-title">Alterar superior</h2></header>
          <p className="text-sm">{editing.nome}</p>
          {organizationError && <Feedback>{organizationError}</Feedback>}
          <label className="form-label">Cargo superior<select value={superior} onChange={(event) => setSuperior(event.target.value)}><option value="">Sem superior</option>{organization.filter((item) => item.id !== editing.id).map((item) => <option key={item.id} value={item.id}>{item.nome} · {item.departamentoNome}</option>)}</select></label>
          <footer><button type="button" className="ui-button ui-button--secondary" disabled={moving !== null} onClick={() => dialog.current?.close()}>Cancelar</button><button className="ui-button" disabled={moving !== null || superior === String(editing.superiorId ?? '')}>{moving !== null ? 'Salvando…' : 'Salvar'}</button></footer>
        </SubmitForm>}
      </dialog>
    </div>
  );
}

import { useMemo, useState, type DragEvent, type ReactNode } from 'react';
import { useCoreRh } from '../context/useCoreRh';
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
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [moving, setMoving] = useState<number | null>(null);
  const tree = useMemo(() => buildTree(organization), [organization]);

  async function handleMove(targetId: number | null) {
    if (draggedId == null || draggedId === targetId) return;
    const cargo = organization.find((item) => item.id === draggedId);
    if (!cargo) return;
    setMoving(cargo.id);
    try { await moveCargo(cargo, targetId, 'Reorganização via drag-and-drop'); }
    finally { setMoving(null); setDraggedId(null); }
  }

  function allowDrop(event: DragEvent) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }

  function renderNode(node: TreeNode, ancestry: Set<number>): ReactNode {
    if (ancestry.has(node.id)) return <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-xs text-red-700">Ciclo detectado no cliente</div>;
    const nextAncestry = new Set(ancestry).add(node.id);
    return (
      <div key={node.id} className="flex flex-col items-center">
        <article draggable onDragStart={(event) => { setDraggedId(node.id); event.dataTransfer.setData('text/plain', String(node.id)); }} onDragEnd={() => setDraggedId(null)} onDragOver={allowDrop} onDrop={(event) => { event.preventDefault(); void handleMove(node.id); }} className={`relative w-60 cursor-grab rounded-2xl border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg active:cursor-grabbing ${draggedId === node.id ? 'border-sky-400 opacity-50' : 'border-slate-200'} ${moving === node.id ? 'animate-pulse' : ''}`}>
          <div className="flex items-start justify-between gap-2"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-950 text-xs font-bold text-white">{node.departamentoCodigo}</div><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-500">Nível {node.nivel}</span></div>
          <h3 className="mt-3 text-sm font-semibold text-slate-950">{node.nome}</h3><p className="mt-1 text-xs text-slate-500">{node.departamentoNome}</p>
          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-[11px] text-slate-400"><span>{node.ocupantes} ocupante{node.ocupantes === 1 ? '' : 's'}</span><span>v{node.versao}</span></div>
        </article>
        {node.children.length > 0 && <><div className="h-7 w-px bg-slate-300" /><div className="relative flex gap-8 pt-4 before:absolute before:left-[120px] before:right-[120px] before:top-0 before:h-px before:bg-slate-300">{node.children.map((child) => <div key={child.id} className="relative before:absolute before:left-1/2 before:top-[-16px] before:h-4 before:w-px before:bg-slate-300">{renderNode(child, nextAncestry)}</div>)}</div></>}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-violet-700">Estrutura organizacional</p><h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Organograma interativo</h1><p className="mt-2 text-sm text-slate-500">Arraste um cargo sobre outro para alterar a linha de reporte com auditoria e rollback.</p></div><button type="button" onClick={() => void refreshOrganization()} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 shadow-sm hover:bg-slate-50">Atualizar árvore</button></header>
      {organizationError && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{organizationError}</div>}
      <div onDragOver={allowDrop} onDrop={(event) => { event.preventDefault(); void handleMove(null); }} className="rounded-2xl border-2 border-dashed border-slate-200 bg-white px-5 py-3 text-center text-xs text-slate-400">Solte aqui para transformar o cargo em raiz</div>
      <section className="min-h-[560px] overflow-auto rounded-3xl border border-slate-200 bg-[radial-gradient(circle_at_1px_1px,#cbd5e1_1px,transparent_0)] bg-[length:22px_22px] p-10 shadow-sm">
        {loadingOrganization ? <p className="text-center text-sm text-slate-500">Recalculando estrutura...</p> : tree.length > 0 ? <div className="flex min-w-max justify-center gap-16">{tree.map((root) => renderNode(root, new Set()))}</div> : <p className="text-center text-sm text-slate-400">Nenhum cargo encontrado.</p>}
      </section>
      <div className="flex flex-wrap gap-4 text-xs text-slate-500"><span>↕ Arraste para mover</span><span>• Lock transacional</span><span>• Controle de versão</span><span>• Prevenção de dependência circular</span></div>
    </div>
  );
}

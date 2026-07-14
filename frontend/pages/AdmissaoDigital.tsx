import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useCoreRh } from '../context/useCoreRh';
import { apiFetch, fetchDocumentBlob } from '../services/api';
import type { DocumentoAdmissao, EtapaAdmissao, NovaAdmissao, TipoDocumento, UploadProgress } from '../types/coreRh';

const stages: { key: EtapaAdmissao; title: string; hint: string; color: string }[] = [
  { key: 'PRE_ADMISSAO', title: 'Pré-admissão', hint: 'Cadastro inicial', color: 'bg-sky-500' },
  { key: 'ENVIO_DOCUMENTOS', title: 'Envio de docs', hint: 'Coleta segura', color: 'bg-violet-500' },
  { key: 'VALIDACAO_RH', title: 'Validação do RH', hint: 'OCR e conferência', color: 'bg-amber-500' },
  { key: 'INTEGRACAO_SISTEMICA', title: 'Integração sistêmica', hint: 'Contrato e ativação', color: 'bg-emerald-500' },
];

const typeLabels: Record<TipoDocumento, string> = {
  RG: 'RG', CPF: 'CPF', PIS: 'PIS',
  COMPROVANTE_RESIDENCIA: 'Comprovante de residência', DIPLOMA: 'Diploma',
};

function inferType(fileName: string): TipoDocumento {
  const name = fileName.toLowerCase();
  if (name.includes('cpf')) return 'CPF';
  if (name.includes('pis')) return 'PIS';
  if (name.includes('resid') || name.includes('comprov')) return 'COMPROVANTE_RESIDENCIA';
  if (name.includes('diploma') || name.includes('certificado')) return 'DIPLOMA';
  return 'RG';
}

function statusStyle(status: DocumentoAdmissao['statusValidacao']) {
  if (status === 'APROVADO') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === 'RECUSADO') return 'bg-red-50 text-red-700 border-red-200';
  return 'bg-amber-50 text-amber-700 border-amber-200';
}

export default function AdmissaoDigital() {
  const {
    admissions, selected, loading, error, selectAdmission, createAdmission,
    uploadDocument, reviewDocument, refreshAdmissions,
  } = useCoreRh();
  const [uploads, setUploads] = useState<UploadProgress[]>([]);
  const [dragging, setDragging] = useState(false);
  const [reviewing, setReviewing] = useState<number | null>(null);
  const [justification, setJustification] = useState('');
  const [actionError, setActionError] = useState('');
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [contractMessage, setContractMessage] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<NovaAdmissao>({ nomeCompleto: '', cpf: '', email: '' });

  const metrics = useMemo(() => ({
    active: admissions.filter((item) => item.etapaAdmissao !== 'CONCLUIDA').length,
    review: admissions.filter((item) => item.etapaAdmissao === 'VALIDACAO_RH').length,
    rejected: admissions.reduce((total, item) => total + item.documentosRecusados, 0),
    completed: admissions.filter((item) => item.etapaAdmissao === 'CONCLUIDA').length,
  }), [admissions]);

  function queueFiles(files: FileList | File[]) {
    const accepted = Array.from(files).map<UploadProgress>((file) => {
      const invalid = !['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)
        ? 'Formato inválido: use PDF, JPG ou PNG.'
        : file.size > 10 * 1024 * 1024 ? 'Arquivo maior que 10 MB.' : undefined;
      return { file, type: inferType(file.name), progress: 0, status: invalid ? 'ERRO' : 'AGUARDANDO', error: invalid };
    });
    setUploads((current) => [...current, ...accepted]);
  }

  function updateUpload(index: number, patch: Partial<UploadProgress>) {
    setUploads((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  }

  async function sendAll() {
    if (!selected) { setActionError('Selecione uma admissão antes de enviar documentos.'); return; }
    setActionError('');
    await Promise.all(uploads.map(async (item, index) => {
      if (item.status === 'ERRO' || item.status === 'CONCLUIDO') return;
      updateUpload(index, { status: 'ENVIANDO', progress: 1 });
      try {
        await uploadDocument(selected.id, item.file, item.type, (progress) => updateUpload(index, { progress }));
        updateUpload(index, { status: 'CONCLUIDO', progress: 100 });
      } catch (uploadError) {
        updateUpload(index, { status: 'ERRO', error: uploadError instanceof Error ? uploadError.message : 'Falha no upload.' });
      }
    }));
  }

  async function openPreview(document: DocumentoAdmissao) {
    setActionError('');
    try {
      if (preview) URL.revokeObjectURL(preview.url);
      const url = URL.createObjectURL(await fetchDocumentBlob(document.id));
      setPreview({ url, name: document.nomeOriginal });
    } catch (previewError) {
      setActionError(previewError instanceof Error ? previewError.message : 'Falha ao abrir documento.');
    }
  }

  async function decide(documentId: number, decision: 'APROVADO' | 'RECUSADO') {
    setActionError('');
    try {
      await reviewDocument(documentId, decision, decision === 'RECUSADO' ? justification : '');
      setReviewing(null);
      setJustification('');
    } catch (reviewError) {
      setActionError(reviewError instanceof Error ? reviewError.message : 'Falha ao validar documento.');
    }
  }

  async function submitAdmission(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setActionError('');
    try {
      await createAdmission(form);
      setForm({ nomeCompleto: '', cpf: '', email: '' });
      setShowForm(false);
    } catch (createError) {
      setActionError(createError instanceof Error ? createError.message : 'Falha ao criar admissão.');
    } finally { setSaving(false); }
  }

  async function generateContract() {
    if (!selected) return;
    setContractMessage('');
    try {
      const response = await apiFetch<{ token_publico: string; pinParaDemonstracao?: string }>(`/core/colaboradores/${selected.id}/contratos`, { method: 'POST' });
      setContractMessage(response.pinParaDemonstracao
        ? `Contrato enfileirado. PIN de demonstração: ${response.pinParaDemonstracao}`
        : 'Contrato gerado e enviado para a fila de e-mails.');
      await refreshAdmissions();
    } catch (contractError) {
      setActionError(contractError instanceof Error ? contractError.message : 'Falha ao gerar contrato.');
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-700">People operations</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Admissão digital</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">Acompanhe documentos, OCR, validação e assinatura em uma única trilha auditável.</p>
        </div>
        <button type="button" onClick={() => setShowForm((value) => !value)} className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 hover:bg-slate-800">
          {showForm ? 'Fechar cadastro' : '+ Nova pré-admissão'}
        </button>
      </header>

      {(error || actionError) && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{actionError || error}</div>}

      {showForm && (
        <form onSubmit={submitAdmission} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-4">
          <input required placeholder="Nome completo" value={form.nomeCompleto} onChange={(event) => setForm({ ...form, nomeCompleto: event.target.value })} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
          <input required placeholder="CPF" value={form.cpf} onChange={(event) => setForm({ ...form, cpf: event.target.value })} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
          <input required type="email" placeholder="E-mail" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
          <button disabled={saving} className="rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Criando...' : 'Criar admissão'}</button>
        </form>
      )}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[['Em andamento', metrics.active], ['Aguardando RH', metrics.review], ['Docs recusados', metrics.rejected], ['Concluídas', metrics.completed]].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-medium text-slate-500">{label}</p><p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p></div>
        ))}
      </section>

      <section className="overflow-x-auto pb-2">
        <div className="grid min-w-[1040px] grid-cols-4 gap-4">
          {stages.map((stage) => {
            const items = admissions.filter((item) => item.etapaAdmissao === stage.key || (stage.key === 'INTEGRACAO_SISTEMICA' && item.etapaAdmissao === 'CONCLUIDA'));
            return (
              <div key={stage.key} className="rounded-2xl border border-slate-200 bg-slate-100/70 p-3">
                <div className="mb-3 flex items-center gap-3 px-1"><span className={`h-2.5 w-2.5 rounded-full ${stage.color}`} /><div><h2 className="text-sm font-semibold text-slate-800">{stage.title}</h2><p className="text-[11px] text-slate-500">{stage.hint} · {items.length}</p></div></div>
                <div className="space-y-2">
                  {items.map((item) => (
                    <button key={item.id} type="button" onClick={() => void selectAdmission(item.id)} className={`w-full rounded-xl border bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${selected?.id === item.id ? 'border-sky-400 ring-2 ring-sky-100' : 'border-slate-200'}`}>
                      <div className="flex items-start justify-between gap-2"><p className="text-sm font-semibold text-slate-900">{item.nomeCompleto}</p>{item.etapaAdmissao === 'CONCLUIDA' && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">ATIVO</span>}</div>
                      <p className="mt-1 truncate text-xs text-slate-500">{item.cargoNome || 'Cargo a definir'}</p>
                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-sky-500" style={{ width: `${Math.min(100, item.documentosAprovados * 20)}%` }} /></div>
                      <p className="mt-1.5 text-[10px] text-slate-400">{item.documentosAprovados}/5 documentos aprovados</p>
                    </button>
                  ))}
                  {!loading && items.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-xs text-slate-400">Nenhuma admissão nesta etapa</p>}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {selected && (
        <section className="grid gap-5 xl:grid-cols-[0.9fr_1.4fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-sky-700">Dossiê #{selected.id}</p><h2 className="mt-1 text-xl font-semibold text-slate-950">{selected.nomeCompleto}</h2><p className="text-sm text-slate-500">{selected.email}</p></div><button type="button" onClick={() => void selectAdmission(null)} className="text-slate-400 hover:text-slate-700">✕</button></div>
            <div className="mt-5 grid grid-cols-2 gap-3 text-sm"><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-400">CPF</p><p className="mt-1 font-medium">{selected.cpf}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-400">Etapa</p><p className="mt-1 font-medium">{selected.etapaAdmissao.replaceAll('_', ' ')}</p></div></div>

            <div onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); queueFiles(event.dataTransfer.files); }} className={`mt-5 rounded-2xl border-2 border-dashed p-6 text-center transition ${dragging ? 'border-sky-500 bg-sky-50' : 'border-slate-200 bg-slate-50'}`}>
              <input ref={fileInput} type="file" multiple accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={(event: ChangeEvent<HTMLInputElement>) => event.target.files && queueFiles(event.target.files)} />
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-white text-xl shadow-sm">⇧</div><p className="mt-3 text-sm font-semibold text-slate-800">Arraste RG, CPF, PIS, comprovante e diploma</p><p className="mt-1 text-xs text-slate-400">PDF, JPG ou PNG · máximo 10 MB por arquivo</p>
              <button type="button" onClick={() => fileInput.current?.click()} className="mt-3 text-xs font-semibold text-sky-700 hover:text-sky-900">Selecionar arquivos</button>
            </div>

            {uploads.length > 0 && <div className="mt-4 space-y-3">{uploads.map((item, index) => <div key={`${item.file.name}-${item.file.lastModified}`} className="rounded-xl border border-slate-200 p-3"><div className="flex items-center gap-3"><div className="min-w-0 flex-1"><p className="truncate text-xs font-medium text-slate-700">{item.file.name}</p><select value={item.type} disabled={item.status === 'ENVIANDO'} onChange={(event) => updateUpload(index, { type: event.target.value as TipoDocumento })} className="mt-1 max-w-full bg-transparent text-[11px] text-slate-500">{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><span className="text-xs font-semibold text-slate-500">{item.progress}%</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full transition-all ${item.status === 'ERRO' ? 'bg-red-500' : item.status === 'CONCLUIDO' ? 'bg-emerald-500' : 'bg-sky-500'}`} style={{ width: `${item.status === 'ERRO' ? 100 : item.progress}%` }} /></div>{item.error && <p className="mt-1 text-[11px] text-red-600">{item.error}</p>}</div>)}</div>}
            {uploads.some((item) => item.status === 'AGUARDANDO') && <button type="button" onClick={() => void sendAll()} className="mt-4 w-full rounded-xl bg-sky-700 py-2.5 text-sm font-semibold text-white hover:bg-sky-800">Criptografar e enviar lote</button>}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between"><div><h2 className="text-lg font-semibold text-slate-950">Validação documental</h2><p className="text-xs text-slate-500">Metadados extraídos pelo OCR precisam de conferência humana.</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{selected.documentos?.length ?? 0} arquivos</span></div>
            <div className="mt-4 space-y-3">
              {selected.documentos?.map((document) => (
                <article key={document.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><p className="text-sm font-semibold text-slate-900">{typeLabels[document.tipo]}</p><span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusStyle(document.statusValidacao)}`}>{document.statusValidacao}</span></div><p className="mt-1 text-xs text-slate-400">{document.nomeOriginal} · {(document.tamanhoBytes / 1024).toFixed(0)} KB</p></div><button type="button" onClick={() => void openPreview(document)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">Visualizar</button></div>
                  <div className="mt-3 grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-2">{Object.entries(document.metadadosOcr).map(([key, value]) => <div key={key}><p className="text-[10px] uppercase tracking-wide text-slate-400">{key.replaceAll('_', ' ')}</p><p className="truncate text-xs font-medium text-slate-700">{value}</p></div>)}<div><p className="text-[10px] uppercase tracking-wide text-slate-400">Confiança OCR</p><p className="text-xs font-semibold text-sky-700">{document.confiancaOcr.toFixed(1)}%</p></div></div>
                  {document.statusValidacao === 'PENDENTE' && <div className="mt-3">{reviewing === document.id ? <div className="space-y-2"><textarea value={justification} onChange={(event) => setJustification(event.target.value)} placeholder="Justificativa obrigatória para recusa" className="w-full rounded-xl border border-slate-200 p-3 text-sm" /><div className="flex gap-2"><button type="button" onClick={() => void decide(document.id, 'RECUSADO')} className="rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white">Confirmar recusa</button><button type="button" onClick={() => setReviewing(null)} className="rounded-lg border px-3 py-2 text-xs">Cancelar</button></div></div> : <div className="flex gap-2"><button type="button" onClick={() => void decide(document.id, 'APROVADO')} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">Aprovar</button><button type="button" onClick={() => setReviewing(document.id)} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700">Recusar</button></div>}</div>}
                  {document.justificativa && <p className="mt-2 text-xs text-red-600">Justificativa: {document.justificativa}</p>}
                </article>
              ))}
              {!selected.documentos?.length && <div className="rounded-2xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-400">Os documentos enviados aparecerão aqui.</div>}
            </div>
            {selected.etapaAdmissao === 'INTEGRACAO_SISTEMICA' && <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><p className="text-sm font-semibold text-emerald-900">Dossiê aprovado para integração</p><p className="mt-1 text-xs text-emerald-700">Gere o PDF, enfileire o e-mail e crie o PIN temporário de assinatura.</p><button type="button" onClick={() => void generateContract()} className="mt-3 rounded-xl bg-emerald-700 px-4 py-2 text-xs font-semibold text-white">Gerar contrato e token</button>{contractMessage && <p className="mt-2 text-xs font-medium text-emerald-800">{contractMessage}</p>}</div>}
          </div>
        </section>
      )}

      {preview && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4" role="dialog" aria-modal="true"><div className="flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"><div className="flex items-center justify-between border-b px-5 py-3"><p className="truncate text-sm font-semibold">{preview.name}</p><button type="button" onClick={() => { URL.revokeObjectURL(preview.url); setPreview(null); }} className="rounded-lg px-3 py-1 text-slate-500 hover:bg-slate-100">Fechar</button></div><iframe title={preview.name} src={preview.url} className="h-full w-full bg-slate-100" /></div></div>}
    </div>
  );
}

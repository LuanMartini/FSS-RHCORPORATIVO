import { useCallback, useEffect, useMemo, useReducer, type ReactNode } from 'react';
import { apiFetch, uploadBinary } from '../services/api';
import type { Admissao, CargoOrganograma, DocumentoAdmissao, NovaAdmissao, TipoDocumento } from '../types/coreRh';
import { CoreRhContext, type CoreRhValue } from './coreRhState';
import { useAuth } from './useAuth';

interface State {
  admissions: Admissao[];
  selected: Admissao | null;
  organization: CargoOrganograma[];
  loading: boolean;
  loadingOrganization: boolean;
  error: string;
  organizationError: string;
}

type Action =
  | { type: 'ADMISSIONS_LOADING' }
  | { type: 'ADMISSIONS_LOADED'; payload: Admissao[] }
  | { type: 'SELECTED'; payload: Admissao | null }
  | { type: 'ERROR'; payload: string }
  | { type: 'ORG_LOADING' }
  | { type: 'ORG_LOADED'; payload: CargoOrganograma[] }
  | { type: 'ORG_ERROR'; payload: string };

const initialState: State = {
  admissions: [], selected: null, organization: [], loading: true,
  loadingOrganization: true, error: '', organizationError: '',
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'ADMISSIONS_LOADING': return { ...state, loading: true, error: '' };
    case 'ADMISSIONS_LOADED': return { ...state, loading: false, admissions: action.payload, error: '' };
    case 'SELECTED': return { ...state, selected: action.payload };
    case 'ERROR': return { ...state, loading: false, error: action.payload };
    case 'ORG_LOADING': return { ...state, loadingOrganization: true, organizationError: '' };
    case 'ORG_LOADED': return { ...state, loadingOrganization: false, organization: action.payload, organizationError: '' };
    case 'ORG_ERROR': return { ...state, loadingOrganization: false, organizationError: action.payload };
  }
}

export function CoreRhProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const permissions = useMemo(() => user?.permissoes ?? [], [user?.permissoes]);
  const [state, dispatch] = useReducer(reducer, initialState);

  const refreshAdmissions = useCallback(async () => {
    dispatch({ type: 'ADMISSIONS_LOADING' });
    try { dispatch({ type: 'ADMISSIONS_LOADED', payload: await apiFetch<Admissao[]>('/core/admissoes') }); }
    catch (error) { dispatch({ type: 'ERROR', payload: error instanceof Error ? error.message : 'Falha ao carregar admissoes.' }); }
  }, []);

  const refreshOrganization = useCallback(async () => {
    dispatch({ type: 'ORG_LOADING' });
    try { dispatch({ type: 'ORG_LOADED', payload: await apiFetch<CargoOrganograma[]>('/core/organograma') }); }
    catch (error) { dispatch({ type: 'ORG_ERROR', payload: error instanceof Error ? error.message : 'Falha ao carregar organograma.' }); }
  }, []);

  useEffect(() => {
    if (permissions.includes('onboarding.read')) void refreshAdmissions();
    else dispatch({ type: 'ADMISSIONS_LOADED', payload: [] });
    if (permissions.includes('organization.read')) void refreshOrganization();
    else dispatch({ type: 'ORG_LOADED', payload: [] });
  }, [permissions, refreshAdmissions, refreshOrganization]);

  const selectAdmission = useCallback(async (id: number | null) => {
    if (id == null) { dispatch({ type: 'SELECTED', payload: null }); return; }
    try { dispatch({ type: 'SELECTED', payload: await apiFetch<Admissao>(`/core/admissoes/${id}`) }); }
    catch (error) { dispatch({ type: 'ERROR', payload: error instanceof Error ? error.message : 'Falha ao abrir admissao.' }); }
  }, []);

  const createAdmission = useCallback(async (input: NovaAdmissao) => {
    const created = await apiFetch<Admissao>('/core/admissoes', { method: 'POST', body: JSON.stringify(input) });
    await refreshAdmissions();
    await selectAdmission(created.id);
    return created;
  }, [refreshAdmissions, selectAdmission]);

  const uploadDocument = useCallback(async (
    admissionId: number, file: File, type: TipoDocumento, onProgress: (value: number) => void,
  ) => {
    const document = await uploadBinary<DocumentoAdmissao>(`/core/admissoes/${admissionId}/documentos`, file, {
      'Content-Type': file.type,
      'X-Document-Type': type,
      'X-File-Name': encodeURIComponent(file.name),
    }, onProgress);
    await Promise.all([refreshAdmissions(), selectAdmission(admissionId)]);
    return document;
  }, [refreshAdmissions, selectAdmission]);

  const reviewDocument = useCallback(async (
    documentId: number, decision: 'APROVADO' | 'RECUSADO', justification = '',
  ) => {
    const updated = await apiFetch<Admissao>(`/core/documentos/${documentId}/validacao`, {
      method: 'PATCH', body: JSON.stringify({ decision, justificativa: justification }),
    });
    dispatch({ type: 'SELECTED', payload: updated });
    await refreshAdmissions();
  }, [refreshAdmissions]);

  const moveCargo = useCallback(async (cargo: CargoOrganograma, superiorId: number | null, reason: string) => {
    try {
      const updated = await apiFetch<CargoOrganograma[]>(`/core/organograma/cargos/${cargo.id}/superior`, {
        method: 'PATCH', body: JSON.stringify({ novoSuperiorId: superiorId, motivo: reason, versao: cargo.versao }),
      });
      dispatch({ type: 'ORG_LOADED', payload: updated });
    } catch (error) {
      dispatch({ type: 'ORG_ERROR', payload: error instanceof Error ? error.message : 'Falha ao mover cargo.' });
      throw error;
    }
  }, []);

  const value: CoreRhValue = {
    ...state, refreshAdmissions, selectAdmission, createAdmission, uploadDocument,
    reviewDocument, refreshOrganization, moveCargo,
  };

  return <CoreRhContext.Provider value={value}>{children}</CoreRhContext.Provider>;
}

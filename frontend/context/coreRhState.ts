import { createContext } from 'react';
import type { Admissao, CargoOrganograma, DocumentoAdmissao, NovaAdmissao, TipoDocumento } from '../types/coreRh';

export interface CoreRhValue {
  admissions: Admissao[];
  selected: Admissao | null;
  organization: CargoOrganograma[];
  loading: boolean;
  loadingOrganization: boolean;
  error: string;
  organizationError: string;
  refreshAdmissions: () => Promise<void>;
  selectAdmission: (id: number | null) => Promise<void>;
  createAdmission: (input: NovaAdmissao) => Promise<Admissao>;
  uploadDocument: (admissionId: number, file: File, type: TipoDocumento, onProgress: (value: number) => void) => Promise<DocumentoAdmissao>;
  reviewDocument: (documentId: number, decision: 'APROVADO' | 'RECUSADO', justification?: string) => Promise<void>;
  refreshOrganization: () => Promise<void>;
  moveCargo: (cargo: CargoOrganograma, superiorId: number | null, reason: string) => Promise<void>;
}

export const CoreRhContext = createContext<CoreRhValue | null>(null);

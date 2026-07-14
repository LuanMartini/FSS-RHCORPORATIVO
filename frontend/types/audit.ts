export interface IntegrityStatus {
  valid: boolean;
  status: 'INTEGRO' | 'CORROMPIDO';
  totalEntries: number;
  brokenAt: number | null;
  reason: string | null;
  anchorStatus: string;
  verifiedAt: string;
  lastHashPrefix: string | null;
}

export interface AuditDashboardData {
  generatedAt: string;
  periodMonths: number;
  summary: { headcount: number; terminationsYear: number; auditEvents: number; lastAuditAt: string | null; currentTurnoverRate: number };
  integrity: IntegrityStatus;
  turnover: {
    monthly: { month: string; admissions: number; terminations: number; voluntary: number; headcountStart: number; headcountEnd: number; turnoverRate: number }[];
    departments: { department: string; recentVoluntary: number; previousVoluntary: number; averageTenureYears: number | null; terminations12m: number }[];
    tenure: { range: string; total: number }[];
    alerts: { severity: 'CRITICO' | 'ATENCAO'; department: string; changePercent: number; averageTenureYears: number | null; message: string }[];
  };
  equity: {
    points: { anonymousId: string; department: string; role: string; salaryCents: number; tenureYears: number; expectedCents: number }[];
    gaps: { dimension: string; group: string; sampleSize: number; averageSalaryCents: number; adjustedGapPercent: number }[];
    salaryBands: { band: string; total: number }[];
    privacy: { minimumGroupSize: number; suppressedRecords: number };
  };
  demographics: { dimension: string; group: string; total: number }[];
  ledger: { id: number; eventId: string; timestamp: string; actor: string; action: string; resourceType: string; resourceId: string | null; ip: string | null; hashPrefix: string; previousHashPrefix: string }[];
}

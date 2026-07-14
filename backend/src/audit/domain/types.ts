export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export interface LedgerCanonicalEntry {
  eventId: string;
  timestamp: string;
  actorUserId: number | null;
  actorReference: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  ip: string | null;
  userAgentHash: string | null;
  correlationId: string;
  payloadHash: string;
  keyVersion: number;
}

export interface AuditEventInput {
  actorUserId: number | null;
  actorReference: string;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  correlationId?: string;
  metadata: JsonValue;
}

export interface TurnoverAlertInput {
  department: string;
  recentVoluntary: number;
  previousVoluntary: number;
  averageTenureYears: number | null;
}

export interface EquityRecord {
  anonymousId: string;
  department: string;
  role: string;
  salaryCents: number;
  tenureYears: number;
  gender: string | null;
  race: string | null;
  disability: boolean | null;
}

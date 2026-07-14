import type { NextFunction, Request, Response } from 'express';
import { sha256, stableSerialize } from '../domain/auditEngine.js';
import type { JsonValue } from '../domain/types.js';
import { enqueueAuditOutbox } from '../infrastructure/auditRepository.js';

type AuthenticatedRequest = Request & { user?: { sub?: string | number; email?: string } };
type Match = { action: string; resourceType: string; resourceId: string | null };

const rules: { method: string; pattern: RegExp; action: string; resourceType: string }[] = [
  { method: 'DELETE', pattern: /^\/rh\/funcionarios\/(\d+)$/, action: 'COLABORADOR_DESLIGADO', resourceType: 'COLABORADOR' },
  { method: 'PATCH', pattern: /^\/core\/organograma\/cargos\/(\d+)\/superior$/, action: 'HIERARQUIA_ALTERADA', resourceType: 'CARGO' },
  { method: 'GET', pattern: /^\/core\/documentos\/(\d+)\/conteudo$/, action: 'DADO_LGPD_ACESSADO', resourceType: 'DOCUMENTO_ADMISSAO' },
  { method: 'PATCH', pattern: /^\/core\/documentos\/(\d+)\/validacao$/, action: 'DOCUMENTO_LGPD_VALIDADO', resourceType: 'DOCUMENTO_ADMISSAO' },
  { method: 'POST', pattern: /^\/core\/colaboradores\/(\d+)\/contratos$/, action: 'CONTRATO_TRABALHO_GERADO', resourceType: 'COLABORADOR' },
  { method: 'POST', pattern: /^\/payroll\/processamentos$/, action: 'FOLHA_PROCESSADA', resourceType: 'PROCESSAMENTO_FOLHA' },
  { method: 'POST', pattern: /^\/payroll\/processamentos\/(\d+)\/enviar-banco$/, action: 'FOLHA_ENVIADA_BANCO', resourceType: 'PROCESSAMENTO_FOLHA' },
  { method: 'GET', pattern: /^\/payroll\/contracheques\/(\d+)\/pdf$/, action: 'DADO_SALARIAL_ACESSADO', resourceType: 'CONTRACHEQUE' },
  { method: 'GET', pattern: /^\/auditoria\/dashboard$/, action: 'PAINEL_ANALYTICS_ACESSADO', resourceType: 'AUDITORIA_ANALYTICS' },
  { method: 'POST', pattern: /^\/auditoria\/ledger\/verificar$/, action: 'LEDGER_VERIFICADO', resourceType: 'AUDIT_LEDGER' },
];

function matchRequest(req: Request): Match | null {
  const path = req.originalUrl.split('?')[0] ?? req.path;
  for (const rule of rules) {
    if (req.method !== rule.method) continue;
    const match = path.match(rule.pattern);
    if (match) return { action: rule.action, resourceType: rule.resourceType, resourceId: match[1] ?? null };
  }
  return null;
}

export function auditCaptureMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const matched = matchRequest(req);
  if (!matched) { next(); return; }
  const startedAt = Date.now();
  res.once('finish', () => {
    if (res.statusCode < 200 || res.statusCode >= 400) return;
    const actorId = Number(req.user?.sub);
    const body = req.body === undefined ? null : req.body as JsonValue;
    void enqueueAuditOutbox({
      actorUserId: Number.isInteger(actorId) && actorId > 0 ? actorId : null,
      actorReference: Number.isInteger(actorId) && actorId > 0 ? `usuario:${actorId}` : 'ator:externo',
      action: matched.action, resourceType: matched.resourceType, resourceId: matched.resourceId,
      ip: req.ip || req.socket.remoteAddress || null, userAgent: req.get('user-agent') ?? null,
      metadata: { method: req.method, path: req.originalUrl.split('?')[0] ?? req.path,
        statusCode: res.statusCode, durationMs: Date.now() - startedAt,
        requestBodyHash: body === null ? null : sha256(stableSerialize(body)) },
    }).catch((error) => console.error('Falha critica ao enfileirar auditoria de leitura', error));
  });
  next();
}

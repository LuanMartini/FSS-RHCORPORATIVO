import type { NextFunction, Request, Response } from 'express';
import * as service from '../application/auditService.js';

type AuthenticatedRequest = Request & { user?: { sub?: string | number } };

function userId(req: AuthenticatedRequest): number {
  const value = Number(req.user?.sub);
  if (!Number.isInteger(value) || value <= 0) throw Object.assign(new Error('Identidade autenticada invalida.'), { status: 401, code: 'INVALID_IDENTITY' });
  return value;
}

export async function dashboard(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try { res.json(await service.dashboard(userId(req), req.query.meses)); } catch (error) { next(error); }
}

export async function ledger(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try { res.json(await service.ledgerEntries(userId(req), req.query.limite)); } catch (error) { next(error); }
}

export async function verify(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try { res.json(await service.verifyLedger(userId(req))); } catch (error) { next(error); }
}

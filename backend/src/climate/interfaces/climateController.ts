import type { NextFunction, Request, Response } from 'express';
import * as service from '../application/climateService.js';

type AuthenticatedRequest = Request & { user?: { sub?: string | number } };
function userId(req: AuthenticatedRequest): number {
  const value = Number(req.user?.sub);
  if (!Number.isInteger(value) || value <= 0) throw Object.assign(new Error('Identidade autenticada invalida.'), { status: 401, code: 'INVALID_IDENTITY' });
  return value;
}

export async function dashboard(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try { res.json(await service.dashboard(userId(req), req.query as Record<string, unknown>)); } catch (error) { next(error); }
}
export async function people(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try { res.json(await service.searchPeople(userId(req), req.query.busca)); } catch (error) { next(error); }
}
export async function createPublication(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try { res.status(201).json(await service.createPublication(userId(req), req.body ?? {})); } catch (error) { next(error); }
}
export async function toggleLike(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try { res.json(await service.toggleLike(userId(req), req.params.publicacaoId)); } catch (error) { next(error); }
}
export async function addComment(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try { res.status(201).json(await service.addComment(userId(req), req.params.publicacaoId, req.body ?? {})); } catch (error) { next(error); }
}
export async function credential(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try { res.status(201).json(await service.issueBallotCredential(userId(req), req.params.pesquisaId)); } catch (error) { next(error); }
}
export async function anonymousVote(req: Request, res: Response, next: NextFunction) {
  try { res.status(202).json(await service.submitAnonymousVote(req.body ?? {})); } catch (error) { next(error); }
}

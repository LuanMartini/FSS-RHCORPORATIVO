import type { NextFunction, Request, Response } from 'express';
import * as service from '../application/journeyService.ts';

interface AuthenticatedRequest extends Request {
  user?: { sub?: string | number };
  principal?: { userId: number; collaboratorId: number | null };
}

function clientIp(request: Request): string | null {
  return request.ip || null;
}

export async function listCollaborators(_request: Request, response: Response, next: NextFunction): Promise<void> {
  try { response.json(await service.listCollaborators()); } catch (error) { next(error); }
}

export async function getConfiguration(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { response.json(await service.getConfiguration(request.params.colaboradorId)); } catch (error) { next(error); }
}

export async function enrollBiometric(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    response.status(201).json(await service.enrollBiometric({
      collaboratorId: request.body?.colaboradorId,
      photoBase64: request.body?.fotoBase64,
      consent: request.body?.consentimento,
      ipAddress: clientIp(request),
    }));
  } catch (error) { next(error); }
}

export async function registerPoint(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    response.status(201).json(await service.registerPoint({
      collaboratorId: request.body?.colaboradorId,
      type: request.body?.tipo,
      latitude: request.body?.latitude,
      longitude: request.body?.longitude,
      accuracyMeters: request.body?.precisaoMetros,
      photoBase64: request.body?.fotoBase64,
      capturedAt: request.body?.capturadoEm,
      idempotencyKey: request.body?.idempotencyKey,
      collectorId: request.body?.coletorId,
      ipAddress: clientIp(request),
      userAgent: request.headers['user-agent']?.slice(0, 500) ?? null,
    }));
  } catch (error) { next(error); }
}

export async function getReceipt(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { response.json(await service.getReceipt(request.params.nsr)); } catch (error) { next(error); }
}

export async function getMirror(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    response.json(await service.getMirror({
      collaboratorId: request.params.colaboradorId,
      start: request.query.inicio,
      end: request.query.fim,
    }));
  } catch (error) { next(error); }
}

export async function createAdjustment(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    response.status(201).json(await service.createAdjustment({
      collaboratorId: request.body?.colaboradorId,
      referenceDate: request.body?.dataReferencia,
      type: request.body?.tipo,
      requestedAt: request.body?.horarioSolicitado,
      punchType: request.body?.tipoMarcacao,
      justification: request.body?.justificativa,
      ...(request.file ? { file: request.file } : {}),
    }));
  } catch (error) { next(error); }
}

export async function listAdjustments(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { response.json(await service.listAdjustments(request.query.colaboradorId)); } catch (error) { next(error); }
}

export async function managerDecision(request: AuthenticatedRequest, response: Response, next: NextFunction): Promise<void> {
  try {
    response.json(await service.decideAdjustment({
      id: request.params.id, level: 'GESTOR', decision: request.body?.decisao,
      observation: request.body?.observacao, userId: request.principal?.userId ?? Number(request.user?.sub),
      managerCollaboratorId: request.principal?.collaboratorId,
    }));
  } catch (error) { next(error); }
}

export async function hrDecision(request: AuthenticatedRequest, response: Response, next: NextFunction): Promise<void> {
  try {
    response.json(await service.decideAdjustment({
      id: request.params.id, level: 'RH', decision: request.body?.decisao,
      observation: request.body?.observacao,
      userId: Number(request.user?.sub),
    }));
  } catch (error) { next(error); }
}

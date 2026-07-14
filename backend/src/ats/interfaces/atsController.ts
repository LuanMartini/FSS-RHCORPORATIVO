import type { NextFunction, Request, Response } from 'express';
import * as service from '../application/atsService.js';
import { publishChatMessage, publishInterview } from './atsSocketServer.js';

type AuthRequest = Request & { user?: { sub?: number } };
function userId(req: AuthRequest): number { return Number(req.user?.sub); }

export async function vacancies(req: AuthRequest, res: Response, next: NextFunction) {
  try { res.json(await service.vacancies(userId(req))); } catch (error) { next(error); }
}

export async function recruiters(req:AuthRequest,res:Response,next:NextFunction){
  try{res.json(await service.vacancyRecruiters(req.params.vagaId,userId(req)));}catch(error){next(error);}
}

export async function setRecruiter(req:AuthRequest,res:Response,next:NextFunction){
  try{res.json(await service.setVacancyRecruiter(req.params.vagaId,userId(req),req.body??{}));}catch(error){next(error);}
}

export async function board(req: AuthRequest, res: Response, next: NextFunction) {
  try { res.json(await service.board(req.params.vagaId, userId(req))); } catch (error) { next(error); }
}

export async function uploadResume(req: AuthRequest, res: Response, next: NextFunction) {
  try { res.status(201).json(await service.uploadResume(req.params.vagaId, userId(req), req.file)); } catch (error) { next(error); }
}

export async function moveCard(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const correlationId = req.body?.correlationId ? String(req.body.correlationId) : undefined;
    const card = await service.moveCard({
      candidaturaId:Number(req.params.candidaturaId),vagaId:Number(req.body?.vagaId),targetStage:req.body?.etapa,
      targetPosition:Number(req.body?.posicao ?? 0),expectedVersion:Number(req.body?.versao),userId:userId(req),
      ...(correlationId ? { correlationId } : {}),
    });
    res.json(card);
  } catch (error) { next(error); }
}

export async function messages(req: AuthRequest, res: Response, next: NextFunction) {
  try { res.json(await service.messages(req.params.candidaturaId, userId(req))); } catch (error) { next(error); }
}

export async function sendMessage(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const message = await service.sendRecruiterMessage(req.params.candidaturaId,userId(req),req.body?.mensagem,req.body?.idempotencia);
    publishChatMessage(Number(req.params.candidaturaId),message);
    res.status(201).json(message);
  } catch (error) { next(error); }
}

export async function schedule(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const interview = await service.scheduleInterview(req.body ?? {},userId(req));
    publishInterview(Number(interview.vaga_id),interview);
    res.status(201).json(interview);
  } catch (error) { next(error); }
}

export async function interviews(req: AuthRequest, res: Response, next: NextFunction) {
  try { res.json(await service.interviews(req.params.vagaId,userId(req))); } catch (error) { next(error); }
}

export async function portal(req: Request, res: Response, next: NextFunction) {
  try { res.json(await service.portal(String(req.params.token))); } catch (error) { next(error); }
}

export async function candidateMessage(req: Request, res: Response, next: NextFunction) {
  try {
    const message = await service.sendCandidateMessage(String(req.params.token),req.body?.mensagem,req.body?.idempotencia);
    publishChatMessage(Number(message.candidatura_id),message);
    res.status(201).json(message);
  } catch (error) { next(error); }
}

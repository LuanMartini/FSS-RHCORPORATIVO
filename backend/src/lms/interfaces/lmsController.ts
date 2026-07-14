import type{NextFunction,Request,Response}from'express';import*as service from'../application/lmsService.js';
export async function dashboard(req:Request,res:Response,next:NextFunction){try{res.json(await service.dashboard(req.query.colaboradorId,req.query.trilhaId,req.query.periodo));}catch(error){next(error)}}
export async function syncWatch(req:Request,res:Response,next:NextFunction){try{res.json(await service.syncWatch(req.params.aulaId,req.body??{},String(req.headers['user-agent']??'')));}catch(error){next(error)}}
export async function startQuiz(req:Request,res:Response,next:NextFunction){try{res.status(201).json(await service.startQuiz(req.params.cursoId,req.body??{}));}catch(error){next(error)}}
export async function submitQuiz(req:Request,res:Response,next:NextFunction){try{res.json(await service.submitQuiz(req.params.tentativaId,req.body??{}));}catch(error){next(error)}}
export async function badgeSvg(req:Request,res:Response,next:NextFunction){try{res.type('image/svg+xml').set('Cache-Control','private, max-age=3600').send(await service.badgeSvg(req.params.badgeId));}catch(error){next(error)}}

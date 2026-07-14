import type { NextFunction,Request,Response } from 'express';
import * as service from '../application/performanceService.js';

type AuthRequest=Request&{user?:{sub?:number}};
const userId=(req:AuthRequest):number=>Number(req.user?.sub);

export async function dashboard(req:AuthRequest,res:Response,next:NextFunction):Promise<void>{
  try{res.json(await service.dashboard(req.query.cicloId,req.query.departamentoId));}catch(error){next(error);}
}
export async function recalculate(req:AuthRequest,res:Response,next:NextFunction):Promise<void>{
  try{res.json(await service.recalculateCycle(req.params.cicloId));}catch(error){next(error);}
}
export async function calibrate(req:AuthRequest,res:Response,next:NextFunction):Promise<void>{
  try{res.json(await service.calibrate(req.params.resultadoId,userId(req),req.body??{}));}catch(error){next(error);}
}
export async function updateOkr(req:AuthRequest,res:Response,next:NextFunction):Promise<void>{
  try{res.json(await service.updateOkr(req.params.okrId,userId(req),req.body??{}));}catch(error){next(error);}
}

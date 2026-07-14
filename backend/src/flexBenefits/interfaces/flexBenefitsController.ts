import type {NextFunction,Request,Response} from 'express';
import * as service from '../application/flexBenefitsService.js';
type AuthRequest=Request&{user?:{sub?:number}};
export async function dashboard(req:AuthRequest,res:Response,next:NextFunction):Promise<void>{try{res.json(await service.dashboard(req.query.colaboradorId,req.query.competencia));}catch(error){next(error);}}
export async function distribute(req:AuthRequest,res:Response,next:NextFunction):Promise<void>{try{res.json(await service.distribute(req.params.carteiraId,req.body??{}));}catch(error){next(error);}}
export async function reimburse(req:AuthRequest,res:Response,next:NextFunction):Promise<void>{try{res.status(201).json(await service.submitReimbursement(req.body??{},req.file));}catch(error){next(error);}}
export async function decide(req:AuthRequest,res:Response,next:NextFunction):Promise<void>{try{res.json(await service.decide(req.params.reembolsoId,Number(req.user?.sub),req.body??{}));}catch(error){next(error);}}

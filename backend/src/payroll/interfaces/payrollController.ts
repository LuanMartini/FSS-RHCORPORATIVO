import type { NextFunction, Request, Response } from 'express';
import * as service from '../application/payrollService.js';

function forward(next: NextFunction, error: unknown): void { next(error); }

export async function dashboard(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { res.json(await service.dashboard(req.query.competencia)); } catch (error) { forward(next, error); }
}

export async function start(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = (req as Request & { user?: { sub?: number } }).user;
    res.status(202).json(await service.startProcessing(req.body?.competencia, user?.sub ?? null));
  } catch (error) { forward(next, error); }
}

export async function status(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { res.json(await service.processing(String(req.params.id))); } catch (error) { forward(next, error); }
}

export async function sendBank(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = Number((req as Request & { user?: { sub?: number } }).user?.sub);
    await service.sendToBank(String(req.params.id), req.body?.dataPagamento, userId);
    res.status(202).json({ ok: true });
  } catch (error) { forward(next, error); }
}

export async function pdf(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const document = await service.payslipPdf(String(req.params.id));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${document.filename}"`);
    res.setHeader('ETag', `"${document.sha256}"`);
    res.send(document.buffer);
  } catch (error) { forward(next, error); }
}

export async function simulate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { res.json(service.simulate(req.body ?? {})); } catch (error) { forward(next, error); }
}

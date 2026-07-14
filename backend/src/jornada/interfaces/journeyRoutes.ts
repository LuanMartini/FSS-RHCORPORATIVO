import { Router } from 'express';
import multer from 'multer';
import { authMiddleware } from '../../middleware/auth.js';
import { authorize, authorizeOwnPointOr, authorizeSelfOr, bindOwnCollaborator, scopeOwnCollaborator } from '../../middleware/authorization.js';
import * as controller from './journeyController.ts';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 10 },
});

const journeyRoutes = Router();
journeyRoutes.use(authMiddleware);
journeyRoutes.get('/colaboradores', authorize('time.manage'), controller.listCollaborators);
journeyRoutes.get('/configuracao/:colaboradorId', authorizeSelfOr('time.manage'), controller.getConfiguration);
journeyRoutes.post('/biometria/cadastrar', bindOwnCollaborator(), controller.enrollBiometric);
journeyRoutes.post('/pontos', bindOwnCollaborator(), controller.registerPoint);
journeyRoutes.get('/pontos/:nsr/comprovante', authorizeOwnPointOr('time.manage'), controller.getReceipt);
journeyRoutes.get('/espelho/:colaboradorId', authorizeSelfOr('time.manage'), controller.getMirror);
journeyRoutes.get('/ajustes', scopeOwnCollaborator('time.manage'), controller.listAdjustments);
journeyRoutes.post('/ajustes', upload.single('anexo'), bindOwnCollaborator(), controller.createAdjustment);
journeyRoutes.patch('/ajustes/:id/gestor', authorize('time.manage'), controller.managerDecision);
journeyRoutes.patch('/ajustes/:id/rh', authorize('time.hr.approve'), controller.hrDecision);

export default journeyRoutes;

import { Router } from 'express';
import multer from 'multer';
import { authMiddleware } from '../../middleware/auth.js';
import { authorize, authorizeOwnTeamPointOr, authorizeSelfTeamOr, bindOwnCollaborator, scopeOwnTeamCollaborator } from '../../middleware/authorization.js';
import * as controller from './journeyController.ts';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 10 },
});

const journeyRoutes = Router();
journeyRoutes.use(authMiddleware);
journeyRoutes.get('/colaboradores', authorize('time.manage.team','time.manage.all'), controller.listCollaborators);
journeyRoutes.get('/configuracao/:colaboradorId', authorizeSelfTeamOr('time.manage.all'), controller.getConfiguration);
journeyRoutes.post('/biometria/cadastrar', bindOwnCollaborator(), controller.enrollBiometric);
journeyRoutes.post('/pontos', bindOwnCollaborator(), controller.registerPoint);
journeyRoutes.get('/pontos/:nsr/comprovante', authorizeOwnTeamPointOr('time.manage.all'), controller.getReceipt);
journeyRoutes.get('/espelho/:colaboradorId', authorizeSelfTeamOr('time.manage.all'), controller.getMirror);
journeyRoutes.get('/ajustes', scopeOwnTeamCollaborator('time.manage.all'), controller.listAdjustments);
journeyRoutes.post('/ajustes', upload.single('anexo'), bindOwnCollaborator(), controller.createAdjustment);
journeyRoutes.patch('/ajustes/:id/gestor', authorize('time.manage.team','time.manage.all'), controller.managerDecision);
journeyRoutes.patch('/ajustes/:id/rh', authorize('time.hr.approve'), controller.hrDecision);

export default journeyRoutes;

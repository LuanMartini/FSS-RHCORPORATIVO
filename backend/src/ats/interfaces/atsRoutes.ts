import { Router } from 'express';
import multer from 'multer';
import { authMiddleware } from '../../middleware/auth.js';
import { authorize } from '../../middleware/authorization.js';
import * as controller from './atsController.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 5 },
});

const router = Router();
router.use(authMiddleware);
router.use(authorize('ats.use'));
router.get('/vagas',controller.vacancies);
router.get('/vagas/:vagaId/permissoes',controller.recruiters);
router.put('/vagas/:vagaId/permissoes',controller.setRecruiter);
router.get('/vagas/:vagaId/kanban',controller.board);
router.post('/vagas/:vagaId/curriculos',upload.single('curriculo'),controller.uploadResume);
router.patch('/candidaturas/:candidaturaId/mover',controller.moveCard);
router.get('/candidaturas/:candidaturaId/mensagens',controller.messages);
router.post('/candidaturas/:candidaturaId/mensagens',controller.sendMessage);
router.get('/vagas/:vagaId/entrevistas',controller.interviews);
router.post('/entrevistas',controller.schedule);

export const publicAtsRoutes = Router();
publicAtsRoutes.get('/portal/:token',controller.portal);
publicAtsRoutes.post('/portal/:token/mensagens',controller.candidateMessage);

export default router;

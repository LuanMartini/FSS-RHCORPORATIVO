import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth.js';
import { authorize } from '../../middleware/authorization.js';
import * as controller from './climateController.js';

const router = Router();
router.post('/enps/votos', controller.anonymousVote);
router.use(authMiddleware);
router.get('/dashboard', authorize('climate.analytics'), controller.dashboard);
router.get('/pessoas', authorize('climate.use'), controller.people);
router.post('/publicacoes', authorize('climate.use'), controller.createPublication);
router.post('/publicacoes/:publicacaoId/curtida', authorize('climate.use'), controller.toggleLike);
router.post('/publicacoes/:publicacaoId/comentarios', authorize('climate.use'), controller.addComment);
router.post('/pesquisas/:pesquisaId/credencial', authorize('climate.use'), controller.credential);
export default router;

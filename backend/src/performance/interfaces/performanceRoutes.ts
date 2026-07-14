import {Router} from 'express';
import {authMiddleware} from '../../middleware/auth.js';
import {authorize} from '../../middleware/authorization.js';
import * as controller from './performanceController.js';

const router=Router();
router.use(authMiddleware);
router.get('/dashboard',authorize('performance.read'),controller.dashboard);
router.post('/ciclos/:cicloId/recalcular',authorize('performance.manage'),controller.recalculate);
router.post('/resultados/:resultadoId/calibrar',authorize('performance.manage'),controller.calibrate);
router.patch('/okrs/:okrId/progresso',authorize('performance.manage'),controller.updateOkr);
export default router;

import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth.js';
import { authorize } from '../../middleware/authorization.js';
import * as controller from './auditController.js';

const router = Router();
router.use(authMiddleware);
router.get('/dashboard', authorize('audit.read'), controller.dashboard);
router.get('/ledger', authorize('audit.read'), controller.ledger);
router.post('/ledger/verificar', authorize('audit.verify'), controller.verify);

export default router;

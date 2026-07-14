import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth.js';
import { authorize, authorizeOwnPayslipOr } from '../../middleware/authorization.js';
import * as controller from './payrollController.js';

const router = Router();
router.use(authMiddleware);
router.get('/dashboard', authorize('payroll.read'), controller.dashboard);
router.post('/processamentos', authorize('payroll.run'), controller.start);
router.get('/processamentos/:id', authorize('payroll.read'), controller.status);
router.post('/processamentos/:id/enviar-banco', authorize('payroll.send_bank'), controller.sendBank);
router.get('/contracheques/:id/pdf', authorizeOwnPayslipOr('payroll.read'), controller.pdf);
router.post('/simular', authorize('payroll.simulate'), controller.simulate);
export default router;

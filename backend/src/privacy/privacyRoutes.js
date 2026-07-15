import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { authorize, bindOwnCollaborator } from '../middleware/authorization.js';
import * as controller from './privacyController.js';

const router = Router();

router.use(authMiddleware);
router.use(authorize('privacy.self'));

router.get('/me/exportacao', controller.exportOwnData);
router.post('/solicitacoes', bindOwnCollaborator('privacy.self'), controller.createRequest);
router.post(
  '/consentimentos/biometria',
  bindOwnCollaborator('privacy.self'),
  controller.biometricConsent,
);

export default router;

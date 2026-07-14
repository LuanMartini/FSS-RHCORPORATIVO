import { Router, raw } from 'express';
import { authMiddleware } from '../../middleware/auth.js';
import { authorize } from '../../middleware/authorization.js';
import * as controller from './coreController.js';

export const publicCoreRoutes = Router();
publicCoreRoutes.post('/assinaturas/:token/confirmar', controller.confirmSignature);

const coreRoutes = Router();
coreRoutes.use(authMiddleware);
coreRoutes.get('/admissoes', authorize('onboarding.read'), controller.listAdmissions);
coreRoutes.post('/admissoes', authorize('onboarding.write'), controller.createAdmission);
coreRoutes.get('/admissoes/:id', authorize('onboarding.read'), controller.getAdmission);
coreRoutes.post(
  '/admissoes/:id/documentos',
  authorize('onboarding.write'),
  raw({ type: ['application/pdf', 'image/jpeg', 'image/png'], limit: '10mb' }),
  controller.uploadDocument
);
coreRoutes.patch('/documentos/:id/validacao', authorize('onboarding.document.review'), controller.validateDocument);
coreRoutes.get('/documentos/:id/conteudo', authorize('onboarding.document.review'), controller.previewDocument);
coreRoutes.post('/colaboradores/:id/contratos', authorize('onboarding.write'), controller.createContract);
coreRoutes.post('/colaboradores/:id/ativar', authorize('onboarding.write'), controller.activateCollaborator);
coreRoutes.get('/organograma', authorize('organization.read'), controller.listOrganization);
coreRoutes.patch('/organograma/cargos/:cargoId/superior', authorize('organization.write'), controller.changeHierarchy);

export default coreRoutes;

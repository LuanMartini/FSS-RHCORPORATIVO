import { loadPrincipal } from '../middleware/authorization.js';
import * as service from './privacyService.js';

export async function exportOwnData(req, res, next) {
  try {
    const principal = await loadPrincipal(req);
    res.setHeader('Cache-Control', 'private, no-store');
    res.json(await service.exportOwnData(principal.collaboratorId));
  } catch (error) {
    next(error);
  }
}

export async function createRequest(req, res, next) {
  try {
    res.status(201).json(await service.createRequest(req.body ?? {}));
  } catch (error) {
    next(error);
  }
}

export async function biometricConsent(req, res, next) {
  try {
    res.status(201).json(
      await service.recordBiometricConsent(req.body ?? {}, req.ip, req.get('user-agent')),
    );
  } catch (error) {
    next(error);
  }
}

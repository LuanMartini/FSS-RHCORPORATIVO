import { Router } from 'express';
import * as c from '../controllers/authController.js';
import { authMiddleware } from '../middleware/auth.js';
import { loginRateLimit, registrationRateLimit } from '../middleware/security.js';

const r = Router();
r.post('/login', loginRateLimit, c.login);
r.post('/registrar', registrationRateLimit, c.registrar);
r.get('/me', authMiddleware, c.me);

export default r;

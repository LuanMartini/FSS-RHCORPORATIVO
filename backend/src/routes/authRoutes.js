import { Router } from 'express';
import * as c from '../controllers/authController.js';
import { authMiddleware } from '../middleware/auth.js';

const r = Router();
r.post('/login', c.login);
r.post('/registrar', c.registrar);
r.get('/me', authMiddleware, c.me);

export default r;

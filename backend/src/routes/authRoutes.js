import { Router } from 'express';
import * as c from '../controllers/authController.js';

const r = Router();
r.post('/login', c.login);
r.post('/registrar', c.registrar);

export default r;

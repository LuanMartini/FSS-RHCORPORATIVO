import jwt from 'jsonwebtoken';
import { getEnv } from '../config/env.js';

const secret = () => getEnv().jwtSecret;

export function signToken(payload) {
  return jwt.sign(payload, secret(), { expiresIn: '7d' });
}

export function authMiddleware(req, res, next) {
  const h = req.headers.authorization;
  const m = h?.match(/^Bearer\s+(.+)$/i);
  if (!m) {
    return res.status(401).json({ erro: 'Token ausente' });
  }
  try {
    req.user = jwt.verify(m[1], secret());
    next();
  } catch {
    return res.status(401).json({ erro: 'Token inválido' });
  }
}

import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { getEnv } from '../config/env.js';

const secret = () => getEnv().jwtSecret;

export function signToken(payload) {
  const env = getEnv();
  return jwt.sign(payload, secret(), {
    algorithm: 'HS256',
    expiresIn: env.jwtAccessTtl,
    issuer: env.jwtIssuer,
    audience: env.jwtAudience,
    jwtid: crypto.randomUUID(),
  });
}

export function authMiddleware(req, res, next) {
  const h = req.headers.authorization;
  const m = h?.match(/^Bearer\s+(.+)$/i);
  if (!m) {
    return res.status(401).json({ erro: 'Token ausente' });
  }
  try {
    const env = getEnv();
    req.user = jwt.verify(m[1], secret(), {
      algorithms: ['HS256'],
      issuer: env.jwtIssuer,
      audience: env.jwtAudience,
    });
    next();
  } catch {
    return res.status(401).json({ erro: 'Token inválido' });
  }
}

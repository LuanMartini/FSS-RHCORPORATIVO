import jwt from 'jsonwebtoken';

const secret = () => process.env.JWT_SECRET || 'dev-secret-change-me';

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

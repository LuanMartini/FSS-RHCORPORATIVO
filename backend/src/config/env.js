const DEFAULT_JWT_SECRET = 'dev-secret-change-me';

export function getEnv() {
  const port = Number(process.env.PORT || 3333);
  const jwtSecret = process.env.JWT_SECRET || DEFAULT_JWT_SECRET;
  const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const isProduction = process.env.NODE_ENV === 'production';

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error('PORT deve ser um numero inteiro positivo.');
  }

  if (isProduction && jwtSecret === DEFAULT_JWT_SECRET) {
    throw new Error('JWT_SECRET deve ser configurado em producao.');
  }

  return {
    allowAdminRegistration: process.env.ALLOW_ADMIN_REGISTRATION === 'true',
    corsOrigins,
    isProduction,
    jwtSecret,
    jwtIssuer: process.env.JWT_ISSUER || 'rhcorp-api',
    jwtAudience: process.env.JWT_AUDIENCE || 'rhcorp-web',
    jwtAccessTtl: process.env.JWT_ACCESS_TTL || '10m',
    port,
    rateLimitMax: Number(process.env.RATE_LIMIT_MAX || 300),
    rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
    trustProxyHops: Number(process.env.TRUST_PROXY_HOPS || 0),
    requireRedis: process.env.REQUIRE_REDIS === 'true' || isProduction,
  };
}

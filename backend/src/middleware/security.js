import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { getEnv } from '../config/env.js';

export function securityMiddleware() {
  const env = getEnv();
  return [
    helmet(),
    rateLimit({
      windowMs: env.rateLimitWindowMs,
      max: env.rateLimitMax,
      standardHeaders: true,
      legacyHeaders: false,
      message: { erro: 'Muitas requisicoes. Tente novamente em instantes.' },
    }),
  ];
}

export function corsOptions() {
  const env = getEnv();
  return {
    credentials: true,
    origin(origin, callback) {
      if (!origin || env.corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Origem nao permitida pelo CORS.'));
    },
  };
}

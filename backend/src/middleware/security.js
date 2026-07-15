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

export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { erro: 'Muitas tentativas. Aguarde antes de tentar novamente.' },
});

export const registrationRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: 'Limite de tentativas de cadastro excedido.' },
});

export const publicSignatureRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: 'Muitas tentativas de assinatura.' },
});

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

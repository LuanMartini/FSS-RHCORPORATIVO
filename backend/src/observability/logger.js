import pino from 'pino';

const REDACTED = '[REDACTED]';
const sensitivePaths = [
  'password', 'senha', 'passwordHash', 'senha_hash', 'token', 'jwt', 'authorization',
  'headers.authorization', 'headers.cookie', 'req.headers.authorization', 'req.headers.cookie',
  'cpf', 'salario', 'salary', 'valor', 'valorCentavos', 'valor_centavos',
];

function options() {
  const result = {
    level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
    base: { service: 'rhcorp-api', environment: process.env.NODE_ENV ?? 'development' },
    redact: { paths: sensitivePaths, censor: REDACTED },
  };
  if (process.env.NODE_ENV === 'development') {
    result.transport = { target: 'pino-pretty', options: { colorize: true, singleLine: true } };
  }
  return result;
}

export const logger = pino(options());

/** Remove valores que nunca devem sair do processo em telemetria ou logs. */
export function sanitizeForObservability(value) {
  let text = String(value ?? 'erro sem detalhes');
  text = text.replace(/\bBearer\s+[A-Za-z0-9._~-]+/gi, `Bearer ${REDACTED}`);
  text = text.replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, REDACTED);
  text = text.replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, REDACTED);
  text = text.replace(/\b(password|senha|token|jwt|authorization|cpf|sal[aá]rio|salary|valor)\b(\s*[:=]\s*)([^\s,;}&]+)/gi, `$1$2${REDACTED}`);
  return text.slice(0, 4_000);
}

export function errorLogFields(error) {
  if (!(error instanceof Error)) return { errorType: 'UnknownError', message: sanitizeForObservability(error) };
  const fields = { errorType: error.name || 'Error', message: sanitizeForObservability(error.message) };
  const code = error.code;
  if (typeof code === 'string' && /^[A-Z0-9_:-]{1,120}$/i.test(code)) fields.errorCode = code;
  if (error.stack) fields.stack = sanitizeForObservability(error.stack);
  return fields;
}

export function requestLogger(requestId) {
  return requestId ? logger.child({ requestId }) : logger;
}

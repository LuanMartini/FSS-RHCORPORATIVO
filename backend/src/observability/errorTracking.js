import { errorLogFields, logger, sanitizeForObservability } from './logger.js';

let enabled = false;
let sentry;
let initialization;

function sanitizeEvent(event) {
  delete event.user;
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.headers;
    if (event.request.url) event.request.url = event.request.url.split('?')[0] ?? event.request.url;
  }
  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = sanitizeForObservability(exception.value);
    for (const frame of exception.stacktrace?.frames ?? []) {
      if (frame.filename) frame.filename = sanitizeForObservability(frame.filename);
    }
  }
  return event;
}

export function initializeErrorTracking() {
  if (initialization) return initialization;
  initialization = (async () => {
    const dsn = process.env.ERROR_TRACKING_DSN?.trim();
    if (!dsn) return false;
    try {
      sentry = await import('@sentry/node');
      sentry.init({
        dsn,
        sendDefaultPii: false,
        tracesSampleRate: Number(process.env.ERROR_TRACKING_TRACES_SAMPLE_RATE ?? 0),
        beforeSend: sanitizeEvent,
      });
      enabled = true;
      logger.info({ event: 'error_tracking_enabled' }, 'Rastreamento de erros habilitado');
    } catch (error) {
      logger.warn({ event: 'error_tracking_initialization_failed', ...errorLogFields(error) }, 'Rastreamento de erros indisponivel');
    }
    return enabled;
  })();
  return initialization;
}

export function reportError(error, context = {}) {
  const client = sentry;
  if (!enabled || !client) return;
  try {
    client.withScope((scope) => {
      scope.setUser(null);
      for (const [key, value] of Object.entries(context)) {
        if (value !== undefined) scope.setTag(key, String(value));
      }
      client.captureException(error);
    });
  } catch (trackingError) {
    logger.warn({ event: 'error_tracking_capture_failed', ...errorLogFields(trackingError) }, 'Falha ao enviar evento de erro');
  }
}

let processHandlersInstalled = false;

export function installProcessErrorHandlers() {
  if (processHandlersInstalled) return;
  processHandlersInstalled = true;
  process.once('uncaughtException', (error) => {
    logger.fatal({ event: 'uncaught_exception', ...errorLogFields(error) }, 'Excecao nao tratada');
    reportError(error, { source: 'uncaught_exception' });
    if (sentry) void sentry.flush(1_500).finally(() => process.exit(1));
    else process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    logger.error({ event: 'unhandled_rejection', ...errorLogFields(reason) }, 'Promise rejeitada sem tratamento');
    reportError(reason, { source: 'unhandled_rejection' });
  });
}

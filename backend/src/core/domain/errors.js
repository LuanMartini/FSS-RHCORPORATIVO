export class AppError extends Error {
  constructor(message, status = 400, code = 'VALIDATION_ERROR', details = undefined) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function assertFound(value, message = 'Registro nao encontrado') {
  if (!value) throw new AppError(message, 404, 'NOT_FOUND');
  return value;
}

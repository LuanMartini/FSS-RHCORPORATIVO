import { AppError } from './errors.js';

export const DOCUMENT_TYPES = Object.freeze([
  'RG',
  'CPF',
  'PIS',
  'COMPROVANTE_RESIDENCIA',
  'DIPLOMA',
]);
export const DOCUMENT_DECISIONS = Object.freeze(['APROVADO', 'RECUSADO']);

function text(value, field, max, required = true) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (required && !normalized) throw new AppError(`${field} e obrigatorio.`);
  if (normalized.length > max) throw new AppError(`${field} deve ter no maximo ${max} caracteres.`);
  return normalized || null;
}

export function positiveId(value, field = 'Id') {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new AppError(`${field} invalido.`);
  return parsed;
}

export function optionalPositiveId(value, field) {
  if (value == null || value === '') return null;
  return positiveId(value, field);
}

export function parseDocumentHeaders(headers) {
  const type = String(headers['x-document-type'] ?? '').toUpperCase();
  let decodedFileName;
  try { decodedFileName = decodeURIComponent(String(headers['x-file-name'] ?? '')); }
  catch { throw new AppError('Nome do arquivo possui codificacao invalida.'); }
  const fileName = text(decodedFileName, 'Nome do arquivo', 255);
  const mimeType = String(headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
  if (!DOCUMENT_TYPES.includes(type)) throw new AppError('Tipo de documento invalido.');
  return { type, fileName, mimeType };
}

export function parseValidationDecision(body) {
  const decision = String(body?.decision ?? '').toUpperCase();
  const justification = text(body?.justificativa, 'Justificativa', 2000, false);
  if (!DOCUMENT_DECISIONS.includes(decision)) throw new AppError('Decisao de validacao invalida.');
  if (decision === 'RECUSADO' && (!justification || justification.length < 5)) {
    throw new AppError('A recusa exige uma justificativa com pelo menos 5 caracteres.');
  }
  return { decision, justification };
}

export function parseHierarchyChange(params, body) {
  return {
    cargoId: positiveId(params.cargoId, 'Cargo'),
    newSuperiorId: optionalPositiveId(body?.novoSuperiorId, 'Novo superior'),
    reason: text(body?.motivo, 'Motivo', 500),
    version: positiveId(body?.versao, 'Versao'),
  };
}

export function parseActivation(body) {
  return {
    scheduleId: positiveId(body?.escalaId, 'Escala'),
    expectedVersion: positiveId(body?.versao, 'Versao'),
  };
}

export function parseNewAdmission(body) {
  const cpf = String(body?.cpf ?? '').replace(/\D/g, '');
  const email = String(body?.email ?? '').trim().toLowerCase();
  const salary = body?.salario == null || body.salario === '' ? null : Number(body.salario);
  if (!/^\d{11}$/.test(cpf)) throw new AppError('CPF deve conter 11 digitos.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError('E-mail invalido.');
  if (salary != null && (!Number.isFinite(salary) || salary < 0)) throw new AppError('Salario invalido.');
  return {
    applicationId: optionalPositiveId(body?.candidaturaId, 'Candidatura'),
    name: text(body?.nomeCompleto, 'Nome completo', 180),
    socialName: text(body?.nomeSocial, 'Nome social', 180, false),
    cpf,
    email,
    phone: text(body?.telefone, 'Telefone', 32, false),
    birthDate: body?.dataNascimento || null,
    admissionDate: body?.dataAdmissao || null,
    cargoId: optionalPositiveId(body?.cargoId, 'Cargo'),
    departmentId: optionalPositiveId(body?.departamentoId, 'Departamento'),
    salary,
  };
}

export function parsePin(body) {
  const pin = String(body?.pin ?? '').trim();
  if (!/^\d{6}$/.test(pin)) throw new AppError('PIN deve conter 6 digitos.');
  return pin;
}

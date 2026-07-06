export function requiredString(value, field, max = 180) {
  const text = String(value ?? '').trim();
  if (!text) return `${field} e obrigatorio.`;
  if (text.length > max) return `${field} deve ter no maximo ${max} caracteres.`;
  return '';
}

export function validEmail(value, field = 'E-mail') {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return `${field} e obrigatorio.`;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return `${field} invalido.`;
  if (text.length > 180) return `${field} deve ter no maximo 180 caracteres.`;
  return '';
}

export function positiveNumber(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return `${field} deve ser maior que zero.`;
  return '';
}

export function positiveInteger(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) return `${field} deve ser um inteiro positivo.`;
  return '';
}

export function optionalDate(value, field) {
  if (!value) return '';
  const text = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00`))) {
    return `${field} deve estar no formato AAAA-MM-DD.`;
  }
  return '';
}

export function validate(fields) {
  const errors = fields.filter(Boolean);
  return errors.length ? errors : null;
}

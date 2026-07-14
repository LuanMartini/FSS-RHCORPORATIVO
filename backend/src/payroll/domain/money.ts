import type { Cents } from './types.js';

export function parseCents(value: string | number | bigint): Cents {
  if (typeof value === 'bigint') return value;
  const normalized = String(value).trim().replace(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) throw new Error(`Valor monetario invalido: ${value}`);
  const [whole = '0', fraction = ''] = normalized.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}

export function formatCents(value: Cents): string {
  const sign = value < 0n ? '-' : '';
  const absolute = value < 0n ? -value : value;
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}

export function multiplyRatio(amount: Cents, numerator: bigint, denominator: bigint): Cents {
  if (denominator <= 0n) throw new Error('Denominador deve ser positivo.');
  const product = amount * numerator;
  return product >= 0n
    ? (product + denominator / 2n) / denominator
    : (product - denominator / 2n) / denominator;
}

export function minMoney(...values: Cents[]): Cents {
  if (values.length === 0) throw new Error('minMoney requer ao menos um valor.');
  return values.reduce((minimum, value) => value < minimum ? value : minimum);
}

export function maxMoney(...values: Cents[]): Cents {
  if (values.length === 0) throw new Error('maxMoney requer ao menos um valor.');
  return values.reduce((maximum, value) => value > maximum ? value : maximum);
}

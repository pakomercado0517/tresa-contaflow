import type { ComplementRole } from '../types/payment.types.js';
import { AppError } from './AppError.js';

//Normalizamos un query param opcional a string
export const optionalQueryString = (value: unknown): string | undefined => {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
};

// Normalizamos un query param opcional a number
export const optionalQueryInt = (value: unknown): number | undefined => {
  if (typeof value !== 'string' || value === '') return undefined;

  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
};

/** Query numérico requerido (p. ej. tras `metricsQueryValidation`). */
export const requiredQueryInt = (value: unknown): number => {
  const parsed = optionalQueryInt(value);
  if (parsed === undefined) {
    throw new AppError('Parámetro de consulta numérico inválido o faltante', 400);
  }
  return parsed;
};

export const optionalComplementRole = (value: unknown): ComplementRole | undefined => {
  const role = optionalQueryString(value);
  return role === undefined ? undefined : (role as ComplementRole);
};

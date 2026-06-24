import { getResicoPfRate } from './resico-pf-rates.2026.js';

export type { ResicoPfRateResult } from './resico-pf-rates.2026.js';
export { getResicoPfRate, RESICO_PF_BRACKETS_2026 } from './resico-pf-rates.2026.js';
export {
  getCorporateIsrRate,
  type CorporateIsrRateResult,
} from './corporate-isr-rate.js';

const SUPPORTED_EJERCICIOS = new Set([2026]);

export function isEjercicioWithResicoPfRates(ejercicio: number): boolean {
  return SUPPORTED_EJERCICIOS.has(ejercicio);
}

export function getResicoPfRateForEjercicio(
  ejercicio: number,
  ingresosMensuales: number
): ReturnType<typeof getResicoPfRate> | null {
  if (!isEjercicioWithResicoPfRates(ejercicio)) {
    return null;
  }
  return getResicoPfRate(ingresosMensuales);
}

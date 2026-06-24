/**
 * Tabla mensual RESICO Persona Física — ejercicio 2026
 * Tasa sobre ingresos cobrados del mes (sin IVA)
 */

export interface ResicoPfRateBracket {
  limiteSuperior: number;
  rate: number;
  label: string;
}

export const RESICO_PF_BRACKETS_2026: readonly ResicoPfRateBracket[] = [
  { limiteSuperior: 25_000, rate: 0.01, label: '1.00%' },
  { limiteSuperior: 50_000, rate: 0.011, label: '1.10%' },
  { limiteSuperior: 83_333.33, rate: 0.015, label: '1.50%' },
  { limiteSuperior: 208_333.33, rate: 0.02, label: '2.00%' },
  { limiteSuperior: 3_500_000, rate: 0.025, label: '2.50%' },
] as const;

export interface ResicoPfRateResult {
  rate: number;
  label: string;
}

export function getResicoPfRate(ingresosMensuales: number): ResicoPfRateResult {
  const ingresos = Math.max(0, ingresosMensuales);
  for (const bracket of RESICO_PF_BRACKETS_2026) {
    if (ingresos <= bracket.limiteSuperior) {
      return { rate: bracket.rate, label: bracket.label };
    }
  }
  const last = RESICO_PF_BRACKETS_2026[RESICO_PF_BRACKETS_2026.length - 1]!;
  return { rate: last.rate, label: last.label };
}

/**
 * Tasa de ISR personas morales (RESICO PM, régimen general) por ejercicio
 */

export interface CorporateIsrRateResult {
  rate: number;
  label: string;
}

const CORPORATE_RATE_BY_EJERCICIO: Readonly<Record<number, CorporateIsrRateResult>> = {
  2026: { rate: 0.3, label: '30%' },
};

export function getCorporateIsrRate(ejercicio: number): CorporateIsrRateResult | null {
  return CORPORATE_RATE_BY_EJERCICIO[ejercicio] ?? null;
}

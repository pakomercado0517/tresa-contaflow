/**
 * Redondeo monetario alineado con MetricsService
 */
export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

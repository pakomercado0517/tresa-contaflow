/**
 * Tarifa mensual acumulada ISR personas físicas (actividad empresarial) — ejercicio 2026.
 * Estructura alineada a tablas del SAT; actualizar límites cuando publique el ejercicio.
 */

export interface PfProgressiveBracket {
  limite_inferior: number;
  limite_superior: number;
  cuota_fija: number;
  porcentaje_excedente: number;
}

/** Tabla referencia (enero); mismas filas base para meses 1–12 en v1 (límites mensuales SAT por mes). */
const BRACKETS_ENERO_2026: readonly PfProgressiveBracket[] = [
  { limite_inferior: 0.01, limite_superior: 746.04, cuota_fija: 0, porcentaje_excedente: 0.0192 },
  { limite_inferior: 746.05, limite_superior: 6332.05, cuota_fija: 14.32, porcentaje_excedente: 0.064 },
  { limite_inferior: 6332.06, limite_superior: 11128.01, cuota_fija: 371.83, porcentaje_excedente: 0.1088 },
  { limite_inferior: 11128.02, limite_superior: 12935.82, cuota_fija: 893.63, porcentaje_excedente: 0.16 },
  { limite_inferior: 12935.83, limite_superior: 15487.71, cuota_fija: 1182.88, porcentaje_excedente: 0.1792 },
  { limite_inferior: 15487.72, limite_superior: 31236.49, cuota_fija: 1640.18, porcentaje_excedente: 0.2136 },
  { limite_inferior: 31236.5, limite_superior: 49233.0, cuota_fija: 5004.12, porcentaje_excedente: 0.2352 },
  { limite_inferior: 49233.01, limite_superior: 93993.9, cuota_fija: 9236.89, porcentaje_excedente: 0.3 },
  { limite_inferior: 93993.91, limite_superior: 125325.2, cuota_fija: 22665.17, porcentaje_excedente: 0.32 },
  { limite_inferior: 125325.21, limite_superior: 375975.61, cuota_fija: 22692.42, porcentaje_excedente: 0.34 },
  {
    limite_inferior: 375975.62,
    limite_superior: Number.MAX_SAFE_INTEGER,
    cuota_fija: 107776.1,
    porcentaje_excedente: 0.35,
  },
] as const;

function scaleBracketsForMonth(
  base: readonly PfProgressiveBracket[],
  mesAcumulado: number
): PfProgressiveBracket[] {
  const factor = mesAcumulado;
  return base.map((row, index) => {
    const isLast = index === base.length - 1;
    return {
      limite_inferior: Math.round(row.limite_inferior * factor * 100) / 100,
      limite_superior: isLast
        ? Number.MAX_SAFE_INTEGER
        : Math.round(row.limite_superior * factor * 100) / 100,
      cuota_fija: Math.round(row.cuota_fija * factor * 100) / 100,
      porcentaje_excedente: row.porcentaje_excedente,
    };
  });
}

const PF_PROGRESSIVE_BY_MONTH_2026: Record<number, PfProgressiveBracket[]> = {};
for (let mes = 1; mes <= 12; mes += 1) {
  PF_PROGRESSIVE_BY_MONTH_2026[mes] =
    mes === 1 ? [...BRACKETS_ENERO_2026] : scaleBracketsForMonth(BRACKETS_ENERO_2026, mes);
}

export function getPfProgressiveBrackets(
  ejercicio: number,
  mesAcumulado: number
): PfProgressiveBracket[] | null {
  if (ejercicio !== 2026 || mesAcumulado < 1 || mesAcumulado > 12) {
    return null;
  }
  return PF_PROGRESSIVE_BY_MONTH_2026[mesAcumulado] ?? null;
}

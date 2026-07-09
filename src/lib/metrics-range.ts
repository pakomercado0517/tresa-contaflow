export const MAX_METRICS_RANGE_MONTHS = 24;

export interface MonthYear {
  mes: number;
  año: number;
}

export function compareMonthYear(a: MonthYear, b: MonthYear): number {
  if (a.año !== b.año) {
    return a.año - b.año;
  }
  return a.mes - b.mes;
}

/**
 * Lista mes/año inclusivos desde (mesDesde, añoDesde) hasta (mesHasta, añoHasta), en orden cronológico.
 */
export function enumerateMonthYears(
  mesDesde: number,
  añoDesde: number,
  mesHasta: number,
  añoHasta: number
): MonthYear[] {
  const items: MonthYear[] = [];
  let mes = mesDesde;
  let año = añoDesde;

  while (año < añoHasta || (año === añoHasta && mes <= mesHasta)) {
    items.push({ mes, año });
    mes += 1;
    if (mes > 12) {
      mes = 1;
      año += 1;
    }
  }

  return items;
}

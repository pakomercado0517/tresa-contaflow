import { describe, it, expect } from 'vitest';
import { mapPeriodMetricsResponseToLegacy } from '../lib/legacy-metrics.mapper.js';
import type { PeriodMetricsResponse } from '../types/metrics.types.js';

const baseResponse: PeriodMetricsResponse = {
  period: { id: 'period-1', start: new Date('2024-12-01'), end: new Date('2024-12-31') },
  flujo: {
    ingresos_cobrados: 1862.07,
    egresos_pagados: 300,
    flujo_neto: 1562.07,
    ingresos_cobrados_sin_conciliar: 0,
    egresos_pagados_sin_conciliar: 0,
  },
  devengado: {
    ingresos_devengados: 2586.21,
    egresos_devengados: 500,
    resultado_devengado: 2086.21,
  },
  impuestos: {
    iva_trasladado: { cobrado: 0, devengado: 0 },
    iva_acreditable: { pagado: 0, devengado: 0 },
    retenciones_iva: { cobrado: 0, devengado: 0 },
    retenciones_isr: { cobrado: 0, devengado: 0 },
  },
  pendientes: {
    por_cobrar: 724.14,
    por_pagar: 100,
    por_cobrar_impuestos: { iva: 0, retenciones_iva: 0, retenciones_isr: 0 },
    por_pagar_impuestos: { iva: 0, retenciones_iva: 0, retenciones_isr: 0 },
  },
  nomina: {
    total_pagada: 0,
    percepciones: 0,
    deducciones: 0,
    cantidad_empleados: 0,
  },
};

describe('mapPeriodMetricsResponseToLegacy', () => {
  it('mapea los KPIs financieros del stack /api/metrics al formato legacy', () => {
    const legacy = mapPeriodMetricsResponseToLegacy(baseResponse);

    expect(legacy.totalFacturado).toBe(2586.21);
    expect(legacy.totalPagado).toBe(1862.07);
    expect(legacy.totalCompras).toBe(500);
    expect(legacy.totalComprasPagadas).toBe(300);
    expect(legacy.totalPagadoMenosCompras).toBe(1562.07);
    expect(legacy.pendientePagar).toBe(724.14);
    expect(legacy.gastosPendientes).toBe(100);
    expect(legacy.facturasPUE).toBe(0);
    expect(legacy.gastosPPD).toBe(0);
  });
});

import type { PeriodMetricsResponse } from '../../types/metrics.types.js';

export function createEmptyMetrics(overrides: Partial<PeriodMetricsResponse> = {}): PeriodMetricsResponse {
  const base: PeriodMetricsResponse = {
    period: { id: 'test-period', start: new Date('2026-06-01'), end: new Date('2026-07-01') },
    flujo: {
      ingresos_cobrados: 0,
      egresos_pagados: 0,
      flujo_neto: 0,
      ingresos_cobrados_sin_conciliar: 0,
      egresos_pagados_sin_conciliar: 0,
    },
    devengado: {
      ingresos_devengados: 0,
      egresos_devengados: 0,
      resultado_devengado: 0,
    },
    impuestos: {
      iva_trasladado: { cobrado: 0, devengado: 0 },
      iva_acreditable: { pagado: 0, devengado: 0 },
      retenciones_iva: { cobrado: 0, devengado: 0 },
      retenciones_isr: { cobrado: 0, devengado: 0 },
    },
    pendientes: {
      por_cobrar: 0,
      por_pagar: 0,
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
  return { ...base, ...overrides };
}

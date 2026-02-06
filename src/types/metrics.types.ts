/**
 * Estructura de respuesta del endpoint de métricas por período (profile_id + period_id).
 * Flujo = cobrado/pagado; Devengado = registrado en el período; Resultado = diferencia.
 */

export interface PeriodInfo {
  id: string;
  start: Date;
  end: Date;
}

export interface FlujoMetrics {
  ingresos_cobrados: number;
  egresos_pagados: number;
  flujo_neto: number;
}

export interface DevengadoMetrics {
  ingresos_devengados: number;
  egresos_devengados: number;
  resultado_devengado: number;
}

export interface ImpuestosMetrics {
  iva_trasladado: { cobrado: number; devengado: number };
  iva_acreditable: { pagado: number; devengado: number };
  retenciones_iva: { cobrado: number; devengado: number };
  retenciones_isr: { cobrado: number; devengado: number };
}

export interface PendientesMetrics {
  por_cobrar: number;
  por_pagar: number;
}

export interface PeriodMetricsResponse {
  period: PeriodInfo;
  flujo: FlujoMetrics;
  devengado: DevengadoMetrics;
  impuestos: ImpuestosMetrics;
  pendientes: PendientesMetrics;
}

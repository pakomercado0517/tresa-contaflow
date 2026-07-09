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
  ingresos_cobrados_sin_conciliar: number;
  egresos_pagados_sin_conciliar: number;
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

/** IVA trasladado y retenciones (ingreso) proporcionales al subtotal pendiente de PPD por cobrar, o pendiente íntegro en egresos manuales. */
export interface PendientesImpuestosDesglose {
  iva: number;
  retenciones_iva: number;
  retenciones_isr: number;
}

export interface PendientesMetrics {
  por_cobrar: number;
  por_pagar: number;
  /** IVA trasladado y retenciones de facturas PPD proporcionales al subtotal pendiente de cobro. */
  por_cobrar_impuestos: PendientesImpuestosDesglose;
  /** IVA acreditable (y retenciones del CFDI) proporcional al pendiente por PPD; más IVA/rets de gastos MANUAL sin pagar. */
  por_pagar_impuestos: PendientesImpuestosDesglose;
}

export interface NominaMetrics {
  total_pagada: number;
  percepciones: number;
  deducciones: number;
  cantidad_empleados: number;
}

export interface PeriodMetricsResponse {
  period: PeriodInfo;
  flujo: FlujoMetrics;
  devengado: DevengadoMetrics;
  impuestos: ImpuestosMetrics;
  pendientes: PendientesMetrics;
  nomina: NominaMetrics;
}

export interface MetricsByMonthItem extends PeriodMetricsResponse {
  mes: number;
  año: number;
}

export interface MetricsRangeResponse {
  range: {
    mes_desde: number;
    año_desde: number;
    mes_hasta: number;
    año_hasta: number;
  };
  items: MetricsByMonthItem[];
}

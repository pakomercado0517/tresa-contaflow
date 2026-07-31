import type { PeriodMetrics, PeriodMetricsResponse } from '../types/metrics.types.js';

/**
 * Adapta la respuesta consolidada de `/api/metrics` al formato legacy de `/api/invoices/metrics`.
 * Los contadores por tipo (facturasPUE, gastosPPD, etc.) ya no se calculan en el endpoint legacy;
 * usa `/api/metrics` para el desglose completo.
 */
export function mapPeriodMetricsResponseToLegacy(
  response: PeriodMetricsResponse
): PeriodMetrics {
  return {
    totalFacturado: response.devengado.ingresos_devengados,
    totalPagado: response.flujo.ingresos_cobrados,
    totalCompras: response.devengado.egresos_devengados,
    totalComprasPagadas: response.flujo.egresos_pagados,
    totalPagadoMenosCompras: response.flujo.flujo_neto,
    pendientePagar: response.pendientes.por_cobrar,
    gastosPendientes: response.pendientes.por_pagar,
    pagosAnticipadosGastos: 0,
    totalFacturas: 0,
    totalGastos: 0,
    facturasPUE: 0,
    facturasPPD: 0,
    facturasPagadasCompletamente: 0,
    facturasParcialmentePagadas: 0,
    facturasPendientesPago: 0,
    gastosPUE: 0,
    gastosPPD: 0,
    gastosPagadosCompletamente: 0,
    gastosParcialmentePagados: 0,
  };
}

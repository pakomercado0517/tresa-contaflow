import type { PeriodMetricsResponse } from '../../types/metrics.types.js';
import type { TaxEstimateIsrBlock } from '../../types/tax-estimate.types.js';
import { getResicoPfRateForEjercicio } from '../../constants/fiscal-rates/index.js';
import { roundMoney } from './round-money.js';

export function calculateResicoPfIsr(
  metrics: PeriodMetricsResponse,
  ejercicio: number
): { isr: TaxEstimateIsrBlock | null; ratesMissing: boolean } {
  const ingresosBase = metrics.flujo.ingresos_cobrados;
  const rateInfo = getResicoPfRateForEjercicio(ejercicio, ingresosBase);
  if (!rateInfo) {
    return { isr: null, ratesMissing: true };
  }

  const retenciones = metrics.impuestos.retenciones_isr.cobrado;
  const isrCausado = roundMoney(ingresosBase * rateInfo.rate);
  const netoRaw = isrCausado - retenciones;
  const isrNeto = roundMoney(Math.max(0, netoRaw));
  const saldoAFavor = roundMoney(Math.max(0, -netoRaw));

  const isr: TaxEstimateIsrBlock = {
    ingresos_base: roundMoney(ingresosBase),
    deducciones_aplicadas: 0,
    base_gravable: roundMoney(ingresosBase),
    tasa_o_tarifa: rateInfo.label,
    isr_causado: isrCausado,
    menos_retenciones: roundMoney(retenciones),
    menos_pagos_provisionales_anteriores: 0,
    isr_neto_a_pagar: isrNeto,
    saldo_a_favor: saldoAFavor,
  };

  return { isr, ratesMissing: false };
}

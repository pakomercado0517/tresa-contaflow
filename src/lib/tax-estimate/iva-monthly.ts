import type { PeriodMetricsResponse } from '../../types/metrics.types.js';
import type { TaxEstimateIvaBlock } from '../../types/tax-estimate.types.js';
import { roundMoney } from './round-money.js';

export function calculateIvaMonthly(
  metrics: PeriodMetricsResponse,
  saldoAFavorIva: number = 0
): TaxEstimateIvaBlock {
  const causado = metrics.impuestos.iva_trasladado.cobrado;
  const acreditable = metrics.impuestos.iva_acreditable.pagado;
  const retenido = metrics.impuestos.retenciones_iva.cobrado;
  const creditos = acreditable + retenido + saldoAFavorIva;
  const neto = roundMoney(causado - creditos);
  const saldoAFavor = roundMoney(Math.max(0, creditos - causado));
  const netoAPagar = roundMoney(Math.max(0, neto));

  return {
    iva_trasladado_cobrado: roundMoney(causado),
    iva_acreditable_pagado: roundMoney(acreditable),
    iva_retenido: roundMoney(retenido),
    iva_neto_a_pagar: netoAPagar,
    saldo_a_favor: saldoAFavor,
  };
}

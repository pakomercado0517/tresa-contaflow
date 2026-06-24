import type { PeriodMetricsResponse } from '../../types/metrics.types.js';
import type { ProfileFiscalSettingsSnapshot } from '../../types/profile-fiscal.types.js';
import type { TaxEstimateIsrBlock } from '../../types/tax-estimate.types.js';
import { getCorporateIsrRate } from '../../constants/fiscal-rates/index.js';
import { settleIsrNeto } from './isr-net-settlement.js';
import { roundMoney } from './round-money.js';

export interface CalculateResicoPmIsrInput {
  ytdMetrics: PeriodMetricsResponse;
  ejercicio: number;
  fiscalSettings?: ProfileFiscalSettingsSnapshot;
  /** @deprecated usar fiscalSettings.isr_pagos_provisionales_acum */
  pagosProvisionalesAnteriores?: number;
}

export function calculateResicoPmIsr(
  input: CalculateResicoPmIsrInput
): { isr: TaxEstimateIsrBlock | null; ratesMissing: boolean } {
  const { ytdMetrics, ejercicio, fiscalSettings } = input;
  const pagosProvisionales =
    fiscalSettings?.isr_pagos_provisionales_acum ?? input.pagosProvisionalesAnteriores ?? 0;
  const perdidas = fiscalSettings?.perdidas_fiscales_pendientes ?? 0;
  const ptu = fiscalSettings?.ptu_pagada_acum ?? 0;
  const saldoAFavorIsr = fiscalSettings?.saldo_a_favor_isr ?? 0;

  const rateInfo = getCorporateIsrRate(ejercicio);
  if (!rateInfo) {
    return { isr: null, ratesMissing: true };
  }

  const ingresosAcum = ytdMetrics.flujo.ingresos_cobrados;
  const egresosAcum = ytdMetrics.flujo.egresos_pagados;
  const utilidadBruta = ingresosAcum - egresosAcum - ptu - perdidas;
  const utilidad = Math.max(0, utilidadBruta);
  const isrCausado = roundMoney(utilidad * rateInfo.rate);
  const retenciones = ytdMetrics.impuestos.retenciones_isr.cobrado;
  const settlement = settleIsrNeto({
    isrCausado,
    retenciones,
    pagosProvisionales,
    saldoAFavorIsr,
  });

  const isr: TaxEstimateIsrBlock = {
    ingresos_base: roundMoney(ingresosAcum),
    deducciones_aplicadas: roundMoney(egresosAcum + ptu + perdidas),
    base_gravable: roundMoney(utilidad),
    tasa_o_tarifa: rateInfo.label,
    isr_causado: isrCausado,
    menos_retenciones: roundMoney(retenciones),
    menos_pagos_provisionales_anteriores: roundMoney(pagosProvisionales),
    isr_neto_a_pagar: settlement.isrNetoAPagar,
    saldo_a_favor: settlement.saldoAFavor,
  };

  return { isr, ratesMissing: false };
}

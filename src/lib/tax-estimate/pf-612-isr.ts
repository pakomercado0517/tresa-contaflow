import type { PeriodMetricsResponse } from '../../types/metrics.types.js';
import type { ProfileFiscalSettingsSnapshot } from '../../types/profile-fiscal.types.js';
import type { TaxEstimateIsrBlock } from '../../types/tax-estimate.types.js';
import { applyPfProgressiveTariff } from './pf-progressive-tariff.js';
import { roundMoney } from './round-money.js';
import { settleIsrNeto } from './isr-net-settlement.js';

export interface CalculatePf612IsrInput {
  ytdMetrics: PeriodMetricsResponse;
  ejercicio: number;
  mes: number;
  fiscalSettings: ProfileFiscalSettingsSnapshot;
}

export function calculatePf612Isr(
  input: CalculatePf612IsrInput
): { isr: TaxEstimateIsrBlock | null; ratesMissing: boolean } {
  const { ytdMetrics, ejercicio, mes, fiscalSettings } = input;
  const ingresosAcum = ytdMetrics.flujo.ingresos_cobrados;
  const egresosAcum = ytdMetrics.flujo.egresos_pagados;
  const baseBruta =
    ingresosAcum -
    egresosAcum -
    fiscalSettings.ptu_pagada_acum -
    fiscalSettings.perdidas_fiscales_pendientes;
  const baseGravable = Math.max(0, baseBruta);

  const tariff = applyPfProgressiveTariff(baseGravable, ejercicio, mes);
  if (!tariff) {
    return { isr: null, ratesMissing: true };
  }

  const retenciones = ytdMetrics.impuestos.retenciones_isr.cobrado;
  const settlement = settleIsrNeto({
    isrCausado: tariff.isrCausado,
    retenciones,
    pagosProvisionales: fiscalSettings.isr_pagos_provisionales_acum,
    saldoAFavorIsr: fiscalSettings.saldo_a_favor_isr,
  });

  const isr: TaxEstimateIsrBlock = {
    ingresos_base: roundMoney(ingresosAcum),
    deducciones_aplicadas: roundMoney(egresosAcum + fiscalSettings.ptu_pagada_acum + fiscalSettings.perdidas_fiscales_pendientes),
    base_gravable: roundMoney(baseGravable),
    tasa_o_tarifa: tariff.tarifaLabel,
    isr_causado: tariff.isrCausado,
    menos_retenciones: roundMoney(retenciones),
    menos_pagos_provisionales_anteriores: roundMoney(fiscalSettings.isr_pagos_provisionales_acum),
    isr_neto_a_pagar: settlement.isrNetoAPagar,
    saldo_a_favor: settlement.saldoAFavor,
  };

  return { isr, ratesMissing: false };
}

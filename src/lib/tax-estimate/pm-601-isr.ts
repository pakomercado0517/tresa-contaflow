import type { PeriodMetricsResponse } from '../../types/metrics.types.js';
import type { ProfileFiscalSettingsSnapshot } from '../../types/profile-fiscal.types.js';
import type { TaxEstimateIsrBlock } from '../../types/tax-estimate.types.js';
import { getCorporateIsrRate } from '../../constants/fiscal-rates/index.js';
import { resolveCoeficienteUtilidad } from './resolve-coeficiente-utilidad.js';
import { settleIsrNeto } from './isr-net-settlement.js';
import { roundMoney } from './round-money.js';

export interface CalculatePm601IsrInput {
  ytdMetrics: PeriodMetricsResponse;
  ejercicio: number;
  mes: number;
  fiscalSettings: ProfileFiscalSettingsSnapshot;
}

export function calculatePm601Isr(
  input: CalculatePm601IsrInput
): {
  isr: TaxEstimateIsrBlock | null;
  ratesMissing: boolean;
  extraAlerts: ReturnType<typeof resolveCoeficienteUtilidad>['alerts'];
} {
  const { ytdMetrics, ejercicio, mes, fiscalSettings } = input;
  const { coeficiente, alerts: coefAlerts } = resolveCoeficienteUtilidad(mes, fiscalSettings);
  if (coeficiente == null) {
    return { isr: null, ratesMissing: false, extraAlerts: coefAlerts };
  }

  const rateInfo = getCorporateIsrRate(ejercicio);
  if (!rateInfo) {
    return { isr: null, ratesMissing: true, extraAlerts: coefAlerts };
  }

  const ingresosDevengados = ytdMetrics.devengado.ingresos_devengados;
  const utilidadBruta =
    ingresosDevengados * coeficiente -
    fiscalSettings.perdidas_fiscales_pendientes -
    fiscalSettings.ptu_pagada_acum;
  const utilidad = Math.max(0, utilidadBruta);
  const isrCausado = roundMoney(utilidad * rateInfo.rate);
  const retenciones = ytdMetrics.impuestos.retenciones_isr.cobrado;
  const settlement = settleIsrNeto({
    isrCausado,
    retenciones,
    pagosProvisionales: fiscalSettings.isr_pagos_provisionales_acum,
    saldoAFavorIsr: fiscalSettings.saldo_a_favor_isr,
  });

  const isr: TaxEstimateIsrBlock = {
    ingresos_base: roundMoney(ingresosDevengados),
    deducciones_aplicadas: roundMoney(
      ingresosDevengados * (1 - coeficiente) +
        fiscalSettings.perdidas_fiscales_pendientes +
        fiscalSettings.ptu_pagada_acum
    ),
    base_gravable: roundMoney(utilidad),
    tasa_o_tarifa: `${rateInfo.label} (coef. ${(coeficiente * 100).toFixed(2)}%)`,
    isr_causado: isrCausado,
    menos_retenciones: roundMoney(retenciones),
    menos_pagos_provisionales_anteriores: roundMoney(fiscalSettings.isr_pagos_provisionales_acum),
    isr_neto_a_pagar: settlement.isrNetoAPagar,
    saldo_a_favor: settlement.saldoAFavor,
  };

  return { isr, ratesMissing: false, extraAlerts: coefAlerts };
}

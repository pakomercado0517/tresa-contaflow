import type { PeriodMetricsResponse } from '../../types/metrics.types.js';
import type {
  BuildTaxEstimateOptions,
  TaxEstimateContext,
  TaxEstimateResult,
} from '../../types/tax-estimate.types.js';
import { TAX_ESTIMATE_DISCLAIMER } from '../../constants/tax-estimate.constants.js';
import { calculateIvaMonthly } from './iva-monthly.js';
import { estimateIsrForContext } from './estimate-isr.js';
import { buildBaseAlerts, buildResicoPfAlerts } from './alerts.js';

export function buildTaxEstimate(
  metrics: PeriodMetricsResponse,
  context: TaxEstimateContext,
  options: BuildTaxEstimateOptions = {}
): TaxEstimateResult {
  const saldoAFavorIva =
    options.saldoAFavorIva ?? options.fiscalSettings?.saldo_a_favor_iva ?? 0;
  const iva = calculateIvaMonthly(metrics, saldoAFavorIva);
  const { isr, isrSupported, extraAlerts } = estimateIsrForContext(metrics, context, options);

  const alerts = [
    ...buildBaseAlerts(),
    ...buildResicoPfAlerts(metrics, context),
    ...extraAlerts,
    ...(options.extraAlerts ?? []),
  ];

  return {
    regimen: context.regimen,
    tipo_persona: context.tipoPersona,
    ejercicio: context.ejercicio,
    mes: context.mes,
    supported: isrSupported,
    disclaimer: TAX_ESTIMATE_DISCLAIMER,
    isr,
    iva,
    alerts,
  };
}

export { calculateIvaMonthly } from './iva-monthly.js';
export { calculateResicoPfIsr } from './resico-pf-isr.js';
export { calculateResicoPmIsr } from './resico-pm-isr.js';
export { estimateIsrForContext } from './estimate-isr.js';
export { roundMoney } from './round-money.js';

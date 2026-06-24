import type { PeriodMetricsResponse } from '../../types/metrics.types.js';
import type {
  BuildTaxEstimateOptions,
  TaxEstimateContext,
  TaxEstimateIsrBlock,
} from '../../types/tax-estimate.types.js';
import { EMPTY_FISCAL_SETTINGS_SNAPSHOT } from '../../types/profile-fiscal.types.js';
import {
  REGIMEN_ACTIVIDAD_EMPRESARIAL,
  REGIMEN_GENERAL_PM,
  REGIMEN_RESICO,
} from '../../constants/tax-estimate.constants.js';
import { calculateResicoPfIsr } from './resico-pf-isr.js';
import { calculateResicoPmIsr } from './resico-pm-isr.js';
import { calculatePf612Isr } from './pf-612-isr.js';
import { calculatePm601Isr } from './pm-601-isr.js';
import {
  buildEjercicioSinTarifasAlert,
  buildRegimenNotSupportedAlert,
  buildResicoPmSinDepreciacionAlert,
  buildSinMetricasAcumuladasAlert,
} from './alerts.js';

export interface EstimateIsrResult {
  isr: TaxEstimateIsrBlock | null;
  isrSupported: boolean;
  extraAlerts: ReturnType<typeof buildRegimenNotSupportedAlert>[];
}

export function estimateIsrForContext(
  metrics: PeriodMetricsResponse,
  context: TaxEstimateContext,
  options: BuildTaxEstimateOptions = {}
): EstimateIsrResult {
  const extraAlerts: EstimateIsrResult['extraAlerts'] = [];
  const fiscalSettings = options.fiscalSettings ?? EMPTY_FISCAL_SETTINGS_SNAPSHOT;

  if (context.regimen === REGIMEN_RESICO && context.tipoPersona === 'FISICA') {
    const { isr, ratesMissing } = calculateResicoPfIsr(metrics, context.ejercicio);
    if (ratesMissing) {
      extraAlerts.push(buildEjercicioSinTarifasAlert(context.ejercicio));
      return { isr: null, isrSupported: false, extraAlerts };
    }
    return { isr, isrSupported: true, extraAlerts };
  }

  if (context.regimen === REGIMEN_RESICO && context.tipoPersona === 'MORAL') {
    if (!options.ytdMetrics) {
      extraAlerts.push(buildSinMetricasAcumuladasAlert());
      return { isr: null, isrSupported: false, extraAlerts };
    }
    const { isr, ratesMissing } = calculateResicoPmIsr({
      ytdMetrics: options.ytdMetrics,
      ejercicio: context.ejercicio,
      fiscalSettings,
    });
    if (ratesMissing) {
      extraAlerts.push(buildEjercicioSinTarifasAlert(context.ejercicio));
      return { isr: null, isrSupported: false, extraAlerts };
    }
    extraAlerts.push(buildResicoPmSinDepreciacionAlert());
    return { isr, isrSupported: true, extraAlerts };
  }

  if (context.regimen === REGIMEN_ACTIVIDAD_EMPRESARIAL && context.tipoPersona === 'FISICA') {
    if (!options.ytdMetrics) {
      extraAlerts.push(buildSinMetricasAcumuladasAlert());
      return { isr: null, isrSupported: false, extraAlerts };
    }
    const { isr, ratesMissing } = calculatePf612Isr({
      ytdMetrics: options.ytdMetrics,
      ejercicio: context.ejercicio,
      mes: context.mes,
      fiscalSettings,
    });
    if (ratesMissing) {
      extraAlerts.push(buildEjercicioSinTarifasAlert(context.ejercicio));
      return { isr: null, isrSupported: false, extraAlerts };
    }
    return { isr, isrSupported: true, extraAlerts };
  }

  if (context.regimen === REGIMEN_GENERAL_PM && context.tipoPersona === 'MORAL') {
    if (!options.ytdMetrics) {
      extraAlerts.push(buildSinMetricasAcumuladasAlert());
      return { isr: null, isrSupported: false, extraAlerts };
    }
    const { isr, ratesMissing, extraAlerts: coefAlerts } = calculatePm601Isr({
      ytdMetrics: options.ytdMetrics,
      ejercicio: context.ejercicio,
      mes: context.mes,
      fiscalSettings,
    });
    extraAlerts.push(...coefAlerts);
    if (ratesMissing) {
      extraAlerts.push(buildEjercicioSinTarifasAlert(context.ejercicio));
      return { isr: null, isrSupported: false, extraAlerts };
    }
    if (isr == null) {
      return { isr: null, isrSupported: false, extraAlerts };
    }
    return { isr, isrSupported: true, extraAlerts };
  }

  extraAlerts.push(buildRegimenNotSupportedAlert(context.regimen));
  return { isr: null, isrSupported: false, extraAlerts };
}

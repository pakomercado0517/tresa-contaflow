import type { PeriodMetricsResponse } from '../../types/metrics.types.js';
import type { TaxEstimateAlert, TaxEstimateContext } from '../../types/tax-estimate.types.js';
import {
  REGIMEN_RESICO,
  TAX_ALERT_CODES,
} from '../../constants/tax-estimate.constants.js';

export function buildBaseAlerts(): TaxEstimateAlert[] {
  return [
    {
      code: TAX_ALERT_CODES.CFDI_NC_CANCELACION,
      severity: 'info',
      message:
        'Las notas de crédito y cancelaciones SAT no están integradas en esta versión; los importes pueden diferir de la declaración oficial.',
    },
  ];
}

export function buildResicoPfAlerts(
  metrics: PeriodMetricsResponse,
  context: TaxEstimateContext
): TaxEstimateAlert[] {
  const alerts: TaxEstimateAlert[] = [];
  if (context.regimen === REGIMEN_RESICO && context.tipoPersona === 'FISICA') {
    if (metrics.flujo.egresos_pagados > 0) {
      alerts.push({
        code: TAX_ALERT_CODES.RESICO_NO_DEDUCCIONES_ISR,
        severity: 'info',
        message:
          'En RESICO persona física las deducciones no reducen la base de ISR; el IVA acreditable sigue calculándose con base en egresos pagados.',
      });
    }
  }
  return alerts;
}

export function buildRegimenNotSupportedAlert(regimen: string): TaxEstimateAlert {
  return {
    code: TAX_ALERT_CODES.REGIMEN_NO_SOPORTADO,
    severity: 'warning',
    message: `La estimación de ISR para el régimen ${regimen} no está disponible en esta fase; solo se muestra IVA mensual orientativo.`,
  };
}

export function buildEjercicioSinTarifasAlert(ejercicio: number): TaxEstimateAlert {
  return {
    code: TAX_ALERT_CODES.EJERCICIO_SIN_TARIFAS,
    severity: 'warning',
    message: `No hay tarifas RESICO configuradas para el ejercicio ${ejercicio}.`,
  };
}

export function buildResicoLimiteAnualAlert(): TaxEstimateAlert {
  return {
    code: TAX_ALERT_CODES.RESICO_LIMITE_ANUAL,
    severity: 'warning',
    message:
      'El acumulado anual de ingresos cobrados supera el límite de $3,500,000 para RESICO persona física; verifique elegibilidad con su contador.',
  };
}

export function buildSinMetricasAlert(): TaxEstimateAlert {
  return {
    code: TAX_ALERT_CODES.SIN_METRICAS,
    severity: 'warning',
    message: 'No fue posible calcular métricas para este régimen y período.',
  };
}

export function buildSinMetricasAcumuladasAlert(): TaxEstimateAlert {
  return {
    code: TAX_ALERT_CODES.SIN_METRICAS_ACUMULADAS,
    severity: 'warning',
    message:
      'No fue posible obtener métricas acumuladas (enero al mes) necesarias para estimar ISR de RESICO persona moral.',
  };
}

export function buildResicoPmSinDepreciacionAlert(): TaxEstimateAlert {
  return {
    code: TAX_ALERT_CODES.RESICO_PM_SIN_DEPRECIACION,
    severity: 'warning',
    message:
      'La estimación no incluye depreciación de inversiones ni PTU; la utilidad fiscal real puede ser menor y el ISR mayor al mostrado.',
  };
}

export function buildResicoPmLimiteAnualAlert(): TaxEstimateAlert {
  return {
    code: TAX_ALERT_CODES.RESICO_PM_LIMITE_ANUAL,
    severity: 'warning',
    message:
      'El acumulado anual de ingresos cobrados supera el límite orientativo de $35,000,000 para RESICO persona moral; verifique elegibilidad con su contador.',
  };
}

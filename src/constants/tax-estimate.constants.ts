/**
 * Constantes del módulo de estimación fiscal informativa
 */

export const TAX_ESTIMATE_DISCLAIMER =
  'Cálculo estimado con base en la información transaccional procesada, CFDI disponibles y reglas fiscales configuradas para el ejercicio correspondiente. El resultado es una predeclaración informativa y debe validarse contra la declaración oficial del SAT y/o con el soporte de un contador titulado.';

export const TAX_ALERT_CODES = {
  REGIMEN_NO_SOPORTADO: 'E_REGIMEN_NO_SOPORTADO',
  EJERCICIO_SIN_TARIFAS: 'E_EJERCICIO_SIN_TARIFAS',
  RESICO_LIMITE_ANUAL: 'W_RESICO_LIMITE_ANUAL',
  RESICO_NO_DEDUCCIONES_ISR: 'W_RESICO_NO_DEDUCCIONES_ISR',
  RESICO_PM_SIN_DEPRECIACION: 'W_RESICO_PM_SIN_DEPRECIACION',
  RESICO_PM_LIMITE_ANUAL: 'W_RESICO_PM_LIMITE_ANUAL',
  COEFICIENTE_UTILIDAD_FALTANTE: 'E_COEFICIENTE_UTILIDAD_FALTANTE',
  COEFICIENTE_ENE_FEB_DEFAULT: 'W_COEFICIENTE_ENE_FEB_DEFAULT',
  SIN_METRICAS_ACUMULADAS: 'W_SIN_METRICAS_ACUMULADAS',
  SIN_METRICAS: 'W_SIN_METRICAS',
  CFDI_NC_CANCELACION: 'W_CFDI_NC_CANCELACION',
} as const;

export const RESICO_PF_ANNUAL_INCOME_LIMIT = 3_500_000;

export const RESICO_PM_ANNUAL_INCOME_LIMIT = 35_000_000;

export const REGIMEN_RESICO = '626';

export const REGIMEN_ACTIVIDAD_EMPRESARIAL = '612';

export const REGIMEN_GENERAL_PM = '601';

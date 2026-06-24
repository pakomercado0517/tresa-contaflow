/**
 * Tipos para estimación informativa de impuestos (Tax Estimate)
 */

import type { PeriodInfo, PeriodMetricsResponse } from './metrics.types.js';
import type { ProfileFiscalSettingsSnapshot } from './profile-fiscal.types.js';

export type TipoPersonaFiscal = 'FISICA' | 'MORAL';

export type TaxEstimateAlertSeverity = 'info' | 'warning' | 'error';

export interface TaxEstimateContext {
  regimen: string;
  tipoPersona: TipoPersonaFiscal;
  ejercicio: number;
  mes: number;
}

export interface TaxEstimateAlert {
  code: string;
  severity: TaxEstimateAlertSeverity;
  message: string;
}

export interface TaxEstimateIsrBlock {
  ingresos_base: number;
  deducciones_aplicadas: number;
  base_gravable: number;
  tasa_o_tarifa: string | null;
  isr_causado: number;
  menos_retenciones: number;
  menos_pagos_provisionales_anteriores: number;
  isr_neto_a_pagar: number;
  saldo_a_favor: number;
}

export interface TaxEstimateIvaBlock {
  iva_trasladado_cobrado: number;
  iva_acreditable_pagado: number;
  iva_retenido: number;
  iva_neto_a_pagar: number;
  saldo_a_favor: number;
}

export interface TaxEstimateResult {
  regimen: string;
  tipo_persona: TipoPersonaFiscal;
  ejercicio: number;
  mes: number;
  supported: boolean;
  disclaimer: string;
  isr: TaxEstimateIsrBlock | null;
  iva: TaxEstimateIvaBlock;
  alerts: TaxEstimateAlert[];
}

export interface TaxEstimateByRegimen {
  regimen: string;
  tax_estimate: TaxEstimateResult | null;
}

export interface TaxEstimateListResponse {
  success: true;
  meta: {
    profile_id: string;
    ejercicio: number;
    mes: number;
    period: PeriodInfo | null;
    persisted_count?: number;
    persist_skipped?: boolean;
  };
  estimates: TaxEstimateByRegimen[];
}

export interface BuildTaxEstimateOptions {
  saldoAFavorIva?: number;
  extraAlerts?: TaxEstimateAlert[];
  resicoPfRatesAvailable?: boolean;
  ytdMetrics?: PeriodMetricsResponse;
  pagosProvisionalesAnteriores?: number;
  ingresosCobradosAcumulados?: number;
  fiscalSettings?: ProfileFiscalSettingsSnapshot;
}

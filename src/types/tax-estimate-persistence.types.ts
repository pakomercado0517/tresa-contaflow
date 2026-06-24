/**
 * Persistencia de estimaciones fiscales (snapshots por mes y régimen)
 */

import type { TaxEstimateResult, TipoPersonaFiscal } from './tax-estimate.types.js';

export interface TaxEstimateRowAttributes {
  id: string;
  profile_id: string;
  regimen: string;
  ejercicio: number;
  mes: number;
  tipo_persona: TipoPersonaFiscal;
  period_id: string | null;
  payload: TaxEstimateResult;
  computed_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface TaxEstimateSnapshotRecord {
  id: string;
  profile_id: string;
  regimen: string;
  ejercicio: number;
  mes: number;
  tipo_persona: TipoPersonaFiscal;
  period_id: string | null;
  payload: TaxEstimateResult;
  computed_at: string;
  created_at: string;
  updated_at: string;
}

export interface PersistTaxEstimateOptions {
  periodId?: string | null;
}

export interface TaxEstimateHistoryResponse {
  success: true;
  meta: {
    profile_id: string;
    ejercicio: number;
    regimen?: string;
  };
  snapshots: TaxEstimateSnapshotRecord[];
}

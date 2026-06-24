import type { PeriodMetricsResponse } from './metrics.types.js';
import type { TaxEstimateResult } from './tax-estimate.types.js';

export interface PublicReportTokenAttributes {
  id: string;
  token: string;
  profile_id: string;
  user_id: string;
  expires_at: Date;
  is_active: boolean;
  created_at: Date;
}

export interface PublicReportBranding {
  logo_url: string | null;
  nombre_comercial: string | null;
}

export interface PublicReportProfileInfo {
  id: string;
  nombre: string;
  rfc: string;
  regimenes_fiscales: string[];
}

export interface MetricsByRegimen {
  regimen: string;
  metrics: PeriodMetricsResponse | null;
  tax_estimate: TaxEstimateResult | null;
}

export interface PublicReportResponse {
  branding: PublicReportBranding;
  profile: PublicReportProfileInfo;
  metrics: PeriodMetricsResponse | null;
  metrics_by_regimen: MetricsByRegimen[];
}

export interface GenerateTokenRequest {
  profile_id: string;
  expires_in_days?: number;
  send_to_email?: string;
}

export interface GenerateTokenResponse {
  token: string;
  url: string;
  expires_at: string;
}

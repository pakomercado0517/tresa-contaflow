import type { PeriodMetrics } from '../services/metrics.service.js';

export interface GetMetricsFilters {
  profileId?: string;
  mes?: number;
  año?: number;
}

export interface GetMetricsResponse {
  filters: {
    profileId: string | null;
    mes: number | null;
    año: number | null;
  };
  period_id: string | null;
  metrics: PeriodMetrics;
}

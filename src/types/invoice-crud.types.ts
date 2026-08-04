import type { InvoiceAttributes } from '../database/models/Invoice.model.js';
import type { PeriodMetrics } from './metrics.types.js';
import type { EstadoPagoDetalle } from './payment.types.js';

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

export interface InvoiceByIdResponse {
  data: InvoiceAttributes & { estadoPago: EstadoPagoDetalle | null };
}

export interface InvoiceDeleteResponse {
  message: string;
}

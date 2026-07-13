import type { EstadoPagoDetalle } from './payment.types.js';

export interface InvoiceListQueryParams {
  profileId?: string;
  mes?: number;
  año?: number;
  tipo?: string;
  regimen_fiscal?: string;
  search?: string;
  page: number;
  limit: number;
}

export interface InvoiceListPagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface InvoiceListItem extends Record<string, unknown> {
  estadoPago: EstadoPagoDetalle | null;
}

export interface ListInvoicesResult {
  data: InvoiceListItem[];
  pagination: InvoiceListPagination;
}

import type { EstadoPagoDetalle } from './payment.types.js';

export interface ExpenseListQueryParams {
  profileId?: string;
  mes?: number;
  año?: number;
  tipo?: string;
  categoria?: string;
  regimen_fiscal?: string;
  search?: string;
  page: number;
  limit: number;
}

export interface ExpenseListPagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ExpenseListItem extends Record<string, unknown> {
  estadoPago: EstadoPagoDetalle | null;
}

export interface ListExpensesResult {
  data: ExpenseListItem[];
  pagination: ExpenseListPagination;
}

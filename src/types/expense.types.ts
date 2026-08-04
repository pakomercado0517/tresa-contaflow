import type AccruedExpense from '../database/models/AccruedExpense.model.js';
import type { EstadoPagoDetalle } from './payment.types.js';

export interface CreateExpenseDto {
  profileId: string;
  fecha: string;
  subtotal: number;
  /** Porcentaje de IVA (ej. 16 = 16%). Fuente de verdad para calcular iva_amount y total. */
  iva: number;
  concepto?: string;
  categoria?: string;
}

export interface UpdateExpenseDto {
  fecha?: string;
  subtotal?: number;
  /** Porcentaje de IVA (ej. 16 = 16%). Recalcula iva_amount y total junto con subtotal. */
  iva?: number;
  concepto?: string;
  categoria?: string;
}

export interface ExpenseByIdData extends Record<string, unknown> {
  estadoPago: EstadoPagoDetalle | null;
}

export interface ExpenseByIdResponse {
  data: ExpenseByIdData;
}

export interface ExpenseMutationResponse {
  message: string;
  data: AccruedExpense;
}

export interface ExpenseDeleteResponse {
  message: string;
}

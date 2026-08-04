export interface ManualExpenseAmounts {
  subtotal: number;
  iva: number;
  iva_amount: number;
  total: number;
}

export interface CreateAccruedExpenseDto {
  profile_id: string;
  period_id: string;
  fecha: string | Date;
  concept: string;
  subtotal: number | string;
  /** Porcentaje de IVA (ej. 16 = 16%). Fuente de verdad para calcular iva_amount. */
  iva: number | string;
  categoria?: string;
}

export interface UpdateAccruedExpenseDto {
  concept?: string;
  subtotal?: number | string;
  /** Porcentaje de IVA (ej. 16 = 16%). Recalcula iva_amount y total junto con subtotal. */
  iva?: number | string;
  categoria?: string;
  is_paid?: boolean;
  payment_date?: string | Date | null;
}

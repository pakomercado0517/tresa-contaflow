export interface CreateAccruedExpenseDto {
  profile_id: string;
  fecha: string | Date;
  concepto: string;
  subtotal: number | string;
  iva_amount: number | string;
  categoria: string;
}

export interface UpdateAccruedExpenseDto {
  concepto: string;
  subtotal: number | string;
  iva_amount: number | string;
  categoria: string;
  is_paid: boolean;
  payment_date: string | Date | null;
}

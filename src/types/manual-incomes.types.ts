export interface CreateManualIncomeInput {
  profile_id: string;
  period_id: string;
  concept: string;
  subtotal: number;
  iva_amount?: number;
  fecha: string;
  is_paid?: boolean;
  payment_date?: string | null;
  notes?: string | null;
}

export interface UpdateManualIncomeInput {
  concept?: string;
  subtotal?: number;
  iva_amount?: number;
  fecha?: string;
  is_paid?: boolean;
  payment_date?: string | null;
  notes?: string | null;
}

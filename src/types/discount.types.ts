/**
 * Tipos para códigos de descuento
 */

export type DiscountCodeStatus = "ACTIVE" | "INACTIVE" | "EXPIRED";

export interface DiscountCodeCreateInput {
  code: string;
  duration: "once" | "repeating" | "forever";
  durationInMonths?: number;
  percentOff?: number;
  amountOff?: number;
  currency?: string;
  maxRedemptions?: number;
  expiresAt?: Date;
  active?: boolean;
  metadata?: Record<string, string>;
  /** Días de trial en checkout cuando el usuario es elegible. 0 = sin trial. Si no se envía, se usa el trial por defecto del plan. */
  trialDays?: number;
}

export interface DiscountCodeResponse {
  id: string;
  code: string;
  stripePromotionCodeId: string;
  stripeCouponId: string;
  status: DiscountCodeStatus;
  active: boolean;
  expiresAt: Date | null;
  maxRedemptions: number | null;
  timesRedeemed: number;
  createdBy: string;
  metadata: Record<string, string> | null;
  trialDays: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DiscountCodeApplyInput {
  code: string;
}

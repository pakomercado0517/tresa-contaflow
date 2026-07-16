import type { DiscountCodeResponse } from '../types/discount.types.js';

export function mapDiscountStatus(record: {
  active: boolean;
  expires_at: Date | null;
}): 'ACTIVE' | 'INACTIVE' | 'EXPIRED' {
  if (!record.active) {
    return 'INACTIVE';
  }
  if (record.expires_at && record.expires_at.getTime() < Date.now()) {
    return 'EXPIRED';
  }
  return 'ACTIVE';
}

export function mapDiscountResponse(record: {
  id: string;
  code: string;
  stripe_promotion_code_id: string;
  stripe_coupon_id: string;
  active: boolean;
  expires_at: Date | null;
  max_redemptions: number | null;
  times_redeemed: number;
  created_by: string;
  metadata: Record<string, string> | null;
  trial_days: number | null;
  created_at: Date;
  updated_at: Date;
}): DiscountCodeResponse {
  return {
    id: record.id,
    code: record.code,
    stripePromotionCodeId: record.stripe_promotion_code_id,
    stripeCouponId: record.stripe_coupon_id,
    status: mapDiscountStatus(record),
    active: record.active,
    expiresAt: record.expires_at,
    maxRedemptions: record.max_redemptions,
    timesRedeemed: record.times_redeemed,
    createdBy: record.created_by,
    metadata: record.metadata,
    trialDays: record.trial_days,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

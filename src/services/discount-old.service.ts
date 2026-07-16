import type Stripe from 'stripe';
import { DiscountCode } from '../database/models/index.js';
import { getStripeService } from './stripe.service.js';
import type { DiscountCodeCreateInput } from '../types/index.js';

export interface PromotionCodeLookup {
  promotionCodeId: string;
  code: string;
  trialDays: number | null;
}

/**
 * Servicio para gestionar códigos de descuento con Stripe
 */
export class DiscountService {
  private stripe: Stripe;

  constructor() {
    const stripeService = getStripeService();
    this.stripe = stripeService.getClient();
  }

  async createDiscountCode(
    input: DiscountCodeCreateInput,
    createdBy: string
  ): Promise<DiscountCode> {
    const { percentOff, amountOff, currency } = input;
    const hasPercent = typeof percentOff === 'number';
    const hasAmount = typeof amountOff === 'number';

    if ((hasPercent && hasAmount) || (!hasPercent && !hasAmount)) {
      throw new Error('Debes proporcionar percentOff o amountOff (solo uno)');
    }

    if (hasAmount && !currency) {
      throw new Error('currency es requerido cuando amountOff está presente');
    }

    const couponParams: Stripe.CouponCreateParams = {
      duration: input.duration,
      ...(typeof input.durationInMonths === 'number'
        ? { duration_in_months: input.durationInMonths }
        : {}),
      ...(hasPercent ? { percent_off: percentOff } : {}),
      ...(hasAmount ? { amount_off: amountOff } : {}),
      ...(hasAmount && currency ? { currency } : {}),
      ...(input.metadata ? { metadata: input.metadata } : {}),
    };

    const coupon = await this.stripe.coupons.create(couponParams);

    const promotionParams: Stripe.PromotionCodeCreateParams = {
      promotion: {
        type: 'coupon',
        coupon: coupon.id,
      },
      code: input.code,
      ...(typeof input.maxRedemptions === 'number'
        ? { max_redemptions: input.maxRedemptions }
        : {}),
      ...(input.expiresAt ? { expires_at: Math.floor(input.expiresAt.getTime() / 1000) } : {}),
      active: input.active ?? true,
      ...(input.metadata ? { metadata: input.metadata } : {}),
    };

    const promotionCode = await this.stripe.promotionCodes.create(promotionParams);

    const record = await DiscountCode.create({
      code: input.code,
      stripe_promotion_code_id: promotionCode.id,
      stripe_coupon_id: coupon.id,
      active: promotionCode.active,
      expires_at: input.expiresAt ?? null,
      max_redemptions: input.maxRedemptions ?? null,
      times_redeemed: promotionCode.times_redeemed || 0,
      created_by: createdBy,
      metadata: input.metadata ?? null,
      trial_days: typeof input.trialDays === 'number' ? input.trialDays : null,
    });

    return record;
  }

  async setDiscountActive(id: string, active: boolean): Promise<DiscountCode> {
    const record = await DiscountCode.findByPk(id);
    if (!record) {
      throw new Error('Código de descuento no encontrado');
    }

    await this.stripe.promotionCodes.update(record.stripe_promotion_code_id, { active });
    await record.update({ active });

    return record;
  }

  async listDiscountCodes(filters: { code?: string; active?: boolean }): Promise<DiscountCode[]> {
    const where: { code?: string; active?: boolean } = {};

    if (filters.code) {
      where.code = filters.code;
    }

    if (typeof filters.active === 'boolean') {
      where.active = filters.active;
    }

    return DiscountCode.findAll({
      where,
      order: [['created_at', 'DESC']],
    });
  }

  async getPromotionCodeForCheckout(code: string): Promise<PromotionCodeLookup | null> {
    const record = await DiscountCode.findOne({ where: { code } });
    if (!record) {
      return null;
    }

    if (!record.active) {
      return null;
    }

    if (record.expires_at && record.expires_at.getTime() < Date.now()) {
      return null;
    }

    if (
      typeof record.max_redemptions === 'number' &&
      record.times_redeemed >= record.max_redemptions
    ) {
      return null;
    }

    const stripePromotion = await this.stripe.promotionCodes.list({
      code,
      active: true,
      limit: 1,
    });

    const promotion = stripePromotion.data[0];
    if (!promotion) {
      return null;
    }

    return {
      promotionCodeId: promotion.id,
      code: promotion.code || code,
      trialDays: record.trial_days,
    };
  }

  async recordRedemptionByPromotionCodeId(promotionCodeId: string): Promise<void> {
    const record = await DiscountCode.findOne({
      where: { stripe_promotion_code_id: promotionCodeId },
    });

    if (!record) {
      return;
    }

    const newTimesRedeemed = record.times_redeemed + 1;
    const reachedMax =
      typeof record.max_redemptions === 'number' && newTimesRedeemed >= record.max_redemptions;

    if (reachedMax && record.active) {
      await this.stripe.promotionCodes.update(record.stripe_promotion_code_id, {
        active: false,
      });
    }

    await record.update({
      times_redeemed: newTimesRedeemed,
      active: reachedMax ? false : record.active,
    });
  }
}

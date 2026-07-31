import { DiscountCode } from '../database/models/index.js';
import { getStripeService } from './stripe.service.js';
import type Stripe from 'stripe';
import { AppError } from '../utils/AppError.js';
import type {
  DiscountCodeCreateInput,
  DiscountCodeListQueryParams,
  ListDiscountCodesResult,
  PromotionCodeLookup,
} from '../types/discount.types.js';

//Obtenemos el cliente de Stripe una sola vez al cargar el archivo
//no cada vez que alguien llama a una función
const stripeService = getStripeService().getClient();

export const createDiscountCodeService = async (
  input: DiscountCodeCreateInput,
  createdBy: string
) => {
  const { percentOff, amountOff, currency } = input;
  const hasPercent = typeof percentOff === 'number';
  const hasAmount = typeof amountOff === 'number';

  if ((hasPercent && hasAmount) || (!hasPercent && !hasAmount))
    throw new AppError('Debes proporcionar percentOff o amountOff, solo uno de los dos', 400);
  if (hasAmount && !currency)
    throw new AppError('currency es requerido cuando ammoutnOff está presente', 400);

  const normalizedCode = input.code.trim().toUpperCase();
  const existing = await DiscountCode.findOne({ where: { code: normalizedCode } });
  if (existing) throw new AppError('El código de descuento ya existe', 409);

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

  const coupon = await stripeService.coupons.create(couponParams);
  const promotionParams: Stripe.PromotionCodeCreateParams = {
    promotion: {
      type: 'coupon',
      coupon: coupon.id,
    },
    code: normalizedCode,
    ...(typeof input.maxRedemptions === 'number' ? { max_redemptions: input.maxRedemptions } : {}),
    ...(input.expiresAt ? { expires_at: Math.floor(input.expiresAt.getTime() / 1000) } : {}),
    active: input.active ?? true,
    ...(input.metadata ? { metadata: input.metadata } : {}),
  };

  const promotionCode = await stripeService.promotionCodes.create(promotionParams);
  const record = await DiscountCode.create({
    code: normalizedCode,
    stripe_promotion_code_id: promotionCode.id,
    stripe_coupon_id: coupon.id,
    active: promotionCode.active,
    expires_at: input.expiresAt ?? null,
    max_redemptions: input.maxRedemptions ?? null,
    times_redeemed: promotionCode.times_redeemed ?? 0,
    created_by: createdBy,
    metadata: input.metadata ?? null,
    trial_days: typeof input.trialDays === 'number' ? input.trialDays : null,
  });

  return record;
};

export const setDiscountActiveService = async (
  id: string,
  active: boolean
): Promise<DiscountCode> => {
  const record = await DiscountCode.findByPk(id);
  if (!record) throw new AppError('Código de descuento no encontrado', 404);

  await stripeService.promotionCodes.update(record.stripe_promotion_code_id, { active });
  await record.update({ active });

  return record;
};

export const listDiscountCodesService = async (
  params: DiscountCodeListQueryParams
): Promise<ListDiscountCodesResult> => {
  const where: { code?: string; active?: boolean } = {};

  if (params.code) where.code = params.code;
  if (typeof params.active === 'boolean') where.active = params.active;

  const offset = (params.page - 1) * params.limit;

  const { count, rows } = await DiscountCode.findAndCountAll({
    where,
    order: [['created_at', 'DESC']],
    limit: params.limit,
    offset,
  });

  return {
    data: rows,
    count,
    pagination: {
      total: count,
      page: params.page,
      limit: params.limit,
      totalPages: Math.ceil(count / params.limit) || 1,
    },
  };
};

export const getPromotionCodeForCheckoutService = async (
  code: string
): Promise<PromotionCodeLookup | null> => {
  const record = await DiscountCode.findOne({ where: { code } });
  if (!record) return null;
  if (!record.active) return null;
  if (record.expires_at && record.expires_at.getTime() < Date.now()) return null;
  if (typeof record.max_redemptions === 'number' && record.times_redeemed >= record.max_redemptions)
    return null;

  const stripePromotion = await stripeService.promotionCodes.list({
    code,
    active: true,
    limit: 1,
  });

  const promotion = stripePromotion.data[0];
  if (!promotion) return null;

  return {
    promotionCodeId: promotion.id,
    code: promotion.code || code,
    trialDays: record.trial_days,
  };
};

export const recordRedemptionByPromotionCodeIdService = async (
  promotionCodeId: string
): Promise<void> => {
  const record = await DiscountCode.findOne({
    where: { stripe_promotion_code_id: promotionCodeId },
  });

  if (!record) return;

  const newTimesRedeemed = record.times_redeemed + 1;
  const reachedMax =
    typeof record.max_redemptions === 'number' && newTimesRedeemed >= record.max_redemptions;

  if (reachedMax && record.active) {
    await stripeService.promotionCodes.update(record.stripe_promotion_code_id, {
      active: false,
    });
  }

  await record.update({
    times_redeemed: newTimesRedeemed,
    active: reachedMax ? false : record.active,
  });
};

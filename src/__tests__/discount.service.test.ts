import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '../utils/AppError.js';

const {
  stripeCouponsCreate,
  stripeCouponsDel,
  stripePromotionCreate,
  stripePromotionRetrieve,
  stripePromotionUpdate,
  discountCodeCreate,
  discountCodeFindByPk,
  discountCodeFindAndCountAll,
  discountCodeFindOne,
} = vi.hoisted(() => ({
  stripeCouponsCreate: vi.fn(),
  stripeCouponsDel: vi.fn(),
  stripePromotionCreate: vi.fn(),
  stripePromotionRetrieve: vi.fn(),
  stripePromotionUpdate: vi.fn(),
  discountCodeCreate: vi.fn(),
  discountCodeFindByPk: vi.fn(),
  discountCodeFindAndCountAll: vi.fn(),
  discountCodeFindOne: vi.fn(),
}));

// El servicio obtiene el cliente de Stripe una sola vez al cargar el módulo,
// por eso getClient debe devolver siempre las mismas funciones mock.
vi.mock('../services/stripe.service.js', () => ({
  getStripeService: () => ({
    getClient: () => ({
      coupons: { create: stripeCouponsCreate, del: stripeCouponsDel },
      promotionCodes: {
        create: stripePromotionCreate,
        retrieve: stripePromotionRetrieve,
        update: stripePromotionUpdate,
      },
    }),
  }),
}));

vi.mock('../database/models/index.js', () => ({
  DiscountCode: {
    create: discountCodeCreate,
    findByPk: discountCodeFindByPk,
    findAndCountAll: discountCodeFindAndCountAll,
    findOne: discountCodeFindOne,
  },
}));

import {
  createDiscountCodeService,
  setDiscountActiveService,
  listDiscountCodesService,
  getPromotionCodeForCheckoutService,
  recordRedemptionByPromotionCodeIdService,
} from '../services/discount.service.js';

async function catchError(promise: Promise<unknown>): Promise<AppError> {
  try {
    await promise;
  } catch (error) {
    return error as AppError;
  }
  throw new Error('Se esperaba que la promesa fuera rechazada, pero se resolvió');
}

describe('discount.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stripeCouponsCreate.mockResolvedValue({ id: 'coupon_1' });
    stripePromotionCreate.mockResolvedValue({
      id: 'promo_1',
      code: 'TEST60',
      times_redeemed: 0,
      active: true,
    });
    stripePromotionRetrieve.mockResolvedValue({ id: 'promo_1', code: 'TEST60', active: true });
    stripePromotionUpdate.mockResolvedValue({});
    stripeCouponsDel.mockResolvedValue({ deleted: true });
    discountCodeCreate.mockResolvedValue({ id: 'id-1' });
    discountCodeFindOne.mockResolvedValue(null);
  });

  describe('createDiscountCodeService', () => {
    it('lanza AppError 400 si se envían percentOff y amountOff a la vez', async () => {
      const error = await catchError(
        createDiscountCodeService(
          { code: 'X', duration: 'once', percentOff: 10, amountOff: 100, currency: 'mxn' },
          'user-uuid'
        )
      );

      expect(error).toBeInstanceOf(AppError);
      expect(error.status).toBe(400);
      expect(stripeCouponsCreate).not.toHaveBeenCalled();
    });

    it('lanza AppError 400 si no se envía ni percentOff ni amountOff', async () => {
      const error = await catchError(
        createDiscountCodeService({ code: 'X', duration: 'once' }, 'user-uuid')
      );

      expect(error.status).toBe(400);
    });

    it('lanza AppError 400 si amountOff está presente sin currency', async () => {
      const error = await catchError(
        createDiscountCodeService({ code: 'X', duration: 'once', amountOff: 100 }, 'user-uuid')
      );

      expect(error.status).toBe(400);
    });

    it('lanza AppError 409 si el código ya existe en BD', async () => {
      discountCodeFindOne.mockResolvedValue({ id: 'existing', code: 'TEST60' });

      const error = await catchError(
        createDiscountCodeService({ code: 'TEST60', duration: 'once', percentOff: 100 }, 'user-uuid')
      );

      expect(error).toBeInstanceOf(AppError);
      expect(error.status).toBe(409);
      expect(error.message).toBe('El código de descuento ya existe');
      expect(stripeCouponsCreate).not.toHaveBeenCalled();
      expect(discountCodeCreate).not.toHaveBeenCalled();
    });

    it('crea cupón, promotion code y persiste el registro', async () => {
      await createDiscountCodeService(
        { code: 'TEST60', duration: 'once', percentOff: 100 },
        'user-uuid'
      );

      expect(stripeCouponsCreate).toHaveBeenCalledTimes(1);
      expect(stripePromotionCreate).toHaveBeenCalledTimes(1);
      expect(discountCodeCreate).toHaveBeenCalledTimes(1);
      const createCall = discountCodeCreate.mock.calls[0]?.[0];
      expect(createCall.stripe_coupon_id).toBe('coupon_1');
      expect(createCall.stripe_promotion_code_id).toBe('promo_1');
      expect(createCall.created_by).toBe('user-uuid');
    });

    it('persiste trial_days cuando se envía trialDays', async () => {
      await createDiscountCodeService(
        { code: 'TEST60', duration: 'once', percentOff: 100, trialDays: 60 },
        'user-uuid'
      );

      expect(discountCodeCreate.mock.calls[0]?.[0].trial_days).toBe(60);
    });

    it('persiste trial_days 0 cuando se envía trialDays: 0', async () => {
      await createDiscountCodeService(
        { code: 'NOTRIAL', duration: 'once', percentOff: 10, trialDays: 0 },
        'user-uuid'
      );

      expect(discountCodeCreate.mock.calls[0]?.[0].trial_days).toBe(0);
    });

    it('persiste trial_days null cuando no se envía trialDays', async () => {
      await createDiscountCodeService(
        { code: 'PROMO20', duration: 'once', percentOff: 20 },
        'user-uuid'
      );

      expect(discountCodeCreate.mock.calls[0]?.[0].trial_days).toBeNull();
    });

    it('compensa en Stripe si falla la persistencia en BD', async () => {
      discountCodeCreate.mockRejectedValue(new Error('DB caída'));

      await expect(
        createDiscountCodeService({ code: 'TEST60', duration: 'once', percentOff: 100 }, 'user-uuid')
      ).rejects.toThrow('DB caída');

      expect(stripeCouponsCreate).toHaveBeenCalledTimes(1);
      expect(stripePromotionCreate).toHaveBeenCalledTimes(1);
      expect(stripePromotionUpdate).toHaveBeenCalledWith('promo_1', { active: false });
      expect(stripeCouponsDel).toHaveBeenCalledWith('coupon_1');
    });

    it('compensa en Stripe si falla la creación del promotion code', async () => {
      stripePromotionCreate.mockRejectedValue(new Error('Stripe promo error'));

      await expect(
        createDiscountCodeService({ code: 'TEST60', duration: 'once', percentOff: 100 }, 'user-uuid')
      ).rejects.toThrow('Stripe promo error');

      expect(stripeCouponsCreate).toHaveBeenCalledTimes(1);
      expect(stripePromotionUpdate).not.toHaveBeenCalled();
      expect(stripeCouponsDel).toHaveBeenCalledWith('coupon_1');
      expect(discountCodeCreate).not.toHaveBeenCalled();
    });
  });

  describe('setDiscountActiveService', () => {
    it('lanza AppError 404 si el código no existe', async () => {
      discountCodeFindByPk.mockResolvedValue(null);

      const error = await catchError(setDiscountActiveService('id-1', true));

      expect(error.status).toBe(404);
      expect(stripePromotionUpdate).not.toHaveBeenCalled();
    });

    it('actualiza estado en Stripe y en el registro cuando existe', async () => {
      const update = vi.fn();
      discountCodeFindByPk.mockResolvedValue({
        id: 'id-1',
        stripe_promotion_code_id: 'promo_1',
        update,
      });

      await setDiscountActiveService('id-1', false);

      expect(stripePromotionUpdate).toHaveBeenCalledWith('promo_1', { active: false });
      expect(update).toHaveBeenCalledWith({ active: false });
    });
  });

  describe('listDiscountCodesService', () => {
    it('consulta con filtros, paginación y ordena por created_at DESC', async () => {
      discountCodeFindAndCountAll.mockResolvedValue({ count: 1, rows: [{ id: 'id-1' }] });

      const result = await listDiscountCodesService({
        code: 'TEST60',
        active: true,
        page: 2,
        limit: 25,
      });

      expect(discountCodeFindAndCountAll).toHaveBeenCalledWith({
        where: { code: 'TEST60', active: true },
        order: [['created_at', 'DESC']],
        limit: 25,
        offset: 25,
      });
      expect(result).toEqual({
        data: [{ id: 'id-1' }],
        count: 1,
        pagination: { total: 1, page: 2, limit: 25, totalPages: 1 },
      });
    });

    it('consulta sin filtros con defaults page=1 limit=50', async () => {
      discountCodeFindAndCountAll.mockResolvedValue({ count: 0, rows: [] });

      const result = await listDiscountCodesService({ page: 1, limit: 50 });

      expect(discountCodeFindAndCountAll).toHaveBeenCalledWith({
        where: {},
        order: [['created_at', 'DESC']],
        limit: 50,
        offset: 0,
      });
      expect(result.pagination.totalPages).toBe(1);
    });
  });

  describe('getPromotionCodeForCheckoutService', () => {
    it('retorna null si el registro no existe', async () => {
      discountCodeFindOne.mockResolvedValue(null);

      expect(await getPromotionCodeForCheckoutService('X')).toBeNull();
    });

    it('retorna null si el código está inactivo', async () => {
      discountCodeFindOne.mockResolvedValue({ active: false });

      expect(await getPromotionCodeForCheckoutService('X')).toBeNull();
    });

    it('retorna null si el código está expirado', async () => {
      discountCodeFindOne.mockResolvedValue({
        active: true,
        expires_at: new Date(Date.now() - 1000),
      });

      expect(await getPromotionCodeForCheckoutService('X')).toBeNull();
    });

    it('retorna null si se alcanzó el máximo de redenciones', async () => {
      discountCodeFindOne.mockResolvedValue({
        active: true,
        expires_at: null,
        max_redemptions: 5,
        times_redeemed: 5,
      });

      expect(await getPromotionCodeForCheckoutService('X')).toBeNull();
    });

    it('retorna null si Stripe no encuentra el promotion code', async () => {
      discountCodeFindOne.mockResolvedValue({
        code: 'TEST60',
        stripe_promotion_code_id: 'promo_1',
        active: true,
        expires_at: null,
        max_redemptions: null,
        times_redeemed: 0,
        trial_days: 60,
      });
      stripePromotionRetrieve.mockRejectedValue(new Error('No such promotion code'));

      expect(await getPromotionCodeForCheckoutService('TEST60')).toBeNull();
    });

    it('retorna null si Stripe reporta el promotion code inactivo', async () => {
      discountCodeFindOne.mockResolvedValue({
        code: 'TEST60',
        stripe_promotion_code_id: 'promo_1',
        active: true,
        expires_at: null,
        max_redemptions: null,
        times_redeemed: 0,
        trial_days: 60,
      });
      stripePromotionRetrieve.mockResolvedValue({ id: 'promo_1', code: 'TEST60', active: false });

      expect(await getPromotionCodeForCheckoutService('TEST60')).toBeNull();
    });

    it('retorna el lookup con trialDays cuando es válido', async () => {
      discountCodeFindOne.mockResolvedValue({
        code: 'TEST60',
        stripe_promotion_code_id: 'promo_1',
        active: true,
        expires_at: null,
        max_redemptions: null,
        times_redeemed: 0,
        trial_days: 60,
      });

      const result = await getPromotionCodeForCheckoutService('TEST60');

      expect(stripePromotionRetrieve).toHaveBeenCalledWith('promo_1');
      expect(result).toEqual({ promotionCodeId: 'promo_1', code: 'TEST60', trialDays: 60 });
    });
  });

  describe('recordRedemptionByPromotionCodeIdService', () => {
    it('no hace nada si el registro no existe', async () => {
      discountCodeFindOne.mockResolvedValue(null);

      await recordRedemptionByPromotionCodeIdService('promo_1');

      expect(stripePromotionUpdate).not.toHaveBeenCalled();
    });

    it('incrementa times_redeemed sin desactivar cuando está por debajo del máximo', async () => {
      const update = vi.fn();
      discountCodeFindOne.mockResolvedValue({
        stripe_promotion_code_id: 'promo_1',
        times_redeemed: 1,
        max_redemptions: 5,
        active: true,
        update,
      });

      await recordRedemptionByPromotionCodeIdService('promo_1');

      expect(stripePromotionUpdate).not.toHaveBeenCalled();
      expect(update).toHaveBeenCalledWith({ times_redeemed: 2, active: true });
    });

    it('desactiva en Stripe y en el registro al alcanzar el máximo', async () => {
      const update = vi.fn();
      discountCodeFindOne.mockResolvedValue({
        stripe_promotion_code_id: 'promo_1',
        times_redeemed: 4,
        max_redemptions: 5,
        active: true,
        update,
      });

      await recordRedemptionByPromotionCodeIdService('promo_1');

      expect(stripePromotionUpdate).toHaveBeenCalledWith('promo_1', { active: false });
      expect(update).toHaveBeenCalledWith({ times_redeemed: 5, active: false });
    });
  });
});

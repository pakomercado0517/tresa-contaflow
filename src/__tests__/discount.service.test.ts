import { describe, it, expect, vi, beforeEach } from "vitest";
import { DiscountService } from "../services/discount.service";

const mockCouponCreate = vi.fn();
const mockPromotionCodesCreate = vi.fn();
const mockGetClient = vi.fn();

vi.mock("../services/stripe.service.js", () => ({
  getStripeService: () => ({
    getClient: mockGetClient,
  }),
}));

const mockDiscountCodeCreate = vi.fn();
const mockDiscountCodeFindOne = vi.fn();
vi.mock("../database/models/index.js", () => ({
  DiscountCode: {
    create: mockDiscountCodeCreate,
    findOne: mockDiscountCodeFindOne,
    findAll: vi.fn(),
    findByPk: vi.fn(),
  },
}));

describe("DiscountService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDiscountCodeFindOne.mockResolvedValue(null);
    mockGetClient.mockReturnValue({
      coupons: {
        create: mockCouponCreate,
      },
      promotionCodes: {
        create: mockPromotionCodesCreate,
        list: vi.fn().mockResolvedValue({ data: [{ id: "promo_1", code: "TEST60" }] }),
        update: vi.fn(),
      },
    });
    mockCouponCreate.mockResolvedValue({ id: "coupon_1" });
    mockPromotionCodesCreate.mockResolvedValue({
      id: "promo_1",
      code: "TEST60",
      times_redeemed: 0,
      active: true,
    });
  });

  describe("createDiscountCode", () => {
    it("persiste trial_days cuando se envía trialDays en el input", async () => {
      const fakeRecord = {
        id: "id-1",
        code: "TEST60",
        trial_days: 60,
      };
      mockDiscountCodeCreate.mockResolvedValue(fakeRecord);

      const service = new DiscountService();
      await service.createDiscountCode(
        {
          code: "TEST60",
          duration: "once",
          percentOff: 100,
          trialDays: 60,
        },
        "user-uuid"
      );

      expect(mockDiscountCodeCreate).toHaveBeenCalledTimes(1);
      const createCall = mockDiscountCodeCreate.mock.calls[0][0];
      expect(createCall.trial_days).toBe(60);
    });

    it("persiste trial_days null cuando no se envía trialDays en el input", async () => {
      const fakeRecord = {
        id: "id-1",
        code: "PROMO20",
        trial_days: null,
      };
      mockDiscountCodeCreate.mockResolvedValue(fakeRecord);

      const service = new DiscountService();
      await service.createDiscountCode(
        {
          code: "PROMO20",
          duration: "once",
          percentOff: 20,
        },
        "user-uuid"
      );

      expect(mockDiscountCodeCreate).toHaveBeenCalledTimes(1);
      const createCall = mockDiscountCodeCreate.mock.calls[0][0];
      expect(createCall.trial_days).toBeNull();
    });

    it("persiste trial_days 0 cuando se envía trialDays: 0 (sin trial con ese cupón)", async () => {
      const fakeRecord = {
        id: "id-1",
        code: "NOTRIAL",
        trial_days: 0,
      };
      mockDiscountCodeCreate.mockResolvedValue(fakeRecord);

      const service = new DiscountService();
      await service.createDiscountCode(
        {
          code: "NOTRIAL",
          duration: "once",
          percentOff: 10,
          trialDays: 0,
        },
        "user-uuid"
      );

      expect(mockDiscountCodeCreate).toHaveBeenCalledTimes(1);
      const createCall = mockDiscountCodeCreate.mock.calls[0][0];
      expect(createCall.trial_days).toBe(0);
    });
  });

  describe("getPromotionCodeForCheckout", () => {
    it("retorna trialDays del registro cuando existe", async () => {
      mockDiscountCodeFindOne.mockResolvedValue({
        code: "TEST60",
        active: true,
        expires_at: null,
        max_redemptions: null,
        times_redeemed: 0,
        trial_days: 60,
        stripe_promotion_code_id: "promo_1",
      });

      const service = new DiscountService();
      const result = await service.getPromotionCodeForCheckout("TEST60");

      expect(result).not.toBeNull();
      expect(result?.trialDays).toBe(60);
    });

    it("retorna trialDays null cuando el registro no tiene trial_days", async () => {
      mockDiscountCodeFindOne.mockResolvedValue({
        code: "PROMO20",
        active: true,
        expires_at: null,
        max_redemptions: null,
        times_redeemed: 0,
        trial_days: null,
        stripe_promotion_code_id: "promo_1",
      });

      const service = new DiscountService();
      const result = await service.getPromotionCodeForCheckout("PROMO20");

      expect(result).not.toBeNull();
      expect(result?.trialDays).toBeNull();
    });
  });
});

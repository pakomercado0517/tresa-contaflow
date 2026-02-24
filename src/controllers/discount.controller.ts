import { type Response } from "express";
import type { AuthRequest } from "../middlewares/auth.middleware.js";
import { DiscountService } from "../services/discount.service.js";
import type { DiscountCodeCreateInput, DiscountCodeResponse } from "../types/index.js";

function mapDiscountStatus(record: {
  active: boolean;
  expires_at: Date | null;
}): "ACTIVE" | "INACTIVE" | "EXPIRED" {
  if (!record.active) {
    return "INACTIVE";
  }
  if (record.expires_at && record.expires_at.getTime() < Date.now()) {
    return "EXPIRED";
  }
  return "ACTIVE";
}

function mapDiscountResponse(record: {
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

/**
 * Crea un código de descuento en Stripe (admin)
 */
export async function createDiscountCode(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Usuario no autenticado" });
      return;
    }

    const {
      code,
      duration,
      durationInMonths,
      percentOff,
      amountOff,
      currency,
      maxRedemptions,
      expiresAt,
      active,
      metadata,
      trialDays,
    } = req.body as {
      code: string;
      duration: "once" | "repeating" | "forever";
      durationInMonths?: number;
      percentOff?: number;
      amountOff?: number;
      currency?: string;
      maxRedemptions?: number;
      expiresAt?: string;
      active?: boolean;
      metadata?: Record<string, string>;
      trialDays?: number;
    };

    const input: DiscountCodeCreateInput = {
      code: code.trim().toUpperCase(),
      duration,
      ...(typeof durationInMonths === "number" ? { durationInMonths } : {}),
      ...(typeof percentOff === "number" ? { percentOff } : {}),
      ...(typeof amountOff === "number" ? { amountOff } : {}),
      ...(currency ? { currency } : {}),
      ...(typeof maxRedemptions === "number" ? { maxRedemptions } : {}),
      ...(expiresAt ? { expiresAt: new Date(expiresAt) } : {}),
      ...(typeof active === "boolean" ? { active } : {}),
      ...(metadata ? { metadata } : {}),
      ...(typeof trialDays === "number" ? { trialDays } : {}),
    };

    const discountService = new DiscountService();
    const record = await discountService.createDiscountCode(input, userId);

    res.status(201).json({
      message: "Código de descuento creado exitosamente",
      discountCode: mapDiscountResponse(record),
    });
  } catch (error) {
    console.error("Error al crear código de descuento:", error);

    if (error instanceof Error) {
      res.status(500).json({
        error: "Error al crear código de descuento",
        message: error.message,
      });
      return;
    }

    res.status(500).json({ error: "Error desconocido al crear código de descuento" });
  }
}

/**
 * Activa un código de descuento existente (admin)
 */
export async function activateDiscountCode(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params as { id: string };
    const discountService = new DiscountService();
    const record = await discountService.setDiscountActive(id, true);

    res.json({
      message: "Código de descuento activado",
      discountCode: mapDiscountResponse(record),
    });
  } catch (error) {
    console.error("Error al activar código de descuento:", error);

    if (error instanceof Error) {
      res.status(500).json({
        error: "Error al activar código de descuento",
        message: error.message,
      });
      return;
    }

    res.status(500).json({ error: "Error desconocido al activar código de descuento" });
  }
}

/**
 * Desactiva un código de descuento existente (admin)
 */
export async function deactivateDiscountCode(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params as { id: string };
    const discountService = new DiscountService();
    const record = await discountService.setDiscountActive(id, false);

    res.json({
      message: "Código de descuento desactivado",
      discountCode: mapDiscountResponse(record),
    });
  } catch (error) {
    console.error("Error al desactivar código de descuento:", error);

    if (error instanceof Error) {
      res.status(500).json({
        error: "Error al desactivar código de descuento",
        message: error.message,
      });
      return;
    }

    res.status(500).json({ error: "Error desconocido al desactivar código de descuento" });
  }
}

/**
 * Lista códigos de descuento (admin)
 */
export async function listDiscountCodes(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { code, active } = req.query as { code?: string; active?: string };
    const normalizedCode = code ? String(code).trim().toUpperCase() : undefined;
    const activeValue =
      typeof active === "string" ? active.toLowerCase() === "true" : undefined;

    const filters: { code?: string; active?: boolean } = {};
    if (normalizedCode) {
      filters.code = normalizedCode;
    }
    if (typeof activeValue === "boolean") {
      filters.active = activeValue;
    }

    const discountService = new DiscountService();
    const records = await discountService.listDiscountCodes(filters);

    res.json({
      data: records.map((record) => mapDiscountResponse(record)),
      count: records.length,
    });
  } catch (error) {
    console.error("Error al listar códigos de descuento:", error);

    if (error instanceof Error) {
      res.status(500).json({
        error: "Error al listar códigos de descuento",
        message: error.message,
      });
      return;
    }

    res.status(500).json({ error: "Error desconocido al listar códigos de descuento" });
  }
}

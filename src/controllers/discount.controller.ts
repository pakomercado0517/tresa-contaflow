import { type NextFunction, type Response } from 'express';
import type { AuthRequest } from '../middlewares/auth.middleware.js';
import {
  createDiscountCodeService,
  listDiscountCodesService,
  setDiscountActiveService,
} from '../services/discount.service.js';
import type { DiscountCodeCreateInput } from '../types/index.js';
import { AppError } from '../utils/AppError.js';
import { mapDiscountResponse } from '../mappers/discount.mapper.js';

/**
 * Crea un código de descuento en Stripe (admin)
 */
export async function createDiscountCode(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.userId;
    if (!userId) throw new AppError('Usuario no autenticado', 401);

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
      duration: 'once' | 'repeating' | 'forever';
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
      ...(typeof durationInMonths === 'number' ? { durationInMonths } : {}),
      ...(typeof percentOff === 'number' ? { percentOff } : {}),
      ...(typeof amountOff === 'number' ? { amountOff } : {}),
      ...(currency ? { currency } : {}),
      ...(typeof maxRedemptions === 'number' ? { maxRedemptions } : {}),
      ...(expiresAt ? { expiresAt: new Date(expiresAt) } : {}),
      ...(typeof active === 'boolean' ? { active } : {}),
      ...(metadata ? { metadata } : {}),
      ...(typeof trialDays === 'number' ? { trialDays } : {}),
    };

    const record = await createDiscountCodeService(input, userId);

    res.status(201).json({
      message: 'Código de descuento creado exitosamente',
      discountCode: mapDiscountResponse(record),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Activa un código de descuento existente (admin)
 */
export async function activateDiscountCode(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params as { id: string };
    const record = await setDiscountActiveService(id, true);

    res.json({
      message: 'Código de descuento activado',
      discountCode: mapDiscountResponse(record),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Desactiva un código de descuento existente (admin)
 */
export async function deactivateDiscountCode(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params as { id: string };
    const record = await setDiscountActiveService(id, false);

    res.json({
      message: 'Código de descuento desactivado',
      discountCode: mapDiscountResponse(record),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Lista códigos de descuento (admin)
 */
export async function listDiscountCodes(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { code, active } = req.query as { code?: string; active?: string };
    const normalizedCode = code ? String(code).trim().toUpperCase() : undefined;
    const activeValue = typeof active === 'string' ? active.toLowerCase() === 'true' : undefined;

    const filters: { code?: string; active?: boolean } = {};
    if (normalizedCode) {
      filters.code = normalizedCode;
    }
    if (typeof activeValue === 'boolean') {
      filters.active = activeValue;
    }

    const records = await listDiscountCodesService(filters);

    res.json({
      data: records.map((record) => mapDiscountResponse(record)),
      count: records.length,
    });
  } catch (error) {
    next(error);
  }
}

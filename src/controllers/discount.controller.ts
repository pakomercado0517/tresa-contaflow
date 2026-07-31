import { type NextFunction, type Response } from 'express';
import type { AuthRequest } from '../middlewares/auth.middleware.js';
import {
  createDiscountCodeService,
  listDiscountCodesService,
  setDiscountActiveService,
} from '../services/discount.service.js';
import { AppError } from '../utils/AppError.js';
import { mapDiscountResponse } from '../mappers/discount.mapper.js';
import {
  normalizeDiscountCodeCreateInput,
  normalizeDiscountListQuery,
} from '../lib/discount-query.util.js';

/**
 * Crea un código de descuento en Stripe (admin)
 */
export async function createDiscountCode(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.userId;
    if (!userId) throw new AppError('Usuario no autenticado', 401);

    const input = normalizeDiscountCodeCreateInput(req.body as Record<string, unknown>);
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
    const params = normalizeDiscountListQuery(req.query as Record<string, unknown>);
    const result = await listDiscountCodesService(params);

    res.json({
      data: result.data.map((record) => mapDiscountResponse(record)),
      count: result.count,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
}

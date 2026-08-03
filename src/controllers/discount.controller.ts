import { type NextFunction, type Response } from 'express';
import type { AuthRequest } from '../middlewares/auth.middleware.js';
import {
  createDiscountCodeService,
  listDiscountCodesService,
  setDiscountActiveService,
} from '../services/discount.service.js';
import { mapDiscountResponse } from '../mappers/discount.mapper.js';
import {
  normalizeDiscountCodeCreateInput,
  normalizeDiscountListQuery,
} from '../lib/discount-query.util.js';
import { optionalString } from '../utils/query.util.js';

/**
 * Crea un código de descuento en Stripe (admin)
 */
export async function createDiscountCode(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.userId;

    const input = normalizeDiscountCodeCreateInput(req.body as Record<string, unknown>);
    const record = await createDiscountCodeService(input, userId!);

    res.status(201).json({
      message: 'Código de descuento creado exitosamente',
      discountCode: mapDiscountResponse(record),
    });
  } catch (error) {
    next(error);
  }
}

/** Activa o desactiva un código de descuento (active viene del middleware de ruta). */
export async function discountCodeSetStatus(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const id = optionalString(req.params.id);
    const { active } = req.body;

    const record = await setDiscountActiveService(id!, active);

    res.status(200).json({
      message: active ? 'Código de descuento activado' : 'Código de descuento desactivado',
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

import type { NextFunction, Response } from 'express';
import type { AuthRequest } from '../middlewares/auth.middleware.js';
import type { ListPaymentComplementsParams } from '../types/payment.types.js';
import { getByIdForUser, listForUser } from '../services/payment-complement.service.js';
import { optionalComplementRole, optionalInt, optionalString } from '../utils/query.util.js';
import { AppError } from '../utils/AppError.js';

/**
 * GET /api/payment-complements — Lista complementos de pago del usuario.
 */
export async function getPaymentComplements(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) throw new AppError('Usuario no autenticado', 401);

    const profileId = optionalString(req.query.profile_id);

    const role = optionalComplementRole(req.query.role);
    const mes = optionalInt(req.query.mes);
    const año = optionalInt(req.query.año);

    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '50'), 10) || 50));

    const listParams: ListPaymentComplementsParams = {
      userId,
      page,
      limit,
    };
    if (profileId !== undefined) listParams.profileId = profileId;
    if (role !== undefined) listParams.role = role;
    if (mes !== undefined) listParams.mes = mes;
    if (año !== undefined) listParams.año = año;

    const result = await listForUser(listParams);

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/payment-complements/:id — Detalle de un complemento (id = payment_complements.id).
 */
export async function getPaymentComplementById(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) throw new AppError('Usuario no autenticado', 401);

    const { id } = req.params;

    const profileId = optionalString(req.query.profile_id);

    const data = await getByIdForUser(id as string, userId, profileId);

    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
}

import type { NextFunction, Response } from 'express';
import type { AuthRequest } from '../middlewares/auth.middleware.js';
import {
  deletePayrollService,
  getPayrollByIdService,
  getPayrollsService,
  uploadPayrollXML,
} from '../services/payroll.service.js';
import { AppError } from '../utils/AppError.js';
import { optionalString } from '../utils/query.util.js';

/**
 * POST /api/payrolls/upload - Sube XML de nómina.
 * Body (form): profile_id, period_id, archivo xml (campo "xml").
 */
export async function uploadPayroll(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) throw new AppError('Usuario no autenticado', 401);

    const profileId = optionalString(req.body.profile_id);
    const periodId = optionalString(req.body.period_id);
    const xmlBuffer = req.xmlBuffer;
    if (!profileId) throw new AppError('profile_id es requerido', 400);
    if (!periodId) throw new AppError('period_id es requerido', 400);
    if (!xmlBuffer) throw new AppError('Archivo XML no encontrado', 400);

    const payroll = await uploadPayrollXML({ userId, profileId, periodId, xmlBuffer });
    res.status(201).json({ message: 'Nómina registrada', data: payroll });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/payrolls - Lista nóminas.
 * Query: period_id (opcional), profile_id (opcional).
 * Si no se pasa profile_id se listan nóminas de todos los perfiles del usuario.
 */
export async function getPayrolls(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) throw new AppError('Usuario no autenticado', 401);

    const periodId = optionalString(req.query.period_id);
    const profileId = optionalString(req.query.profile_id);

    const result = await getPayrollsService(userId, profileId, periodId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/payrolls/:id - Detalle de una nómina.
 */
export async function getPayrollById(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) throw new AppError('Usuario no autenticado', 401);

    const payrollId = optionalString(req.params.id);
    if (!payrollId) throw new AppError('ID de payroll es requerido', 400);

    const result = await getPayrollByIdService(userId, payrollId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/payrolls/:id - Elimina una nómina.
 */
export async function deletePayroll(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) throw new AppError('Usuario no autenticado', 401);

    const payrollId = optionalString(req.params.id);
    if (!payrollId) throw new AppError('ID de payroll es requerido', 400);

    const result = await deletePayrollService(userId, payrollId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

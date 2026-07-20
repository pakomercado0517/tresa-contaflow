import type { NextFunction, Response } from 'express';
import type { AuthRequest } from '../middlewares/auth.middleware.js';
import { ManualIncome, Profile } from '../database/models/index.js';
import { invalidateProfileCache } from '../services/cache.service.js';
import {
  createManualIncomeService,
  getManualIncomeByIdService,
  getManualIncomesService,
  updateManualIncomeService,
} from '../services/manual-incomes.service.js';
import { AppError } from '../utils/AppError.js';

/**
 * Lista ingresos manuales. Filtro por period_id (obligatorio para listar por período).
 * Verifica que el perfil del período pertenezca al usuario.
 */
export async function getManualIncomes(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.userId;
    if (!userId) throw new AppError('Usuario no autenticado', 401);

    const periodId = req.query.period_id as string;
    const result = await getManualIncomesService(periodId, userId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * Obtiene un ingreso manual por ID. Verifica ownership vía profile.
 */
export async function getManualIncomeById(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.userId;
    if (!userId) throw new AppError('Usuario no autenticado', 401);

    const { id } = req.params;
    const result = await getManualIncomeByIdService(id as string, userId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * Crea un ingreso devengado manual. Valida profile_id y period_id (ownership).
 */
export async function createManualIncome(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.userId;
    if (!userId) throw new AppError('Usuario no autenticado', 401);

    const result = await createManualIncomeService(req.body, userId);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * Actualiza un ingreso manual (concept, subtotal, iva_amount, is_paid, payment_date, notes).
 */
export async function updateManualIncome(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.userId;
    if (!userId) throw new AppError('Usuario no autenticado', 401);

    const { id } = req.params;

    const result = await updateManualIncomeService(userId, id as string, req.body);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * Elimina un ingreso manual por ID.
 */
export async function deleteManualIncome(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Usuario no autenticado' });
      return;
    }

    const { id } = req.params;

    const income = await ManualIncome.findOne({
      where: { id },
      include: [{ model: Profile, as: 'profile', where: { user_id: userId }, attributes: ['id'] }],
    });
    if (!income) {
      res.status(404).json({ error: 'Ingreso no encontrado' });
      return;
    }

    const profileId = income.profile_id;
    await income.destroy();
    await invalidateProfileCache(profileId);
    res.json({ message: 'Ingreso eliminado' });
  } catch (error) {
    console.error('Error al eliminar ingreso manual:', error);
    res.status(500).json({
      error: 'Error al eliminar ingreso',
      message: error instanceof Error ? error.message : 'Error desconocido',
    });
  }
}

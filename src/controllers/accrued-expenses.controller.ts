import type { NextFunction, Response } from 'express';
import type { AuthRequest } from '../middlewares/auth.middleware.js';
import {
  createAccruedExpenseService,
  deleteAccruedExpenseService,
  getAccruedExpenseByIdService,
  getAccruedExpensesService,
  updateAccruedExpenseService,
} from '../services/accrued-expenses.service.js';
import { AppError } from '../utils/AppError.js';

/**
 * Lista gastos devengados manuales. Filtro por period_id y type=manual.
 * Verifica que el período pertenezca a un perfil del usuario.
 */
export async function getAccruedExpenses(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.userId;
    const { period_id, type } = req.query;

    if (!period_id || typeof period_id !== 'string')
      throw new AppError('periodId es requerido y debe ser una cadena de texto', 400);

    const result = await getAccruedExpensesService(
      userId!,
      period_id,
      (type as string) || 'MANUAL'
    );
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * Obtiene un gasto devengado por ID. Verifica ownership vía profile.
 */
export async function getAccruedExpenseById(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    if (!id) throw new AppError('El ID del gasto es requerido', 400);
    const result = await getAccruedExpenseByIdService(userId, id as string);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * Crea un gasto devengado manual. Valida profile_id y period_id (ownership).
 */
export async function createAccruedExpense(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.userId!;
    const { profileId, fecha, concepto, subtotal, iva_amount, categoria } = req.body;
    if (!profileId) throw new AppError('El ID del perfil es requerido', 400);

    const result = await createAccruedExpenseService(userId, {
      profile_id: profileId,
      fecha,
      concepto,
      subtotal,
      iva_amount,
      categoria,
    });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * Actualiza un gasto devengado manual (concept, subtotal, iva_amount, is_paid, payment_date, categoria).
 */
export async function updateAccruedExpense(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const result = await updateAccruedExpenseService(userId, id as string, req.body);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * Elimina un gasto devengado manual por ID.
 */
export async function deleteAccruedExpense(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const result = await deleteAccruedExpenseService(userId, id as string);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

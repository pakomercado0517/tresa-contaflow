import type { NextFunction, Response } from 'express';
import type { AuthRequest } from '../middlewares/auth.middleware.js';
import {
  createAccruedExpenseService,
  deleteAccruedExpenseService,
  getAccruedExpenseByIdService,
  getAccruedExpensesService,
  updateAccruedExpenseService,
} from '../services/accrued-expenses.service.js';

/**
 * Lista gastos devengados manuales. Filtro por period_id y type=manual.
 * Verifica que el período pertenezca a un perfil del usuario.
 */
export async function getAccruedExpenses(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.userId;
    const { period_id, type } = req.query;

    const result = await getAccruedExpensesService(
      userId as string,
      period_id as string,
      type as string
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

    const result = await createAccruedExpenseService(req.body, userId as string);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * Actualiza un gasto devengado manual (concept, subtotal, iva, is_paid, payment_date, categoria).
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

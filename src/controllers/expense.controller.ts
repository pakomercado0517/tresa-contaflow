import { type NextFunction, type Response } from 'express';
import type { AuthRequest } from '../middlewares/auth.middleware.js';
import { uploadInvoice } from './invoice.controller.js';
import { listExpenses, parseExpenseListQuery } from '../services/expense-list.service.js';
import { getLegacyDashboardMetricsService } from '../services/legacy-dashboard-metrics.service.js';
import type { GetMetricsFilters } from '../types/invoice-crud.types.js';
import { AppError } from '../utils/AppError.js';
import { optionalInt, optionalString } from '../utils/query.util.js';
import {
  createExpenseService,
  deleteExpenseService,
  getExpenseByIdService,
  updateExpenseService,
} from '../services/expenses-crud.service.js';

/**
 * Lista los gastos del usuario
 * Soporta filtros: profileId, mes, año, tipo, categoria, regimen_fiscal, search (búsqueda por texto), y paginación
 */
export async function getExpenses(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) throw new AppError('Usuario no autenticado', 401);

    const params = parseExpenseListQuery(req.query as Record<string, unknown>);
    const result = await listExpenses(userId, params);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * Obtiene un gasto por ID
 */
export async function getExpenseById(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.userId!;
    const id = req.params.id as string;

    const result = await getExpenseByIdService(userId, id);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * Crea un gasto manual (no desde XML)
 */
export async function createExpense(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.userId!;
    const result = await createExpenseService(userId, req.body);

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * Actualiza un gasto existente
 */
export async function updateExpense(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.userId!;
    const id = req.params.id as string;

    const result = await updateExpenseService(userId, id, req.body);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * Elimina un gasto por ID
 */
export async function deleteExpense(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.userId!;
    const id = req.params.id as string;

    const result = await deleteExpenseService(userId, id);

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * @deprecated Usar GET /api/metrics?mes=&año=&profile_id=
 * Obtiene métricas del dashboard en formato legacy (adaptado desde el stack de /api/metrics).
 */
export async function getMetrics(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) throw new AppError('Usuario no autenticado', 401);

    const profileId = optionalString(req.query.profileId);
    const mes = optionalInt(req.query.mes);
    const año = optionalInt(req.query.año);

    if (mes === undefined || año === undefined) {
      throw new AppError(
        'Los parámetros mes y año son requeridos. Use GET /api/metrics?mes=&año=&profile_id=',
        400
      );
    }

    const filters: GetMetricsFilters = { mes, año };
    profileId !== undefined && (filters.profileId = profileId);

    const result = await getLegacyDashboardMetricsService(userId, filters);

    res.set('Deprecation', 'true');
    res.set('Link', '</api/metrics>; rel="successor-version"');
    res.set(
      'Warning',
      '299 - "GET /api/expenses/metrics está deprecado. Use GET /api/metrics?mes=&año=&profile_id="'
    );
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * Sube un XML de gasto (reutiliza la lógica de uploadInvoice)
 * Este endpoint es un alias/conveniencia para /api/invoices/upload
 * pero específico para gastos
 */
export async function uploadExpense(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  return uploadInvoice(req, res, next);
}

import type { NextFunction, Response } from 'express';
import type { AuthRequest } from '../middlewares/auth.middleware.js';
import type { UpsertProfileFiscalSettingsBody } from '../types/profile-fiscal.types.js';
import { AppError } from '../utils/AppError.js';
import { optionalString, requiredQueryInt } from '../utils/query.util.js';
import {
  getProfileFiscalSettingsService,
  putProfileFiscalSettingsService,
} from '../services/profile-fiscal-crud.service.js';

/**
 * GET /api/profiles/:id/fiscal-settings?ejercicio=
 */
export async function getProfileFiscalSettings(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) throw new AppError('Usuario no autenticado', 401);

    const profileId = optionalString(req.params.id);
    if (!profileId) throw new AppError('ID de profile es requerido', 400);

    const ejercicio = requiredQueryInt(req.query.ejercicio);

    const data = await getProfileFiscalSettingsService({ userId, profileId, ejercicio });
    res.status(200).json(data);
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/profiles/:id/fiscal-settings
 */
export async function putProfileFiscalSettings(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) throw new AppError('Usuario no autenticado', 401);

    const profileId = optionalString(req.params.id);
    if (!profileId) throw new AppError('ID de profile es requerido', 400);

    const body = req.body as UpsertProfileFiscalSettingsBody;
    const data = await putProfileFiscalSettingsService({ userId, profileId, body });
    res.status(200).json({ message: 'Configuración fiscal guardada', data });
  } catch (error) {
    next(error);
  }
}

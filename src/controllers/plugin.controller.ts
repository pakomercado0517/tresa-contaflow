import type { NextFunction, Response } from 'express';
import type { AuthRequest } from '../middlewares/auth.middleware.js';
import { getPluginsService, getProfilePluginsService } from '../services/plugin.service.js';
import { AppError } from '../utils/AppError.js';
import { optionalString } from '../utils/query.util.js';

/**
 * GET /api/plugins - Lista todos los plugins con enabled según la suscripción del usuario actual.
 */
export async function getPlugins(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) throw new AppError('Usuario no autenticado', 401);

    const result = await getPluginsService(userId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/profiles/:id/plugins - Lista plugins habilitados para un perfil (el perfil debe pertenecer al usuario).
 */
export async function getProfilePlugins(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) throw new AppError('Usuario no autenticado', 401);

    const profileId = optionalString(req.params.profile_id);
    if (!profileId) throw new AppError('profile id es requerido', 400);

    const result = await getProfilePluginsService(userId, profileId);

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

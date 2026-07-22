import { type NextFunction, type Response } from 'express';
import { Profile, Subscription } from '../database/models/index.js';
import type { AuthRequest } from '../middlewares/auth.middleware.js';
import { invalidateProfileCache } from '../services/cache.service.js';
import { PLAN_LIMITS, type Plan } from '../constants/plans.constants.js';
import type { ProfileServiceError, FreezeOthersRequest } from '../types/index.js';
import { unfreezeProfileService } from '../services/profile.service.js';
import { AppError } from '../utils/AppError.js';
import {
  createProfileService,
  deleteProfileService,
  getProfileByIdService,
  getProfilesService,
  updateProfileService,
} from '../services/profile-crud.service.js';
import { optionalString } from '../utils/query.util.js';
import { freezeExcessProfilesService } from '../services/profile-freeze.service.js';

/**
 * Obtener todos los perfiles del usuario autenticado
 */
export async function getProfiles(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) throw new AppError('Usuario no autenticado', 401);

    const profiles = await getProfilesService(userId);
    res.json({
      message: 'Perfiles obtenidos exitosamente',
      data: profiles,
      count: profiles.length,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Obtener un perfil específico por ID
 */
export async function getProfileById(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) throw new AppError('Usuario no autenticado', 401);

    const profileId = optionalString(req.params.id);
    if (!profileId) throw new AppError('ID de profile es requerido', 400);

    const profile = await getProfileByIdService(userId, profileId);
    res.json({
      message: 'Perfil obtenido exitosamente',
      data: profile,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Crear un nuevo perfil
 */
export async function createProfile(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.userId;
    const body = req.body;

    if (!userId) throw new AppError('Usuario no autenticado', 401);

    const profile = await createProfileService({ userId, body });
    res.status(201).json({
      message: 'Perfil creado exitosamente',
      data: profile,
    });
  } catch (error: unknown) {
    next(error);
  }
}

/**
 * Actualizar un perfil existente
 */
export async function updateProfile(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.userId;
    const profileId = optionalString(req.params.id);
    const body = req.body;

    if (!userId) throw new AppError('Usuario no autenticado', 401);
    if (!profileId) throw new AppError('ID de profile es requerido', 400);

    const profile = await updateProfileService({ userId, profileId, body });
    res.json({
      message: 'Perfil actualizado exitosamente',
      data: profile,
    });
  } catch (error: unknown) {
    next(error);
  }
}

/**
 * Eliminar un perfil
 */
export async function deleteProfile(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.userId;
    const profileId = optionalString(req.params.id);

    if (!userId) throw new AppError('Usuario no autenticado', 401);
    if (!profileId) throw new AppError('ID de profile es requerido', 400);

    const result = await deleteProfileService(userId, profileId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * Congelar perfiles excedentes cuando el usuario hace downgrade
 * POST /api/profiles/freeze-others
 */
export async function freezeOtherProfiles(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    const { preserveProfileId, targetPlan }: FreezeOthersRequest = req.body;

    if (!userId) {
      res.status(401).json({ error: 'Usuario no autenticado' });
      return;
    }

    // Validar que preserveProfileId fue enviado
    if (!preserveProfileId) {
      res.status(400).json({
        error: "El campo 'preserveProfileId' es requerido",
        code: 'MISSING_PROFILE_ID',
      });
      return;
    }

    // Validar targetPlan si se envía
    let requestedPlan: Plan | undefined;
    if (targetPlan) {
      if (!(targetPlan in PLAN_LIMITS)) {
        res.status(400).json({
          error: "El campo 'targetPlan' es inválido",
          code: 'INVALID_PLAN',
        });
        return;
      }
      requestedPlan = targetPlan;
    }

    // Obtener el plan actual del usuario desde su suscripción
    const subscription = await Subscription.findOne({
      where: { user_id: userId },
      order: [['created_at', 'DESC']],
    });

    const currentPlan = subscription?.plan || 'FREE';
    const effectivePlan = requestedPlan || currentPlan;

    // Ejecutar la lógica de congelación usando el servicio
    const result = await freezeExcessProfilesService(
      userId,
      preserveProfileId,
      effectivePlan,
      'plan_limit'
    );

    res.status(200).json({
      message: 'Perfiles congelados exitosamente',
      frozen: result.frozen.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        rfc: p.rfc,
        frozen: p.frozen,
        frozen_reason: p.frozen_reason,
        frozen_at: p.frozen_at?.toISOString(),
      })),
      active: {
        id: result.active.id,
        nombre: result.active.nombre,
        rfc: result.active.rfc,
        frozen: result.active.frozen,
      },
      count: {
        frozen: result.frozen.length,
        total: result.frozen.length + 1, // +1 por el activo
      },
    });
  } catch (error) {
    console.error('Error al congelar perfiles:', error);

    // Manejar errores del servicio
    if (error && typeof error === 'object' && 'code' in error) {
      const serviceError = error as ProfileServiceError;
      res.status(serviceError.statusCode).json({
        error: serviceError.message,
        code: serviceError.code,
      });
      return;
    }

    res.status(500).json({ error: 'Error al congelar perfiles' });
  }
}

/**
 * Descongelar un perfil
 * PUT /api/profiles/:id/unfreeze
 */
export async function unfreezeProfile(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    const idRaw = req.params.id;
    const id = Array.isArray(idRaw) ? idRaw[0] : idRaw;

    if (!userId) {
      res.status(401).json({ error: 'Usuario no autenticado' });
      return;
    }

    if (!id) {
      res.status(400).json({ error: 'ID de perfil requerido' });
      return;
    }

    // Obtener el plan actual del usuario
    const subscription = await Subscription.findOne({
      where: { user_id: userId },
      order: [['created_at', 'DESC']],
    });

    const currentPlan = subscription?.plan || 'FREE';

    // Descongelar usando el servicio
    const profile = await unfreezeProfileService(userId, id, currentPlan);

    res.json({
      message: 'Perfil descongelado exitosamente',
      data: profile,
    });
  } catch (error) {
    console.error('Error al descongelar perfil:', error);

    // Manejar errores del servicio
    if (error && typeof error === 'object' && 'code' in error) {
      const serviceError = error as ProfileServiceError;
      res.status(serviceError.statusCode).json({
        error: serviceError.message,
        code: serviceError.code,
      });
      return;
    }

    res.status(500).json({ error: 'Error al descongelar perfil' });
  }
}

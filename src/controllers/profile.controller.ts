import { type NextFunction, type Response } from 'express';
import { Subscription } from '../database/models/index.js';
import type { AuthRequest } from '../middlewares/auth.middleware.js';
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
import {
  freezeOtherProfilesService,
  getEffectivePlanService,
} from '../services/profile-freeze.service.js';

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
export async function freezeOtherProfiles(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.userId;
    const { preserveProfileId, targetPlan }: FreezeOthersRequest = req.body;

    if (!userId) throw new AppError('Usuario no autenticado', 401);

    // Validar que preserveProfileId fue enviado
    if (!preserveProfileId) throw new AppError('El perfil seleccionado no existe...', 400);

    if(!targetPlan) throw new AppError('targetPlan es requerido', 400)


    // Ejecutar la lógica de congelación usando el servicio
    const result = await freezeOtherProfilesService(
      {userId,
      preserveProfileId,
      targetPlan}
    );

    res.status(200).json(result);
  } catch (error) {
    next(error);
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

import { type Response } from 'express';
import { Op } from 'sequelize';
import { Profile, Subscription } from '../database/models/index.js';
import type { AuthRequest } from '../middlewares/auth.middleware.js';
import { ProfileService } from '../services/profile.service.js';
import { PLAN_LIMITS, type Plan } from '../constants/plans.constants.js';
import { SUPPORT_EMAIL, ERROR_CODE_RFC_IN_USE } from '../constants/support.constants.js';
import { normalizeRFC } from '../utils/rfc.util.js';
import type { ProfileServiceError, FreezeOthersRequest } from '../types/index.js';

/**
 * Obtener todos los perfiles del usuario autenticado
 */
export async function getProfiles(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Usuario no autenticado' });
      return;
    }

    const profiles = await Profile.findAll({
      where: { user_id: userId },
      order: [['created_at', 'DESC']],
    });

    res.json({
      message: 'Perfiles obtenidos exitosamente',
      data: profiles,
      count: profiles.length,
    });
  } catch (error) {
    console.error('Error al obtener perfiles:', error);
    res.status(500).json({ error: 'Error al obtener perfiles' });
  }
}

/**
 * Obtener un perfil específico por ID
 */
export async function getProfileById(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    const { id } = req.params;

    if (!userId) {
      res.status(401).json({ error: 'Usuario no autenticado' });
      return;
    }

    const profile = await Profile.findOne({
      where: { id, user_id: userId },
    });

    if (!profile) {
      res.status(404).json({ error: 'Perfil no encontrado' });
      return;
    }

    res.json({
      message: 'Perfil obtenido exitosamente',
      data: profile,
    });
  } catch (error) {
    console.error('Error al obtener perfil:', error);
    res.status(500).json({ error: 'Error al obtener perfil' });
  }
}

/**
 * Crear un nuevo perfil
 */
export async function createProfile(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    const { nombre, rfc, tipo_persona, regimenes_fiscales, validaciones_habilitadas } = req.body;

    if (!userId) {
      res.status(401).json({ error: 'Usuario no autenticado' });
      return;
    }

    // Obtener el plan actual del usuario
    const subscription = await Subscription.findOne({
      where: { user_id: userId },
      order: [['created_at', 'DESC']],
    });

    const currentPlan = subscription?.plan || 'FREE';

    // Verificar límite de perfiles usando el servicio
    const canCreate = await ProfileService.canCreateProfile(userId, currentPlan);
    if (!canCreate) {
      const activeCount = await ProfileService.countActiveProfiles(userId);
      const limit = ProfileService.getProfileLimitForPlan(currentPlan);
      res.status(403).json({
        error: `Has alcanzado el límite de perfiles para tu plan ${currentPlan}`,
        limit,
        current: activeCount,
        code: 'PROFILE_LIMIT_REACHED',
      });
      return;
    }

    // Verificar si el RFC ya está en uso por cualquier usuario (un RFC solo puede existir en una cuenta)
    const rfcNormalizado = normalizeRFC(rfc);
    const existingProfile = await Profile.findOne({
      where: { rfc: rfcNormalizado },
    });

    if (existingProfile) {
      res.status(409).json({
        error: 'Este RFC ya está en uso',
        message: `Este RFC ya está registrado en Contafy por otro usuario. Si requiere ayuda para resolver este problema, contacte a ${SUPPORT_EMAIL}`,
        code: ERROR_CODE_RFC_IN_USE,
      });
      return;
    }

    // Normalizar regímenes fiscales: array de strings no vacíos
    const regimenesNormalizados = Array.isArray(regimenes_fiscales)
      ? regimenes_fiscales
          .filter((r: unknown) => typeof r === 'string' && String(r).trim() !== '')
          .map((r: unknown) => String(r).trim())
      : [];

    // Crear el perfil
    const profile = await Profile.create({
      user_id: userId,
      nombre,
      rfc: rfcNormalizado,
      tipo_persona,
      regimenes_fiscales: regimenesNormalizados,
      validaciones_habilitadas: validaciones_habilitadas || {},
    });

    res.status(201).json({
      message: 'Perfil creado exitosamente',
      data: profile,
    });
  } catch (error: unknown) {
    console.error('Error al crear perfil:', error);

    // Manejar error de constraint único (RFC duplicado a nivel BD)
    if (error instanceof Error && error.name === 'SequelizeUniqueConstraintError') {
      res.status(409).json({
        error: 'Este RFC ya está en uso',
        message: `Este RFC ya está registrado en Contafy por otro usuario. Si requiere ayuda para resolver este problema, contacte a ${SUPPORT_EMAIL}`,
        code: ERROR_CODE_RFC_IN_USE,
      });
      return;
    }

    res.status(500).json({ error: 'Error al crear perfil' });
  }
}

/**
 * Actualizar un perfil existente
 */
export async function updateProfile(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    const { id } = req.params;
    const { nombre, rfc, tipo_persona, regimenes_fiscales, validaciones_habilitadas } = req.body;

    if (!userId) {
      res.status(401).json({ error: 'Usuario no autenticado' });
      return;
    }

    // Buscar el perfil y verificar que pertenece al usuario
    const profile = await Profile.findOne({
      where: { id, user_id: userId },
    });

    if (!profile) {
      res.status(404).json({ error: 'Perfil no encontrado' });
      return;
    }

    // Si se está actualizando el RFC, verificar que no esté en uso por otro usuario
    if (rfc) {
      const rfcNormalizado = normalizeRFC(rfc);
      if (rfcNormalizado !== profile.rfc) {
        const existingProfile = await Profile.findOne({
          where: {
            rfc: rfcNormalizado,
            id: { [Op.ne]: profile.id },
          },
        });

        if (existingProfile) {
          res.status(409).json({
            error: 'Este RFC ya está en uso',
            message: `Este RFC ya está registrado en Contafy por otro usuario. Si requiere ayuda para resolver este problema, contacte a ${SUPPORT_EMAIL}`,
            code: ERROR_CODE_RFC_IN_USE,
          });
          return;
        }
      }
    }

    // Normalizar regímenes fiscales si se envían
    const regimenesActualizados =
      regimenes_fiscales !== undefined
        ? Array.isArray(regimenes_fiscales)
          ? regimenes_fiscales
              .filter((r: unknown) => typeof r === 'string' && String(r).trim() !== '')
              .map((r: unknown) => String(r).trim())
          : []
        : profile.regimenes_fiscales;

    // Actualizar el perfil
    await profile.update({
      nombre: nombre || profile.nombre,
      rfc: rfc ? normalizeRFC(rfc) : profile.rfc,
      tipo_persona: tipo_persona || profile.tipo_persona,
      regimenes_fiscales: regimenesActualizados,
      validaciones_habilitadas:
        validaciones_habilitadas !== undefined
          ? validaciones_habilitadas
          : profile.validaciones_habilitadas,
    });

    res.json({
      message: 'Perfil actualizado exitosamente',
      data: profile,
    });
  } catch (error: unknown) {
    console.error('Error al actualizar perfil:', error);

    // Manejar error de constraint único (RFC duplicado a nivel BD)
    if (error instanceof Error && error.name === 'SequelizeUniqueConstraintError') {
      res.status(409).json({
        error: 'Este RFC ya está en uso',
        message: `Este RFC ya está registrado en Contafy por otro usuario. Si requiere ayuda para resolver este problema, contacte a ${SUPPORT_EMAIL}`,
        code: ERROR_CODE_RFC_IN_USE,
      });
      return;
    }

    res.status(500).json({ error: 'Error al actualizar perfil' });
  }
}

/**
 * Eliminar un perfil
 */
export async function deleteProfile(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    const { id } = req.params;

    if (!userId) {
      res.status(401).json({ error: 'Usuario no autenticado' });
      return;
    }

    // Buscar el perfil y verificar que pertenece al usuario
    const profile = await Profile.findOne({
      where: { id, user_id: userId },
    });

    if (!profile) {
      res.status(404).json({ error: 'Perfil no encontrado' });
      return;
    }

    // Eliminar el perfil
    await profile.destroy();

    res.json({
      message: 'Perfil eliminado exitosamente',
    });
  } catch (error) {
    console.error('Error al eliminar perfil:', error);
    res.status(500).json({ error: 'Error al eliminar perfil' });
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
    const result = await ProfileService.freezeExcessProfiles(
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
    const profile = await ProfileService.unfreezeProfile(userId, id, currentPlan);

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

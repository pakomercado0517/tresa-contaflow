import { Profile } from '../database/models/index.js';
import { PLAN_LIMITS, type Plan } from '../constants/plans.constants.js';
import type { FrozenReason, ProfileServiceError } from '../types/profile.types.js';

/**
 * Servicio para gestión de perfiles
 */
/**
 * Obtener todos los perfiles de un usuario
 */
export const getProfilesByUserId = async (userId: string): Promise<Profile[]> => {
  return await Profile.findAll({
    where: { user_id: userId },
    order: [['created_at', 'DESC']],
  });
};

/**
 * Obtener perfiles activos (no congelados) de un usuario
 */
export const getActiveProfilesByUserId = async (userId: string): Promise<Profile[]> => {
  return await Profile.findAll({
    where: { user_id: userId, frozen: false },
    order: [['created_at', 'DESC']],
  });
};

/**
 * Contar perfiles activos de un usuario
 */
export const countActiveProfiles = async (userId: string): Promise<number> => {
  return await Profile.count({
    where: { user_id: userId, frozen: false },
  });
};

/**
 * Obtener límite de perfiles para un plan
 */
export const getProfileLimitForPlan = (plan: Plan): number => {
  const limit = PLAN_LIMITS[plan].profiles;
  if (limit === null) {
    return Number.MAX_SAFE_INTEGER; // Ilimitado
  }
  return limit;
};

/**
 * Verificar si el usuario tiene perfiles que excedan el límite de su plan
 */
export const hasExcessProfiles = async (userId: string, plan: Plan): Promise<boolean> => {
  const activeCount = await countActiveProfiles(userId);
  const limit = getProfileLimitForPlan(plan);
  return activeCount > limit;
};

/**
 * Descongelar un perfil si no excede el límite del plan
 */
export const unfreezeProfileService = async (
  userId: string,
  profileId: string,
  plan: Plan
): Promise<Profile> => {
  // 1. Buscar el perfil
  const profile = await Profile.findOne({
    where: { id: profileId, user_id: userId },
  });

  if (!profile) {
    const error: ProfileServiceError = {
      code: 'PROFILE_NOT_FOUND',
      message: 'Perfil no encontrado',
      statusCode: 404,
    };
    throw error;
  }

  // 2. Verificar que está congelado
  if (!profile.frozen) {
    const error: ProfileServiceError = {
      code: 'PROFILE_NOT_FROZEN',
      message: 'El perfil no está congelado',
      statusCode: 400,
    };
    throw error;
  }

  // 3. Verificar que no exceda el límite al descongelar
  const activeCount = await countActiveProfiles(userId);
  const limit = getProfileLimitForPlan(plan);

  if (activeCount >= limit) {
    const error: ProfileServiceError = {
      code: 'PROFILE_LIMIT_REACHED',
      message: `No puedes descongelar este perfil. Ya tienes ${activeCount} perfil(es) activo(s) y tu límite es ${limit}`,
      statusCode: 403,
    };
    throw error;
  }

  // 4. Descongelar
  await profile.update({
    frozen: false,
    frozen_reason: null,
    frozen_at: null,
  });

  return profile;
};

/**
 * Verificar si un usuario puede crear un nuevo perfil
 */
export const canCreateProfile = async (userId: string, plan: Plan): Promise<boolean> => {
  const activeCount = await countActiveProfiles(userId);
  const limit = getProfileLimitForPlan(plan);
  return activeCount < limit;
};

/**
 * Verificar que un perfil pertenece a un usuario
 */
export const verifyProfileOwnership = async (
  userId: string,
  profileId: string
): Promise<boolean> => {
  const profile = await Profile.findOne({
    where: { id: profileId, user_id: userId },
  });
  return profile !== null;
};

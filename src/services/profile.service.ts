import { Profile } from '../database/models/index.js';
import { PLAN_LIMITS, type Plan } from '../constants/plans.constants.js';
import type { FrozenReason, ProfileServiceError } from '../types/profile.types.js';

/**
 * Servicio para gestión de perfiles
 */
export class ProfileService {
  /**
   * Obtener todos los perfiles de un usuario
   */
  static async getProfilesByUserId(userId: string): Promise<Profile[]> {
    return await Profile.findAll({
      where: { user_id: userId },
      order: [['created_at', 'DESC']],
    });
  }

  /**
   * Obtener perfiles activos (no congelados) de un usuario
   */
  static async getActiveProfilesByUserId(userId: string): Promise<Profile[]> {
    return await Profile.findAll({
      where: { user_id: userId, frozen: false },
      order: [['created_at', 'DESC']],
    });
  }

  /**
   * Contar perfiles activos de un usuario
   */
  static async countActiveProfiles(userId: string): Promise<number> {
    return await Profile.count({
      where: { user_id: userId, frozen: false },
    });
  }

  /**
   * Obtener límite de perfiles para un plan
   */
  static getProfileLimitForPlan(plan: Plan): number {
    const limit = PLAN_LIMITS[plan].profiles;
    if (limit === null) {
      return Number.MAX_SAFE_INTEGER; // Ilimitado
    }
    return limit;
  }

  /**
   * Verificar si el usuario tiene perfiles que excedan el límite de su plan
   */
  static async hasExcessProfiles(userId: string, plan: Plan): Promise<boolean> {
    const activeCount = await this.countActiveProfiles(userId);
    const limit = this.getProfileLimitForPlan(plan);
    return activeCount > limit;
  }

  /**
   * Congelar perfiles que excedan el límite del plan, preservando uno específico
   */
  static async freezeExcessProfiles(
    userId: string,
    preserveProfileId: string,
    plan: Plan,
    reason: FrozenReason = 'plan_limit'
  ): Promise<{ frozen: Profile[]; active: Profile }> {
    // 1. Verificar que el perfil a preservar existe y pertenece al usuario
    const profileToPreserve = await Profile.findOne({
      where: { id: preserveProfileId, user_id: userId },
    });

    if (!profileToPreserve) {
      const error: ProfileServiceError = {
        code: 'PROFILE_NOT_FOUND',
        message: 'El perfil seleccionado no existe o no pertenece al usuario',
        statusCode: 404,
      };
      throw error;
    }

    // 2. Verificar que el perfil no está congelado
    if (profileToPreserve.frozen) {
      const error: ProfileServiceError = {
        code: 'PROFILE_ALREADY_FROZEN',
        message: 'El perfil seleccionado ya está congelado',
        statusCode: 400,
      };
      throw error;
    }

    // 3. Obtener todos los perfiles activos del usuario
    const activeProfiles = await this.getActiveProfilesByUserId(userId);
    const limit = this.getProfileLimitForPlan(plan);

    // 4. Verificar que hay perfiles para congelar
    if (activeProfiles.length <= limit) {
      const error: ProfileServiceError = {
        code: 'NO_EXCESS_PROFILES',
        message: `No hay perfiles que congelar. Tienes ${activeProfiles.length} perfil(es) activo(s) y tu límite es ${limit}`,
        statusCode: 400,
      };
      throw error;
    }

    // 5. Determinar qué perfiles congelar (todos excepto el preservado)
    const profilesToFreeze = activeProfiles.filter((profile) => profile.id !== preserveProfileId);

    // 6. Calcular cuántos perfiles congelar
    const excessCount = activeProfiles.length - limit;
    const profilesToFreezeCount = Math.min(profilesToFreeze.length, excessCount);
    const selectedToFreeze = profilesToFreeze.slice(0, profilesToFreezeCount);

    // 7. Congelar los perfiles excedentes
    const frozenProfiles: Profile[] = [];
    const now = new Date();

    for (const profile of selectedToFreeze) {
      await profile.update({
        frozen: true,
        frozen_reason: reason,
        frozen_at: now,
      });
      frozenProfiles.push(profile);
    }

    return {
      frozen: frozenProfiles,
      active: profileToPreserve,
    };
  }

  /**
   * Descongelar un perfil si no excede el límite del plan
   */
  static async unfreezeProfile(userId: string, profileId: string, plan: Plan): Promise<Profile> {
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
    const activeCount = await this.countActiveProfiles(userId);
    const limit = this.getProfileLimitForPlan(plan);

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
  }

  /**
   * Verificar si un usuario puede crear un nuevo perfil
   */
  static async canCreateProfile(userId: string, plan: Plan): Promise<boolean> {
    const activeCount = await this.countActiveProfiles(userId);
    const limit = this.getProfileLimitForPlan(plan);
    return activeCount < limit;
  }

  /**
   * Verificar que un perfil pertenece a un usuario
   */
  static async verifyProfileOwnership(userId: string, profileId: string): Promise<boolean> {
    const profile = await Profile.findOne({
      where: { id: profileId, user_id: userId },
    });
    return profile !== null;
  }
}

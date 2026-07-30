import { Result } from 'express-validator';
import { PLAN_LIMITS, type Plan } from '../constants/plans.constants.js';
import Profile from '../database/models/Profile.model.js';
import Subscription from '../database/models/Subscription.model.js';
import type {
  FreezeOtherProfilesParams,
  FrozenReason,
  ProfileServiceError,
} from '../types/profile.types.js';
import { AppError } from '../utils/AppError.js';
import { countActiveProfiles, getActiveProfilesByUserId, getProfileLimitForPlan } from './profile.service.js';

export const freezeOtherProfilesService = async ({
  userId,
  preserveProfileId,
  targetPlan,
}: FreezeOtherProfilesParams) => {
  const getEffectivePlan = await getEffectivePlanService(userId, targetPlan)
  const freezeProfilesJSON = await freezeExcessProfilesService(userId, preserveProfileId, getEffectivePlan, 'plan_limit')
  const result = {
    message: 'Perfiles congelados exitosamente',
    frozen: freezeProfilesJSON.frozen.map(p => ({
      id:p.id,
      nombre: p.nombre,
      rfc: p.rfc,
      frozen: p.frozen,
      frozen_reason: p.frozen_reason,
      frozen_at: p.frozen_at
    })),
    active: {
      id: freezeProfilesJSON.active.id,
      nombre: freezeProfilesJSON.active.nombre,
      rfc: freezeProfilesJSON.active.rfc,
      frozen: freezeProfilesJSON.active.frozen
    },
    count: {
      frozen: freezeProfilesJSON.frozen.length,
      total: freezeProfilesJSON.frozen.length + 1
    }
  }
  
  return result
};

  // Descongelar un perfil (rfc)
export const unfreezeProfileService = async (userId: string, profileId: string): Promise<Profile> => {
  const profile = await Profile.findOne({
    where: {id: profileId, user_id: userId}
  })

  const subscription = await Subscription.findOne({
    where: { user_id: userId},
    order: [['created_at', 'DESC']]
  })

  const plan = subscription?.plan || 'FREE'

  if(!profile) throw new AppError('Perfil no encontrado', 404)
  if(!profile.frozen) throw new AppError('El perfil no está congelado', 400)

  const activeCount = await countActiveProfiles(userId)
  const limit = getProfileLimitForPlan(plan)

  if(activeCount >= limit) throw new AppError(`No puedes descongelar este perfil, Ya tienes ${activeCount} perfil(es) activo(s) y tu límite ${limit}`, 403)

  await profile.update({
    frozen: false,
    frozen_reason: null,
    frozen_at: null
  })

  return profile; 
};

/**
 * Congelar perfiles que excedan el límite del plan, preservando uno específico
 */
export const freezeExcessProfilesService = async (
  userId: string,
  preserveProfileId: string,
  plan: Plan,
  reason: FrozenReason = 'plan_limit'
): Promise<{ frozen: Profile[]; active: Profile }> => {
  // 1. Verificar que el perfil a preservar existe y pertenece al usuario
  const profileToPreserve = await Profile.findOne({
    where: { id: preserveProfileId, user_id: userId },
  });

  if (!profileToPreserve) {
    throw new AppError('El perfil selecconado no existe o no pertenece al usuario', 404);
  }

  // 2. Verificar que el perfil no está congelado
  if (profileToPreserve.frozen) {
    throw new AppError('El perfil seleccionado ya está congelado', 400);
  }

  // 3. Obtener todos los perfiles activos del usuario
  const activeProfiles = await getActiveProfilesByUserId(userId);
  const limit = getProfileLimitForPlan(plan);

  // 4. Verificar que hay perfiles para congelar
  if (activeProfiles.length <= limit) {
    throw new AppError(
      `No hay perfiles que congelar. Tienes ${activeProfiles.length} perfil(es) activo(s) y tu límite es ${limit}`,
      400
    );
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
};

export const getEffectivePlanService = async (userId: string, targetPlan?: Plan) => {
  let requestedPlan: Plan | undefined;
  if (targetPlan) {
    if (!(targetPlan in PLAN_LIMITS)) throw new AppError('El campo target plan es inválido', 400);
    requestedPlan = targetPlan;
  }

  const subscription = await Subscription.findOne({
    where: { user_id: userId },
    order: [['created_at', 'DESC']],
  });

  const currentPlan = subscription?.plan || 'FREE';
  const effectivePlan = requestedPlan || currentPlan;

  return effectivePlan;
};

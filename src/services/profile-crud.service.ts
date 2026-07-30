import { Op } from 'sequelize';
import { SUPPORT_EMAIL } from '../constants/support.constants.js';
import Profile from '../database/models/Profile.model.js';
import Subscription from '../database/models/Subscription.model.js';
import type { CreateProfileparams, UpdateProfileParams } from '../types/profile.types.js';
import { AppError } from '../utils/AppError.js';
import { normalizeRFC } from '../utils/rfc.util.js';
import {
  canCreateProfile,
  countActiveProfiles,
  getProfileLimitForPlan,
} from './profile.service.js';
import { invalidateProfileCache } from './cache.service.js';

export const getProfilesService = async (userId: string) => {
  const profiles = await Profile.findAll({
    where: { user_id: userId },
    order: [['created_at', 'DESC']],
  });

  return profiles;
};

export const getProfileByIdService = async (userId: string, profileId: string) => {
  const profile = await Profile.findOne({
    where: { id: profileId, user_id: userId },
  });
  if (!profile) throw new AppError('Perfil no encontrado o no corresponde al usuario', 404);

  return profile;
};

export const createProfileService = async ({ userId, body }: CreateProfileparams) => {
  const subscription = await Subscription.findOne({
    where: { user_id: userId },
    order: [['created_at', 'DESC']],
  });

  const currentPlan = subscription?.plan || 'FREE';

  const canCreate = await canCreateProfile(userId, currentPlan);
  if (!canCreate) {
    const activeCount = await countActiveProfiles(userId);
    const limit = getProfileLimitForPlan(currentPlan);
    throw new AppError(
      `Has alcanzado el límite de perfiles para tu plan ${currentPlan}, ${limit}, current: ${activeCount}`,
      403
    );
  }

  const rfcNormalizado = normalizeRFC(body.rfc);
  const existingProfile = await Profile.findOne({ where: { rfc: rfcNormalizado } });
  if (existingProfile)
    throw new AppError(
      `Este RFC ya está registrado en Contafy por otro usuario. Si requieres ayuda para resolver este problema, contacte a ${SUPPORT_EMAIL}`,
      409
    );

  const regimenesNormalizados = Array.isArray(body.regimenes_fiscales)
    ? body.regimenes_fiscales
        .filter((r: unknown) => typeof r === 'string' && String(r).trim() !== '')
        .map((r: unknown) => String(r).trim())
    : [];

  const profile = await Profile.create({
    user_id: userId,
    nombre: body.nombre,
    rfc: rfcNormalizado,
    tipo_persona: body.tipo_persona,
    regimenes_fiscales: regimenesNormalizados,
    validaciones_habilitadas: body.validaciones_habilitadas ?? {},
  });

  return profile;
};

export const updateProfileService = async ({ userId, profileId, body }: UpdateProfileParams) => {
  const profile = await Profile.findOne({ where: { id: profileId, user_id: userId } });
  if (!profile) throw new AppError('Perfil no encontrado', 404);

  if (body.rfc) {
    const rfcNormalizado = normalizeRFC(body.rfc);
    if (rfcNormalizado !== profile.rfc) {
      const existingProfile = await Profile.findOne({
        where: {
          rfc: rfcNormalizado,
          id: { [Op.ne]: profile.id },
        },
      });

      if (existingProfile)
        throw new AppError(
          `Este RFC ya está registrado en Contafy por otro usuario. Si requiere ayuda para resolver este problema, contacte a ${SUPPORT_EMAIL}`,
          409
        );
    }
  }
  const regimenesNormalizados = Array.isArray(body.regimenes_fiscales)
    ? body.regimenes_fiscales
        .filter((r: unknown) => typeof r === 'string' && String(r).trim() !== '')
        .map((r: unknown) => String(r).trim())
    : profile.regimenes_fiscales;

  await profile.update({
    nombre: body.nombre !== undefined ? body.nombre : profile.nombre,
    rfc: body.rfc ? normalizeRFC(body.rfc) : profile.rfc,
    tipo_persona: body.tipo_persona !== undefined ? body.tipo_persona : profile.tipo_persona,
    regimenes_fiscales: regimenesNormalizados,
    validaciones_habilitadas:
      body.validaciones_habilitadas !== undefined
        ? body.validaciones_habilitadas
        : profile.validaciones_habilitadas,
  });

  await invalidateProfileCache(profile.id);
  return profile;
};

export const deleteProfileService = async (userId: string, profileId: string) => {
  const profile = await Profile.findOne({ where: { id: profileId, user_id: userId } });
  if (!profile) throw new AppError('Perfil no encontrado', 404);

  const profileIdToDelete = profile.id;
  await profile.destroy();
  await invalidateProfileCache(profileIdToDelete);

  return { message: 'Perfil eliminado exitosamente' };
};

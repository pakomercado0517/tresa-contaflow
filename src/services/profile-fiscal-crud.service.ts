import type {
  GetProfileFiscalSettingsParams,
  UpsertProfileFiscalSettingsParams,
} from '../types/profile-fiscal.types.js';
import { AppError } from '../utils/AppError.js';
import {
  assertProfileOwnership,
  getFiscalSettings,
  upsertFiscalSettings,
} from './profile-fiscal.service.js';

export const getProfileFiscalSettingsService = async ({
  userId,
  profileId,
  ejercicio,
}: GetProfileFiscalSettingsParams) => {
  const profile = await assertProfileOwnership(profileId, userId);
  if (!profile) throw new AppError('Perfil no encontrado o no pertenece al usuario', 404);

  const data = await getFiscalSettings(profileId, ejercicio);

  return { data };
};

export const putProfileFiscalSettingsService = async ({
  userId,
  profileId,
  body,
}: UpsertProfileFiscalSettingsParams) => {
  const profile = await assertProfileOwnership(profileId, userId);
  if (!profile) throw new AppError('Perfil no encontrado o no pertenece al usuario', 404);

  const data = await upsertFiscalSettings(profileId, body);

  return data;
};

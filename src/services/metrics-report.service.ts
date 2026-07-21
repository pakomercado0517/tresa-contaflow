import Period from '../database/models/Period.model.js';
import Profile from '../database/models/Profile.model.js';
import { AppError } from '../utils/AppError.js';
import { getMetricsForPeriod } from './metrics.service.js';

export const validateProfileAndRegimenService = async (
  userId: string,
  profileId: string | undefined,
  regimenFiscal: string | undefined
) => {
  if (!profileId) return;
  const profile = await Profile.findOne({
    where: { id: profileId, user_id: userId },
    attributes: ['id', 'regimenes_fiscales'],
  });

  if (!profile) throw new AppError('Perfil no encontrado o no pertenece al usuario', 404);

  if (regimenFiscal && typeof regimenFiscal === 'string') {
    const regimenes = profile.regimenes_fiscales ?? [];
    if (!regimenes.includes(regimenFiscal))
      throw new AppError(
        `El perfil no incluye el régimen ${regimenFiscal}. Regimenes del perfil: ${
          regimenes.join(', ') || 'ninguno'
        }`,
        400
      );
  }
};

export const getMetricsByPeriodIdService = async (
  userId: string,
  periodId: string,
  regimenFiscal?: string
) => {
  const period = await Period.findOne({
    where: { id: periodId },
    include: [
      {
        model: Profile,
        as: 'profile',
        where: { user_id: userId },
        attributes: ['id', 'regimenes_fiscales'],
      },
    ],
    attributes: ['id', 'profile_id', 'start_date', 'end_date'],
  });
  if (!period) throw new AppError('Periodo no encontrado o no pertenece al usuario', 404);

  const periodWithProfile = period as Period & { profile?: Profile };
  const regimenes = periodWithProfile.profile?.regimenes_fiscales ?? [];
  if (regimenFiscal && !regimenes.includes(regimenFiscal))
    throw new AppError(
      `El perfil no incluye el régimen ${regimenFiscal}. Regimenes del perfil: ${
        regimenes.join(', ') || 'ninguno'
      }`,
      400
    );

  const result = await getMetricsForPeriod(period.profile_id, periodId, regimenFiscal);

  if (!result) throw new AppError('No se pudieron calcular las métricas del periodo', 404);
  return result;
};

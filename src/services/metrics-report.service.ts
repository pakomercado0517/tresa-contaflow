import Profile from '../database/models/Profile.model.js';
import { AppError } from '../utils/AppError.js';

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

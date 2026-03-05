import { Profile } from '../database/models/index.js';
import { encrypt } from '../utils/fiel-crypto.util.js';
import type { RegisterFielDto, SatDescargaSyncResult, SatDescargaSyncStatus } from '../types/sat-descarga.types.js';

/**
 * Registra credenciales FIEL (e.firma) para un perfil. Cifra y persiste en BD.
 * El usuario debe ser dueño del perfil.
 */
export async function registerCredentials(
  profileId: string,
  userId: string,
  dto: RegisterFielDto
): Promise<void> {
  const profile = await Profile.findOne({
    where: { id: profileId, user_id: userId },
    attributes: ['id'],
  });
  if (!profile) {
    throw new Error('Perfil no encontrado o no pertenece al usuario');
  }

  const certificateBase64 = (dto.certificate_base64 ?? '').trim();
  const privateKeyBase64 = (dto.private_key_base64 ?? '').trim();
  const password = (dto.password ?? '').trim();

  if (!certificateBase64 || !privateKeyBase64 || !password) {
    throw new Error('certificate_base64, private_key_base64 y password son requeridos');
  }

  const fielCerEncrypted = encrypt(certificateBase64);
  const fielKeyEncrypted = encrypt(privateKeyBase64);
  const fielPasswordEncrypted = encrypt(password);

  await Profile.update(
    {
      fiel_cer_encrypted: fielCerEncrypted,
      fiel_key_encrypted: fielKeyEncrypted,
      fiel_password_encrypted: fielPasswordEncrypted,
      sat_download_sync_enabled: true,
    },
    { where: { id: profileId, user_id: userId } }
  );
}

/**
 * Devuelve el estado de sincronización SAT para un perfil.
 */
export async function getSyncStatus(
  profileId: string,
  userId: string
): Promise<SatDescargaSyncStatus | null> {
  const profile = await Profile.findOne({
    where: { id: profileId, user_id: userId },
    attributes: [
      'id',
      'sat_download_last_sync_at',
      'sat_download_sync_enabled',
      'fiel_cer_encrypted',
      'fiel_key_encrypted',
    ],
  });
  if (!profile) return null;

  return {
    profile_id: profile.id,
    last_sync_at: profile.sat_download_last_sync_at?.toISOString() ?? null,
    sync_enabled: profile.sat_download_sync_enabled,
    has_credentials:
      Boolean(profile.fiel_cer_encrypted) && Boolean(profile.fiel_key_encrypted),
  };
}

/**
 * Sincroniza facturas desde el SAT para un perfil (Web Service Descarga Masiva).
 * Implementación actual: stub. La integración SOAP completa (autenticación, solicitud,
 * verificación, descarga de paquetes, parseo e inserción) se puede añadir aquí.
 */
export async function syncInvoicesForProfile(profileId: string): Promise<SatDescargaSyncResult> {
  const profile = await Profile.findByPk(profileId, {
    attributes: [
      'id',
      'fiel_cer_encrypted',
      'fiel_key_encrypted',
      'fiel_password_encrypted',
    ],
  });

  if (!profile) {
    return { profile_id: profileId, synced: 0, errors: ['Perfil no encontrado'] };
  }

  if (!profile.fiel_cer_encrypted || !profile.fiel_key_encrypted) {
    return {
      profile_id: profileId,
      synced: 0,
      errors: ['El perfil no tiene credenciales FIEL registradas'],
    };
  }

  // Stub: solo actualizar last_sync_at. Aquí iría la lógica SOAP del SAT.
  await Profile.update(
    { sat_download_last_sync_at: new Date() },
    { where: { id: profileId } }
  );

  return { profile_id: profileId, synced: 0, errors: [] };
}

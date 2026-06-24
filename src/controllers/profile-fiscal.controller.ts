import type { Response } from 'express';
import type { AuthRequest } from '../middlewares/auth.middleware.js';
import {
  assertProfileOwnership,
  getFiscalSettings,
  upsertFiscalSettings,
} from '../services/profile-fiscal.service.js';
import type { UpsertProfileFiscalSettingsBody } from '../types/profile-fiscal.types.js';

/**
 * GET /api/profiles/:id/fiscal-settings?ejercicio=
 */
export async function getProfileFiscalSettings(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Usuario no autenticado' });
      return;
    }

    const idRaw = req.params.id;
    const profileId = Array.isArray(idRaw) ? idRaw[0] : idRaw;
    const ejercicioRaw = req.query.ejercicio;
    const ejercicio =
      typeof ejercicioRaw === 'string' ? parseInt(ejercicioRaw, 10) : NaN;

    if (!profileId || Number.isNaN(ejercicio) || ejercicio < 2000 || ejercicio > 2100) {
      res.status(400).json({ error: 'ejercicio es requerido y debe ser un año válido (2000-2100)' });
      return;
    }

    const profile = await assertProfileOwnership(profileId, userId);
    if (!profile) {
      res.status(404).json({ error: 'Perfil no encontrado o no pertenece al usuario' });
      return;
    }

    const data = await getFiscalSettings(profileId, ejercicio);
    res.json({ data });
  } catch (error) {
    console.error('Error al obtener configuración fiscal:', error);
    res.status(500).json({ error: 'Error al obtener configuración fiscal' });
  }
}

/**
 * PUT /api/profiles/:id/fiscal-settings
 */
export async function putProfileFiscalSettings(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Usuario no autenticado' });
      return;
    }

    const idRaw = req.params.id;
    const profileId = Array.isArray(idRaw) ? idRaw[0] : idRaw;
    if (!profileId) {
      res.status(400).json({ error: 'ID de perfil inválido' });
      return;
    }

    const profile = await assertProfileOwnership(profileId, userId);
    if (!profile) {
      res.status(404).json({ error: 'Perfil no encontrado o no pertenece al usuario' });
      return;
    }

    const body = req.body as UpsertProfileFiscalSettingsBody;
    const data = await upsertFiscalSettings(profileId, body);
    res.json({ message: 'Configuración fiscal guardada', data });
  } catch (error) {
    console.error('Error al guardar configuración fiscal:', error);
    res.status(500).json({ error: 'Error al guardar configuración fiscal' });
  }
}

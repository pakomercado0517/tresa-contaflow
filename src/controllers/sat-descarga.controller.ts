import type { Response } from 'express';
import type { AuthRequest } from '../middlewares/auth.middleware.js';
import * as satDescargaService from '../services/sat-descarga-masiva.service.js';
import type { RegisterFielDto } from '../types/sat-descarga.types.js';

/**
 * POST /api/sat-descarga/register
 * Registra credenciales FIEL (.cer + .key en Base64 + contraseña) para un perfil.
 */
export async function register(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Usuario no autenticado' });
      return;
    }

    const body = req.body as RegisterFielDto & { profile_id?: string };
    const profileId = body.profile_id;
    if (!profileId || typeof profileId !== 'string') {
      res.status(400).json({ error: 'profile_id es requerido' });
      return;
    }

    await satDescargaService.registerCredentials(profileId.trim(), userId, {
      profile_id: profileId.trim(),
      certificate_base64: body.certificate_base64 ?? '',
      private_key_base64: body.private_key_base64 ?? '',
      password: body.password ?? '',
    });

    res.status(200).json({
      message: 'Credenciales FIEL registradas correctamente',
      profile_id: profileId.trim(),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error al registrar credenciales';
    if (msg.includes('Perfil no encontrado')) {
      res.status(404).json({ error: msg });
      return;
    }
    if (msg.includes('son requeridos') || msg.includes('SAT_FIEL_ENCRYPTION_KEY')) {
      res.status(400).json({ error: msg });
      return;
    }
    console.error('Error en sat-descarga register:', error);
    res.status(500).json({ error: 'Error al registrar credenciales', message: msg });
  }
}

/**
 * POST /api/sat-descarga/trigger/:profile_id
 * Dispara sincronización manual para un perfil.
 */
export async function trigger(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Usuario no autenticado' });
      return;
    }

    const profileId = req.params.profile_id as string;
    if (!profileId) {
      res.status(400).json({ error: 'profile_id es requerido' });
      return;
    }

    const profile = await satDescargaService.getSyncStatus(profileId, userId);
    if (!profile) {
      res.status(404).json({ error: 'Perfil no encontrado o no pertenece al usuario' });
      return;
    }

    const result = await satDescargaService.syncInvoicesForProfile(profileId);
    res.status(200).json(result);
  } catch (error) {
    console.error('Error en sat-descarga trigger:', error);
    res.status(500).json({
      error: 'Error al sincronizar',
      message: error instanceof Error ? error.message : 'Error desconocido',
    });
  }
}

/**
 * GET /api/sat-descarga/status/:profile_id
 * Estado de sincronización SAT para un perfil.
 */
export async function getStatus(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Usuario no autenticado' });
      return;
    }

    const profileId = req.params.profile_id as string;
    if (!profileId) {
      res.status(400).json({ error: 'profile_id es requerido' });
      return;
    }

    const status = await satDescargaService.getSyncStatus(profileId, userId);
    if (!status) {
      res.status(404).json({ error: 'Perfil no encontrado o no pertenece al usuario' });
      return;
    }

    res.json(status);
  } catch (error) {
    console.error('Error en sat-descarga status:', error);
    res.status(500).json({
      error: 'Error al obtener estado',
      message: error instanceof Error ? error.message : 'Error desconocido',
    });
  }
}

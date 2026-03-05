import type { Response } from 'express';
import type { AuthRequest } from '../middlewares/auth.middleware.js';
import { User } from '../database/models/index.js';
import * as publicReportService from '../services/public-report.service.js';
import { sendPublicReportInvitation } from '../services/email.service.js';

/**
 * POST /api/public-reports/generate
 * Genera un token de reporte público y opcionalmente envía el enlace por email.
 */
export async function generate(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Usuario no autenticado' });
      return;
    }

    const { profile_id, expires_in_days, send_to_email } = req.body as {
      profile_id: string;
      expires_in_days?: number;
      send_to_email?: string;
    };

    if (!profile_id || typeof profile_id !== 'string') {
      res.status(400).json({ error: 'profile_id es requerido' });
      return;
    }

    const days = expires_in_days != null ? Number(expires_in_days) : undefined;
    if (days !== undefined && (Number.isNaN(days) || days < 1 || days > 365)) {
      res.status(400).json({ error: 'expires_in_days debe ser un número entre 1 y 365' });
      return;
    }

    const result = await publicReportService.generateToken(
      profile_id.trim(),
      userId,
      days
    );

    if (send_to_email && typeof send_to_email === 'string' && send_to_email.trim()) {
      const email = send_to_email.trim();
      const user = await User.findByPk(userId, {
        attributes: ['nombre_comercial', 'logo_url', 'nombre'],
      });
      const nombreDespacho =
        user?.nombre_comercial?.trim() ||
        (user?.nombre ? `${user.nombre}`.trim() : 'Tu despacho');
      try {
        await sendPublicReportInvitation(
          email,
          result.url,
          nombreDespacho,
          user?.logo_url ?? undefined
        );
      } catch (emailError) {
        console.error('Error al enviar email de invitación:', emailError);
        res.status(200).json({
          ...result,
          message: 'Token generado. No se pudo enviar el email de invitación.',
        });
        return;
      }
    }

    res.status(201).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error al generar el token';
    if (message.includes('Perfil no encontrado')) {
      res.status(404).json({ error: message });
      return;
    }
    console.error('Error en generate public report:', error);
    res.status(500).json({ error: 'Error al generar el token', message });
  }
}

/**
 * GET /api/public-reports/:token
 * Endpoint público: devuelve branding, perfil y métricas para el token.
 */
export async function getByToken(req: AuthRequest, res: Response): Promise<void> {
  try {
    const token = req.params.token as string;
    if (!token) {
      res.status(400).json({ error: 'Token requerido' });
      return;
    }

    const data = await publicReportService.getPublicData(token);
    if (!data) {
      res.status(404).json({
        error: 'Enlace no válido o expirado',
        message: 'El enlace no existe, ha expirado o ha sido revocado.',
      });
      return;
    }

    res.json(data);
  } catch (error) {
    console.error('Error en getByToken public report:', error);
    res.status(500).json({
      error: 'Error al obtener el reporte',
      message: error instanceof Error ? error.message : 'Error desconocido',
    });
  }
}

/**
 * DELETE /api/public-reports/:token
 * Revoca un token de reporte público. Solo el dueño puede revocarlo.
 */
export async function revoke(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Usuario no autenticado' });
      return;
    }

    const token = req.params.token as string;
    if (!token) {
      res.status(400).json({ error: 'Token requerido' });
      return;
    }

    const revoked = await publicReportService.revokeToken(token, userId);
    if (!revoked) {
      res.status(404).json({
        error: 'Token no encontrado',
        message: 'El token no existe o no tienes permiso para revocarlo.',
      });
      return;
    }

    res.status(200).json({ message: 'Enlace revocado correctamente' });
  } catch (error) {
    console.error('Error en revoke public report:', error);
    res.status(500).json({
      error: 'Error al revocar el enlace',
      message: error instanceof Error ? error.message : 'Error desconocido',
    });
  }
}

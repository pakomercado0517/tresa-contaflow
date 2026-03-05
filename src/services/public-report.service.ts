import { randomUUID } from 'crypto';
import { Op } from 'sequelize';
import {
  PublicReportToken,
  Profile,
  User,
} from '../database/models/index.js';
import { MetricsService } from './metrics.service.js';
import type {
  PublicReportResponse,
  GenerateTokenResponse,
} from '../types/public-report.types.js';

const DEFAULT_EXPIRES_IN_DAYS = 30;
const metricsService = new MetricsService();

/**
 * Genera un token de reporte público para un perfil.
 * El usuario debe ser dueño del perfil.
 */
export async function generateToken(
  profileId: string,
  userId: string,
  expiresInDays: number = DEFAULT_EXPIRES_IN_DAYS
): Promise<GenerateTokenResponse> {
  const profile = await Profile.findOne({
    where: { id: profileId, user_id: userId },
    attributes: ['id'],
  });
  if (!profile) {
    throw new Error('Perfil no encontrado o no pertenece al usuario');
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expiresInDays);

  const token = randomUUID();
  await PublicReportToken.create({
    token,
    profile_id: profileId,
    user_id: userId,
    expires_at: expiresAt,
    is_active: true,
  });

  const baseUrl = process.env.FRONTEND_URL || process.env.APP_URL || 'http://localhost:3000';
  const url = `${baseUrl.replace(/\/$/, '')}/public/${token}`;

  return {
    token,
    url,
    expires_at: expiresAt.toISOString(),
  };
}

/**
 * Obtiene los datos públicos para mostrar el dashboard: branding del usuario,
 * datos del perfil y métricas del mes actual.
 */
export async function getPublicData(tokenValue: string): Promise<PublicReportResponse | null> {
  const record = await PublicReportToken.findOne({
    where: {
      token: tokenValue,
      is_active: true,
      expires_at: { [Op.gt]: new Date() },
    },
    include: [
      { model: Profile, as: 'profile', attributes: ['id', 'nombre', 'rfc'] },
      { model: User, as: 'user', attributes: ['logo_url', 'nombre_comercial'] },
    ],
  });

  const profile = record?.get('profile') as Profile | undefined;
  const user = record?.get('user') as User | undefined;
  if (!record || !profile || !user) {
    return null;
  }

  const now = new Date();
  const mes = now.getMonth() + 1;
  const año = now.getFullYear();
  const start = new Date(año, mes - 1, 1, 0, 0, 0);
  const end = new Date(año, mes, 1, 0, 0, 0);

  let metrics = null;
  try {
    metrics = await metricsService.getMetricsByDateRange(profile.id, start, end);
  } catch {
    // Si falla el cálculo de métricas, devolver null en metrics
  }

  return {
    branding: {
      logo_url: user.logo_url ?? null,
      nombre_comercial: user.nombre_comercial ?? null,
    },
    profile: {
      id: profile.id,
      nombre: profile.nombre,
      rfc: profile.rfc,
    },
    metrics,
  };
}

/**
 * Revoca un token (lo desactiva). Solo el usuario dueño puede revocarlo.
 */
export async function revokeToken(tokenValue: string, userId: string): Promise<boolean> {
  const record = await PublicReportToken.findOne({
    where: { token: tokenValue, user_id: userId },
  });
  if (!record) {
    return false;
  }
  await record.update({ is_active: false });
  return true;
}

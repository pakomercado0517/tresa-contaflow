import { randomUUID } from 'crypto';
import { Op } from 'sequelize';
import { PublicReportToken, Profile, User } from '../database/models/index.js';
import { MetricsService } from './metrics.service.js';
import { taxEstimateService } from './tax-estimate.service.js';
import { loadFiscalSettingsSnapshot } from './profile-fiscal.service.js';
import type { PeriodMetricsResponse } from '../types/metrics.types.js';
import type {
  PublicReportResponse,
  GenerateTokenResponse,
  MetricsByRegimen,
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
export async function getPublicData(
  tokenValue: string,
  mes?: number,
  año?: number
): Promise<PublicReportResponse | null> {
  const record = await PublicReportToken.findOne({
    where: {
      token: tokenValue,
      is_active: true,
      expires_at: { [Op.gt]: new Date() },
    },
    include: [
      { model: Profile, as: 'profile', attributes: ['id', 'nombre', 'rfc', 'tipo_persona', 'regimenes_fiscales'] },
      { model: User, as: 'user', attributes: ['logo_url', 'nombre_comercial'] },
    ],
  });

  const profile = record?.get('profile') as Profile | undefined;
  const user = record?.get('user') as User | undefined;
  if (!record || !profile || !user) {
    return null;
  }

  const now = new Date();
  const resolvedMes = mes ?? now.getMonth() + 1;
  const resolvedAño = año ?? now.getFullYear();
  const start = new Date(resolvedAño, resolvedMes - 1, 1, 0, 0, 0);
  const end = new Date(resolvedAño, resolvedMes, 1, 0, 0, 0);

  let metrics: PeriodMetricsResponse | null = null;
  let metrics_by_regimen: MetricsByRegimen[] = [];

  const regimenes = profile.regimenes_fiscales ?? [];

  try {
    const [totalMetrics, ...perRegimenMetrics] = await Promise.all([
      metricsService.getMetricsByDateRange(profile.id, start, end),
      ...regimenes.map((r) =>
        metricsService.getMetricsByDateRange(profile.id, start, end, r).catch(() => null)
      ),
    ]);
    metrics = totalMetrics;
    const metricsRows = regimenes.map((r, i) => ({
      regimen: r,
      metrics: perRegimenMetrics[i] ?? null,
    }));
    const tipoPersona = profile.tipo_persona === 'MORAL' ? 'MORAL' : 'FISICA';
    const fiscalSettings = await loadFiscalSettingsSnapshot(profile.id, resolvedAño);
    const withEstimates = await taxEstimateService.estimateFromMetricsByRegimen(
      profile.id,
      tipoPersona,
      resolvedMes,
      resolvedAño,
      metricsRows,
      fiscalSettings
    );
    metrics_by_regimen = withEstimates.map((row, i) => ({
      regimen: row.regimen,
      metrics: metricsRows[i]?.metrics ?? null,
      tax_estimate: row.tax_estimate,
    }));
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
      regimenes_fiscales: regimenes,
    },
    metrics,
    metrics_by_regimen,
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

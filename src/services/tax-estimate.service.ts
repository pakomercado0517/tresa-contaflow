import { Profile, Period } from '../database/models/index.js';
import { MetricsService } from './metrics.service.js';
import { buildTaxEstimate } from '../lib/tax-estimate/index.js';
import {
  buildResicoLimiteAnualAlert,
  buildResicoPmLimiteAnualAlert,
} from '../lib/tax-estimate/alerts.js';
import { loadFiscalSettingsSnapshot } from './profile-fiscal.service.js';
import {
  REGIMEN_ACTIVIDAD_EMPRESARIAL,
  REGIMEN_GENERAL_PM,
  REGIMEN_RESICO,
  RESICO_PF_ANNUAL_INCOME_LIMIT,
  RESICO_PM_ANNUAL_INCOME_LIMIT,
} from '../constants/tax-estimate.constants.js';
import type { ProfileFiscalSettingsSnapshot } from '../types/profile-fiscal.types.js';
import type { PeriodMetricsResponse } from '../types/metrics.types.js';
import type {
  BuildTaxEstimateOptions,
  TaxEstimateByRegimen,
  TaxEstimateContext,
  TaxEstimateListResponse,
  TaxEstimateResult,
  TipoPersonaFiscal,
} from '../types/tax-estimate.types.js';

export class TaxEstimateServiceError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly statusCode: number
  ) {
    super(message);
    this.name = 'TaxEstimateServiceError';
  }
}

function getMonthDateRange(mes: number, año: number): { start: Date; end: Date } {
  const start = new Date(año, mes - 1, 1, 0, 0, 0);
  const end = new Date(año, mes, 1, 0, 0, 0);
  return { start, end };
}

function getYearToDateRange(mes: number, ejercicio: number): { start: Date; end: Date } {
  const start = new Date(ejercicio, 0, 1, 0, 0, 0);
  const end = new Date(ejercicio, mes, 1, 0, 0, 0);
  return { start, end };
}

function mesFromPeriodStart(startDate: Date): { mes: number; ejercicio: number } {
  const mes = startDate.getMonth() + 1;
  const ejercicio = startDate.getFullYear();
  return { mes, ejercicio };
}

function needsYtdMetrics(regimen: string, tipoPersona: TipoPersonaFiscal): boolean {
  if (regimen === REGIMEN_RESICO && (tipoPersona === 'FISICA' || tipoPersona === 'MORAL')) {
    return true;
  }
  if (regimen === REGIMEN_ACTIVIDAD_EMPRESARIAL && tipoPersona === 'FISICA') {
    return true;
  }
  if (regimen === REGIMEN_GENERAL_PM && tipoPersona === 'MORAL') {
    return true;
  }
  return false;
}

export class TaxEstimateService {
  constructor(private readonly metricsService: MetricsService = new MetricsService()) {}

  estimateFromMetrics(
    metrics: PeriodMetricsResponse,
    context: TaxEstimateContext,
    options: BuildTaxEstimateOptions = {}
  ): TaxEstimateResult {
    let result = buildTaxEstimate(metrics, context, options);

    if (
      context.regimen === REGIMEN_RESICO &&
      context.tipoPersona === 'FISICA' &&
      options.ingresosCobradosAcumulados != null &&
      options.ingresosCobradosAcumulados > RESICO_PF_ANNUAL_INCOME_LIMIT
    ) {
      result = {
        ...result,
        alerts: [...result.alerts, buildResicoLimiteAnualAlert()],
      };
    }

    if (
      context.regimen === REGIMEN_RESICO &&
      context.tipoPersona === 'MORAL' &&
      options.ytdMetrics != null &&
      options.ytdMetrics.flujo.ingresos_cobrados > RESICO_PM_ANNUAL_INCOME_LIMIT
    ) {
      result = {
        ...result,
        alerts: [...result.alerts, buildResicoPmLimiteAnualAlert()],
      };
    }

    return result;
  }

  async estimateForProfileMonth(
    profileId: string,
    mes: number,
    año: number,
    regimenFiscal?: string
  ): Promise<TaxEstimateListResponse> {
    const profile = await Profile.findByPk(profileId, {
      attributes: ['id', 'tipo_persona', 'regimenes_fiscales'],
    });
    if (!profile) {
      throw new TaxEstimateServiceError('Perfil no encontrado', 'PROFILE_NOT_FOUND', 404);
    }

    const regimenes = profile.regimenes_fiscales ?? [];
    const targets = regimenFiscal ? [regimenFiscal] : regimenes;

    if (regimenFiscal && !regimenes.includes(regimenFiscal)) {
      throw new TaxEstimateServiceError(
        `El perfil no incluye el régimen ${regimenFiscal}`,
        'REGIMEN_NOT_IN_PROFILE',
        400
      );
    }

    const { start, end } = getMonthDateRange(mes, año);
    const tipoPersona = profile.tipo_persona as TipoPersonaFiscal;
    const fiscalSettings = await loadFiscalSettingsSnapshot(profileId, año);

    const estimates = await Promise.all(
      targets.map((regimen) =>
        this.buildEstimateForRegimen(
          profileId,
          regimen,
          tipoPersona,
          mes,
          año,
          start,
          end,
          fiscalSettings
        )
      )
    );

    return {
      success: true,
      meta: {
        profile_id: profileId,
        ejercicio: año,
        mes,
        period: { id: '', start, end },
      },
      estimates,
    };
  }

  async estimateForPeriod(
    profileId: string,
    periodId: string,
    regimenFiscal?: string
  ): Promise<TaxEstimateListResponse> {
    const period = await Period.findOne({
      where: { id: periodId, profile_id: profileId },
      attributes: ['id', 'start_date', 'end_date'],
    });
    if (!period) {
      throw new TaxEstimateServiceError('Período no encontrado', 'PERIOD_NOT_FOUND', 404);
    }

    const startDate =
      period.start_date instanceof Date ? period.start_date : new Date(period.start_date);
    const { mes, ejercicio } = mesFromPeriodStart(startDate);

    const profile = await Profile.findByPk(profileId, {
      attributes: ['id', 'tipo_persona', 'regimenes_fiscales'],
    });
    if (!profile) {
      throw new TaxEstimateServiceError('Perfil no encontrado', 'PROFILE_NOT_FOUND', 404);
    }

    const regimenes = profile.regimenes_fiscales ?? [];
    const targets = regimenFiscal ? [regimenFiscal] : regimenes;

    if (regimenFiscal && !regimenes.includes(regimenFiscal)) {
      throw new TaxEstimateServiceError(
        `El perfil no incluye el régimen ${regimenFiscal}`,
        'REGIMEN_NOT_IN_PROFILE',
        400
      );
    }

    const tipoPersona = profile.tipo_persona as TipoPersonaFiscal;
    const fiscalSettings = await loadFiscalSettingsSnapshot(profileId, ejercicio);
    const endDate =
      period.end_date instanceof Date ? period.end_date : new Date(period.end_date);

    const estimates = await Promise.all(
      targets.map(async (regimen) => {
        const metrics = await this.metricsService
          .getMetricsForPeriod(profileId, periodId, regimen)
          .catch(() => null);
        const tax_estimate = await this.estimateFromMetricsWithYtd(
          profileId,
          regimen,
          tipoPersona,
          mes,
          ejercicio,
          metrics,
          fiscalSettings
        );
        return { regimen, tax_estimate };
      })
    );

    return {
      success: true,
      meta: {
        profile_id: profileId,
        ejercicio,
        mes,
        period: { id: period.id, start: startDate, end: endDate },
      },
      estimates,
    };
  }

  /**
   * Calcula estimados para métricas ya cargadas (reporte público, sin reconsultar métricas del mes).
   */
  async estimateFromMetricsByRegimen(
    profileId: string,
    tipoPersona: TipoPersonaFiscal,
    mes: number,
    ejercicio: number,
    items: Array<{ regimen: string; metrics: PeriodMetricsResponse | null }>,
    fiscalSettings?: ProfileFiscalSettingsSnapshot
  ): Promise<TaxEstimateByRegimen[]> {
    const resolvedFiscal =
      fiscalSettings ?? (await loadFiscalSettingsSnapshot(profileId, ejercicio));

    return Promise.all(
      items.map(async (item) => {
        if (!item.metrics) {
          return { regimen: item.regimen, tax_estimate: null };
        }
        const tax_estimate = await this.estimateFromMetricsWithYtd(
          profileId,
          item.regimen,
          tipoPersona,
          mes,
          ejercicio,
          item.metrics,
          resolvedFiscal
        );
        return { regimen: item.regimen, tax_estimate };
      })
    );
  }

  private async buildEstimateForRegimen(
    profileId: string,
    regimen: string,
    tipoPersona: TipoPersonaFiscal,
    mes: number,
    ejercicio: number,
    start: Date,
    end: Date,
    fiscalSettings: ProfileFiscalSettingsSnapshot
  ): Promise<TaxEstimateByRegimen> {
    let metrics: PeriodMetricsResponse | null = null;
    try {
      metrics = await this.metricsService.getMetricsByDateRange(profileId, start, end, regimen);
    } catch {
      metrics = null;
    }
    const tax_estimate = await this.estimateFromMetricsWithYtd(
      profileId,
      regimen,
      tipoPersona,
      mes,
      ejercicio,
      metrics,
      fiscalSettings
    );
    return { regimen, tax_estimate };
  }

  private async fetchYtdMetrics(
    profileId: string,
    mes: number,
    ejercicio: number,
    regimen: string
  ): Promise<PeriodMetricsResponse | null> {
    const ytd = getYearToDateRange(mes, ejercicio);
    try {
      return await this.metricsService.getMetricsByDateRange(
        profileId,
        ytd.start,
        ytd.end,
        regimen
      );
    } catch {
      return null;
    }
  }

  private async estimateFromMetricsWithYtd(
    profileId: string,
    regimen: string,
    tipoPersona: TipoPersonaFiscal,
    mes: number,
    ejercicio: number,
    metrics: PeriodMetricsResponse | null,
    fiscalSettings: ProfileFiscalSettingsSnapshot
  ): Promise<TaxEstimateResult | null> {
    if (!metrics) {
      return null;
    }

    const context: TaxEstimateContext = {
      regimen,
      tipoPersona,
      ejercicio,
      mes,
    };

    const buildOptions: BuildTaxEstimateOptions = {
      fiscalSettings,
    };

    if (needsYtdMetrics(regimen, tipoPersona)) {
      const ytdMetrics = await this.fetchYtdMetrics(profileId, mes, ejercicio, regimen);
      if (ytdMetrics) {
        buildOptions.ytdMetrics = ytdMetrics;
        if (regimen === REGIMEN_RESICO && tipoPersona === 'FISICA') {
          buildOptions.ingresosCobradosAcumulados = ytdMetrics.flujo.ingresos_cobrados;
        }
      }
    }

    return this.estimateFromMetrics(metrics, context, buildOptions);
  }
}

export const taxEstimateService = new TaxEstimateService();

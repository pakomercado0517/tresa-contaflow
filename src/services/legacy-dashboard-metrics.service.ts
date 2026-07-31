import type { GetMetricsFilters, GetMetricsResponse } from '../types/invoice-crud.types.js';
import { mapPeriodMetricsResponseToLegacy } from '../lib/legacy-metrics.mapper.js';
import { AppError } from '../utils/AppError.js';
import { getMetricsForMonthYear } from './metrics.service.js';
import { validateProfileAndRegimenService } from './metrics-report.service.js';

/**
 * @deprecated Usar GET /api/metrics?mes=&año=&profile_id=
 * Delega al stack consolidado de métricas y adapta la respuesta al formato legacy
 * usado por GET /api/invoices/metrics y GET /api/expenses/metrics.
 */
export const getLegacyDashboardMetricsService = async (
  userId: string,
  filters: GetMetricsFilters
): Promise<GetMetricsResponse> => {
  const { profileId, mes, año } = filters;

  if (mes === undefined || año === undefined) {
    throw new AppError(
      'Los parámetros mes y año son requeridos. Use GET /api/metrics?mes=&año=&profile_id=',
      400
    );
  }

  await validateProfileAndRegimenService(userId, profileId, undefined);

  const result = await getMetricsForMonthYear(userId, mes, año, profileId);

  if (!result) {
    throw new AppError('No se pudieron calcular las métricas', 404);
  }

  const periodId =
    profileId !== undefined && result.period.id !== '' && result.period.id !== 'aggregated'
      ? result.period.id
      : null;

  return {
    filters: {
      profileId: profileId ?? null,
      mes,
      año,
    },
    period_id: periodId,
    metrics: mapPeriodMetricsResponseToLegacy(result),
  };
};

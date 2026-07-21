import type { NextFunction, Response } from 'express';
import type { AuthRequest } from '../middlewares/auth.middleware.js';
import {
  getMetricsForMonthYear,
  getMetricsForMonthYearRange,
} from '../services/metrics.service.js';
import {
  getMetricsByPeriodIdService,
  validateProfileAndRegimenService,
} from '../services/metrics-report.service.js';
import { AppError } from '../utils/AppError.js';
import { optionalQueryString, requiredQueryInt } from '../utils/query.util.js';

function isRangeQuery(req: AuthRequest): boolean {
  const q = req.query;
  return (
    q.mes_desde !== undefined ||
    q.año_desde !== undefined ||
    q.mes_hasta !== undefined ||
    q.año_hasta !== undefined
  );
}

/**
 * GET /api/metrics?mes=&año=&profile_id=
 * GET /api/metrics?mes_desde=&año_desde=&mes_hasta=&año_hasta=&profile_id=
 * Retorna métricas por mes/año o por rango de meses.
 */
export async function getMetricsByMonthYear(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) throw new AppError('Usuario no autenticado', 401);

    const profileId = optionalQueryString(req.query.profile_id);
    const regimenFiscal = optionalQueryString(req.query.regimen_fiscal);

    await validateProfileAndRegimenService(userId, profileId, regimenFiscal);

    if (isRangeQuery(req)) {
      const mesDesde = requiredQueryInt(req.query.mes_desde);
      const añoDesde = requiredQueryInt(req.query.año_desde);
      const mesHasta = requiredQueryInt(req.query.mes_hasta);
      const añoHasta = requiredQueryInt(req.query.año_hasta);

      const result = await getMetricsForMonthYearRange(
        userId,
        mesDesde,
        añoDesde,
        mesHasta,
        añoHasta,
        profileId ?? undefined,
        regimenFiscal ?? undefined
      );

      if (!result) throw new AppError('No se pudieron calcular las métricas', 404);

      res.json(result);
      return;
    }

    const mesNum = requiredQueryInt(req.query.mes);
    const añoNum = requiredQueryInt(req.query.año);

    const result = await getMetricsForMonthYear(
      userId,
      mesNum,
      añoNum,
      profileId ?? undefined,
      regimenFiscal ?? undefined
    );

    if (!result) throw new AppError('No se pudieron calcular las métricas', 404);

    res.json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/metrics/:period_id
 * Retorna métricas consolidadas del período (por period_id). Valida que el período pertenezca al usuario.
 * Query opcional: regimen_fiscal (clave SAT 3 dígitos) para filtrar facturas y gastos por régimen.
 */
export async function getMetricsByPeriodId(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.userId;
    if (!userId) throw new AppError('Usuario no autenticado', 401);

    const periodIdRaw = req.params.period_id;
    const periodId = Array.isArray(periodIdRaw) ? periodIdRaw[0] : periodIdRaw;
    if (!periodId) throw new AppError('period_id es requerido', 400);

    const regimenFiscal = optionalQueryString(req.query.regimen_fiscal);

    const result = await getMetricsByPeriodIdService(userId, periodId, regimenFiscal);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

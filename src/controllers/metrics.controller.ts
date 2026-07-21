import type { NextFunction, Response } from 'express';
import type { AuthRequest } from '../middlewares/auth.middleware.js';
import { Period, Profile } from '../database/models/index.js';
import {
  getMetricsForMonthYear,
  getMetricsForMonthYearRange,
  getMetricsForPeriod,
} from '../services/metrics.service.js';
import { validateProfileAndRegimenService } from '../services/metrics-report.service.js';
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
export async function getMetricsByPeriodId(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Usuario no autenticado' });
      return;
    }

    const periodIdRaw = req.params.period_id;
    const periodId = Array.isArray(periodIdRaw) ? periodIdRaw[0] : periodIdRaw;
    if (!periodId) {
      res.status(400).json({ error: 'period_id es requerido' });
      return;
    }

    const regimenFiscal = req.query.regimen_fiscal as string | undefined;

    const period = await Period.findOne({
      where: { id: periodId },
      include: [
        {
          model: Profile,
          as: 'profile',
          where: { user_id: userId },
          attributes: ['id', 'regimenes_fiscales'],
        },
      ],
      attributes: ['id', 'profile_id', 'start_date', 'end_date'],
    });

    if (!period) {
      res.status(404).json({ error: 'Período no encontrado o no pertenece al usuario' });
      return;
    }

    if (regimenFiscal && typeof regimenFiscal === 'string') {
      const periodWithProfile = period as Period & { profile?: Profile };
      const regimenes = periodWithProfile.profile?.regimenes_fiscales ?? [];
      if (!regimenes.includes(regimenFiscal)) {
        res.status(400).json({
          error: 'El perfil no tiene el régimen fiscal indicado',
          message: `El perfil no incluye el régimen ${regimenFiscal}. Régimenes del perfil: ${
            regimenes.join(', ') || 'ninguno'
          }`,
        });
        return;
      }
    }

    const result = await getMetricsForPeriod(
      period.profile_id,
      periodId,
      regimenFiscal ?? undefined
    );

    if (!result) {
      res.status(404).json({ error: 'No se pudieron calcular las métricas del período' });
      return;
    }

    res.json(result);
  } catch (error) {
    console.error('Error al obtener métricas por período:', error);
    res.status(500).json({
      error: 'Error al obtener métricas',
      message: error instanceof Error ? error.message : 'Error desconocido',
    });
  }
}

import type { Response } from 'express';
import type { AuthRequest } from '../middlewares/auth.middleware.js';
import { Profile, Period } from '../database/models/index.js';
import {
  taxEstimateService,
  TaxEstimateServiceError,
} from '../services/tax-estimate.service.js';
import {
  listTaxEstimateHistory,
  persistEstimatesFromList,
} from '../services/tax-estimate-persistence.service.js';
import type { TaxEstimateListResponse } from '../types/tax-estimate.types.js';

function parsePersistQuery(raw: unknown): boolean {
  if (raw === undefined || raw === null || raw === '') {
    return true;
  }
  if (raw === true || raw === 'true') {
    return true;
  }
  if (raw === false || raw === 'false') {
    return false;
  }
  return true;
}

async function attachPersistenceMeta(
  profileId: string,
  result: TaxEstimateListResponse,
  persist: boolean,
  periodId?: string
): Promise<TaxEstimateListResponse> {
  if (!persist) {
    return {
      ...result,
      meta: {
        ...result.meta,
        persist_skipped: true,
        persisted_count: 0,
      },
    };
  }

  const persisted_count = await persistEstimatesFromList(profileId, result.estimates, {
    periodId: periodId ?? null,
  });

  return {
    ...result,
    meta: {
      ...result.meta,
      persisted_count,
      persist_skipped: false,
    },
  };
}

/**
 * GET /api/tax-estimates?profile_id=&mes=&año=&regimen_fiscal=
 */
export async function getTaxEstimatesByMonthYear(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Usuario no autenticado' });
      return;
    }

    const profileId = req.query.profile_id as string | undefined;
    const mesRaw = req.query.mes;
    const añoRaw = req.query.año;
    const regimenFiscal = req.query.regimen_fiscal as string | undefined;

    if (!profileId) {
      res.status(400).json({ error: 'profile_id es requerido' });
      return;
    }

    const mes = typeof mesRaw === 'string' ? parseInt(mesRaw, 10) : NaN;
    const año = typeof añoRaw === 'string' ? parseInt(añoRaw, 10) : NaN;

    const profile = await Profile.findOne({
      where: { id: profileId, user_id: userId },
      attributes: ['id'],
    });
    if (!profile) {
      res.status(404).json({ error: 'Perfil no encontrado o no pertenece al usuario' });
      return;
    }

    const result = await taxEstimateService.estimateForProfileMonth(
      profileId,
      mes,
      año,
      regimenFiscal
    );
    const persist = parsePersistQuery(req.query.persist);
    const response = await attachPersistenceMeta(profileId, result, persist);
    res.json(response);
  } catch (error) {
    if (error instanceof TaxEstimateServiceError) {
      res.status(error.statusCode).json({ error: error.message, code: error.code });
      return;
    }
    console.error('Error al obtener estimación fiscal:', error);
    res.status(500).json({
      error: 'Error al obtener estimación fiscal',
      message: error instanceof Error ? error.message : 'Error desconocido',
    });
  }
}

/**
 * GET /api/tax-estimates/period/:period_id?regimen_fiscal=
 */
export async function getTaxEstimatesByPeriodId(req: AuthRequest, res: Response): Promise<void> {
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
          attributes: ['id'],
        },
      ],
      attributes: ['id', 'profile_id'],
    });

    if (!period) {
      res.status(404).json({ error: 'Período no encontrado o no pertenece al usuario' });
      return;
    }

    const result = await taxEstimateService.estimateForPeriod(
      period.profile_id,
      periodId,
      regimenFiscal
    );
    const persist = parsePersistQuery(req.query.persist);
    const response = await attachPersistenceMeta(
      period.profile_id,
      result,
      persist,
      periodId
    );
    res.json(response);
  } catch (error) {
    if (error instanceof TaxEstimateServiceError) {
      res.status(error.statusCode).json({ error: error.message, code: error.code });
      return;
    }
    console.error('Error al obtener estimación fiscal por período:', error);
    res.status(500).json({
      error: 'Error al obtener estimación fiscal por período',
      message: error instanceof Error ? error.message : 'Error desconocido',
    });
  }
}

/**
 * GET /api/tax-estimates/history?profile_id=&ejercicio=&regimen_fiscal=
 */
export async function getTaxEstimateHistory(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Usuario no autenticado' });
      return;
    }

    const profileId = req.query.profile_id as string | undefined;
    const ejercicioRaw = req.query.ejercicio;
    const regimenFiscal = req.query.regimen_fiscal as string | undefined;

    if (!profileId) {
      res.status(400).json({ error: 'profile_id es requerido' });
      return;
    }

    const ejercicio =
      typeof ejercicioRaw === 'string' ? parseInt(ejercicioRaw, 10) : NaN;
    if (Number.isNaN(ejercicio) || ejercicio < 2000 || ejercicio > 2100) {
      res.status(400).json({
        error: 'ejercicio es requerido y debe ser un año válido (2000-2100)',
      });
      return;
    }

    const profile = await Profile.findOne({
      where: { id: profileId, user_id: userId },
      attributes: ['id'],
    });
    if (!profile) {
      res.status(404).json({ error: 'Perfil no encontrado o no pertenece al usuario' });
      return;
    }

    const snapshots = await listTaxEstimateHistory(profileId, ejercicio, regimenFiscal);
    res.json({
      success: true,
      meta: {
        profile_id: profileId,
        ejercicio,
        ...(regimenFiscal !== undefined ? { regimen: regimenFiscal } : {}),
      },
      snapshots,
    });
  } catch (error) {
    console.error('Error al obtener historial de estimaciones fiscales:', error);
    res.status(500).json({
      error: 'Error al obtener historial de estimaciones fiscales',
      message: error instanceof Error ? error.message : 'Error desconocido',
    });
  }
}

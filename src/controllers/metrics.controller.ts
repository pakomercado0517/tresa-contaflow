import type { Response } from "express";
import type { AuthRequest } from "../middlewares/auth.middleware.js";
import { Period, Profile } from "../database/models/index.js";
import { MetricsRangeError, MetricsService } from "../services/metrics.service.js";

const metricsService = new MetricsService();

function parseQueryInt(value: unknown): number | undefined {
  if (typeof value !== "string" || value === "") {
    return undefined;
  }
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function isRangeQuery(req: AuthRequest): boolean {
  const q = req.query;
  return (
    q.mes_desde !== undefined ||
    q.año_desde !== undefined ||
    q.mes_hasta !== undefined ||
    q.año_hasta !== undefined
  );
}

async function validateProfileAndRegimen(
  userId: string,
  profileId: string | undefined,
  regimenFiscal: string | undefined,
  res: Response
): Promise<boolean> {
  if (profileId == null || typeof profileId !== "string") {
    return true;
  }

  const profile = await Profile.findOne({
    where: { id: profileId, user_id: userId },
    attributes: ["id", "regimenes_fiscales"],
  });
  if (!profile) {
    res.status(404).json({ error: "Perfil no encontrado o no pertenece al usuario" });
    return false;
  }

  if (regimenFiscal && typeof regimenFiscal === "string") {
    const regimenes = profile.regimenes_fiscales ?? [];
    if (!regimenes.includes(regimenFiscal)) {
      res.status(400).json({
        error: "El perfil no tiene el régimen fiscal indicado",
        message: `El perfil no incluye el régimen ${regimenFiscal}. Régimenes del perfil: ${regimenes.join(", ") || "ninguno"}`,
      });
      return false;
    }
  }

  return true;
}

/**
 * GET /api/metrics?mes=&año=&profile_id=
 * GET /api/metrics?mes_desde=&año_desde=&mes_hasta=&año_hasta=&profile_id=
 * Retorna métricas por mes/año o por rango de meses.
 */
export async function getMetricsByMonthYear(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Usuario no autenticado" });
      return;
    }

    const profileId = req.query.profile_id as string | undefined;
    const regimenFiscal = req.query.regimen_fiscal as string | undefined;

    const profileOk = await validateProfileAndRegimen(userId, profileId, regimenFiscal, res);
    if (!profileOk) {
      return;
    }

    if (isRangeQuery(req)) {
      const mesDesde = parseQueryInt(req.query.mes_desde);
      const añoDesde = parseQueryInt(req.query.año_desde);
      const mesHasta = parseQueryInt(req.query.mes_hasta);
      const añoHasta = parseQueryInt(req.query.año_hasta);

      if (
        mesDesde == null ||
        añoDesde == null ||
        mesHasta == null ||
        añoHasta == null
      ) {
        res.status(400).json({ error: "Parámetros de rango inválidos" });
        return;
      }

      const result = await metricsService.getMetricsForMonthYearRange(
        userId,
        mesDesde,
        añoDesde,
        mesHasta,
        añoHasta,
        profileId ?? undefined,
        regimenFiscal ?? undefined
      );

      if (!result) {
        res.status(404).json({ error: "No se pudieron calcular las métricas" });
        return;
      }

      res.json(result);
      return;
    }

    const mesNum = parseQueryInt(req.query.mes);
    const añoNum = parseQueryInt(req.query.año);

    if (mesNum == null || mesNum < 1 || mesNum > 12) {
      res.status(400).json({ error: "mes es requerido y debe ser un número entre 1 y 12" });
      return;
    }
    if (añoNum == null || añoNum < 2000 || añoNum > 2100) {
      res.status(400).json({ error: "año es requerido y debe ser un año válido" });
      return;
    }

    const result = await metricsService.getMetricsForMonthYear(
      userId,
      mesNum,
      añoNum,
      profileId ?? undefined,
      regimenFiscal ?? undefined
    );

    if (!result) {
      res.status(404).json({ error: "No se pudieron calcular las métricas" });
      return;
    }

    res.json(result);
  } catch (error) {
    if (error instanceof MetricsRangeError) {
      if (error.code === "RANGE_TOO_LARGE") {
        res.status(400).json({ error: error.message });
        return;
      }
    }
    console.error("Error al obtener métricas por mes/año:", error);
    res.status(500).json({
      error: "Error al obtener métricas",
      message: error instanceof Error ? error.message : "Error desconocido",
    });
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
      res.status(401).json({ error: "Usuario no autenticado" });
      return;
    }

    const periodIdRaw = req.params.period_id;
    const periodId = Array.isArray(periodIdRaw) ? periodIdRaw[0] : periodIdRaw;
    if (!periodId) {
      res.status(400).json({ error: "period_id es requerido" });
      return;
    }

    const regimenFiscal = req.query.regimen_fiscal as string | undefined;

    const period = await Period.findOne({
      where: { id: periodId },
      include: [
        {
          model: Profile,
          as: "profile",
          where: { user_id: userId },
          attributes: ["id", "regimenes_fiscales"],
        },
      ],
      attributes: ["id", "profile_id", "start_date", "end_date"],
    });

    if (!period) {
      res.status(404).json({ error: "Período no encontrado o no pertenece al usuario" });
      return;
    }

    if (regimenFiscal && typeof regimenFiscal === "string") {
      const periodWithProfile = period as Period & { profile?: Profile };
      const regimenes = periodWithProfile.profile?.regimenes_fiscales ?? [];
      if (!regimenes.includes(regimenFiscal)) {
        res.status(400).json({
          error: "El perfil no tiene el régimen fiscal indicado",
          message: `El perfil no incluye el régimen ${regimenFiscal}. Régimenes del perfil: ${regimenes.join(", ") || "ninguno"}`,
        });
        return;
      }
    }

    const result = await metricsService.getMetricsForPeriod(
      period.profile_id,
      periodId,
      regimenFiscal ?? undefined
    );

    if (!result) {
      res.status(404).json({ error: "No se pudieron calcular las métricas del período" });
      return;
    }

    res.json(result);
  } catch (error) {
    console.error("Error al obtener métricas por período:", error);
    res.status(500).json({
      error: "Error al obtener métricas",
      message: error instanceof Error ? error.message : "Error desconocido",
    });
  }
}

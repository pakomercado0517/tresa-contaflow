import type { Response } from "express";
import type { AuthRequest } from "../middlewares/auth.middleware.js";
import { Period, Profile } from "../database/models/index.js";
import { MetricsService } from "../services/metrics.service.js";

const metricsService = new MetricsService();

/**
 * GET /api/metrics?mes=&año=&profile_id=
 * Retorna métricas por mes/año: sin profile_id = todos los perfiles agregados; con profile_id = un perfil.
 * Una sola petición para dashboard (todos) o selector (un cliente).
 */
export async function getMetricsByMonthYear(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Usuario no autenticado" });
      return;
    }

    const mes = req.query.mes;
    const año = req.query.año;
    const profileId = req.query.profile_id as string | undefined;
    const regimenFiscal = req.query.regimen_fiscal as string | undefined;

    const mesNum = typeof mes === "string" ? parseInt(mes, 10) : undefined;
    const añoNum = typeof año === "string" ? parseInt(año, 10) : undefined;

    if (mesNum == null || isNaN(mesNum) || mesNum < 1 || mesNum > 12) {
      res.status(400).json({ error: "mes es requerido y debe ser un número entre 1 y 12" });
      return;
    }
    if (añoNum == null || isNaN(añoNum) || añoNum < 2000 || añoNum > 2100) {
      res.status(400).json({ error: "año es requerido y debe ser un año válido" });
      return;
    }

    if (profileId != null && typeof profileId === "string") {
      const profile = await Profile.findOne({
        where: { id: profileId, user_id: userId },
        attributes: ["id", "regimenes_fiscales"],
      });
      if (!profile) {
        res.status(404).json({ error: "Perfil no encontrado o no pertenece al usuario" });
        return;
      }
      if (regimenFiscal && typeof regimenFiscal === "string") {
        const regimenes = profile.regimenes_fiscales ?? [];
        if (!regimenes.includes(regimenFiscal)) {
          res.status(400).json({
            error: "El perfil no tiene el régimen fiscal indicado",
            message: `El perfil no incluye el régimen ${regimenFiscal}. Régimenes del perfil: ${regimenes.join(", ") || "ninguno"}`,
          });
          return;
        }
      }
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

    const period = await Period.findOne({
      where: { id: periodId },
      include: [{ model: Profile, as: "profile", where: { user_id: userId }, attributes: ["id"] }],
      attributes: ["id", "profile_id", "start_date", "end_date"],
    });

    if (!period) {
      res.status(404).json({ error: "Período no encontrado o no pertenece al usuario" });
      return;
    }

    const result = await metricsService.getMetrics(period.profile_id, periodId);

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

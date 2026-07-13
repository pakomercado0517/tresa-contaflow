import type { Response } from "express";
import type { AuthRequest } from "../middlewares/auth.middleware.js";
import { Payroll, Profile, Period } from "../database/models/index.js";
import { uploadPayrollXML } from "../services/payroll.service.js";
import { invalidateProfileCache } from "../services/cache.service.js";
import type { UploadedFile } from "express-fileupload";
import { Op } from "sequelize";

/**
 * POST /api/payrolls/upload - Sube XML de nómina.
 * Body (form): profile_id, period_id, archivo xml (campo "xml").
 */
export async function uploadPayroll(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Usuario no autenticado" });
      return;
    }

    const profileId = req.body.profile_id as string | undefined;
    const periodId = req.body.period_id as string | undefined;
    if (!profileId || typeof profileId !== "string") {
      res.status(400).json({ error: "profile_id es requerido" });
      return;
    }
    if (!periodId || typeof periodId !== "string") {
      res.status(400).json({ error: "period_id es requerido" });
      return;
    }

    const profile = await Profile.findOne({
      where: { id: profileId, user_id: userId },
    });
    if (!profile) {
      res.status(404).json({ error: "Perfil no encontrado o no pertenece al usuario" });
      return;
    }

    if (!req.files || !req.files.xml) {
      res.status(400).json({ error: "No se proporcionó archivo XML" });
      return;
    }

    const file = req.files.xml as UploadedFile;
    if (!file.name.toLowerCase().endsWith(".xml")) {
      res.status(400).json({ error: "El archivo debe ser un XML" });
      return;
    }

    const xmlBuffer = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data as ArrayBuffer);

    const payroll = await uploadPayrollXML(profileId, periodId, xmlBuffer);
    res.status(201).json({ message: "Nómina registrada", data: payroll });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al subir nómina";
    if (
      message === "El perfil no tiene habilitado el plugin de nómina" ||
      message.includes("plugin de nómina")
    ) {
      res.status(403).json({ error: message });
      return;
    }
    if (
      message === "Perfil no encontrado" ||
      message === "Período no encontrado o no pertenece al perfil"
    ) {
      res.status(404).json({ error: message });
      return;
    }
    if (message.includes("UUID") && message.includes("Ya existe")) {
      res.status(409).json({ error: message });
      return;
    }
    if (
      message.includes("complemento de nómina") ||
      message.includes("Comprobante CFDI") ||
      message.includes("Fecha de pago")
    ) {
      res.status(400).json({ error: message });
      return;
    }
    console.error("Error al subir nómina:", error);
    res.status(500).json({ error: "Error al subir nómina", message });
  }
}

/**
 * GET /api/payrolls - Lista nóminas.
 * Query: period_id (opcional), profile_id (opcional).
 * Si no se pasa profile_id se listan nóminas de todos los perfiles del usuario.
 */
export async function getPayrolls(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Usuario no autenticado" });
      return;
    }

    const periodId = req.query.period_id as string | undefined;
    const profileId = req.query.profile_id as string | undefined;

    const profileIds = await Profile.findAll({
      where: { user_id: userId },
      attributes: ["id"],
    }).then((rows) => rows.map((p) => p.id));

    if (profileIds.length === 0) {
      res.json({ data: [] });
      return;
    }

    const where: {
      profile_id: string | { [Op.in]: string[] };
      period_id?: string;
    } = {
      profile_id: { [Op.in]: profileIds },
    };

    if (profileId && typeof profileId === "string") {
      if (!profileIds.includes(profileId)) {
        res.status(404).json({ error: "Perfil no encontrado o no pertenece al usuario" });
        return;
      }
      where.profile_id = profileId;
    }

    if (periodId && typeof periodId === "string") {
      where.period_id = periodId;
    }

    const payrolls = await Payroll.findAll({
      where,
      order: [["fecha_pago", "DESC"]],
      include: [
        { model: Profile, as: "profile", attributes: ["id", "nombre", "rfc"] },
        { model: Period, as: "period", attributes: ["id", "start_date", "end_date", "name"] },
      ],
    });

    res.json({ data: payrolls });
  } catch (error) {
    console.error("Error al listar nóminas:", error);
    res.status(500).json({
      error: "Error al listar nóminas",
      message: error instanceof Error ? error.message : "Error desconocido",
    });
  }
}

/**
 * GET /api/payrolls/:id - Detalle de una nómina.
 */
export async function getPayrollById(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Usuario no autenticado" });
      return;
    }

    const { id } = req.params;

    const payroll = await Payroll.findOne({
      where: { id },
      include: [
        { model: Profile, as: "profile", where: { user_id: userId }, attributes: ["id", "nombre", "rfc"] },
        { model: Period, as: "period", attributes: ["id", "start_date", "end_date", "name"] },
      ],
    });

    if (!payroll) {
      res.status(404).json({ error: "Nómina no encontrada" });
      return;
    }

    res.json({ data: payroll });
  } catch (error) {
    console.error("Error al obtener nómina:", error);
    res.status(500).json({
      error: "Error al obtener nómina",
      message: error instanceof Error ? error.message : "Error desconocido",
    });
  }
}

/**
 * DELETE /api/payrolls/:id - Elimina una nómina.
 */
export async function deletePayroll(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Usuario no autenticado" });
      return;
    }

    const { id } = req.params;

    const payroll = await Payroll.findOne({
      where: { id },
      include: [{ model: Profile, as: "profile", where: { user_id: userId }, attributes: ["id"] }],
    });

    if (!payroll) {
      res.status(404).json({ error: "Nómina no encontrada" });
      return;
    }

    const profileId = payroll.profile_id;
    await payroll.destroy();
    await invalidateProfileCache(profileId);
    res.json({ message: "Nómina eliminada" });
  } catch (error) {
    console.error("Error al eliminar nómina:", error);
    res.status(500).json({
      error: "Error al eliminar nómina",
      message: error instanceof Error ? error.message : "Error desconocido",
    });
  }
}

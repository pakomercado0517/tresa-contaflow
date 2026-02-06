import type { Response } from "express";
import type { AuthRequest } from "../middlewares/auth.middleware.js";
import { ManualIncome, Profile, Period } from "../database/models/index.js";

/**
 * Lista ingresos manuales. Filtro por period_id (obligatorio para listar por período).
 * Verifica que el perfil del período pertenezca al usuario.
 */
export async function getManualIncomes(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Usuario no autenticado" });
      return;
    }

    const periodId = req.query.period_id as string | undefined;
    if (!periodId || typeof periodId !== "string") {
      res.status(400).json({
        error: "period_id es requerido",
        message: "Indica el período con ?period_id=UUID",
      });
      return;
    }

    const period = await Period.findOne({
      where: { id: periodId },
      include: [{ model: Profile, as: "profile", where: { user_id: userId }, attributes: ["id"] }],
    });
    if (!period) {
      res.status(404).json({ error: "Período no encontrado o no pertenece al usuario" });
      return;
    }

    const incomes = await ManualIncome.findAll({
      where: { profile_id: period.profile_id, period_id: periodId },
      order: [["fecha", "DESC"]],
    });

    res.json({ data: incomes });
  } catch (error) {
    console.error("Error al listar ingresos manuales:", error);
    res.status(500).json({
      error: "Error al listar ingresos manuales",
      message: error instanceof Error ? error.message : "Error desconocido",
    });
  }
}

/**
 * Obtiene un ingreso manual por ID. Verifica ownership vía profile.
 */
export async function getManualIncomeById(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Usuario no autenticado" });
      return;
    }

    const { id } = req.params;
    const income = await ManualIncome.findOne({
      where: { id },
      include: [
        { model: Profile, as: "profile", where: { user_id: userId }, attributes: ["id", "nombre", "rfc"] },
        { model: Period, as: "period", attributes: ["id", "start_date", "end_date", "name"] },
      ],
    });

    if (!income) {
      res.status(404).json({ error: "Ingreso no encontrado" });
      return;
    }

    res.json({ data: income });
  } catch (error) {
    console.error("Error al obtener ingreso manual:", error);
    res.status(500).json({
      error: "Error al obtener ingreso",
      message: error instanceof Error ? error.message : "Error desconocido",
    });
  }
}

/**
 * Crea un ingreso devengado manual. Valida profile_id y period_id (ownership).
 */
export async function createManualIncome(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Usuario no autenticado" });
      return;
    }

    const { profile_id, period_id, concept, subtotal, iva_amount, fecha, notes } = req.body;

    const profile = await Profile.findOne({
      where: { id: profile_id, user_id: userId },
      attributes: ["id"],
    });
    if (!profile) {
      res.status(404).json({ error: "Perfil no encontrado o no pertenece al usuario" });
      return;
    }

    const period = await Period.findOne({
      where: { id: period_id, profile_id: profile_id },
      attributes: ["id"],
    });
    if (!period) {
      res.status(404).json({ error: "Período no encontrado o no pertenece al perfil" });
      return;
    }

    const fechaDate = new Date(fecha);
    if (isNaN(fechaDate.getTime())) {
      res.status(400).json({ error: "Fecha inválida" });
      return;
    }

    const income = await ManualIncome.create({
      profile_id,
      period_id,
      concept: String(concept).trim(),
      subtotal: Number(subtotal),
      iva_amount: Number(iva_amount) || 0,
      fecha: fechaDate,
      notes: notes != null ? String(notes).trim() || null : null,
    });

    res.status(201).json({ message: "Ingreso creado", data: income });
  } catch (error) {
    console.error("Error al crear ingreso manual:", error);
    res.status(500).json({
      error: "Error al crear ingreso",
      message: error instanceof Error ? error.message : "Error desconocido",
    });
  }
}

/**
 * Actualiza un ingreso manual (concept, subtotal, iva_amount, is_paid, payment_date, notes).
 */
export async function updateManualIncome(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Usuario no autenticado" });
      return;
    }

    const { id } = req.params;
    const { concept, subtotal, iva_amount, is_paid, payment_date, notes } = req.body;

    const income = await ManualIncome.findOne({
      where: { id },
      include: [{ model: Profile, as: "profile", where: { user_id: userId }, attributes: ["id"] }],
    });
    if (!income) {
      res.status(404).json({ error: "Ingreso no encontrado" });
      return;
    }

    const updateData: Record<string, unknown> = {};
    if (concept !== undefined) updateData.concept = String(concept).trim();
    if (subtotal !== undefined) updateData.subtotal = Number(subtotal);
    if (iva_amount !== undefined) updateData.iva_amount = Number(iva_amount);
    if (typeof is_paid === "boolean") updateData.is_paid = is_paid;
    if (payment_date !== undefined) {
      if (payment_date === null) {
        updateData.payment_date = null;
      } else {
        const d = new Date(payment_date);
        if (isNaN(d.getTime())) {
          res.status(400).json({ error: "payment_date inválido" });
          return;
        }
        updateData.payment_date = d;
      }
    }
    if (notes !== undefined) updateData.notes = notes == null ? null : String(notes).trim() || null;

    await income.update(updateData);

    res.json({ message: "Ingreso actualizado", data: income });
  } catch (error) {
    console.error("Error al actualizar ingreso manual:", error);
    res.status(500).json({
      error: "Error al actualizar ingreso",
      message: error instanceof Error ? error.message : "Error desconocido",
    });
  }
}

/**
 * Elimina un ingreso manual por ID.
 */
export async function deleteManualIncome(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Usuario no autenticado" });
      return;
    }

    const { id } = req.params;

    const income = await ManualIncome.findOne({
      where: { id },
      include: [{ model: Profile, as: "profile", where: { user_id: userId }, attributes: ["id"] }],
    });
    if (!income) {
      res.status(404).json({ error: "Ingreso no encontrado" });
      return;
    }

    await income.destroy();
    res.json({ message: "Ingreso eliminado" });
  } catch (error) {
    console.error("Error al eliminar ingreso manual:", error);
    res.status(500).json({
      error: "Error al eliminar ingreso",
      message: error instanceof Error ? error.message : "Error desconocido",
    });
  }
}

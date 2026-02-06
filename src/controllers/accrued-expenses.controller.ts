import type { Response } from "express";
import type { AuthRequest } from "../middlewares/auth.middleware.js";
import { AccruedExpense, Profile, Period } from "../database/models/index.js";
import { Op } from "sequelize";

/**
 * Lista gastos devengados manuales. Filtro por period_id y type=manual.
 * Verifica que el período pertenezca a un perfil del usuario.
 */
export async function getAccruedExpenses(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Usuario no autenticado" });
      return;
    }

    const periodId = req.query.period_id as string | undefined;
    const type = req.query.type as string | undefined;

    if (!periodId || typeof periodId !== "string") {
      res.status(400).json({
        error: "period_id es requerido",
        message: "Indica el período con ?period_id=UUID",
      });
      return;
    }
    if (type !== "manual") {
      res.status(400).json({
        error: "type debe ser 'manual'",
        message: "Este endpoint solo lista gastos manuales. Usa ?type=manual",
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

    const start = new Date(period.start_date);
    const end = new Date(period.end_date);
    end.setDate(end.getDate() + 1);

    const expenses = await AccruedExpense.findAll({
      where: {
        profile_id: period.profile_id,
        tipo_origen: "MANUAL",
        fecha: { [Op.gte]: start, [Op.lt]: end },
      },
      order: [["fecha", "DESC"]],
    });

    res.json({ data: expenses });
  } catch (error) {
    console.error("Error al listar gastos devengados:", error);
    res.status(500).json({
      error: "Error al listar gastos devengados",
      message: error instanceof Error ? error.message : "Error desconocido",
    });
  }
}

/**
 * Obtiene un gasto devengado por ID. Verifica ownership vía profile.
 */
export async function getAccruedExpenseById(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Usuario no autenticado" });
      return;
    }

    const { id } = req.params;
    const expense = await AccruedExpense.findOne({
      where: { id },
      include: [
        { model: Profile, as: "profile", where: { user_id: userId }, attributes: ["id", "nombre", "rfc"] },
      ],
    });

    if (!expense) {
      res.status(404).json({ error: "Gasto no encontrado" });
      return;
    }

    if (expense.tipo_origen !== "MANUAL") {
      res.status(400).json({
        error: "Solo se puede consultar gastos manuales en este endpoint",
      });
      return;
    }

    res.json({ data: expense });
  } catch (error) {
    console.error("Error al obtener gasto devengado:", error);
    res.status(500).json({
      error: "Error al obtener gasto",
      message: error instanceof Error ? error.message : "Error desconocido",
    });
  }
}

/**
 * Crea un gasto devengado manual. Valida profile_id y period_id (ownership).
 */
export async function createAccruedExpense(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Usuario no autenticado" });
      return;
    }

    const { profile_id, period_id, concept, subtotal, iva_amount, fecha, categoria } = req.body;

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
      attributes: ["id", "start_date", "end_date"],
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

    const mes = fechaDate.getMonth() + 1;
    const año = fechaDate.getFullYear();
    const subtotalNum = Number(subtotal);
    const ivaAmountNum = Number(iva_amount) || 0;
    const total = subtotalNum + ivaAmountNum;

    const expense = await AccruedExpense.create({
      profile_id,
      tipo_origen: "MANUAL",
      fecha: fechaDate,
      mes,
      año,
      total,
      subtotal: subtotalNum,
      iva: ivaAmountNum,
      iva_amount: ivaAmountNum,
      concepto: String(concept).trim() || null,
      categoria: categoria != null ? String(categoria).trim() || null : null,
      uuid: null,
      tipo: null,
      rfc_emisor: null,
      nombre_emisor: null,
      regimen_fiscal_emisor: null,
      rfc_receptor: null,
      nombre_receptor: null,
      regimen_fiscal_receptor: null,
      pagos: [],
      complemento_pago: null,
      validacion: {
        rfcVerificado: true,
        regimenFiscalVerificado: true,
        uuidDuplicado: false,
        advertencias: [],
        errores: [],
        valido: true,
      },
    });

    res.status(201).json({ message: "Gasto devengado creado", data: expense });
  } catch (error) {
    console.error("Error al crear gasto devengado:", error);
    res.status(500).json({
      error: "Error al crear gasto devengado",
      message: error instanceof Error ? error.message : "Error desconocido",
    });
  }
}

/**
 * Actualiza un gasto devengado manual (concept, subtotal, iva_amount, is_paid, payment_date, categoria).
 */
export async function updateAccruedExpense(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Usuario no autenticado" });
      return;
    }

    const { id } = req.params;
    const { concept, subtotal, iva_amount, is_paid, payment_date, categoria } = req.body;

    const expense = await AccruedExpense.findOne({
      where: { id },
      include: [{ model: Profile, as: "profile", where: { user_id: userId }, attributes: ["id"] }],
    });
    if (!expense) {
      res.status(404).json({ error: "Gasto no encontrado" });
      return;
    }

    if (expense.tipo_origen !== "MANUAL") {
      res.status(400).json({
        error: "Solo se pueden actualizar gastos manuales en este endpoint",
      });
      return;
    }

    const updateData: Record<string, unknown> = {};
    if (concept !== undefined) updateData.concepto = String(concept).trim() || null;
    if (subtotal !== undefined) updateData.subtotal = Number(subtotal);
    if (iva_amount !== undefined) {
      updateData.iva_amount = Number(iva_amount);
      updateData.iva = Number(iva_amount);
    }
    if (subtotal !== undefined || iva_amount !== undefined) {
      const sub = subtotal !== undefined ? Number(subtotal) : Number(expense.subtotal ?? 0);
      const iva = iva_amount !== undefined ? Number(iva_amount) : Number(expense.iva_amount ?? 0);
      updateData.total = sub + iva;
    }
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
    if (categoria !== undefined) updateData.categoria = categoria == null ? null : String(categoria).trim() || null;

    await expense.update(updateData);

    res.json({ message: "Gasto devengado actualizado", data: expense });
  } catch (error) {
    console.error("Error al actualizar gasto devengado:", error);
    res.status(500).json({
      error: "Error al actualizar gasto devengado",
      message: error instanceof Error ? error.message : "Error desconocido",
    });
  }
}

/**
 * Elimina un gasto devengado manual por ID.
 */
export async function deleteAccruedExpense(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Usuario no autenticado" });
      return;
    }

    const { id } = req.params;

    const expense = await AccruedExpense.findOne({
      where: { id },
      include: [{ model: Profile, as: "profile", where: { user_id: userId }, attributes: ["id"] }],
    });
    if (!expense) {
      res.status(404).json({ error: "Gasto no encontrado" });
      return;
    }

    if (expense.tipo_origen !== "MANUAL") {
      res.status(400).json({
        error: "Solo se pueden eliminar gastos manuales en este endpoint",
      });
      return;
    }

    await expense.destroy();
    res.json({ message: "Gasto devengado eliminado" });
  } catch (error) {
    console.error("Error al eliminar gasto devengado:", error);
    res.status(500).json({
      error: "Error al eliminar gasto devengado",
      message: error instanceof Error ? error.message : "Error desconocido",
    });
  }
}

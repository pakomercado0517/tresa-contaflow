import { type Response } from "express";
import type { AuthRequest } from "../middlewares/auth.middleware.js";
import { Profile, AccruedExpense } from "../database/models/index.js";
import { validateExpenseLimit } from "../middlewares/plan-limits.middleware.js";
import { uploadInvoice } from "./invoice.controller.js";
import { PaymentStatusService } from "../services/payment-status.service.js";
import { MetricsService } from "../services/metrics.service.js";
import { invalidateProfileCache } from "../services/cache.service.js";
import { listExpenses, parseExpenseListQuery } from "../services/expense-list.service.js";
import { Op } from "sequelize";

/**
 * Lista los gastos del usuario
 * Soporta filtros: profileId, mes, año, tipo, categoria, regimen_fiscal, search (búsqueda por texto), y paginación
 */
export async function getExpenses(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Usuario no autenticado" });
      return;
    }

    const params = parseExpenseListQuery(req.query as Record<string, unknown>);
    const result = await listExpenses(userId, params);
    res.json(result);
  } catch (error) {
    console.error("Error al obtener gastos:", error);
    
    if (error instanceof Error) {
      res.status(500).json({
        error: "Error al obtener gastos",
        message: error.message,
      });
      return;
    }

    res.status(500).json({ error: "Error desconocido al obtener gastos" });
  }
}

/**
 * Obtiene un gasto por ID
 */
export async function getExpenseById(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Usuario no autenticado" });
      return;
    }

    const { id } = req.params;

    // Buscar gasto con verificación de ownership
    const expense = await AccruedExpense.findOne({
      where: { id },
      include: [
        {
          model: Profile,
          as: "profile",
          where: { user_id: userId },
          attributes: ["id", "nombre", "rfc"],
        },
      ],
    });

    if (!expense) {
      res.status(404).json({ error: "Gasto no encontrado" });
      return;
    }

    // Calcular estado de pago si aplica
    let estadoPago = null;
    if (expense.tipo && expense.uuid) {
      const paymentStatusService = new PaymentStatusService();
      estadoPago = await paymentStatusService.calcularEstadoPagoGasto(expense, expense.profile_id);
    }

    res.json({
      data: {
        ...expense.toJSON(),
        estadoPago,
      },
    });
  } catch (error) {
    console.error("Error al obtener gasto:", error);
    
    if (error instanceof Error) {
      res.status(500).json({
        error: "Error al obtener gasto",
        message: error.message,
      });
      return;
    }

    res.status(500).json({ error: "Error desconocido al obtener gasto" });
  }
}

/**
 * Crea un gasto manual (no desde XML)
 */
export async function createExpense(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Usuario no autenticado" });
      return;
    }

    const { profileId, fecha, total, subtotal, iva, concepto, categoria } = req.body;

    // Validaciones básicas
    if (!profileId || !fecha || total === undefined || subtotal === undefined || iva === undefined) {
      res.status(400).json({
        error: "Datos incompletos",
        message: "profileId, fecha, total, subtotal e iva son requeridos",
      });
      return;
    }

    // Verificar que el perfil pertenece al usuario
    const profile = await Profile.findOne({
      where: { id: profileId, user_id: userId },
    });

    if (!profile) {
      res.status(404).json({ error: "Perfil no encontrado" });
      return;
    }

    // Parsear fecha
    const fechaDate = new Date(fecha);
    if (isNaN(fechaDate.getTime())) {
      res.status(400).json({ error: "Fecha inválida" });
      return;
    }

    const mes = fechaDate.getMonth() + 1; // Enero = 1
    const año = fechaDate.getFullYear();

    // Crear gasto
    const expense = await AccruedExpense.create({
      profile_id: profileId,
      tipo_origen: "MANUAL",
      fecha: fechaDate,
      mes,
      año,
      total: Number(total),
      subtotal: Number(subtotal),
      iva: Number(iva),
      iva_amount: Number(iva),
      concepto: concepto || null,
      categoria: categoria || null,
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

    await invalidateProfileCache(profileId);
    res.status(201).json({
      message: "Gasto creado exitosamente",
      data: expense,
    });
  } catch (error) {
    console.error("Error al crear gasto:", error);
    
    if (error instanceof Error) {
      res.status(400).json({
        error: "Error al crear gasto",
        message: error.message,
      });
      return;
    }

    res.status(500).json({ error: "Error desconocido al crear gasto" });
  }
}

/**
 * Actualiza un gasto existente
 */
export async function updateExpense(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Usuario no autenticado" });
      return;
    }

    const { id } = req.params;
    const { fecha, total, subtotal, iva, concepto, categoria } = req.body;

    // Buscar gasto y verificar ownership
    const expense = await AccruedExpense.findOne({
      where: { id },
      include: [
        {
          model: Profile,
          as: "profile",
          where: { user_id: userId },
        },
      ],
    });

    if (!expense) {
      res.status(404).json({ error: "Gasto no encontrado" });
      return;
    }

    // Solo permitir actualizar gastos manuales
    if (expense.tipo_origen !== "MANUAL") {
      res.status(400).json({
        error: "No se puede actualizar un gasto creado desde XML",
        message: "Solo se pueden actualizar gastos creados manualmente",
      });
      return;
    }

    // Preparar datos para actualizar
    const updateData: any = {};

    if (fecha !== undefined) {
      const fechaDate = new Date(fecha);
      if (isNaN(fechaDate.getTime())) {
        res.status(400).json({ error: "Fecha inválida" });
        return;
      }
      updateData.fecha = fechaDate;
      updateData.mes = fechaDate.getMonth() + 1;
      updateData.año = fechaDate.getFullYear();
    }

    if (total !== undefined) updateData.total = Number(total);
    if (subtotal !== undefined) updateData.subtotal = Number(subtotal);
    if (iva !== undefined) updateData.iva = Number(iva);
    if (concepto !== undefined) updateData.concepto = concepto || null;
    if (categoria !== undefined) updateData.categoria = categoria || null;

    // Actualizar gasto
    await expense.update(updateData);
    await invalidateProfileCache(expense.profile_id);

    res.json({
      message: "Gasto actualizado exitosamente",
      data: expense,
    });
  } catch (error) {
    console.error("Error al actualizar gasto:", error);
    
    if (error instanceof Error) {
      res.status(400).json({
        error: "Error al actualizar gasto",
        message: error.message,
      });
      return;
    }

    res.status(500).json({ error: "Error desconocido al actualizar gasto" });
  }
}

/**
 * Elimina un gasto por ID
 */
export async function deleteExpense(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Usuario no autenticado" });
      return;
    }

    const { id } = req.params;

    // Buscar gasto y verificar ownership
    const expense = await AccruedExpense.findOne({
      where: { id },
      include: [
        {
          model: Profile,
          as: "profile",
          where: { user_id: userId },
        },
      ],
    });

    if (!expense) {
      res.status(404).json({ error: "Gasto no encontrado" });
      return;
    }

    // Eliminar gasto
    const profileId = expense.profile_id;
    await expense.destroy();
    await invalidateProfileCache(profileId);

    res.json({ message: "Gasto eliminado exitosamente" });
  } catch (error) {
    console.error("Error al eliminar gasto:", error);
    
    if (error instanceof Error) {
      res.status(500).json({
        error: "Error al eliminar gasto",
        message: error.message,
      });
      return;
    }

    res.status(500).json({ error: "Error desconocido al eliminar gasto" });
  }
}

/**
 * Obtiene métricas del dashboard de gastos
 * Soporta filtros: profileId, mes, año
 * Incluye period_id cuando hay perfil + mes + año para habilitar "Agregar ingreso manual" / acciones de período en el frontend
 */
export async function getMetrics(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Usuario no autenticado" });
      return;
    }

    const { profileId, mes, año } = req.query;

    const filters: {
      profileId?: string;
      mes?: number;
      año?: number;
      userId: string;
    } = {
      userId,
    };

    if (profileId && typeof profileId === "string") {
      filters.profileId = profileId;
    }

    if (mes && typeof mes === "string") {
      const mesNum = parseInt(mes, 10);
      if (!isNaN(mesNum) && mesNum >= 1 && mesNum <= 12) {
        filters.mes = mesNum;
      } else {
        res.status(400).json({
          error: "Parámetro inválido",
          message: "El mes debe ser un número entre 1 y 12",
        });
        return;
      }
    }

    if (año && typeof año === "string") {
      const añoNum = parseInt(año, 10);
      if (!isNaN(añoNum) && añoNum > 2000 && añoNum < 2100) {
        filters.año = añoNum;
      } else {
        res.status(400).json({
          error: "Parámetro inválido",
          message: "El año debe ser un número válido",
        });
        return;
      }
    }

    const metricsService = new MetricsService();
    const metrics = await metricsService.calculatePeriodMetrics(filters);

    let periodId: string | null = null;
    if (filters.profileId && filters.mes && filters.año) {
      const period = await metricsService.findOrCreatePeriodForMonth(
        filters.profileId,
        filters.mes,
        filters.año
      );
      periodId = period.id;
    }

    res.json({
      filters: {
        profileId: filters.profileId || null,
        mes: filters.mes || null,
        año: filters.año || null,
      },
      period_id: periodId,
      metrics,
    });
  } catch (error) {
    console.error("Error al obtener métricas de gastos:", error);

    if (error instanceof Error) {
      res.status(500).json({
        error: "Error al obtener métricas de gastos",
        message: error.message,
      });
      return;
    }

    res.status(500).json({ error: "Error desconocido al obtener métricas de gastos" });
  }
}

/**
 * Sube un XML de gasto (reutiliza la lógica de uploadInvoice)
 * Este endpoint es un alias/conveniencia para /api/invoices/upload
 * pero específico para gastos
 */
export async function uploadExpense(req: AuthRequest, res: Response): Promise<void> {
  // Reutilizar la lógica de uploadInvoice
  // El endpoint uploadInvoice ya determina si es factura o gasto basado en el RFC
  return uploadInvoice(req, res);
}


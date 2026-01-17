import { type Response } from "express";
import type { AuthRequest } from "../middlewares/auth.middleware.js";
import { Profile, Expense } from "../database/models/index.js";
import { validateExpenseLimit } from "../middlewares/plan-limits.middleware.js";
import { uploadInvoice } from "./invoice.controller.js";
import { Op } from "sequelize";

/**
 * Lista los gastos del usuario
 * Soporta filtros: profileId, mes, año, tipo, categoria, search (búsqueda por texto), y paginación
 */
export async function getExpenses(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Usuario no autenticado" });
      return;
    }

    // Obtener parámetros de query
    const { profileId, mes, año, tipo, categoria, search, page = "1", limit = "50" } = req.query;

    // Construir filtros
    const whereClause: any = {};
    const profileWhereClause: any = { user_id: userId };

    if (profileId && typeof profileId === "string") {
      profileWhereClause.id = profileId;
    }

    if (mes && typeof mes === "string") {
      const mesNum = parseInt(mes, 10);
      if (!isNaN(mesNum) && mesNum >= 1 && mesNum <= 12) {
        whereClause.mes = mesNum;
      }
    }

    if (año && typeof año === "string") {
      const añoNum = parseInt(año, 10);
      if (!isNaN(añoNum)) {
        whereClause.año = añoNum;
      }
    }

    if (tipo && typeof tipo === "string" && ["PUE", "PPD", "COMPLEMENTO_PAGO"].includes(tipo)) {
      whereClause.tipo = tipo;
    }

    if (categoria && typeof categoria === "string") {
      whereClause.categoria = categoria;
    }

    // Búsqueda por texto (RFC, razón social, concepto)
    if (search && typeof search === "string" && search.trim().length > 0) {
      const searchTerm = `%${search.trim()}%`;
      whereClause[Op.or] = [
        { rfc_emisor: { [Op.iLike]: searchTerm } },
        { nombre_emisor: { [Op.iLike]: searchTerm } },
        { rfc_receptor: { [Op.iLike]: searchTerm } },
        { nombre_receptor: { [Op.iLike]: searchTerm } },
        { concepto: { [Op.iLike]: searchTerm } },
      ];
    }

    // Paginación
    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 50));
    const offset = (pageNum - 1) * limitNum;

    // Obtener gastos con perfil
    const { count, rows: expenses } = await Expense.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: Profile,
          as: "profile",
          where: profileWhereClause,
          attributes: ["id", "nombre", "rfc"],
        },
      ],
      order: [["fecha", "DESC"]],
      limit: limitNum,
      offset: offset,
    });

    res.json({
      data: expenses,
      pagination: {
        total: count,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(count / limitNum),
      },
    });
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
    const expense = await Expense.findOne({
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

    res.json({ data: expense });
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
    const expense = await Expense.create({
      profile_id: profileId,
      tipo_origen: "MANUAL",
      fecha: fechaDate,
      mes,
      año,
      total: Number(total),
      subtotal: Number(subtotal),
      iva: Number(iva),
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
    const expense = await Expense.findOne({
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
    const expense = await Expense.findOne({
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
    await expense.destroy();

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
 * Sube un XML de gasto (reutiliza la lógica de uploadInvoice)
 * Este endpoint es un alias/conveniencia para /api/invoices/upload
 * pero específico para gastos
 */
export async function uploadExpense(req: AuthRequest, res: Response): Promise<void> {
  // Reutilizar la lógica de uploadInvoice
  // El endpoint uploadInvoice ya determina si es factura o gasto basado en el RFC
  return uploadInvoice(req, res);
}


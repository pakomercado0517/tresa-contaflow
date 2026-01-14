import { type Response } from "express";
import type { AuthRequest } from "../middlewares/auth.middleware.js";
import { CFDIParserService } from "../services/cfdi-parser.service.js";
import { FiscalValidationService } from "../services/fiscal-validation.service.js";
import { PaymentMatchingService } from "../services/payment-matching.service.js";
import { Profile, Invoice, Expense } from "../database/models/index.js";
import type { UploadedFile } from "express-fileupload";
import type { ValidacionesConfig } from "../types/validation.types.js";
import type { CFDI } from "../types/cfdi.types.js";
import { Op } from "sequelize";
import { MetricsService } from "../services/metrics.service.js";

/**
 * Endpoint de prueba para parsear XML CFDI
 * Este endpoint permite subir un archivo XML y ver los datos extraídos con validaciones fiscales
 */
export async function parseXML(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Usuario no autenticado" });
      return;
    }

    // Obtener profileId del body o query
    const profileId = req.body.profileId || req.query.profileId;
    if (!profileId || typeof profileId !== "string") {
      res.status(400).json({ error: "profileId es requerido" });
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

    // Verificar que se subió un archivo
    if (!req.files || !req.files.xml) {
      res.status(400).json({ error: "No se proporcionó archivo XML" });
      return;
    }

    const file = req.files.xml as UploadedFile;

    // Verificar que es un archivo XML
    if (!file.name.toLowerCase().endsWith(".xml")) {
      res.status(400).json({ error: "El archivo debe ser un XML" });
      return;
    }

    // Leer el contenido del archivo como texto
    const xmlString = file.data.toString("utf-8");

    // Parsear el XML
    const parser = new CFDIParserService();
    const cfdi = await parser.parseXML(xmlString);

    // Realizar validaciones fiscales y matching
    const validationService = new FiscalValidationService();
    const matchingService = new PaymentMatchingService();
    const validacionesConfig = (profile.validaciones_habilitadas || {}) as ValidacionesConfig;

    let estadoValidacion;
    let matchingResult = null;

    if (cfdi.tipo === "COMPLEMENTO_PAGO") {
      // Para complementos de pago: validar UUID duplicado y hacer matching
      // Verificar en ambas tablas (invoices y expenses) ya que un complemento puede estar relacionado con facturas
      const uuidDuplicado = await validationService.checkUUIDDuplicado(cfdi.uuid, profileId, "both");
      
      estadoValidacion = {
        rfcVerificado: true, // N/A para complemento
        regimenFiscalVerificado: true, // N/A para complemento
        uuidDuplicado: uuidDuplicado,
        advertencias: [],
        errores: uuidDuplicado ? [`El complemento de pago con UUID ${cfdi.uuid} ya existe.`] : [],
        valido: !uuidDuplicado,
      };

      // Si no hay UUID duplicado, proceder con el matching
      if (!uuidDuplicado) {
        try {
          matchingResult = await matchingService.buscarMatchesComplemento(cfdi, profileId);
        } catch (error) {
          console.error("Error en matching:", error);
          estadoValidacion.errores?.push(
            error instanceof Error ? error.message : "Error al buscar matches"
          );
        }
      }
    } else {
      // Para facturas normales: validaciones fiscales completas
      // Determinar si es factura (ingreso) o gasto basado en RFC
      if (cfdi.rfcEmisor === profile.rfc) {
        // Si el RFC del perfil es el emisor, es una factura de ingreso
        estadoValidacion = await validationService.validateFacturaIngreso(
          cfdi,
          profileId,
          profile.rfc,
          profile.regimen_fiscal,
          validacionesConfig
        );
      } else if (cfdi.rfcReceptor === profile.rfc) {
        // Si el RFC del perfil es el receptor, es un gasto
        estadoValidacion = await validationService.validateGasto(
          cfdi,
          profileId,
          profile.rfc,
          profile.regimen_fiscal,
          validacionesConfig
        );
      } else {
        // El CFDI no corresponde al perfil ni como emisor ni como receptor
        estadoValidacion = {
          rfcVerificado: false,
          regimenFiscalVerificado: false,
          uuidDuplicado: false,
          advertencias: [],
          errores: [`El CFDI no corresponde al perfil ${profile.rfc} ni como emisor ni como receptor.`],
          valido: false,
        };
      }
    }

    // Retornar los datos parseados junto con el estado de validación y matching
    res.json({
      message: "XML parseado exitosamente",
      data: cfdi,
      validacion: estadoValidacion,
      matching: matchingResult,
      profile: {
        id: profile.id,
        nombre: profile.nombre,
        rfc: profile.rfc,
        regimen_fiscal: profile.regimen_fiscal,
      },
    });
  } catch (error) {
    console.error("Error al parsear XML:", error);
    
    if (error instanceof Error) {
      res.status(400).json({ 
        error: "Error al parsear XML",
        message: error.message 
      });
      return;
    }

    res.status(500).json({ error: "Error desconocido al parsear XML" });
  }
}

/**
 * Endpoint para subir y guardar facturas/gastos en BD
 * Este endpoint parsea, valida y guarda el CFDI en la base de datos
 */
export async function uploadInvoice(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Usuario no autenticado" });
      return;
    }

    // Obtener profileId del body o query
    const profileId = req.body.profileId || req.query.profileId;
    if (!profileId || typeof profileId !== "string") {
      res.status(400).json({ error: "profileId es requerido" });
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

    // Verificar que se subió un archivo
    if (!req.files || !req.files.xml) {
      res.status(400).json({ error: "No se proporcionó archivo XML" });
      return;
    }

    const file = req.files.xml as UploadedFile;

    // Verificar que es un archivo XML
    if (!file.name.toLowerCase().endsWith(".xml")) {
      res.status(400).json({ error: "El archivo debe ser un XML" });
      return;
    }

    // Leer el contenido del archivo como texto
    const xmlString = file.data.toString("utf-8");

    // Parsear el XML
    const parser = new CFDIParserService();
    const cfdi = await parser.parseXML(xmlString);

    // Realizar validaciones fiscales y matching
    const validationService = new FiscalValidationService();
    const matchingService = new PaymentMatchingService();
    const validacionesConfig = (profile.validaciones_habilitadas || {}) as ValidacionesConfig;

    let estadoValidacion;
    let matchingResult = null;
    let esFacturaIngreso = false;
    let esGasto = false;

    if (cfdi.tipo === "COMPLEMENTO_PAGO") {
      // Para complementos de pago: validar UUID duplicado y hacer matching
      // Verificar en ambas tablas (invoices y expenses) ya que un complemento puede estar relacionado con facturas
      const uuidDuplicado = await validationService.checkUUIDDuplicado(cfdi.uuid, profileId, "both");
      
      estadoValidacion = {
        rfcVerificado: true, // N/A para complemento
        regimenFiscalVerificado: true, // N/A para complemento
        uuidDuplicado: uuidDuplicado,
        advertencias: [],
        errores: uuidDuplicado ? [`El complemento de pago con UUID ${cfdi.uuid} ya existe.`] : [],
        valido: !uuidDuplicado,
      };

      // Si no hay UUID duplicado, proceder con el matching
      if (!uuidDuplicado) {
        try {
          matchingResult = await matchingService.buscarMatchesComplemento(cfdi, profileId);
        } catch (error) {
          console.error("Error en matching:", error);
          estadoValidacion.errores?.push(
            error instanceof Error ? error.message : "Error al buscar matches"
          );
        }
      }

      // Los complementos de pago NO se guardan como facturas/gastos
      // Solo se procesan para matching
      if (!estadoValidacion.valido) {
        res.status(400).json({
          error: "El complemento de pago no es válido",
          validacion: estadoValidacion,
        });
        return;
      }

      // Retornar éxito pero sin guardar (los complementos no se guardan)
      res.json({
        message: "Complemento de pago procesado exitosamente",
        data: cfdi,
        validacion: estadoValidacion,
        matching: matchingResult,
        saved: false, // No se guarda en BD
      });
      return;
    } else {
      // Para facturas normales: validaciones fiscales completas
      // Determinar si es factura (ingreso) o gasto basado en RFC
      if (cfdi.rfcEmisor === profile.rfc) {
        // Si el RFC del perfil es el emisor, es una factura de ingreso
        esFacturaIngreso = true;
        estadoValidacion = await validationService.validateFacturaIngreso(
          cfdi,
          profileId,
          profile.rfc,
          profile.regimen_fiscal,
          validacionesConfig
        );
      } else if (cfdi.rfcReceptor === profile.rfc) {
        // Si el RFC del perfil es el receptor, es un gasto
        esGasto = true;
        estadoValidacion = await validationService.validateGasto(
          cfdi,
          profileId,
          profile.rfc,
          profile.regimen_fiscal,
          validacionesConfig
        );
      } else {
        // El CFDI no corresponde al perfil ni como emisor ni como receptor
        res.status(400).json({
          error: "El CFDI no corresponde al perfil",
          message: `El CFDI no corresponde al perfil ${profile.rfc} ni como emisor ni como receptor.`,
        });
        return;
      }
    }

    // Si las validaciones fallaron, no guardar
    if (!estadoValidacion.valido) {
      res.status(400).json({
        error: "El CFDI no pasó las validaciones fiscales",
        validacion: estadoValidacion,
        data: cfdi,
      });
      return;
    }

    // Guardar en BD según el tipo
    let savedRecord;
    if (esFacturaIngreso) {
      savedRecord = await saveInvoice(cfdi, profileId, estadoValidacion);
    } else if (esGasto) {
      savedRecord = await saveExpense(cfdi, profileId, estadoValidacion);
    } else {
      res.status(400).json({ error: "No se pudo determinar el tipo de CFDI" });
      return;
    }

    res.status(201).json({
      message: esFacturaIngreso ? "Factura guardada exitosamente" : "Gasto guardado exitosamente",
      data: savedRecord,
      validacion: estadoValidacion,
      tipo: esFacturaIngreso ? "factura" : "gasto",
    });
  } catch (error) {
    console.error("Error al subir factura:", error);
    
    if (error instanceof Error) {
      // Manejar error de UUID duplicado
      if (error.message.includes("duplicate key") || error.message.includes("unique constraint")) {
        res.status(409).json({ 
          error: "El CFDI ya existe en la base de datos",
          message: "Este UUID ya fue procesado anteriormente"
        });
        return;
      }

      res.status(400).json({ 
        error: "Error al procesar XML",
        message: error.message 
      });
      return;
    }

    res.status(500).json({ error: "Error desconocido al procesar XML" });
  }
}

/**
 * Lista las facturas del usuario
 * Soporta filtros: profileId, mes, año, tipo, search (búsqueda por texto), y paginación
 */
export async function getInvoices(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Usuario no autenticado" });
      return;
    }

    // Obtener parámetros de query
    const { profileId, mes, año, tipo, search, page = "1", limit = "50" } = req.query;

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

    // Obtener facturas con perfil
    const { count, rows: invoices } = await Invoice.findAndCountAll({
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
      data: invoices,
      pagination: {
        total: count,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(count / limitNum),
      },
    });
  } catch (error) {
    console.error("Error al obtener facturas:", error);
    
    if (error instanceof Error) {
      res.status(500).json({
        error: "Error al obtener facturas",
        message: error.message,
      });
      return;
    }

    res.status(500).json({ error: "Error desconocido al obtener facturas" });
  }
}

/**
 * Obtiene una factura por ID
 */
export async function getInvoiceById(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Usuario no autenticado" });
      return;
    }

    const { id } = req.params;

    // Buscar factura con verificación de ownership
    const invoice = await Invoice.findOne({
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

    if (!invoice) {
      res.status(404).json({ error: "Factura no encontrada" });
      return;
    }

    res.json({ data: invoice });
  } catch (error) {
    console.error("Error al obtener factura:", error);
    
    if (error instanceof Error) {
      res.status(500).json({
        error: "Error al obtener factura",
        message: error.message,
      });
      return;
    }

    res.status(500).json({ error: "Error desconocido al obtener factura" });
  }
}

/**
 * Obtiene métricas del dashboard
 * Soporta filtros: profileId, mes, año
 */
export async function getMetrics(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Usuario no autenticado" });
      return;
    }

    // Obtener parámetros de query
    const { profileId, mes, año } = req.query;

    // Validar y parsear parámetros
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

    // Calcular métricas
    const metricsService = new MetricsService();
    const metrics = await metricsService.calculatePeriodMetrics(filters);

    res.json({
      filters: {
        profileId: filters.profileId || null,
        mes: filters.mes || null,
        año: filters.año || null,
      },
      metrics,
    });
  } catch (error) {
    console.error("Error al obtener métricas:", error);
    
    if (error instanceof Error) {
      res.status(500).json({
        error: "Error al obtener métricas",
        message: error.message,
      });
      return;
    }

    res.status(500).json({ error: "Error desconocido al obtener métricas" });
  }
}

/**
 * Elimina una factura por ID
 */
export async function deleteInvoice(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Usuario no autenticado" });
      return;
    }

    const { id } = req.params;

    // Buscar factura y verificar ownership
    const invoice = await Invoice.findOne({
      where: { id },
      include: [
        {
          model: Profile,
          as: "profile",
          where: { user_id: userId },
        },
      ],
    });

    if (!invoice) {
      res.status(404).json({ error: "Factura no encontrada" });
      return;
    }

    // Eliminar factura
    await invoice.destroy();

    res.json({ message: "Factura eliminada exitosamente" });
  } catch (error) {
    console.error("Error al eliminar factura:", error);
    
    if (error instanceof Error) {
      res.status(500).json({
        error: "Error al eliminar factura",
        message: error.message,
      });
      return;
    }

    res.status(500).json({ error: "Error desconocido al eliminar factura" });
  }
}

/**
 * Guarda una factura (ingreso) en la BD
 */
async function saveInvoice(
  cfdi: CFDI,
  profileId: string,
  estadoValidacion: { rfcVerificado: boolean; regimenFiscalVerificado: boolean; uuidDuplicado: boolean; advertencias: string[]; errores: string[]; valido: boolean }
): Promise<Invoice> {
  const invoiceData = {
    profile_id: profileId,
    uuid: cfdi.uuid,
    fecha: cfdi.fecha,
    mes: cfdi.mes,
    año: cfdi.año,
    total: cfdi.total,
    subtotal: cfdi.subtotal,
    iva: cfdi.iva,
    tipo: cfdi.tipo,
    rfc_emisor: cfdi.rfcEmisor,
    nombre_emisor: cfdi.nombreEmisor,
    regimen_fiscal_emisor: cfdi.regimenFiscalEmisor || null,
    rfc_receptor: cfdi.rfcReceptor,
    nombre_receptor: cfdi.nombreReceptor,
    regimen_fiscal_receptor: cfdi.regimenFiscalReceptor || null,
    concepto: cfdi.concepto || null,
    pagos: cfdi.pagos || [],
    complemento_pago: cfdi.complementoPago ? (cfdi.complementoPago as unknown as Record<string, unknown>) : null,
    validacion: estadoValidacion as unknown as Record<string, unknown>,
  };

  return await Invoice.create(invoiceData);
}

/**
 * Guarda un gasto en la BD
 */
async function saveExpense(
  cfdi: CFDI,
  profileId: string,
  estadoValidacion: { rfcVerificado: boolean; regimenFiscalVerificado: boolean; uuidDuplicado: boolean; advertencias: string[]; errores: string[]; valido: boolean }
): Promise<Expense> {
  const expenseData = {
    profile_id: profileId,
    tipo_origen: "XML" as const,
    fecha: cfdi.fecha,
    mes: cfdi.mes,
    año: cfdi.año,
    total: cfdi.total,
    subtotal: cfdi.subtotal,
    iva: cfdi.iva,
    concepto: cfdi.concepto || null,
    categoria: null, // Se puede agregar categorización automática en el futuro
    uuid: cfdi.uuid,
    tipo: cfdi.tipo,
    rfc_emisor: cfdi.rfcEmisor,
    nombre_emisor: cfdi.nombreEmisor,
    regimen_fiscal_emisor: cfdi.regimenFiscalEmisor || null,
    rfc_receptor: cfdi.rfcReceptor,
    nombre_receptor: cfdi.nombreReceptor,
    regimen_fiscal_receptor: cfdi.regimenFiscalReceptor || null,
    pagos: cfdi.pagos || [],
    complemento_pago: cfdi.complementoPago ? (cfdi.complementoPago as unknown as Record<string, unknown>) : null,
    validacion: estadoValidacion as unknown as Record<string, unknown>,
  };

  return await Expense.create(expenseData);
}

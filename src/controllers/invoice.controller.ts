import { type NextFunction, type Response } from 'express';
import type { AuthRequest } from '../middlewares/auth.middleware.js';
import { listInvoices, normalizeInvoiceListQuery } from '../services/invoice-list.service.js';
import { AppError } from '../utils/AppError.js';
import {
  invoiceParseXmlForProfile,
  uploadInvoiceService,
} from '../services/invoice-parse.service.js';
import {
  deleteInvoiceService,
  getInvoiceByIdService,
  getMetricsService,
} from '../services/invoice-crud.service.js';
import { optionalInt, optionalString } from '../utils/query.util.js';
import type { GetMetricsFilters } from '../types/invoice-crud.types.js';

/**
 * Endpoint de prueba para parsear XML CFDI
 * Este endpoint permite subir un archivo XML y ver los datos extraídos con validaciones fiscales
 */
export async function parseXML(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.userId;
    if (!userId) throw new AppError('Usuario no autenticado', 401);

    const { profileId } = req.body;

    const result = await invoiceParseXmlForProfile(userId, profileId, req.xmlFile!.data);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * Endpoint para subir y guardar facturas/gastos en BD
 * Este endpoint parsea, valida y guarda el CFDI en la base de datos
 */
export async function uploadInvoice(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.userId;
    if (!userId) throw new AppError('Usuario no autenticado', 401);

    const { profileId } = req.body;
    const result = await uploadInvoiceService(userId, profileId, req.xmlFile!.data);
    const status = 'saved' in result && result.saved ? 200 : 201;

    res.status(status).json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * Lista las facturas del usuario
 * Soporta filtros: profileId, mes, año, tipo, regimen_fiscal, search (búsqueda por texto), y paginación
 */
export async function getInvoices(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.userId;
    if (!userId) throw new AppError('Usuario no autenticado', 401);

    const params = normalizeInvoiceListQuery(req.query as Record<string, unknown>);
    const result = await listInvoices(userId, params);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * Obtiene una factura por ID
 */
export async function getInvoiceById(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.userId;
    if (!userId) throw new AppError('Usuario no autenticado', 401);

    const { id } = req.params;
    const result = await getInvoiceByIdService(userId, id as string);

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * Obtiene métricas del dashboard
 * Soporta filtros: profileId, mes, año
 */
export async function getMetrics(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.userId;
    if (!userId) throw new AppError('Usuario no autenticado', 401);
    const profileId = optionalString(req.query.profileId);
    const mes = optionalInt(req.query.mes);
    const año = optionalInt(req.query.año);

    const filters: GetMetricsFilters = {};
    profileId !== undefined && (filters.profileId = profileId);
    mes !== undefined && (filters.mes = mes);
    año !== undefined && (filters.año = año);

    const result = await getMetricsService(userId, filters);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * Elimina una factura por ID
 */
export async function deleteInvoice(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.userId;
    if (!userId) throw new AppError('Usuario no autenticado', 401);

    const invoiceId = req.params.id as string;
    const result = await deleteInvoiceService(userId, invoiceId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

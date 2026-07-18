import { type NextFunction, type Response } from 'express';
import type { AuthRequest } from '../middlewares/auth.middleware.js';
import { PaymentStatusService } from '../services/payment-status.service.js';
import { Profile, Invoice } from '../database/models/index.js';
import { MetricsService } from '../services/metrics.service.js';
import { invalidateProfileCache } from '../services/cache.service.js';
import { listInvoices, normalizeInvoiceListQuery } from '../services/invoice-list.service.js';
import { AppError } from '../utils/AppError.js';
import {
  invoiceParseXmlForProfile,
  uploadInvoiceService,
} from '../services/invoice-parse.service.js';

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
export async function getInvoiceById(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Usuario no autenticado' });
      return;
    }

    const { id } = req.params;

    // Buscar factura con verificación de ownership
    const invoice = await Invoice.findOne({
      where: { id },
      include: [
        {
          model: Profile,
          as: 'profile',
          where: { user_id: userId },
          attributes: ['id', 'nombre', 'rfc'],
        },
      ],
    });

    if (!invoice) {
      res.status(404).json({ error: 'Factura no encontrada' });
      return;
    }

    // Calcular estado de pago
    const paymentStatusService = new PaymentStatusService();
    const estadoPago = await paymentStatusService.calcularEstadoPagoFactura(
      invoice,
      invoice.profile_id
    );

    res.json({
      data: {
        ...invoice.toJSON(),
        estadoPago,
      },
    });
  } catch (error) {
    console.error('Error al obtener factura:', error);

    if (error instanceof Error) {
      res.status(500).json({
        error: 'Error al obtener factura',
        message: error.message,
      });
      return;
    }

    res.status(500).json({ error: 'Error desconocido al obtener factura' });
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
      res.status(401).json({ error: 'Usuario no autenticado' });
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

    if (profileId && typeof profileId === 'string') {
      filters.profileId = profileId;
    }

    if (mes && typeof mes === 'string') {
      const mesNum = parseInt(mes, 10);
      if (!isNaN(mesNum) && mesNum >= 1 && mesNum <= 12) {
        filters.mes = mesNum;
      } else {
        res.status(400).json({
          error: 'Parámetro inválido',
          message: 'El mes debe ser un número entre 1 y 12',
        });
        return;
      }
    }

    if (año && typeof año === 'string') {
      const añoNum = parseInt(año, 10);
      if (!isNaN(añoNum) && añoNum > 2000 && añoNum < 2100) {
        filters.año = añoNum;
      } else {
        res.status(400).json({
          error: 'Parámetro inválido',
          message: 'El año debe ser un número válido',
        });
        return;
      }
    }

    // Calcular métricas
    const metricsService = new MetricsService();
    const metrics = await metricsService.calculatePeriodMetrics(filters);

    // Obtener period_id cuando hay perfil + mes + año para habilitar "Agregar ingreso manual" en el frontend
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
    console.error('Error al obtener métricas:', error);

    if (error instanceof Error) {
      res.status(500).json({
        error: 'Error al obtener métricas',
        message: error.message,
      });
      return;
    }

    res.status(500).json({ error: 'Error desconocido al obtener métricas' });
  }
}

/**
 * Elimina una factura por ID
 */
export async function deleteInvoice(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Usuario no autenticado' });
      return;
    }

    const { id } = req.params;

    // Buscar factura y verificar ownership
    const invoice = await Invoice.findOne({
      where: { id },
      include: [
        {
          model: Profile,
          as: 'profile',
          where: { user_id: userId },
        },
      ],
    });

    if (!invoice) {
      res.status(404).json({ error: 'Factura no encontrada' });
      return;
    }

    const profileId = invoice.profile_id;
    await invoice.destroy();
    await invalidateProfileCache(profileId);

    res.json({ message: 'Factura eliminada exitosamente' });
  } catch (error) {
    console.error('Error al eliminar factura:', error);

    if (error instanceof Error) {
      res.status(500).json({
        error: 'Error al eliminar factura',
        message: error.message,
      });
      return;
    }

    res.status(500).json({ error: 'Error desconocido al eliminar factura' });
  }
}

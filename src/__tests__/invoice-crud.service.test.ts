import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '../utils/AppError.js';

const {
  invoiceFindOne,
  calculatePeriodMetrics,
  findOrCreatePeriodForMonth,
  invalidateProfileCache,
  calcularEstadoPagoFactura,
} = vi.hoisted(() => ({
  invoiceFindOne: vi.fn(),
  calculatePeriodMetrics: vi.fn(),
  findOrCreatePeriodForMonth: vi.fn(),
  invalidateProfileCache: vi.fn(),
  calcularEstadoPagoFactura: vi.fn(),
}));

vi.mock('../database/models/Invoice.model.js', () => ({
  default: { findOne: invoiceFindOne },
}));

vi.mock('../database/models/Profile.model.js', () => ({
  default: {},
}));

vi.mock('../services/cache.service.js', () => ({
  invalidateProfileCache,
}));

vi.mock('../services/payment-status.service.js', () => ({
  calcularEstadoPagoFactura,
}));

vi.mock('../services/metrics.service.js', () => ({
  calculatePeriodMetrics,
  findOrCreatePeriodForMonth,
}));

import {
  getInvoiceByIdService,
  getMetricsService,
  deleteInvoiceService,
} from '../services/invoice-crud.service.js';

async function catchError(promise: Promise<unknown>): Promise<AppError> {
  try {
    await promise;
  } catch (error) {
    return error as AppError;
  }
  throw new Error('Se esperaba que la promesa fuera rechazada, pero se resolvió');
}

describe('invoice-crud.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getInvoiceByIdService', () => {
    it('lanza AppError 404 si la factura no existe', async () => {
      invoiceFindOne.mockResolvedValue(null);

      const error = await catchError(getInvoiceByIdService('u1', 'inv-1'));

      expect(error).toBeInstanceOf(AppError);
      expect(error.status).toBe(404);
      expect(error.message).toBe('Factura no encontrada');
      expect(calcularEstadoPagoFactura).not.toHaveBeenCalled();
    });

    it('retorna la factura con estado de pago', async () => {
      const invoice = {
        id: 'inv-1',
        profile_id: 'p1',
        toJSON: () => ({ id: 'inv-1', profile_id: 'p1', total: 1000 }),
      };
      const estadoPago = { estado: 'PAGADO', totalPagado: 1000 };
      invoiceFindOne.mockResolvedValue(invoice);
      calcularEstadoPagoFactura.mockResolvedValue(estadoPago);

      const result = await getInvoiceByIdService('u1', 'inv-1');

      expect(calcularEstadoPagoFactura).toHaveBeenCalledWith(invoice, 'p1');
      expect(result).toEqual({
        data: {
          id: 'inv-1',
          profile_id: 'p1',
          total: 1000,
          estadoPago,
        },
      });
    });
  });

  describe('getMetricsService', () => {
    it('calcula métricas sin crear periodo cuando faltan filtros', async () => {
      const metrics = { totalFacturado: 100 };
      calculatePeriodMetrics.mockResolvedValue(metrics);

      const result = await getMetricsService('u1', { profileId: 'p1' });

      expect(calculatePeriodMetrics).toHaveBeenCalledWith({
        userId: 'u1',
        profileId: 'p1',
      });
      expect(findOrCreatePeriodForMonth).not.toHaveBeenCalled();
      expect(result).toEqual({
        filters: { profileId: 'p1', mes: null, año: null },
        period_id: null,
        metrics,
      });
    });

    it('crea o encuentra el periodo cuando hay profileId, mes y año', async () => {
      const metrics = { totalFacturado: 250 };
      calculatePeriodMetrics.mockResolvedValue(metrics);
      findOrCreatePeriodForMonth.mockResolvedValue({ id: 'period-1' });

      const result = await getMetricsService('u1', {
        profileId: 'p1',
        mes: 12,
        año: 2024,
      });

      expect(calculatePeriodMetrics).toHaveBeenCalledWith({
        userId: 'u1',
        profileId: 'p1',
        mes: 12,
        año: 2024,
      });
      expect(findOrCreatePeriodForMonth).toHaveBeenCalledWith('p1', 12, 2024);
      expect(result).toEqual({
        filters: { profileId: 'p1', mes: 12, año: 2024 },
        period_id: 'period-1',
        metrics,
      });
    });
  });

  describe('deleteInvoiceService', () => {
    it('lanza AppError 404 si la factura no existe', async () => {
      invoiceFindOne.mockResolvedValue(null);

      const error = await catchError(deleteInvoiceService('u1', 'inv-1'));

      expect(error).toBeInstanceOf(AppError);
      expect(error.status).toBe(404);
      expect(error.message).toBe('Factura no encontrada');
      expect(invalidateProfileCache).not.toHaveBeenCalled();
    });

    it('elimina la factura e invalida la caché del perfil', async () => {
      const destroy = vi.fn().mockResolvedValue(undefined);
      invoiceFindOne.mockResolvedValue({
        id: 'inv-1',
        profile_id: 'p1',
        destroy,
      });

      const result = await deleteInvoiceService('u1', 'inv-1');

      expect(destroy).toHaveBeenCalledTimes(1);
      expect(invalidateProfileCache).toHaveBeenCalledWith('p1');
      expect(result).toEqual({ message: 'Factura eliminada exitosamente' });
    });
  });
});

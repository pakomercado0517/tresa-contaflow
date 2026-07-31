import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '../utils/AppError.js';

const {
  invoiceFindOne,
  getMetricsForMonthYear,
  validateProfileAndRegimenService,
  invalidateProfileCache,
  calcularEstadoPagoFactura,
} = vi.hoisted(() => ({
  invoiceFindOne: vi.fn(),
  getMetricsForMonthYear: vi.fn(),
  validateProfileAndRegimenService: vi.fn(),
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
  getMetricsForMonthYear,
}));

vi.mock('../services/metrics-report.service.js', () => ({
  validateProfileAndRegimenService,
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

const samplePeriodMetricsResponse = {
  period: { id: 'period-1', start: new Date(), end: new Date() },
  flujo: {
    ingresos_cobrados: 1000,
    egresos_pagados: 400,
    flujo_neto: 600,
    ingresos_cobrados_sin_conciliar: 0,
    egresos_pagados_sin_conciliar: 0,
  },
  devengado: {
    ingresos_devengados: 1200,
    egresos_devengados: 500,
    resultado_devengado: 700,
  },
  impuestos: {
    iva_trasladado: { cobrado: 0, devengado: 0 },
    iva_acreditable: { pagado: 0, devengado: 0 },
    retenciones_iva: { cobrado: 0, devengado: 0 },
    retenciones_isr: { cobrado: 0, devengado: 0 },
  },
  pendientes: {
    por_cobrar: 200,
    por_pagar: 100,
    por_cobrar_impuestos: { iva: 0, retenciones_iva: 0, retenciones_isr: 0 },
    por_pagar_impuestos: { iva: 0, retenciones_iva: 0, retenciones_isr: 0 },
  },
  nomina: {
    total_pagada: 0,
    percepciones: 0,
    deducciones: 0,
    cantidad_empleados: 0,
  },
};

describe('invoice-crud.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateProfileAndRegimenService.mockResolvedValue(undefined);
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
    it('lanza AppError 400 si faltan mes o año', async () => {
      const error = await catchError(getMetricsService('u1', { profileId: 'p1' }));

      expect(error).toBeInstanceOf(AppError);
      expect(error.status).toBe(400);
      expect(getMetricsForMonthYear).not.toHaveBeenCalled();
    });

    it('delega a getMetricsForMonthYear y adapta la respuesta legacy', async () => {
      getMetricsForMonthYear.mockResolvedValue(samplePeriodMetricsResponse);

      const result = await getMetricsService('u1', {
        profileId: 'p1',
        mes: 12,
        año: 2024,
      });

      expect(validateProfileAndRegimenService).toHaveBeenCalledWith('u1', 'p1', undefined);
      expect(getMetricsForMonthYear).toHaveBeenCalledWith('u1', 12, 2024, 'p1');
      expect(result).toEqual({
        filters: { profileId: 'p1', mes: 12, año: 2024 },
        period_id: 'period-1',
        metrics: {
          totalFacturado: 1200,
          totalPagado: 1000,
          totalCompras: 500,
          totalComprasPagadas: 400,
          totalPagadoMenosCompras: 600,
          pendientePagar: 200,
          gastosPendientes: 100,
          pagosAnticipadosGastos: 0,
          totalFacturas: 0,
          totalGastos: 0,
          facturasPUE: 0,
          facturasPPD: 0,
          facturasPagadasCompletamente: 0,
          facturasParcialmentePagadas: 0,
          facturasPendientesPago: 0,
          gastosPUE: 0,
          gastosPPD: 0,
          gastosPagadosCompletamente: 0,
          gastosParcialmentePagados: 0,
        },
      });
    });

    it('retorna period_id null cuando la respuesta es agregada multi-perfil', async () => {
      getMetricsForMonthYear.mockResolvedValue({
        ...samplePeriodMetricsResponse,
        period: { id: 'aggregated', start: new Date(), end: new Date() },
      });

      const result = await getMetricsService('u1', { mes: 1, año: 2025 });

      expect(result.period_id).toBeNull();
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

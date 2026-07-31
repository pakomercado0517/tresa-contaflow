import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError.js';
import type { AuthRequest } from '../middlewares/auth.middleware.js';

vi.mock('../services/invoice-list.service.js', () => ({
  listInvoices: vi.fn(),
  normalizeInvoiceListQuery: vi.fn(),
}));

vi.mock('../services/invoice-parse.service.js', () => ({
  invoiceParseXmlForProfile: vi.fn(),
  uploadInvoiceService: vi.fn(),
}));

vi.mock('../services/invoice-crud.service.js', () => ({
  deleteInvoiceService: vi.fn(),
  getInvoiceByIdService: vi.fn(),
  getMetricsService: vi.fn(),
}));

import { listInvoices, normalizeInvoiceListQuery } from '../services/invoice-list.service.js';
import {
  invoiceParseXmlForProfile,
  uploadInvoiceService,
} from '../services/invoice-parse.service.js';
import {
  deleteInvoiceService,
  getInvoiceByIdService,
  getMetricsService,
} from '../services/invoice-crud.service.js';
import {
  parseXML,
  uploadInvoice,
  getInvoices,
  getInvoiceById,
  getMetrics,
  deleteInvoice,
} from '../controllers/invoice.controller.js';

function mockRes(): Response {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res) as unknown as Response['status'];
  res.json = vi.fn().mockReturnValue(res) as unknown as Response['json'];
  res.set = vi.fn().mockReturnValue(res) as unknown as Response['set'];
  return res as Response;
}

function mockReq(overrides: Partial<AuthRequest> = {}): AuthRequest {
  return {
    body: {},
    params: {},
    query: {},
    headers: {},
    ...overrides,
  } as AuthRequest;
}

const next: NextFunction = vi.fn();

function expectNextAppError(status: number): void {
  expect(next).toHaveBeenCalledTimes(1);
  const error = (next as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).status).toBe(status);
}

function xmlBuffer(): Buffer {
  return Buffer.from('<cfdi:Comprobante/>', 'utf-8');
}

describe('invoice.controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('parseXML', () => {
    it('lanza AppError 401 cuando no hay userId', async () => {
      const res = mockRes();

      await parseXML(
        mockReq({ body: { profileId: 'p1' }, xmlFile: { data: xmlBuffer() } as never }),
        res,
        next
      );

      expectNextAppError(401);
      expect(invoiceParseXmlForProfile).not.toHaveBeenCalled();
    });

    it('responde 200 con el resultado del parseo', async () => {
      const result = { cfdi: { uuid: 'u-1' } };
      vi.mocked(invoiceParseXmlForProfile).mockResolvedValue(result as never);
      const xmlData = xmlBuffer();
      const req = mockReq({
        userId: 'u1',
        body: { profileId: 'p1' },
        xmlFile: { data: xmlData } as never,
      });
      const res = mockRes();

      await parseXML(req, res, next);

      expect(invoiceParseXmlForProfile).toHaveBeenCalledWith('u1', 'p1', xmlData);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(result);
      expect(next).not.toHaveBeenCalled();
    });

    it('delega el error al middleware con next(error)', async () => {
      const error = new AppError('Perfil no encontrado', 404);
      vi.mocked(invoiceParseXmlForProfile).mockRejectedValue(error);
      const res = mockRes();

      await parseXML(
        mockReq({
          userId: 'u1',
          body: { profileId: 'p1' },
          xmlFile: { data: xmlBuffer() } as never,
        }),
        res,
        next
      );

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('uploadInvoice', () => {
    it('lanza AppError 401 cuando no hay userId', async () => {
      const res = mockRes();

      await uploadInvoice(
        mockReq({ body: { profileId: 'p1' }, xmlFile: { data: xmlBuffer() } as never }),
        res,
        next
      );

      expectNextAppError(401);
      expect(uploadInvoiceService).not.toHaveBeenCalled();
    });

    it('responde 200 cuando el CFDI ya estaba guardado', async () => {
      const result = { saved: true, message: 'Ya existía' };
      vi.mocked(uploadInvoiceService).mockResolvedValue(result as never);
      const xmlData = xmlBuffer();
      const req = mockReq({
        userId: 'u1',
        body: { profileId: 'p1' },
        xmlFile: { data: xmlData } as never,
      });
      const res = mockRes();

      await uploadInvoice(req, res, next);

      expect(uploadInvoiceService).toHaveBeenCalledWith('u1', 'p1', xmlData);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(result);
      expect(next).not.toHaveBeenCalled();
    });

    it('responde 201 cuando se crea un registro nuevo', async () => {
      const result = { id: 'inv-1' };
      vi.mocked(uploadInvoiceService).mockResolvedValue(result as never);
      const res = mockRes();

      await uploadInvoice(
        mockReq({
          userId: 'u1',
          body: { profileId: 'p1' },
          xmlFile: { data: xmlBuffer() } as never,
        }),
        res,
        next
      );

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    it('delega el error al middleware con next(error)', async () => {
      const error = new AppError('Perfil no encontrado', 404);
      vi.mocked(uploadInvoiceService).mockRejectedValue(error);
      const res = mockRes();

      await uploadInvoice(
        mockReq({
          userId: 'u1',
          body: { profileId: 'p1' },
          xmlFile: { data: xmlBuffer() } as never,
        }),
        res,
        next
      );

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('getInvoices', () => {
    it('lanza AppError 401 cuando no hay userId', async () => {
      const res = mockRes();

      await getInvoices(mockReq({ query: { profileId: 'p1' } }), res, next);

      expectNextAppError(401);
      expect(listInvoices).not.toHaveBeenCalled();
    });

    it('normaliza el query, lista facturas y responde 200', async () => {
      const params = { page: 1, limit: 50, profileId: 'p1' };
      const result = { data: [], pagination: { total: 0, page: 1, limit: 50, totalPages: 0 } };
      vi.mocked(normalizeInvoiceListQuery).mockReturnValue(params);
      vi.mocked(listInvoices).mockResolvedValue(result as never);
      const req = mockReq({ userId: 'u1', query: { profileId: 'p1' } });
      const res = mockRes();

      await getInvoices(req, res, next);

      expect(normalizeInvoiceListQuery).toHaveBeenCalledWith({ profileId: 'p1' });
      expect(listInvoices).toHaveBeenCalledWith('u1', params);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(result);
      expect(next).not.toHaveBeenCalled();
    });

    it('delega el error al middleware con next(error)', async () => {
      const error = new Error('DB caída');
      vi.mocked(normalizeInvoiceListQuery).mockReturnValue({ page: 1, limit: 50 });
      vi.mocked(listInvoices).mockRejectedValue(error);
      const res = mockRes();

      await getInvoices(mockReq({ userId: 'u1', query: {} }), res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('getInvoiceById', () => {
    it('lanza AppError 401 cuando no hay userId', async () => {
      const res = mockRes();

      await getInvoiceById(mockReq({ params: { id: 'inv-1' } }), res, next);

      expectNextAppError(401);
      expect(getInvoiceByIdService).not.toHaveBeenCalled();
    });

    it('responde 200 con la factura', async () => {
      const result = { data: { id: 'inv-1' } };
      vi.mocked(getInvoiceByIdService).mockResolvedValue(result as never);
      const res = mockRes();

      await getInvoiceById(mockReq({ userId: 'u1', params: { id: 'inv-1' } }), res, next);

      expect(getInvoiceByIdService).toHaveBeenCalledWith('u1', 'inv-1');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(result);
      expect(next).not.toHaveBeenCalled();
    });

    it('delega el error al middleware con next(error)', async () => {
      const error = new AppError('Factura no encontrada', 404);
      vi.mocked(getInvoiceByIdService).mockRejectedValue(error);
      const res = mockRes();

      await getInvoiceById(mockReq({ userId: 'u1', params: { id: 'inv-1' } }), res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('getMetrics', () => {
    it('lanza AppError 401 cuando no hay userId', async () => {
      const res = mockRes();

      await getMetrics(mockReq({ query: { profileId: 'p1' } }), res, next);

      expectNextAppError(401);
      expect(getMetricsService).not.toHaveBeenCalled();
    });

    it('parsea filtros opcionales y responde 200 con headers de deprecación', async () => {
      const result = {
        filters: { profileId: 'p1', mes: 12, año: 2024 },
        period_id: 'period-1',
        metrics: {},
      };
      vi.mocked(getMetricsService).mockResolvedValue(result as never);
      const req = mockReq({
        userId: 'u1',
        query: { profileId: 'p1', mes: '12', año: '2024' },
      });
      const res = mockRes();

      await getMetrics(req, res, next);

      expect(getMetricsService).toHaveBeenCalledWith('u1', {
        profileId: 'p1',
        mes: 12,
        año: 2024,
      });
      expect(res.set).toHaveBeenCalledWith('Deprecation', 'true');
      expect(res.set).toHaveBeenCalledWith('Link', '</api/metrics>; rel="successor-version"');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(result);
      expect(next).not.toHaveBeenCalled();
    });

    it('lanza AppError 400 cuando faltan mes o año', async () => {
      const res = mockRes();

      await getMetrics(
        mockReq({ userId: 'u1', query: { profileId: '', mes: 'abc', año: '' } }),
        res,
        next
      );

      expectNextAppError(400);
      expect(getMetricsService).not.toHaveBeenCalled();
    });

    it('delega el error al middleware con next(error)', async () => {
      const error = new AppError('Error al calcular métricas', 500);
      vi.mocked(getMetricsService).mockRejectedValue(error);
      const res = mockRes();

      await getMetrics(
        mockReq({ userId: 'u1', query: { mes: '1', año: '2025' } }),
        res,
        next
      );

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('deleteInvoice', () => {
    it('lanza AppError 401 cuando no hay userId', async () => {
      const res = mockRes();

      await deleteInvoice(mockReq({ params: { id: 'inv-1' } }), res, next);

      expectNextAppError(401);
      expect(deleteInvoiceService).not.toHaveBeenCalled();
    });

    it('responde 200 con el mensaje de eliminación', async () => {
      const result = { message: 'Factura eliminada exitosamente' };
      vi.mocked(deleteInvoiceService).mockResolvedValue(result as never);
      const res = mockRes();

      await deleteInvoice(mockReq({ userId: 'u1', params: { id: 'inv-1' } }), res, next);

      expect(deleteInvoiceService).toHaveBeenCalledWith('u1', 'inv-1');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(result);
      expect(next).not.toHaveBeenCalled();
    });

    it('delega el error al middleware con next(error)', async () => {
      const error = new AppError('Factura no encontrada', 404);
      vi.mocked(deleteInvoiceService).mockRejectedValue(error);
      const res = mockRes();

      await deleteInvoice(mockReq({ userId: 'u1', params: { id: 'inv-1' } }), res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });
});

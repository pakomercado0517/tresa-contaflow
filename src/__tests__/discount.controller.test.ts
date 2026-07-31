import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError.js';
import type { AuthRequest } from '../middlewares/auth.middleware.js';

vi.mock('../services/discount.service.js', () => ({
  createDiscountCodeService: vi.fn(),
  setDiscountActiveService: vi.fn(),
  listDiscountCodesService: vi.fn(),
}));

vi.mock('../mappers/discount.mapper.js', () => ({
  mapDiscountResponse: vi.fn((record: { id: string }) => ({ id: record.id, mapped: true })),
}));

import {
  createDiscountCodeService,
  setDiscountActiveService,
  listDiscountCodesService,
} from '../services/discount.service.js';
import { mapDiscountResponse } from '../mappers/discount.mapper.js';
import {
  createDiscountCode,
  activateDiscountCode,
  deactivateDiscountCode,
  listDiscountCodes,
} from '../controllers/discount.controller.js';

function mockRes(): Response {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res) as unknown as Response['status'];
  res.json = vi.fn().mockReturnValue(res) as unknown as Response['json'];
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

describe('discount.controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createDiscountCode', () => {
    it('lanza AppError 401 cuando no hay userId', async () => {
      const res = mockRes();

      await createDiscountCode(
        mockReq({ body: { code: 'X', duration: 'once', percentOff: 10 } }),
        res,
        next
      );

      expectNextAppError(401);
      expect(createDiscountCodeService).not.toHaveBeenCalled();
    });

    it('responde 201 normalizando el code y mapeando la respuesta', async () => {
      vi.mocked(createDiscountCodeService).mockResolvedValue({ id: 'id-1' } as never);
      const req = mockReq({
        userId: 'u1',
        body: { code: ' test60 ', duration: 'once', percentOff: 100, trialDays: 60 },
      });
      const res = mockRes();

      await createDiscountCode(req, res, next);

      const inputArg = vi.mocked(createDiscountCodeService).mock.calls[0]?.[0];
      expect(inputArg?.code).toBe('TEST60');
      expect(inputArg?.trialDays).toBe(60);
      expect(createDiscountCodeService).toHaveBeenCalledWith(expect.anything(), 'u1');
      expect(mapDiscountResponse).toHaveBeenCalledWith({ id: 'id-1' });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Código de descuento creado exitosamente',
        discountCode: { id: 'id-1', mapped: true },
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('delega el error al middleware con next(error)', async () => {
      const error = new AppError('percentOff o amountOff', 400);
      vi.mocked(createDiscountCodeService).mockRejectedValue(error);
      const res = mockRes();

      await createDiscountCode(
        mockReq({ userId: 'u1', body: { code: 'X', duration: 'once', percentOff: 1 } }),
        res,
        next
      );

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('activateDiscountCode', () => {
    it('responde con el código activado', async () => {
      vi.mocked(setDiscountActiveService).mockResolvedValue({ id: 'id-1' } as never);
      const res = mockRes();

      await activateDiscountCode(mockReq({ params: { id: 'id-1' } }), res, next);

      expect(setDiscountActiveService).toHaveBeenCalledWith('id-1', true);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Código de descuento activado',
        discountCode: { id: 'id-1', mapped: true },
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('delega el error al middleware con next(error)', async () => {
      const error = new AppError('Código de descuento no encontrado', 404);
      vi.mocked(setDiscountActiveService).mockRejectedValue(error);
      const res = mockRes();

      await activateDiscountCode(mockReq({ params: { id: 'id-1' } }), res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('deactivateDiscountCode', () => {
    it('responde con el código desactivado', async () => {
      vi.mocked(setDiscountActiveService).mockResolvedValue({ id: 'id-1' } as never);
      const res = mockRes();

      await deactivateDiscountCode(mockReq({ params: { id: 'id-1' } }), res, next);

      expect(setDiscountActiveService).toHaveBeenCalledWith('id-1', false);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Código de descuento desactivado',
        discountCode: { id: 'id-1', mapped: true },
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('delega el error al middleware con next(error)', async () => {
      const error = new AppError('Código de descuento no encontrado', 404);
      vi.mocked(setDiscountActiveService).mockRejectedValue(error);
      const res = mockRes();

      await deactivateDiscountCode(mockReq({ params: { id: 'id-1' } }), res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('listDiscountCodes', () => {
    it('normaliza filtros y responde con data, count y pagination', async () => {
      vi.mocked(listDiscountCodesService).mockResolvedValue({
        data: [{ id: 'id-1' }, { id: 'id-2' }] as never,
        count: 2,
        pagination: { total: 2, page: 1, limit: 50, totalPages: 1 },
      });
      const req = mockReq({ query: { code: ' test60 ', active: 'true', page: '1', limit: '50' } });
      const res = mockRes();

      await listDiscountCodes(req, res, next);

      expect(listDiscountCodesService).toHaveBeenCalledWith({
        code: 'TEST60',
        active: true,
        page: 1,
        limit: 50,
      });
      expect(res.json).toHaveBeenCalledWith({
        data: [
          { id: 'id-1', mapped: true },
          { id: 'id-2', mapped: true },
        ],
        count: 2,
        pagination: { total: 2, page: 1, limit: 50, totalPages: 1 },
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('consulta con defaults cuando no se envían query params', async () => {
      vi.mocked(listDiscountCodesService).mockResolvedValue({
        data: [] as never,
        count: 0,
        pagination: { total: 0, page: 1, limit: 50, totalPages: 1 },
      });
      const res = mockRes();

      await listDiscountCodes(mockReq(), res, next);

      expect(listDiscountCodesService).toHaveBeenCalledWith({ page: 1, limit: 50 });
      expect(res.json).toHaveBeenCalledWith({
        data: [],
        count: 0,
        pagination: { total: 0, page: 1, limit: 50, totalPages: 1 },
      });
    });

    it('delega el error al middleware con next(error)', async () => {
      const error = new Error('DB caída');
      vi.mocked(listDiscountCodesService).mockRejectedValue(error);
      const res = mockRes();

      await listDiscountCodes(mockReq(), res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });
});

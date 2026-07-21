import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Response } from 'express';
import type { AuthRequest } from '../middlewares/auth.middleware.js';
import { AppError } from '../utils/AppError.js';

const { listForUser, getByIdForUser } = vi.hoisted(() => ({
  listForUser: vi.fn(),
  getByIdForUser: vi.fn(),
}));

vi.mock('../services/payment-complement.service.js', () => ({
  listForUser,
  getByIdForUser,
}));

import {
  getPaymentComplementById,
  getPaymentComplements,
} from '../controllers/payment-complement.controller.js';

const mockRes = () => {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res as unknown as Response;
};

const mockReq = (overrides: Partial<AuthRequest> = {}) =>
  ({
    userId: 'u1',
    query: {},
    params: {},
    ...overrides,
  }) as AuthRequest;

describe('payment-complement.controller', () => {
  let next: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    next = vi.fn();
  });

  describe('getPaymentComplements', () => {
    it('envia AppError 401 si no hay usuario autenticado', async () => {
      const res = mockRes();

      await getPaymentComplements(mockReq({ userId: undefined }), res, next);

      expect(listForUser).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      expect(vi.mocked(next).mock.calls[0]?.[0]).toMatchObject({
        status: 401,
        message: 'Usuario no autenticado',
      });
    });

    it('lista complementos con parametros normalizados', async () => {
      const result = {
        data: [],
        pagination: { total: 0, page: 2, limit: 25, totalPages: 0 },
      };
      vi.mocked(listForUser).mockResolvedValue(result as never);
      const res = mockRes();

      await getPaymentComplements(
        mockReq({
          query: {
            profile_id: 'p1',
            role: 'INGRESO',
            mes: '12',
            año: '2025',
            page: '2',
            limit: '25',
          },
        }),
        res,
        next
      );

      expect(listForUser).toHaveBeenCalledWith({
        userId: 'u1',
        profileId: 'p1',
        role: 'INGRESO',
        mes: 12,
        año: 2025,
        page: 2,
        limit: 25,
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(result);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('getPaymentComplementById', () => {
    it('obtiene el detalle y lo envuelve en data', async () => {
      const detail = { id: 'comp-1', uuid: 'uuid-1' };
      vi.mocked(getByIdForUser).mockResolvedValue(detail as never);
      const res = mockRes();

      await getPaymentComplementById(
        mockReq({ params: { id: 'comp-1' }, query: { profile_id: 'p1' } }),
        res,
        next
      );

      expect(getByIdForUser).toHaveBeenCalledWith('comp-1', 'u1', 'p1');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ data: detail });
      expect(next).not.toHaveBeenCalled();
    });
  });
});

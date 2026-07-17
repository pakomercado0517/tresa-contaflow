import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError.js';
import type { AuthRequest } from '../middlewares/auth.middleware.js';

vi.mock('../services/accrued-expenses.service.js', () => ({
  createAccruedExpenseService: vi.fn(),
  deleteAccruedExpenseService: vi.fn(),
  getAccruedExpenseByIdService: vi.fn(),
  getAccruedExpensesService: vi.fn(),
  updateAccruedExpenseService: vi.fn(),
}));

import {
  createAccruedExpenseService,
  deleteAccruedExpenseService,
  getAccruedExpenseByIdService,
  getAccruedExpensesService,
  updateAccruedExpenseService,
} from '../services/accrued-expenses.service.js';
import {
  getAccruedExpenses,
  getAccruedExpenseById,
  createAccruedExpense,
  updateAccruedExpense,
  deleteAccruedExpense,
} from '../controllers/accrued-expenses.controller.js';

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

describe('accrued-expenses.controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAccruedExpenses', () => {
    it('lanza AppError 400 cuando falta periodId', async () => {
      const res = mockRes();

      await getAccruedExpenses(mockReq({ userId: 'u1', query: {} }), res, next);

      expectNextAppError(400);
      expect(getAccruedExpensesService).not.toHaveBeenCalled();
    });

    it('responde 200 usando el type por defecto MANUAL', async () => {
      const result = { data: [] };
      vi.mocked(getAccruedExpensesService).mockResolvedValue(result as never);
      const req = mockReq({ userId: 'u1', query: { periodId: 'p1' } });
      const res = mockRes();

      await getAccruedExpenses(req, res, next);

      expect(getAccruedExpensesService).toHaveBeenCalledWith('u1', 'p1', 'MANUAL');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(result);
      expect(next).not.toHaveBeenCalled();
    });

    it('respeta el type recibido por query', async () => {
      vi.mocked(getAccruedExpensesService).mockResolvedValue({ data: [] } as never);
      const req = mockReq({ userId: 'u1', query: { periodId: 'p1', type: 'CFDI' } });
      const res = mockRes();

      await getAccruedExpenses(req, res, next);

      expect(getAccruedExpensesService).toHaveBeenCalledWith('u1', 'p1', 'CFDI');
    });

    it('delega el error al middleware con next(error)', async () => {
      const error = new AppError('Periodo no encontrado o no pertenece al usuario', 404);
      vi.mocked(getAccruedExpensesService).mockRejectedValue(error);
      const res = mockRes();

      await getAccruedExpenses(mockReq({ userId: 'u1', query: { periodId: 'p1' } }), res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('getAccruedExpenseById', () => {
    it('lanza AppError 400 cuando falta el id', async () => {
      const res = mockRes();

      await getAccruedExpenseById(mockReq({ userId: 'u1', params: {} }), res, next);

      expectNextAppError(400);
      expect(getAccruedExpenseByIdService).not.toHaveBeenCalled();
    });

    it('responde 200 con el gasto', async () => {
      const result = { data: { id: 'e1' } };
      vi.mocked(getAccruedExpenseByIdService).mockResolvedValue(result as never);
      const res = mockRes();

      await getAccruedExpenseById(mockReq({ userId: 'u1', params: { id: 'e1' } }), res, next);

      expect(getAccruedExpenseByIdService).toHaveBeenCalledWith('u1', 'e1');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(result);
      expect(next).not.toHaveBeenCalled();
    });

    it('delega el error al middleware con next(error)', async () => {
      const error = new AppError('Gasto no encontrado', 404);
      vi.mocked(getAccruedExpenseByIdService).mockRejectedValue(error);
      const res = mockRes();

      await getAccruedExpenseById(mockReq({ userId: 'u1', params: { id: 'e1' } }), res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('createAccruedExpense', () => {
    it('lanza AppError 400 cuando falta profileId', async () => {
      const res = mockRes();

      await createAccruedExpense(mockReq({ userId: 'u1', body: {} }), res, next);

      expectNextAppError(400);
      expect(createAccruedExpenseService).not.toHaveBeenCalled();
    });

    it('responde 201 mapeando el body al DTO del servicio', async () => {
      const result = { message: 'Gasto devengado creado', data: { id: 'e1' } };
      vi.mocked(createAccruedExpenseService).mockResolvedValue(result as never);
      const req = mockReq({
        userId: 'u1',
        body: {
          profileId: 'p1',
          fecha: '2026-01-15',
          concepto: 'Renta',
          subtotal: 1000,
          iva_amount: 160,
          categoria: 'Oficina',
        },
      });
      const res = mockRes();

      await createAccruedExpense(req, res, next);

      expect(createAccruedExpenseService).toHaveBeenCalledWith('u1', {
        profile_id: 'p1',
        fecha: '2026-01-15',
        concepto: 'Renta',
        subtotal: 1000,
        iva_amount: 160,
        categoria: 'Oficina',
      });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(result);
      expect(next).not.toHaveBeenCalled();
    });

    it('delega el error al middleware con next(error)', async () => {
      const error = new AppError('Perfil no encontrado o no pertenece al usuario', 404);
      vi.mocked(createAccruedExpenseService).mockRejectedValue(error);
      const res = mockRes();

      await createAccruedExpense(
        mockReq({ userId: 'u1', body: { profileId: 'p1' } }),
        res,
        next
      );

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('updateAccruedExpense', () => {
    it('responde 200 con el gasto actualizado', async () => {
      const result = { message: 'Gasto devengado actualizado', data: { id: 'e1' } };
      vi.mocked(updateAccruedExpenseService).mockResolvedValue(result as never);
      const req = mockReq({ userId: 'u1', params: { id: 'e1' }, body: { subtotal: 500 } });
      const res = mockRes();

      await updateAccruedExpense(req, res, next);

      expect(updateAccruedExpenseService).toHaveBeenCalledWith('u1', 'e1', { subtotal: 500 });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(result);
      expect(next).not.toHaveBeenCalled();
    });

    it('delega el error al middleware con next(error)', async () => {
      const error = new AppError('Gasto no encontrado', 404);
      vi.mocked(updateAccruedExpenseService).mockRejectedValue(error);
      const res = mockRes();

      await updateAccruedExpense(
        mockReq({ userId: 'u1', params: { id: 'e1' }, body: {} }),
        res,
        next
      );

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('deleteAccruedExpense', () => {
    it('responde 200 con el mensaje de eliminación', async () => {
      const result = { message: 'Gasto devengado eliminado' };
      vi.mocked(deleteAccruedExpenseService).mockResolvedValue(result as never);
      const res = mockRes();

      await deleteAccruedExpense(mockReq({ userId: 'u1', params: { id: 'e1' } }), res, next);

      expect(deleteAccruedExpenseService).toHaveBeenCalledWith('u1', 'e1');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(result);
      expect(next).not.toHaveBeenCalled();
    });

    it('delega el error al middleware con next(error)', async () => {
      const error = new AppError('Gasto no encontrado', 404);
      vi.mocked(deleteAccruedExpenseService).mockRejectedValue(error);
      const res = mockRes();

      await deleteAccruedExpense(mockReq({ userId: 'u1', params: { id: 'e1' } }), res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });
});

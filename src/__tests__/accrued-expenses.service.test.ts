import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '../utils/AppError.js';

const { periodFindOne, profileFindOne, accruedFindOne, accruedFindAll, accruedCreate } = vi.hoisted(
  () => ({
    periodFindOne: vi.fn(),
    profileFindOne: vi.fn(),
    accruedFindOne: vi.fn(),
    accruedFindAll: vi.fn(),
    accruedCreate: vi.fn(),
  })
);

vi.mock('../database/models/index.js', () => ({
  Period: { findOne: periodFindOne },
  Profile: { findOne: profileFindOne },
  AccruedExpense: {
    findOne: accruedFindOne,
    findAll: accruedFindAll,
    create: accruedCreate,
  },
}));

vi.mock('../services/cache.service.js', () => ({
  invalidateProfileCache: vi.fn(),
}));

import { invalidateProfileCache } from '../services/cache.service.js';
import {
  getAccruedExpensesService,
  getAccruedExpenseByIdService,
  createAccruedExpenseService,
  updateAccruedExpenseService,
  deleteAccruedExpenseService,
} from '../services/accrued-expenses.service.js';

async function catchError(promise: Promise<unknown>): Promise<AppError> {
  try {
    await promise;
  } catch (error) {
    return error as AppError;
  }
  throw new Error('Se esperaba que la promesa fuera rechazada, pero se resolvió');
}

describe('accrued-expenses.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAccruedExpensesService', () => {
    it('lanza AppError 404 si el periodo no existe o no pertenece al usuario', async () => {
      periodFindOne.mockResolvedValue(null);

      const error = await catchError(getAccruedExpensesService('u1', 'p1', 'MANUAL'));

      expect(error.status).toBe(404);
      expect(accruedFindAll).not.toHaveBeenCalled();
    });

    it('retorna los gastos del periodo filtrando por profile y tipo_origen', async () => {
      periodFindOne.mockResolvedValue({
        profile_id: 'p1',
        start_date: '2026-01-01',
        end_date: '2026-01-31',
      });
      const expenses = [{ id: 'e1' }];
      accruedFindAll.mockResolvedValue(expenses);

      const result = await getAccruedExpensesService('u1', 'p1', 'MANUAL');

      expect(accruedFindAll).toHaveBeenCalledTimes(1);
      const whereArg = accruedFindAll.mock.calls[0]?.[0].where;
      expect(whereArg.profile_id).toBe('p1');
      expect(whereArg.tipo_origen).toBe('MANUAL');
      expect(result).toEqual({ data: expenses });
    });
  });

  describe('getAccruedExpenseByIdService', () => {
    it('lanza AppError 404 si el gasto no existe', async () => {
      accruedFindOne.mockResolvedValue(null);

      const error = await catchError(getAccruedExpenseByIdService('u1', 'e1'));

      expect(error.status).toBe(404);
    });

    it('lanza AppError 400 si el gasto no es MANUAL', async () => {
      accruedFindOne.mockResolvedValue({ id: 'e1', tipo_origen: 'CFDI' });

      const error = await catchError(getAccruedExpenseByIdService('u1', 'e1'));

      expect(error.status).toBe(400);
    });

    it('retorna el gasto cuando existe y es MANUAL', async () => {
      const expense = { id: 'e1', tipo_origen: 'MANUAL' };
      accruedFindOne.mockResolvedValue(expense);

      const result = await getAccruedExpenseByIdService('u1', 'e1');

      expect(result).toEqual({ data: expense });
    });
  });

  describe('createAccruedExpenseService', () => {
    it('lanza AppError 404 si el perfil no pertenece al usuario', async () => {
      profileFindOne.mockResolvedValue(null);

      const error = await catchError(
        createAccruedExpenseService('u1', {
          profile_id: 'p1',
          fecha: '2026-01-15',
          concepto: 'Renta',
          subtotal: 1000,
          iva_amount: 160,
          categoria: 'Oficina',
        })
      );

      expect(error.status).toBe(404);
      expect(accruedCreate).not.toHaveBeenCalled();
    });

    it('lanza AppError 400 si la fecha es inválida', async () => {
      profileFindOne.mockResolvedValue({ id: 'p1' });

      const error = await catchError(
        createAccruedExpenseService('u1', {
          profile_id: 'p1',
          fecha: 'no-es-fecha',
          concepto: 'Renta',
          subtotal: 1000,
          iva_amount: 160,
          categoria: 'Oficina',
        })
      );

      expect(error.status).toBe(400);
    });

    it('calcula mes, año y total, crea el gasto e invalida caché', async () => {
      profileFindOne.mockResolvedValue({ id: 'p1' });
      accruedCreate.mockResolvedValue({ id: 'e1' });

      const result = await createAccruedExpenseService('u1', {
        profile_id: 'p1',
        fecha: '2026-01-15',
        concepto: 'Renta',
        subtotal: 1000,
        iva_amount: 160,
        categoria: 'Oficina',
      });

      const createArg = accruedCreate.mock.calls[0]?.[0];
      expect(createArg.mes).toBe(1);
      expect(createArg.año).toBe(2026);
      expect(createArg.subtotal).toBe(1000);
      expect(createArg.iva).toBe(160);
      expect(createArg.total).toBe(1160);
      expect(createArg.tipo_origen).toBe('MANUAL');
      expect(invalidateProfileCache).toHaveBeenCalledWith('p1');
      expect(result).toEqual({ message: 'Gasto devengado creado', data: { id: 'e1' } });
    });
  });

  describe('updateAccruedExpenseService', () => {
    it('lanza AppError 404 si el gasto no existe', async () => {
      accruedFindOne.mockResolvedValue(null);

      const error = await catchError(updateAccruedExpenseService('u1', 'e1', {} as never));

      expect(error.status).toBe(404);
    });

    it('lanza AppError 400 si el gasto no es MANUAL', async () => {
      accruedFindOne.mockResolvedValue({ id: 'e1', tipo_origen: 'CFDI' });

      const error = await catchError(updateAccruedExpenseService('u1', 'e1', {} as never));

      expect(error.status).toBe(400);
    });

    it('lanza AppError 400 si payment_date es inválido', async () => {
      accruedFindOne.mockResolvedValue({
        id: 'e1',
        tipo_origen: 'MANUAL',
        update: vi.fn(),
      });

      const error = await catchError(
        updateAccruedExpenseService('u1', 'e1', { payment_date: 'no-fecha' } as never)
      );

      expect(error.status).toBe(400);
    });

    it('recalcula total al actualizar subtotal e iva_amount', async () => {
      const update = vi.fn();
      accruedFindOne.mockResolvedValue({
        id: 'e1',
        tipo_origen: 'MANUAL',
        profile_id: 'p1',
        subtotal: 1000,
        iva_amount: 160,
        update,
      });

      const result = await updateAccruedExpenseService('u1', 'e1', {
        subtotal: 500,
        iva_amount: 80,
      } as never);

      const updateArg = update.mock.calls[0]?.[0];
      expect(updateArg.subtotal).toBe(500);
      expect(updateArg.iva).toBe(80);
      expect(updateArg.iva_amount).toBe(80);
      expect(updateArg.total).toBe(580);
      expect(invalidateProfileCache).toHaveBeenCalledWith('p1');
      expect(result.message).toBe('Gasto devengado actualizado');
    });
  });

  describe('deleteAccruedExpenseService', () => {
    it('lanza AppError 404 si el gasto no existe', async () => {
      accruedFindOne.mockResolvedValue(null);

      const error = await catchError(deleteAccruedExpenseService('u1', 'e1'));

      expect(error.status).toBe(404);
    });

    it('lanza AppError 400 si el gasto no es MANUAL', async () => {
      accruedFindOne.mockResolvedValue({ id: 'e1', tipo_origen: 'CFDI' });

      const error = await catchError(deleteAccruedExpenseService('u1', 'e1'));

      expect(error.status).toBe(400);
    });

    it('elimina el gasto e invalida la caché del perfil', async () => {
      const destroy = vi.fn();
      accruedFindOne.mockResolvedValue({
        id: 'e1',
        tipo_origen: 'MANUAL',
        profile_id: 'p1',
        destroy,
      });

      const result = await deleteAccruedExpenseService('u1', 'e1');

      expect(destroy).toHaveBeenCalledTimes(1);
      expect(invalidateProfileCache).toHaveBeenCalledWith('p1');
      expect(result).toEqual({ message: 'Gasto devengado eliminado' });
    });
  });
});

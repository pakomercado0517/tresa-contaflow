import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '../utils/AppError.js';
import type { CreateAccruedExpenseDto } from '../types/accrued-expenses.types.js';

const {
  periodFindOne,
  profileFindOne,
  accruedFindAll,
  accruedCreate,
  findOwnedManualExpense,
} = vi.hoisted(() => ({
  periodFindOne: vi.fn(),
  profileFindOne: vi.fn(),
  accruedFindAll: vi.fn(),
  accruedCreate: vi.fn(),
  findOwnedManualExpense: vi.fn(),
}));

vi.mock('../database/models/index.js', () => ({
  Period: { findOne: periodFindOne },
  Profile: { findOne: profileFindOne },
  AccruedExpense: {
    findAll: accruedFindAll,
    create: accruedCreate,
  },
}));

vi.mock('../services/accrued-expenses.helper.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/accrued-expenses.helper.js')>();
  return {
    ...actual,
    findOwnedManualExpense,
  };
});

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

const baseCreateDto: CreateAccruedExpenseDto = {
  profile_id: 'p1',
  period_id: 'period-1',
  fecha: '2026-01-15',
  concept: 'Renta',
  subtotal: 1000,
  iva: 16,
  categoria: 'Oficina',
};

function mockPeriodInRange(): void {
  periodFindOne.mockResolvedValue({
    id: 'period-1',
    start_date: '2026-01-01',
    end_date: '2026-01-31',
  });
}

describe('accrued-expenses.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAccruedExpensesService', () => {
    it('lanza AppError 404 si el periodo no existe o no pertenece al usuario', async () => {
      periodFindOne.mockResolvedValue(null);

      const error = await catchError(getAccruedExpensesService('u1', 'p1', 'manual'));

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

      const result = await getAccruedExpensesService('u1', 'p1', 'manual');

      expect(accruedFindAll).toHaveBeenCalledTimes(1);
      const whereArg = accruedFindAll.mock.calls[0]?.[0].where;
      expect(whereArg.profile_id).toBe('p1');
      expect(whereArg.tipo_origen).toBe('MANUAL');
      expect(result).toEqual({ data: expenses });
    });
  });

  describe('getAccruedExpenseByIdService', () => {
    it('retorna el gasto cuando existe y es MANUAL', async () => {
      const expense = { id: 'e1', tipo_origen: 'MANUAL' };
      findOwnedManualExpense.mockResolvedValue(expense);

      const result = await getAccruedExpenseByIdService('u1', 'e1');

      expect(findOwnedManualExpense).toHaveBeenCalledWith('u1', 'e1');
      expect(result).toEqual({ data: expense });
    });
  });

  describe('createAccruedExpenseService', () => {
    it('lanza AppError 404 si el perfil no pertenece al usuario', async () => {
      profileFindOne.mockResolvedValue(null);

      const error = await catchError(createAccruedExpenseService(baseCreateDto, 'u1'));

      expect(error.status).toBe(404);
      expect(accruedCreate).not.toHaveBeenCalled();
    });

    it('lanza AppError 404 si el periodo no pertenece al perfil', async () => {
      profileFindOne.mockResolvedValue({ id: 'p1' });
      periodFindOne.mockResolvedValue(null);

      const error = await catchError(createAccruedExpenseService(baseCreateDto, 'u1'));

      expect(error.status).toBe(404);
      expect(accruedCreate).not.toHaveBeenCalled();
    });

    it('lanza AppError 400 si la fecha es inválida', async () => {
      profileFindOne.mockResolvedValue({ id: 'p1' });
      mockPeriodInRange();

      const error = await catchError(
        createAccruedExpenseService({ ...baseCreateDto, fecha: 'no-es-fecha' }, 'u1')
      );

      expect(error.status).toBe(400);
    });

    it('lanza AppError 400 si la fecha está fuera del periodo', async () => {
      profileFindOne.mockResolvedValue({ id: 'p1' });
      mockPeriodInRange();

      const error = await catchError(
        createAccruedExpenseService({ ...baseCreateDto, fecha: '2026-02-15' }, 'u1')
      );

      expect(error.status).toBe(400);
      expect(accruedCreate).not.toHaveBeenCalled();
    });

    it('calcula iva_amount desde el porcentaje iva, crea el gasto e invalida caché', async () => {
      profileFindOne.mockResolvedValue({ id: 'p1' });
      mockPeriodInRange();
      accruedCreate.mockResolvedValue({ id: 'e1' });

      const result = await createAccruedExpenseService(baseCreateDto, 'u1');

      const createArg = accruedCreate.mock.calls[0]?.[0];
      expect(createArg.mes).toBe(1);
      expect(createArg.año).toBe(2026);
      expect(createArg.subtotal).toBe(1000);
      expect(createArg.iva).toBe(16);
      expect(createArg.iva_amount).toBe(160);
      expect(createArg.total).toBe(1160);
      expect(createArg.concepto).toBe('Renta');
      expect(createArg.tipo_origen).toBe('MANUAL');
      expect(invalidateProfileCache).toHaveBeenCalledWith('p1');
      expect(result).toEqual({ message: 'Gasto devengado creado', data: { id: 'e1' } });
    });
  });

  describe('updateAccruedExpenseService', () => {
    it('lanza AppError 404 si el gasto no existe', async () => {
      findOwnedManualExpense.mockRejectedValue(new AppError('Gasto no encontrado', 404));

      const error = await catchError(updateAccruedExpenseService('u1', 'e1', {}));

      expect(error.status).toBe(404);
    });

    it('lanza AppError 400 si payment_date es inválido', async () => {
      findOwnedManualExpense.mockResolvedValue({
        id: 'e1',
        tipo_origen: 'MANUAL',
        subtotal: 1000,
        iva: 16,
        iva_amount: 160,
        update: vi.fn(),
      });

      const error = await catchError(
        updateAccruedExpenseService('u1', 'e1', { payment_date: 'no-fecha' })
      );

      expect(error.status).toBe(400);
    });

    it('recalcula iva_amount y total al actualizar subtotal manteniendo el porcentaje iva', async () => {
      const update = vi.fn();
      findOwnedManualExpense.mockResolvedValue({
        id: 'e1',
        tipo_origen: 'MANUAL',
        profile_id: 'p1',
        subtotal: 1000,
        iva: 16,
        iva_amount: 160,
        update,
      });

      const result = await updateAccruedExpenseService('u1', 'e1', { subtotal: 500 });

      const updateArg = update.mock.calls[0]?.[0];
      expect(updateArg.subtotal).toBe(500);
      expect(updateArg.iva).toBe(16);
      expect(updateArg.iva_amount).toBe(80);
      expect(updateArg.total).toBe(580);
      expect(invalidateProfileCache).toHaveBeenCalledWith('p1');
      expect(result.message).toBe('Gasto devengado actualizado');
    });

    it('recalcula iva_amount y total al actualizar el porcentaje iva', async () => {
      const update = vi.fn();
      findOwnedManualExpense.mockResolvedValue({
        id: 'e1',
        tipo_origen: 'MANUAL',
        profile_id: 'p1',
        subtotal: 1000,
        iva: 16,
        iva_amount: 160,
        update,
      });

      await updateAccruedExpenseService('u1', 'e1', { iva: 8 });

      const updateArg = update.mock.calls[0]?.[0];
      expect(updateArg.subtotal).toBe(1000);
      expect(updateArg.iva).toBe(8);
      expect(updateArg.iva_amount).toBe(80);
      expect(updateArg.total).toBe(1080);
    });
  });

  describe('deleteAccruedExpenseService', () => {
    it('elimina el gasto e invalida la caché del perfil', async () => {
      const destroy = vi.fn();
      findOwnedManualExpense.mockResolvedValue({
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

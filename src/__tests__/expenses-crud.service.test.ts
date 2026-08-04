import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '../utils/AppError.js';
import type { CreateExpenseDto } from '../types/expense.types.js';

const {
  profileFindOne,
  accruedCreate,
  findOwnedExpense,
  findOwnedManualExpense,
} = vi.hoisted(() => ({
  profileFindOne: vi.fn(),
  accruedCreate: vi.fn(),
  findOwnedExpense: vi.fn(),
  findOwnedManualExpense: vi.fn(),
}));

vi.mock('../database/models/AccruedExpense.model.js', () => ({
  default: { create: accruedCreate },
}));

vi.mock('../database/models/Profile.model.js', () => ({
  default: { findOne: profileFindOne },
}));

vi.mock('../services/helpers/accrued-expenses.helper.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../services/helpers/accrued-expenses.helper.js')>();
  return {
    ...actual,
    findOwnedExpense,
    findOwnedManualExpense,
  };
});

vi.mock('../services/cache.service.js', () => ({
  invalidateProfileCache: vi.fn(),
}));

vi.mock('../services/payment-status.service.js', () => ({
  calcularEstadoPagoGasto: vi.fn(),
}));

import { invalidateProfileCache } from '../services/cache.service.js';
import {
  createExpenseService,
  deleteExpenseService,
  getExpenseByIdService,
  updateExpenseService,
} from '../services/expenses-crud.service.js';

async function catchError(promise: Promise<unknown>): Promise<AppError> {
  try {
    await promise;
  } catch (error) {
    return error as AppError;
  }
  throw new Error('Se esperaba que la promesa fuera rechazada, pero se resolvió');
}

const baseCreateDto: CreateExpenseDto = {
  profileId: 'profile-1',
  fecha: '2024-12-15T00:00:00.000Z',
  subtotal: 431.03,
  iva: 16,
  concepto: 'Gasto de prueba',
  categoria: 'Servicios',
};

describe('expenses-crud.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createExpenseService', () => {
    it('calcula iva_amount y total desde subtotal y porcentaje iva', async () => {
      profileFindOne.mockResolvedValue({ id: 'profile-1' });
      accruedCreate.mockResolvedValue({ id: 'expense-1' });

      await createExpenseService('user-1', baseCreateDto);

      expect(accruedCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          subtotal: 431.03,
          iva: 16,
          iva_amount: 68.96,
          total: 499.99,
          tipo_origen: 'MANUAL',
        })
      );
      expect(invalidateProfileCache).toHaveBeenCalledWith('profile-1');
    });

    it('rechaza perfil ajeno o inexistente', async () => {
      profileFindOne.mockResolvedValue(null);

      const error = await catchError(createExpenseService('user-1', baseCreateDto));

      expect(error).toBeInstanceOf(AppError);
      expect(error.status).toBe(404);
    });
  });

  describe('getExpenseByIdService', () => {
    it('delega ownership a findOwnedExpense', async () => {
      findOwnedExpense.mockResolvedValue({
        id: 'expense-1',
        profile_id: 'profile-1',
        tipo: null,
        uuid: null,
        toJSON: () => ({ id: 'expense-1' }),
      });

      const result = await getExpenseByIdService('user-1', 'expense-1');

      expect(findOwnedExpense).toHaveBeenCalledWith('user-1', 'expense-1');
      expect(result.data).toMatchObject({ id: 'expense-1', estadoPago: null });
    });
  });

  describe('updateExpenseService', () => {
    it('recalcula montos cuando cambia subtotal', async () => {
      const expense = {
        id: 'expense-1',
        profile_id: 'profile-1',
        subtotal: 400,
        iva: 16,
        update: vi.fn().mockResolvedValue(undefined),
      };
      findOwnedManualExpense.mockResolvedValue(expense);

      await updateExpenseService('user-1', 'expense-1', { subtotal: 500 });

      expect(expense.update).toHaveBeenCalledWith(
        expect.objectContaining({
          subtotal: 500,
          iva: 16,
          iva_amount: 80,
          total: 580,
        })
      );
      expect(invalidateProfileCache).toHaveBeenCalledWith('profile-1');
    });
  });

  describe('deleteExpenseService', () => {
    it('solo elimina gastos manuales del usuario', async () => {
      const expense = {
        profile_id: 'profile-1',
        destroy: vi.fn().mockResolvedValue(undefined),
      };
      findOwnedManualExpense.mockResolvedValue(expense);

      const result = await deleteExpenseService('user-1', 'expense-1');

      expect(findOwnedManualExpense).toHaveBeenCalledWith('user-1', 'expense-1');
      expect(expense.destroy).toHaveBeenCalled();
      expect(result.message).toBe('Gasto eliminado exitosamente');
    });
  });
});

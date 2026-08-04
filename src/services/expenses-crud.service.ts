import AccruedExpense from '../database/models/AccruedExpense.model.js';
import Profile from '../database/models/Profile.model.js';
import type {
  CreateExpenseDto,
  ExpenseByIdResponse,
  ExpenseDeleteResponse,
  ExpenseMutationResponse,
  UpdateExpenseDto,
} from '../types/expense.types.js';
import { AppError } from '../utils/AppError.js';
import { invalidateProfileCache } from './cache.service.js';
import {
  calculateManualExpenseAmounts,
  findOwnedExpense,
  findOwnedManualExpense,
} from './helpers/accrued-expenses.helper.js';
import { calcularEstadoPagoGasto } from './payment-status.service.js';

const DEFAULT_EXPENSE_VALUES: Partial<AccruedExpense> = {
  uuid: null,
  tipo: null,
  rfc_emisor: null,
  nombre_emisor: null,
  regimen_fiscal_emisor: null,
  rfc_receptor: null,
  nombre_receptor: null,
  regimen_fiscal_receptor: null,
  pagos: [],
  complemento_pago: null,
  validacion: {
    rfcVerificado: true,
    regimenFiscalVerificado: true,
    uuidDuplicado: false,
    advertencias: [],
    errores: [],
    valido: true,
  },
};

export async function getExpenseByIdService(
  userId: string,
  id: string
): Promise<ExpenseByIdResponse> {
  const expense = await findOwnedExpense(userId, id);

  let estadoPago = null;
  if (expense.tipo && expense.uuid) {
    estadoPago = await calcularEstadoPagoGasto(expense, expense.profile_id);
  }

  return {
    data: {
      ...expense.toJSON(),
      estadoPago,
    },
  };
}

export async function createExpenseService(
  userId: string,
  data: CreateExpenseDto
): Promise<ExpenseMutationResponse> {
  const profile = await Profile.findOne({
    where: { id: data.profileId, user_id: userId },
  });
  if (!profile) throw new AppError('Perfil no encontrado', 404);

  const fechaDate = new Date(data.fecha);
  if (isNaN(fechaDate.getTime())) throw new AppError('Fecha inválida', 400);

  const subtotalNum = Number(data.subtotal);
  const ivaRate = Number(data.iva);

  if (Number.isNaN(subtotalNum) || Number.isNaN(ivaRate)) {
    throw new AppError('subtotal e iva deben ser números válidos', 400);
  }

  const amounts = calculateManualExpenseAmounts(subtotalNum, ivaRate);
  const mes = fechaDate.getMonth() + 1;
  const año = fechaDate.getFullYear();

  const expense = await AccruedExpense.create({
    ...DEFAULT_EXPENSE_VALUES,
    profile_id: profile.id,
    tipo_origen: 'MANUAL',
    fecha: fechaDate,
    mes,
    año,
    total: amounts.total,
    subtotal: amounts.subtotal,
    iva: amounts.iva,
    iva_amount: amounts.iva_amount,
    concepto: data.concepto != null ? String(data.concepto).trim() || null : null,
    categoria: data.categoria != null ? String(data.categoria).trim() || null : null,
  });

  await invalidateProfileCache(profile.id);

  return {
    message: 'Gasto creado exitosamente',
    data: expense,
  };
}

export async function updateExpenseService(
  userId: string,
  id: string,
  data: UpdateExpenseDto
): Promise<ExpenseMutationResponse> {
  const expense = await findOwnedManualExpense(userId, id);

  const updateData: Partial<
    Pick<AccruedExpense, 'fecha' | 'mes' | 'año' | 'subtotal' | 'iva' | 'iva_amount' | 'total' | 'concepto' | 'categoria'>
  > = {};

  const { fecha, subtotal, iva, concepto, categoria } = data;

  if (fecha !== undefined) {
    const fechaDate = new Date(fecha);
    if (isNaN(fechaDate.getTime())) throw new AppError('Fecha inválida', 400);

    updateData.fecha = fechaDate;
    updateData.mes = fechaDate.getMonth() + 1;
    updateData.año = fechaDate.getFullYear();
  }

  if (subtotal !== undefined || iva !== undefined) {
    const nextSubtotal = subtotal !== undefined ? Number(subtotal) : Number(expense.subtotal ?? 0);
    const nextIvaRate = iva !== undefined ? Number(iva) : Number(expense.iva ?? 0);

    if (Number.isNaN(nextSubtotal) || Number.isNaN(nextIvaRate)) {
      throw new AppError('subtotal e iva deben ser números válidos', 400);
    }

    const amounts = calculateManualExpenseAmounts(nextSubtotal, nextIvaRate);
    updateData.subtotal = amounts.subtotal;
    updateData.iva = amounts.iva;
    updateData.iva_amount = amounts.iva_amount;
    updateData.total = amounts.total;
  }

  if (concepto !== undefined) updateData.concepto = concepto ? String(concepto).trim() || null : null;
  if (categoria !== undefined) updateData.categoria = categoria ? String(categoria).trim() || null : null;

  await expense.update(updateData);
  await invalidateProfileCache(expense.profile_id);

  return {
    message: 'Gasto actualizado exitosamente',
    data: expense,
  };
}

export async function deleteExpenseService(
  userId: string,
  id: string
): Promise<ExpenseDeleteResponse> {
  const expense = await findOwnedManualExpense(userId, id);
  const profileId = expense.profile_id;

  await expense.destroy();
  await invalidateProfileCache(profileId);

  return {
    message: 'Gasto eliminado exitosamente',
  };
}

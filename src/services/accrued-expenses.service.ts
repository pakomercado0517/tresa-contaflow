import { AccruedExpense, Period, Profile } from '../database/models/index.js';
import { AppError } from '../utils/AppError.js';
import { Op } from 'sequelize';
import { invalidateProfileCache } from './cache.service.js';
import type {
  CreateAccruedExpenseDto,
  UpdateAccruedExpenseDto,
} from '../types/accrued-expenses.types.js';
import {
  calculateManualExpenseAmounts,
  findOwnedManualExpense,
} from './helpers/accrued-expenses.helper.js';

export async function getAccruedExpensesService(userId: string, period_id: string, type: string) {
  const period = await Period.findOne({
    where: { id: period_id },
    include: [{ model: Profile, as: 'profile', where: { user_id: userId }, attributes: ['id'] }],
  });
  if (!period) throw new AppError('Periodo no encontrado o no pertenece al usuario', 404);

  const start = new Date(period.start_date);
  const end = new Date(period.end_date);
  end.setDate(end.getDate() + 1);

  const expenses = await AccruedExpense.findAll({
    where: {
      profile_id: period.profile_id,
      tipo_origen: type.toUpperCase().trim() || 'MANUAL',
      fecha: { [Op.gte]: start, [Op.lt]: end },
    },
    order: [['fecha', 'DESC']],
  });

  return {
    data: expenses,
  };
}

export async function getAccruedExpenseByIdService(userId: string, id: string) {
  const expense = await findOwnedManualExpense(userId, id);

  return { data: expense };
}

export async function createAccruedExpenseService(data: CreateAccruedExpenseDto, userId: string) {
  const profile = await Profile.findOne({
    where: { id: data.profile_id, user_id: userId },
    attributes: ['id'],
  });
  if (!profile) throw new AppError('Perfil no encontrado o no pertenece al usuario', 404);

  const period = await Period.findOne({
    where: { id: data.period_id, profile_id: data.profile_id },
    attributes: ['id', 'start_date', 'end_date'],
  });

  if (!period) throw new AppError('Periodo no encontrado o no pertenece al perfil', 404);

  const { fecha } = data;

  const fechaDate = new Date(fecha);
  if (isNaN(fechaDate.getTime())) throw new AppError('Fecha inválida', 400);

  const expenseDate = new Date(fechaDate).setHours(0, 0, 0, 0);
  const startDate = new Date(period.start_date).setHours(0, 0, 0, 0);
  const endDate = new Date(period.end_date).setHours(23, 59, 59, 999);

  if (expenseDate < startDate || expenseDate > endDate)
    throw new AppError(
      `La fecha del gasto (${fechaDate.toISOString().split('T')[0]}) no corresponde al periodo seleccionado`,
      400
    );

  const mes = fechaDate.getMonth() + 1;
  const año = fechaDate.getFullYear();
  const subtotalNum = Number(data.subtotal);
  const ivaRate = Number(data.iva);

  if (Number.isNaN(subtotalNum) || Number.isNaN(ivaRate)) {
    throw new AppError('subtotal e iva deben ser números válidos', 400);
  }

  const amounts = calculateManualExpenseAmounts(subtotalNum, ivaRate);

  const expense = await AccruedExpense.create({
    profile_id: profile.id,
    tipo_origen: 'MANUAL',
    fecha: fechaDate,
    mes,
    año,
    total: amounts.total,
    subtotal: amounts.subtotal,
    iva: amounts.iva,
    iva_amount: amounts.iva_amount,
    concepto: String(data.concept).trim() || null,
    categoria: data.categoria != null ? String(data.categoria).trim() || null : null,
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
  });
  await invalidateProfileCache(profile.id);
  return { message: 'Gasto devengado creado', data: expense };
}

export async function updateAccruedExpenseService(
  userId: string,
  id: string,
  data: UpdateAccruedExpenseDto
) {
  const expense = await findOwnedManualExpense(userId, id);

  const { concept, subtotal, categoria, is_paid, payment_date, iva } = data;
  const updateData: Partial<
    Pick<
      AccruedExpense,
      | 'concepto'
      | 'subtotal'
      | 'iva_amount'
      | 'iva'
      | 'total'
      | 'is_paid'
      | 'payment_date'
      | 'categoria'
    >
  > = {};
  if (concept !== undefined) updateData.concepto = String(concept).trim() || null;

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
  if (typeof is_paid === 'boolean') updateData.is_paid = is_paid;
  if (payment_date !== undefined) {
    if (payment_date === null) {
      updateData.payment_date = null;
    } else {
      const d = new Date(payment_date);
      if (isNaN(d.getTime())) {
        throw new AppError('payment_date inválido', 400);
      }
      updateData.payment_date = d;
    }
  }
  if (categoria !== undefined)
    updateData.categoria = categoria == null ? null : String(categoria).trim() || null;

  await expense.update(updateData);
  await invalidateProfileCache(expense.profile_id);
  return { message: 'Gasto devengado actualizado', data: expense };
}

export async function deleteAccruedExpenseService(userId: string, id: string) {
  const expense = await findOwnedManualExpense(userId, id);
  const profileId = expense.profile_id;
  await expense.destroy();
  await invalidateProfileCache(profileId);
  return { message: 'Gasto devengado eliminado' };
}

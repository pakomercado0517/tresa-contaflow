import { AccruedExpense, Period, Profile } from '../database/models/index.js';
import { AppError } from '../utils/AppError.js';
import { Op } from 'sequelize';
import { invalidateProfileCache } from './cache.service.js';
import type {
  CreateAccruedExpenseDto,
  UpdateAccruedExpenseDto,
} from '../types/accrued-expenses.types.js';

export async function getAccruedExpensesService(userId: string, periodId: string, type: string) {
  const period = await Period.findOne({
    where: { id: periodId },
    include: [{ model: Profile, as: 'profile', where: { user_id: userId }, attributes: ['id'] }],
  });
  if (!period) throw new AppError('Periodo no encontrado o no pertenece al usuario', 404);

  const start = new Date(period.start_date);
  const end = new Date(period.end_date);
  end.setDate(end.getDate() + 1);

  const expenses = await AccruedExpense.findAll({
    where: {
      profile_id: period.profile_id,
      tipo_origen: type || 'MANUAL',
      fecha: { [Op.gte]: start, [Op.lt]: end },
    },
    order: [['fecha', 'DESC']],
  });

  return {
    data: expenses,
  };
}

export async function getAccruedExpenseByIdService(userId: string, id: string) {
  const expense = await AccruedExpense.findOne({
    where: { id },
    include: [
      {
        model: Profile,
        as: 'profile',
        where: { user_id: userId },
        attributes: ['id', 'nombre', 'rfc'],
      },
    ],
  });

  if (!expense) throw new AppError('Gasto no encontrado', 404);
  if (expense.tipo_origen !== 'MANUAL')
    throw new AppError('Solo se puede consultar gastos manuales en esta ruta', 400);

  return { data: expense };
}

export async function createAccruedExpenseService(userId: string, data: CreateAccruedExpenseDto) {
  const profile = await Profile.findOne({
    where: { id: data.profile_id, user_id: userId },
    attributes: ['id'],
  });
  if (!profile) throw new AppError('Perfil no encontrado o no pertenece al usuario', 404);

  const fechaDate = new Date(data.fecha);
  if (isNaN(fechaDate.getTime())) throw new AppError('Fecha inválida', 400);

  const mes = fechaDate.getMonth() + 1;
  const año = fechaDate.getFullYear();
  const subtotalNum = Number(data.subtotal);
  const ivaAmountNum = Number(data.iva_amount) || 0;
  const total = subtotalNum + ivaAmountNum;

  const expense = await AccruedExpense.create({
    profile_id: profile.id,
    tipo_origen: 'MANUAL',
    fecha: fechaDate,
    mes,
    año,
    total,
    subtotal: subtotalNum,
    iva: ivaAmountNum,
    concepto: String(data.concepto).trim() || null,
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
  const expense = await AccruedExpense.findOne({
    where: { id },
    include: [{ model: Profile, as: 'profile', where: { user_id: userId }, attributes: ['id'] }],
  });
  if (!expense) throw new AppError('Gasto no encontrado', 404);
  if (expense.tipo_origen !== 'MANUAL')
    throw new AppError('Solo se pueden actualizar gastos manuales en esta ruta', 400);

  const { concepto, subtotal, iva_amount, categoria, is_paid, payment_date } = data;
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
  if (concepto !== undefined) updateData.concepto = String(concepto).trim() || null;
  if (subtotal !== undefined) updateData.subtotal = Number(subtotal);
  if (iva_amount !== undefined) {
    updateData.iva_amount = Number(iva_amount);
    updateData.iva = Number(iva_amount);
  }
  if (subtotal !== undefined || iva_amount !== undefined) {
    const sub = subtotal !== undefined ? Number(subtotal) : Number(expense.subtotal ?? 0);
    const iva = iva_amount !== undefined ? Number(iva_amount) : Number(expense.iva_amount ?? 0);
    updateData.total = sub + iva;
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
  const expense = await AccruedExpense.findOne({
    where: { id },
    include: [{ model: Profile, as: 'profile', where: { user_id: userId }, attributes: ['id'] }],
  });
  if (!expense) throw new AppError('Gasto no encontrado', 404);
  if (expense.tipo_origen !== 'MANUAL')
    throw new AppError('Solo se pueden eliminar gastos manuales en esta ruta', 400);
  const profileId = expense.profile_id;
  await expense.destroy();
  await invalidateProfileCache(profileId);
  return { message: 'Gasto devengado eliminado' };
}

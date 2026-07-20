import ManualIncome from '../database/models/ManualIncome.model.js';
import type { ManualIncomeAttributes } from '../database/models/ManualIncome.model.js';
import Period from '../database/models/Period.model.js';
import Profile from '../database/models/Profile.model.js';
import type {
  CreateManualIncomeInput,
  UpdateManualIncomeInput,
} from '../types/manual-incomes.types.js';
import { AppError } from '../utils/AppError.js';
import { invalidateProfileCache } from './cache.service.js';

export const getManualIncomesService = async (userId: string, periodId: string) => {
  const period = await Period.findOne({
    where: { id: periodId },
    include: [{ model: Profile, as: 'profile', where: { user_id: userId }, attributes: ['id'] }],
  });
  if (!period) throw new AppError('Periodo no encontrado o no pertenece al usuario', 404);

  const incomes = await ManualIncome.findAll({
    where: { profile_id: period.profile_id, period_id: periodId },
    order: [['fecha', 'DESC']],
  });
  return { data: incomes };
};

export const getManualIncomeByIdService = async (userId: string, id: string) => {
  const income = await ManualIncome.findOne({
    where: { id },
    include: [
      {
        model: Profile,
        as: 'profile',
        where: { user_id: userId },
        attributes: ['id', 'nombre', 'rfc'],
      },
      { model: Period, as: 'period', attributes: ['id', 'start_date', 'end_date', 'name'] },
    ],
  });

  if (!income) throw new AppError('Ingreso no encontrado', 404);

  return { data: income };
};

export const createManualIncomeService = async (data: CreateManualIncomeInput, userId: string) => {
  const profile = await Profile.findOne({
    where: { id: data.profile_id, user_id: userId },
    attributes: ['id'],
  });

  if (!profile) throw new AppError('Perfil no encontrado o no pertenece al usuario', 404);

  const period = await Period.findOne({
    where: { id: data.period_id, profile_id: data.profile_id },
    attributes: ['id'],
  });

  if (!period) throw new AppError('Periodo no encontrado o no pertenece al perfil', 404);

  const { fecha, payment_date, ...rest } = data;

  const fechaDate = new Date(fecha);
  if (isNaN(fechaDate.getTime())) throw new AppError('Fecha inválida', 400);

  let paymentDate: Date | null | undefined;
  if (payment_date === undefined) {
    paymentDate = undefined;
  } else if (payment_date === null) {
    paymentDate = null;
  } else {
    paymentDate = new Date(payment_date);
    if (isNaN(paymentDate.getTime())) throw new AppError('Fecha de pago inválida', 400);
  }

  const income = await ManualIncome.create({
    ...rest,
    fecha: fechaDate,
    ...(paymentDate !== undefined ? { payment_date: paymentDate } : {}),
  });
  await invalidateProfileCache(data.profile_id);
  return { message: 'Ingreso creado', data: income };
};

export const updateManualIncomeService = async (
  userId: string,
  id: string,
  data: UpdateManualIncomeInput
) => {
  const income = await ManualIncome.findOne({
    where: { id },
    include: [{ model: Profile, as: 'profile', where: { user_id: userId }, attributes: ['id'] }],
  });
  if (!income) throw new AppError('Ingreso no encontrado', 404);

  const { fecha, payment_date, concept, subtotal, iva_amount, is_paid, notes } = data;

  const updatePayload: Partial<
    Pick<
      ManualIncomeAttributes,
      'concept' | 'subtotal' | 'iva_amount' | 'fecha' | 'is_paid' | 'payment_date' | 'notes'
    >
  > = {};

  if (concept !== undefined) updatePayload.concept = concept;
  if (subtotal !== undefined) updatePayload.subtotal = subtotal;
  if (iva_amount !== undefined) updatePayload.iva_amount = iva_amount;
  if (typeof is_paid === 'boolean') updatePayload.is_paid = is_paid;
  if (notes !== undefined) updatePayload.notes = notes;

  if (fecha !== undefined) {
    const fechaDate = new Date(fecha);
    if (isNaN(fechaDate.getTime())) throw new AppError('Fecha inválida', 400);
    updatePayload.fecha = fechaDate;
  }

  if (payment_date !== undefined) {
    if (payment_date === null) {
      updatePayload.payment_date = null;
    } else {
      const paymentDate = new Date(payment_date);
      if (isNaN(paymentDate.getTime())) throw new AppError('Fecha de pago inválida', 400);
      updatePayload.payment_date = paymentDate;
    }
  }

  await income.update(updatePayload);
  await invalidateProfileCache(income.profile_id);
  return { message: 'Ingreso actualizado', data: income };
};

export const deleteManualIncomeService = async (userId: string, id: string) => {
  const income = await ManualIncome.findOne({
    where: { id },
    include: [{ model: Profile, as: 'profile', where: { user_id: userId }, attributes: ['id'] }],
  });
  if (!income) throw new AppError('Ingreso no encontrado', 404);

  const profileId = income.profile_id;
  await income.destroy();
  await invalidateProfileCache(profileId);
  return { message: 'Ingreso eliminado' };
};

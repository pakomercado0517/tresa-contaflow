import { Payroll, Profile, Period } from '../database/models/index.js';
import { parsePayroll } from '../parsers/payroll.parser.js';
import { SubscriptionService } from './subscription.service.js';
import { invalidateProfileCache } from './cache.service.js';
import { AppError } from '../utils/AppError.js';
import { Op } from 'sequelize';
import type { UploadPayrollParams } from '../types/payroll.types.js';

/**
 * Sube un XML de nómina: valida plugin (vía suscripción), parsea y guarda en payrolls.
 *
 * @param profile_id - UUID del perfil (debe pertenecer al usuario y tener plugin nómina en su suscripción)
 * @param period_id - UUID del período (debe pertenecer al perfil)
 * @param xmlBuffer - Contenido del archivo XML
 * @returns Payroll creado
 */
export const uploadPayrollXML = async ({
  userId,
  profileId,
  periodId,
  xmlBuffer,
}: UploadPayrollParams): Promise<Payroll> => {
  const profile = await Profile.findOne({ where: { id: profileId, user_id: userId } });
  if (!profile) {
    throw new AppError('Perfil no encontrado', 404);
  }

  const subscriptionService = new SubscriptionService();
  const hasAccess = await subscriptionService.hasPlugin(profileId, 'payroll');
  if (!hasAccess) {
    throw new AppError('El perfil no tiene habilitado el plugin de nómina', 403);
  }

  const period = await Period.findOne({
    where: { id: periodId, profile_id: profileId },
  });
  if (!period) {
    throw new AppError('Período no encontrado o no pertenece al perfil', 404);
  }

  let data: ReturnType<typeof parsePayroll>;
  try {
    data = parsePayroll(xmlBuffer);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'archivo XML inválido';
    throw new AppError(message, 400);
  }

  const existing = await Payroll.findOne({
    where: { profile_id: profileId, uuid: data.uuid },
  });
  if (existing) {
    throw new AppError(`Ya existe una nómina con el mismo UUID (CFDI) en este perfil`, 409);
  }

  const payroll = await Payroll.create({
    profile_id: profileId,
    period_id: periodId,
    uuid: data.uuid,
    employee_rfc: data.receptor.rfc,
    fecha_pago: data.fecha_pago,
    percepciones_total: data.percepciones_total,
    deducciones_total: data.deducciones_total,
    neto_pagado: data.neto_pagado,
    xml_path: null,
  });

  await invalidateProfileCache(profileId);
  return payroll;
};

export const getPayrollsService = async (userId: string, profileId?: string, periodId?: string) => {
  const profileIds = await Profile.findAll({
    where: { user_id: userId },
    attributes: ['id'],
  }).then((rows) => rows.map((p) => p.id));

  if (profileIds.length === 0) return { data: [] };

  const where: {
    profile_id: string | { [Op.in]: string[] };
    period_id?: string;
  } = {
    profile_id: { [Op.in]: profileIds },
  };

  if (profileId !== undefined) {
    if (!profileIds.includes(profileId)) {
      throw new AppError('Perfil no encontrado o no pertenece al usuario', 404);
    }
    where.profile_id = profileId;
  }
  if (periodId !== undefined) {
    where.period_id = periodId;
  }

  const payrolls = await Payroll.findAll({
    where,
    order: [['fecha_pago', 'DESC']],
    include: [
      { model: Profile, as: 'profile', attributes: ['id', 'nombre', 'rfc'] },
      { model: Period, as: 'period', attributes: ['id', 'start_date', 'end_date', 'name'] },
    ],
  });

  return { data: payrolls };
};

export const getPayrollByIdService = async (userId: string, payrollId: string) => {
  const payroll = await Payroll.findOne({
    where: { id: payrollId },
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
  if (!payroll) throw new AppError('Nómina no encontrada', 404);

  return { data: payroll };
};

export const deletePayrollService = async (userId: string, payrollId: string) => {
  const payroll = await Payroll.findOne({
    where: { id: payrollId },
    include: [{ model: Profile, as: 'profile', where: { user_id: userId }, attributes: ['id'] }],
  });

  if (!payroll) throw new AppError('Nómina no encontrada', 404);

  const profileId = payroll.profile_id;
  await payroll.destroy();
  await invalidateProfileCache(profileId);
  return { message: 'Nómina eliminada' };
};

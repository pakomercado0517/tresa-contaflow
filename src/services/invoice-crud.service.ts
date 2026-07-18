import Invoice from '../database/models/Invoice.model.js';
import Profile from '../database/models/Profile.model.js';
import type { GetMetricsFilters, GetMetricsResponse } from '../types/invoice-crud.types.js';
import { AppError } from '../utils/AppError.js';
import { invalidateProfileCache } from './cache.service.js';
import { MetricsService, type MetricsFilters } from './metrics.service.js';
import { calcularEstadoPagoFactura } from './payment-status.service.js';

export const getInvoiceByIdService = async (userId: string, invoiceId: string) => {
  const invoice = await Invoice.findOne({
    where: { id: invoiceId },
    include: [
      {
        model: Profile,
        as: 'profile',
        where: { user_id: userId },
        attributes: ['id', 'nombre', 'rfc'],
      },
    ],
  });

  if (!invoice) throw new AppError('Factura no encontrada', 404);

  const estadoPago = await calcularEstadoPagoFactura(invoice, invoice.profile_id);
  return {
    data: {
      ...invoice.toJSON(),
      estadoPago,
    },
  };
};

export const getMetricsService = async (
  userId: string,
  filters: GetMetricsFilters
): Promise<GetMetricsResponse> => {
  const { profileId, mes, año } = filters;

  const metricsFilters: MetricsFilters = { userId };
  profileId !== undefined && (metricsFilters.profileId = profileId);
  mes !== undefined && (metricsFilters.mes = mes);
  año !== undefined && (metricsFilters.año = año);

  const metricsService = new MetricsService();
  const metrics = await metricsService.calculatePeriodMetrics(metricsFilters);

  let periodId: string | null = null;
  if (profileId && mes && año) {
    const period = await metricsService.findOrCreatePeriodForMonth(profileId, mes, año);
    periodId = period.id;
  }

  return {
    filters: {
      profileId: profileId ?? null,
      mes: mes ?? null,
      año: año ?? null,
    },
    period_id: periodId,
    metrics,
  };
};

export const deleteInvoiceService = async (userId: string, invoiceId: string) => {
  const invoice = await Invoice.findOne({
    where: { id: invoiceId },
    include: [
      {
        model: Profile,
        as: 'profile',
        where: { user_id: userId },
        attributes: ['id'],
      },
    ],
  });

  if (!invoice) throw new AppError('Factura no encontrada', 404);

  const profileId = invoice.profile_id;
  await invoice.destroy();
  await invalidateProfileCache(profileId);

  return {
    message: 'Factura eliminada exitosamente',
  };
};

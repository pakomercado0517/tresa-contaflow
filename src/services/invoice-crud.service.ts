import Invoice from '../database/models/Invoice.model.js';
import Profile from '../database/models/Profile.model.js';
import { AppError } from '../utils/AppError.js';
import { invalidateProfileCache } from './cache.service.js';
import { calcularEstadoPagoFactura } from './payment-status.service.js';

export { getLegacyDashboardMetricsService as getMetricsService } from './legacy-dashboard-metrics.service.js';

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

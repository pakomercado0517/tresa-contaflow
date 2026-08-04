import PaymentComplementItem from '../database/models/PaymentComplementItem.model.js';
import type { InvoiceByIdResponse, InvoiceDeleteResponse } from '../types/invoice-crud.types.js';
import { AppError } from '../utils/AppError.js';
import { invalidateProfileCache } from './cache.service.js';
import { findOwnedInvoice } from './helpers/invoices.helper.js';
import { calcularEstadoPagoFactura } from './payment-status.service.js';

export { getLegacyDashboardMetricsService as getMetricsService } from './legacy-dashboard-metrics.service.js';

export const getInvoiceByIdService = async (
  userId: string,
  invoiceId: string
): Promise<InvoiceByIdResponse> => {
  const invoice = await findOwnedInvoice(userId, invoiceId);

  const estadoPago = await calcularEstadoPagoFactura(invoice, invoice.profile_id);
  return {
    data: {
      ...invoice.toJSON(),
      estadoPago,
    },
  };
};

export const deleteInvoiceService = async (
  userId: string,
  invoiceId: string
): Promise<InvoiceDeleteResponse> => {
  const invoice = await findOwnedInvoice(userId, invoiceId);

  const complementCount = await PaymentComplementItem.count({
    where: {
      profile_id: invoice.profile_id,
      factura_uuid: invoice.uuid,
    },
  });

  if (complementCount > 0) {
    throw new AppError(
      'No se puede eliminar: la factura tiene complementos de pago vinculados. Elimine primero los complementos.',
      409
    );
  }

  const pagosManuales = invoice.pagos.filter((pago) => (pago.origen ?? 'MANUAL') === 'MANUAL');
  if (invoice.tipo === 'PPD' && pagosManuales.length > 0) {
    throw new AppError('No se puede eliminar: la factura PPD tiene pagos registrados.', 409);
  }

  const profileId = invoice.profile_id;
  await invoice.destroy();
  await invalidateProfileCache(profileId);

  return {
    message: 'Factura eliminada exitosamente',
  };
};

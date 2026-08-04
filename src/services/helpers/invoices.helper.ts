import Invoice from '../../database/models/Invoice.model.js';
import Profile from '../../database/models/Profile.model.js';
import { AppError } from '../../utils/AppError.js';

export const findOwnedInvoice = async (userId: string, id: string): Promise<Invoice> => {
  const invoice = await Invoice.findOne({
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

  if (!invoice) throw new AppError('Factura no encontrada', 404);

  return invoice;
};

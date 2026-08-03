import AccruedExpense from '../../database/models/AccruedExpense.model.js';
import Profile from '../../database/models/Profile.model.js';
import { roundMoney } from '../../lib/tax-estimate/round-money.js';
import type { ManualExpenseAmounts } from '../../types/accrued-expenses.types.js';
import { AppError } from '../../utils/AppError.js';

/**
 * Calcula iva_amount (monto) y total a partir del subtotal y el porcentaje de IVA.
 */
export function calculateManualExpenseAmounts(
  subtotal: number,
  ivaRate: number
): ManualExpenseAmounts {
  const ivaAmount = roundMoney(subtotal * (ivaRate / 100));
  const total = roundMoney(subtotal + ivaAmount);

  return {
    subtotal,
    iva: ivaRate,
    iva_amount: ivaAmount,
    total,
  };
}

export const findOwnedManualExpense = async (userId: string, id: string) => {
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
    throw new AppError('Solo se puede operar gastos manuales en esta ruta', 400);

  return expense;
};

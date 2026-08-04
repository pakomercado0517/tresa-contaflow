import { describe, it, expect } from 'vitest';
import { calculateManualExpenseAmounts } from '../services/helpers/accrued-expenses.helper.js';

describe('accrued-expenses.helper', () => {
  describe('calculateManualExpenseAmounts', () => {
    it('calcula iva_amount y total desde subtotal y porcentaje iva', () => {
      const result = calculateManualExpenseAmounts(1000, 16);

      expect(result).toEqual({
        subtotal: 1000,
        iva: 16,
        iva_amount: 160,
        total: 1160,
      });
    });

    it('redondea montos a dos decimales', () => {
      const result = calculateManualExpenseAmounts(431.03, 16);

      expect(result.iva_amount).toBe(68.96);
      expect(result.total).toBe(499.99);
    });
  });
});

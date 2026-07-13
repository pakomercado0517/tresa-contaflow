import { describe, it, expect } from 'vitest';
import {
  invoiceListQueryHash,
  expenseListQueryHash,
  invoicesListKeyForProfile,
  invoicesListKeyForUser,
  expensesListKeyForProfile,
} from '../lib/list-cache-key.js';

describe('list-cache-key', () => {
  const baseInvoice = {
    mes: 7,
    año: 2026,
    tipo: 'PPD' as const,
    regimen_fiscal: '626',
    search: 'acme',
    page: 1,
    limit: 50,
  };

  it('misma consulta produce el mismo hash', () => {
    const a = invoiceListQueryHash(baseInvoice);
    const b = invoiceListQueryHash({ ...baseInvoice });
    expect(a).toBe(b);
  });

  it('cambio de page produce hash distinto', () => {
    const a = invoiceListQueryHash(baseInvoice);
    const b = invoiceListQueryHash({ ...baseInvoice, page: 2 });
    expect(a).not.toBe(b);
  });

  it('search normalizado (trim/case) produce el mismo hash', () => {
    const a = invoiceListQueryHash({ ...baseInvoice, search: 'Acme' });
    const b = invoiceListQueryHash({ ...baseInvoice, search: '  acme  ' });
    expect(a).toBe(b);
  });

  it('claves de perfil vs usuario difieren', () => {
    const hash = invoiceListQueryHash(baseInvoice);
    expect(invoicesListKeyForProfile('p1', hash)).toBe(
      `contafy:invoices:list:p1:${hash}`
    );
    expect(invoicesListKeyForUser('u1', hash)).toBe(
      `contafy:invoices:list:user:u1:${hash}`
    );
  });

  it('expenses incluye categoria en el hash', () => {
    const without = expenseListQueryHash({ ...baseInvoice, categoria: undefined });
    const withCat = expenseListQueryHash({ ...baseInvoice, categoria: 'nomina' });
    expect(without).not.toBe(withCat);
  });

  it('expensesListKeyForProfile usa prefijo expenses', () => {
    const hash = expenseListQueryHash({ ...baseInvoice, categoria: 'x' });
    expect(expensesListKeyForProfile('p1', hash)).toMatch(/^contafy:expenses:list:/);
  });
});

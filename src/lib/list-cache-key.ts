import { createHash } from 'crypto';

export interface InvoiceListQueryFingerprint {
  mes?: number;
  año?: number;
  tipo?: string;
  regimen_fiscal?: string;
  search?: string;
  page: number;
  limit: number;
}

export interface ExpenseListQueryFingerprint extends InvoiceListQueryFingerprint {
  categoria?: string;
}

function normalizeSearch(search: string | undefined): string {
  if (!search || search.trim().length === 0) {
    return '_';
  }
  return search.trim().toLowerCase();
}

function buildQueryHash(parts: Record<string, string | number>): string {
  const sorted = Object.keys(parts)
    .sort()
    .map((k) => `${k}=${parts[k]}`)
    .join('&');
  return createHash('sha256').update(sorted).digest('hex').slice(0, 16);
}

export function invoiceListQueryHash(params: InvoiceListQueryFingerprint): string {
  return buildQueryHash({
    mes: params.mes ?? '_',
    año: params.año ?? '_',
    tipo: params.tipo ?? '_',
    regimen: params.regimen_fiscal ?? '_',
    search: normalizeSearch(params.search),
    page: params.page,
    limit: params.limit,
  });
}

export function expenseListQueryHash(params: ExpenseListQueryFingerprint): string {
  return buildQueryHash({
    mes: params.mes ?? '_',
    año: params.año ?? '_',
    tipo: params.tipo ?? '_',
    regimen: params.regimen_fiscal ?? '_',
    categoria: params.categoria ?? '_',
    search: normalizeSearch(params.search),
    page: params.page,
    limit: params.limit,
  });
}

const PREFIX = 'contafy';

export function invoicesListKeyForProfile(
  profileId: string,
  queryHash: string
): string {
  return `${PREFIX}:invoices:list:${profileId}:${queryHash}`;
}

export function invoicesListKeyForUser(userId: string, queryHash: string): string {
  return `${PREFIX}:invoices:list:user:${userId}:${queryHash}`;
}

export function expensesListKeyForProfile(
  profileId: string,
  queryHash: string
): string {
  return `${PREFIX}:expenses:list:${profileId}:${queryHash}`;
}

export function expensesListKeyForUser(userId: string, queryHash: string): string {
  return `${PREFIX}:expenses:list:user:${userId}:${queryHash}`;
}

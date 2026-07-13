import { Op, type WhereOptions } from 'sequelize';
import { AccruedExpense, Profile } from '../database/models/index.js';
import { PaymentStatusService } from './payment-status.service.js';
import {
  getJson,
  setJson,
  getExpensesListTtlSeconds,
  profileIndexKey,
  userListsIndexKey,
} from './cache.service.js';
import {
  expenseListQueryHash,
  expensesListKeyForProfile,
  expensesListKeyForUser,
} from '../lib/list-cache-key.js';
import type {
  ExpenseListItem,
  ExpenseListQueryParams,
  ListExpensesResult,
} from '../types/expense-list.types.js';

const paymentStatusService = new PaymentStatusService();

function rehydrateExpenseListItem(item: ExpenseListItem): ExpenseListItem {
  const fecha =
    item.fecha != null && typeof item.fecha === 'string'
      ? new Date(item.fecha)
      : item.fecha;
  const payment_date =
    item.payment_date != null && typeof item.payment_date === 'string'
      ? new Date(item.payment_date)
      : item.payment_date;
  let estadoPago = item.estadoPago;
  if (estadoPago?.fechasComplementos) {
    estadoPago = {
      ...estadoPago,
      fechasComplementos: estadoPago.fechasComplementos.map((d) =>
        typeof d === 'string' ? new Date(d) : d
      ),
    };
  }
  return { ...item, fecha, payment_date, estadoPago };
}

function rehydrateListResult(result: ListExpensesResult): ListExpensesResult {
  return {
    ...result,
    data: result.data.map(rehydrateExpenseListItem),
  };
}

function buildWhereClause(params: ExpenseListQueryParams): WhereOptions {
  const whereClause: WhereOptions = {};

  if (params.mes !== undefined) {
    whereClause.mes = params.mes;
  }
  if (params.año !== undefined) {
    whereClause.año = params.año;
  }
  if (params.tipo !== undefined) {
    whereClause.tipo = params.tipo;
  }
  if (params.categoria !== undefined) {
    whereClause.categoria = params.categoria;
  }
  if (params.regimen_fiscal !== undefined) {
    whereClause.regimen_fiscal_receptor = params.regimen_fiscal;
  }
  if (params.search !== undefined && params.search.length > 0) {
    const searchTerm = `%${params.search}%`;
    return {
      ...whereClause,
      [Op.or]: [
        { rfc_emisor: { [Op.iLike]: searchTerm } },
        { nombre_emisor: { [Op.iLike]: searchTerm } },
        { rfc_receptor: { [Op.iLike]: searchTerm } },
        { nombre_receptor: { [Op.iLike]: searchTerm } },
        { concepto: { [Op.iLike]: searchTerm } },
      ],
    } as WhereOptions;
  }

  return whereClause;
}

async function fetchExpensesFromDb(
  userId: string,
  params: ExpenseListQueryParams
): Promise<ListExpensesResult> {
  const whereClause = buildWhereClause(params);
  const profileWhereClause: Record<string, unknown> = { user_id: userId };
  if (params.profileId) {
    profileWhereClause.id = params.profileId;
  }

  const offset = (params.page - 1) * params.limit;

  const { count, rows: expenses } = await AccruedExpense.findAndCountAll({
    where: whereClause,
    include: [
      {
        model: Profile,
        as: 'profile',
        where: profileWhereClause,
        attributes: ['id', 'nombre', 'rfc'],
      },
    ],
    order: [['fecha', 'DESC']],
    limit: params.limit,
    offset,
  });

  const estadosPago = new Map<string, Awaited<ReturnType<PaymentStatusService['calcularEstadoPagoGasto']>>>();
  const byProfile = new Map<string, typeof expenses>();
  for (const expense of expenses) {
    const group = byProfile.get(expense.profile_id) ?? [];
    group.push(expense);
    byProfile.set(expense.profile_id, group);
  }
  for (const [profileId, group] of byProfile) {
    const batch = await paymentStatusService.calcularEstadoPagoGastos(group, profileId);
    for (const [id, estado] of batch) {
      estadosPago.set(id, estado);
    }
  }

  const expensesConEstado: ExpenseListItem[] = expenses.map((expense) => {
    let estadoPago = null;
    if (expense.tipo && expense.uuid) {
      estadoPago =
        estadosPago.get(expense.id) ??
        null;
    }
    return {
      ...expense.toJSON(),
      estadoPago,
    } as ExpenseListItem;
  });

  return {
    data: expensesConEstado,
    pagination: {
      total: count,
      page: params.page,
      limit: params.limit,
      totalPages: Math.ceil(count / params.limit),
    },
  };
}

export async function listExpenses(
  userId: string,
  params: ExpenseListQueryParams
): Promise<ListExpensesResult> {
  const queryHash = expenseListQueryHash({
    page: params.page,
    limit: params.limit,
    ...(params.mes !== undefined ? { mes: params.mes } : {}),
    ...(params.año !== undefined ? { año: params.año } : {}),
    ...(params.tipo !== undefined ? { tipo: params.tipo } : {}),
    ...(params.categoria !== undefined ? { categoria: params.categoria } : {}),
    ...(params.regimen_fiscal !== undefined ? { regimen_fiscal: params.regimen_fiscal } : {}),
    ...(params.search !== undefined ? { search: params.search } : {}),
  });

  const cacheKey = params.profileId
    ? expensesListKeyForProfile(params.profileId, queryHash)
    : expensesListKeyForUser(userId, queryHash);

  const cacheMeta = params.profileId
    ? { profileId: params.profileId, domain: 'expenses' as const }
    : { domain: 'expenses' as const };

  const cached = await getJson<ListExpensesResult>(cacheKey, cacheMeta);
  if (cached) {
    return rehydrateListResult(cached);
  }

  const result = await fetchExpensesFromDb(userId, params);
  const ttl = getExpensesListTtlSeconds();
  const indexKey = params.profileId
    ? profileIndexKey(params.profileId)
    : userListsIndexKey(userId);

  await setJson(cacheKey, result, { ttlSeconds: ttl, indexKey }, cacheMeta);

  return result;
}

export function parseExpenseListQuery(query: Record<string, unknown>): ExpenseListQueryParams {
  const profileId =
    typeof query.profileId === 'string' && query.profileId.length > 0
      ? query.profileId
      : undefined;

  let mes: number | undefined;
  if (typeof query.mes === 'string') {
    const mesNum = parseInt(query.mes, 10);
    if (!isNaN(mesNum) && mesNum >= 1 && mesNum <= 12) {
      mes = mesNum;
    }
  }

  let año: number | undefined;
  if (typeof query.año === 'string') {
    const añoNum = parseInt(query.año, 10);
    if (!isNaN(añoNum)) {
      año = añoNum;
    }
  }

  let tipo: string | undefined;
  if (
    typeof query.tipo === 'string' &&
    ['PUE', 'PPD', 'COMPLEMENTO_PAGO'].includes(query.tipo)
  ) {
    tipo = query.tipo;
  }

  let categoria: string | undefined;
  if (typeof query.categoria === 'string' && query.categoria.length > 0) {
    categoria = query.categoria;
  }

  let regimen_fiscal: string | undefined;
  if (typeof query.regimen_fiscal === 'string' && /^\d{3}$/.test(query.regimen_fiscal)) {
    regimen_fiscal = query.regimen_fiscal;
  }

  let search: string | undefined;
  if (typeof query.search === 'string' && query.search.trim().length > 0) {
    search = query.search.trim();
  }

  const page = Math.max(1, parseInt(String(query.page ?? '1'), 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(query.limit ?? '50'), 10) || 50));

  const params: ExpenseListQueryParams = { page, limit };
  if (profileId !== undefined) params.profileId = profileId;
  if (mes !== undefined) params.mes = mes;
  if (año !== undefined) params.año = año;
  if (tipo !== undefined) params.tipo = tipo;
  if (categoria !== undefined) params.categoria = categoria;
  if (regimen_fiscal !== undefined) params.regimen_fiscal = regimen_fiscal;
  if (search !== undefined) params.search = search;
  return params;
}

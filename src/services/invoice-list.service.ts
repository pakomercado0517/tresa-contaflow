import { Op, type WhereOptions } from 'sequelize';
import { Invoice, Profile } from '../database/models/index.js';
import { PaymentStatusService } from './payment-status.service.js';
import {
  getJson,
  setJson,
  getInvoicesListTtlSeconds,
  profileIndexKey,
  userListsIndexKey,
} from './cache.service.js';
import {
  invoiceListQueryHash,
  invoicesListKeyForProfile,
  invoicesListKeyForUser,
} from '../lib/list-cache-key.js';
import type {
  InvoiceListItem,
  InvoiceListQueryParams,
  ListInvoicesResult,
} from '../types/invoice-list.types.js';

const paymentStatusService = new PaymentStatusService();

function rehydrateInvoiceListItem(item: InvoiceListItem): InvoiceListItem {
  const fecha =
    item.fecha != null && typeof item.fecha === 'string' ? new Date(item.fecha) : item.fecha;
  let estadoPago = item.estadoPago;
  if (estadoPago?.fechasComplementos) {
    estadoPago = {
      ...estadoPago,
      fechasComplementos: estadoPago.fechasComplementos.map((d) =>
        typeof d === 'string' ? new Date(d) : d
      ),
    };
  }
  return { ...item, fecha, estadoPago };
}

function rehydrateListResult(result: ListInvoicesResult): ListInvoicesResult {
  return {
    ...result,
    data: result.data.map(rehydrateInvoiceListItem),
  };
}

function buildWhereClause(params: InvoiceListQueryParams): WhereOptions {
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
  if (params.regimen_fiscal !== undefined) {
    whereClause.regimen_fiscal_emisor = params.regimen_fiscal;
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

async function fetchInvoicesFromDb(
  userId: string,
  params: InvoiceListQueryParams
): Promise<ListInvoicesResult> {
  const whereClause = buildWhereClause(params);
  const profileWhereClause: Record<string, unknown> = { user_id: userId };
  if (params.profileId) {
    profileWhereClause.id = params.profileId;
  }

  const offset = (params.page - 1) * params.limit;

  const { count, rows: invoices } = await Invoice.findAndCountAll({
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

  const estadosPago = new Map<
    string,
    Awaited<ReturnType<PaymentStatusService['calcularEstadoPagoFactura']>>
  >();
  const byProfile = new Map<string, typeof invoices>();
  for (const invoice of invoices) {
    const group = byProfile.get(invoice.profile_id) ?? [];
    group.push(invoice);
    byProfile.set(invoice.profile_id, group);
  }
  for (const [profileId, group] of byProfile) {
    const batch = await paymentStatusService.calcularEstadoPagoFacturas(group, profileId);
    for (const [id, estado] of batch) {
      estadosPago.set(id, estado);
    }
  }

  const invoicesConEstado: InvoiceListItem[] = await Promise.all(
    invoices.map(async (invoice) => {
      const estado =
        estadosPago.get(invoice.id) ??
        (await paymentStatusService.calcularEstadoPagoFactura(invoice, invoice.profile_id));
      return {
        ...invoice.toJSON(),
        estadoPago: estado,
      } as InvoiceListItem;
    })
  );

  return {
    data: invoicesConEstado,
    pagination: {
      total: count,
      page: params.page,
      limit: params.limit,
      totalPages: Math.ceil(count / params.limit),
    },
  };
}

export async function listInvoices(
  userId: string,
  params: InvoiceListQueryParams
): Promise<ListInvoicesResult> {
  const queryHash = invoiceListQueryHash({
    page: params.page,
    limit: params.limit,
    ...(params.mes !== undefined ? { mes: params.mes } : {}),
    ...(params.año !== undefined ? { año: params.año } : {}),
    ...(params.tipo !== undefined ? { tipo: params.tipo } : {}),
    ...(params.regimen_fiscal !== undefined ? { regimen_fiscal: params.regimen_fiscal } : {}),
    ...(params.search !== undefined ? { search: params.search } : {}),
  });

  const cacheKey = params.profileId
    ? invoicesListKeyForProfile(params.profileId, queryHash)
    : invoicesListKeyForUser(userId, queryHash);

  const cacheMeta = params.profileId
    ? { profileId: params.profileId, domain: 'invoices' as const }
    : { domain: 'invoices' as const };

  const cached = await getJson<ListInvoicesResult>(cacheKey, cacheMeta);
  if (cached) {
    return rehydrateListResult(cached);
  }

  const result = await fetchInvoicesFromDb(userId, params);
  const ttl = getInvoicesListTtlSeconds();
  const indexKey = params.profileId ? profileIndexKey(params.profileId) : userListsIndexKey(userId);

  await setJson(cacheKey, result, { ttlSeconds: ttl, indexKey }, cacheMeta);

  return result;
}

export function normalizeInvoiceListQuery(query: Record<string, unknown>): InvoiceListQueryParams {
  const profileId =
    typeof query.profileId === 'string' && query.profileId.length > 0 ? query.profileId : undefined;

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
  if (typeof query.tipo === 'string' && ['PUE', 'PPD', 'COMPLEMENTO_PAGO'].includes(query.tipo)) {
    tipo = query.tipo;
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

  const params: InvoiceListQueryParams = { page, limit };
  if (profileId !== undefined) params.profileId = profileId;
  if (mes !== undefined) params.mes = mes;
  if (año !== undefined) params.año = año;
  if (tipo !== undefined) params.tipo = tipo;
  if (regimen_fiscal !== undefined) params.regimen_fiscal = regimen_fiscal;
  if (search !== undefined) params.search = search;
  return params;
}

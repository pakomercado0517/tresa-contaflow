import { Op } from 'sequelize';

import {
  Invoice,
  AccruedExpense,
  PaymentComplement,
  ProfilePaymentComplement,
  PaymentComplementItem,
  Profile,
} from '../database/models/index.js';
import { compareRFCs } from '../utils/rfc.util.js';

import type { CFDI, ComplementoPagoItem, FacturaRelacionada } from '../types/cfdi.types.js';
import type {
  ComplementRole,
  ListPaymentComplementsParams,
  ListPaymentComplementsResult,
  PaymentComplementDetailResponse,
  PaymentComplementItemResponse,
  PaymentComplementListItemResponse,
  PagoParcial,
  PaymentComplementItemCreationAttributes,
} from '../types/payment.types.js';
import { invalidateProfileCache } from './cache.service.js';
import { AppError } from '../utils/AppError.js';

interface ConciliationMatch {
  conciliado: boolean;
  tipo: 'invoice' | 'expense' | null;
  documentoId: string | null;
}

export const saveComplemento = async (
  cfdi: CFDI,
  profileId: string,
  profileRFC: string
): Promise<PaymentComplement> => {
  if (!cfdi.complementoPago) {
    throw new Error('El CFDI no contiene un complemento de pago');
  }

  // 1. Buscar o crear el documento del complemento (entidad global por UUID)
  const [complemento] = await PaymentComplement.findOrCreate({
    where: { uuid: cfdi.uuid },
    defaults: {
      uuid: cfdi.uuid,
      fecha_emision: cfdi.fecha,
      rfc_emisor: cfdi.rfcEmisor,
      rfc_receptor: cfdi.rfcReceptor,
      complemento_data: cfdi.complementoPago,
    },
  });

  // 2. Determinar el rol del perfil respecto a este complemento
  const role = determineRole(cfdi.rfcEmisor, cfdi.rfcReceptor, profileRFC);

  // 3. Crear el vínculo perfil ↔ complemento (si no existe)
  await ProfilePaymentComplement.findOrCreate({
    where: {
      profile_id: profileId,
      complement_id: complemento.id,
    },
    defaults: {
      profile_id: profileId,
      complement_id: complemento.id,
      role,
    },
  });

  // 4. Crear items del complemento para este perfil
  const items = buildComplementItems(cfdi.complementoPago.pagos, profileId, complemento.id);

  if (items.length > 0) {
    const existingItems = await PaymentComplementItem.findAll({
      where: {
        complement_id: complemento.id,
        profile_id: profileId,
      },
    });

    if (existingItems.length === 0) {
      await PaymentComplementItem.bulkCreate(items);
      await applyComplementItemsToDocuments(profileId, items);
    } else {
      const existingItemsSet = new Set(
        existingItems.map((item) => {
          const fechaPago =
            item.fecha_pago instanceof Date
              ? item.fecha_pago.toISOString()
              : new Date(item.fecha_pago).toISOString();
          return `${item.factura_uuid}-${item.num_parcialidad}-${fechaPago}-${Number(
            item.imp_pagado
          )}-${item.num_operacion ?? ''}`;
        })
      );

      const newItems = items.filter((item) => {
        const fechaPago =
          item.fecha_pago instanceof Date
            ? item.fecha_pago.toISOString()
            : new Date(item.fecha_pago).toISOString();
        const key = `${item.factura_uuid}-${item.num_parcialidad}-${fechaPago}-${item.imp_pagado}-${
          item.num_operacion ?? ''
        }`;
        return !existingItemsSet.has(key);
      });

      if (newItems.length > 0) {
        await PaymentComplementItem.bulkCreate(newItems);
        await applyComplementItemsToDocuments(profileId, newItems);
      }
    }
  }

  await invalidateProfileCache(profileId);
  return complemento;
};

export const applyPaymentsToInvoice = async (
  invoice: Invoice,
  profileId: string
): Promise<void> => {
  const items = await PaymentComplementItem.findAll({
    where: {
      profile_id: profileId,
      factura_uuid: invoice.uuid,
    },
    order: [['fecha_pago', 'ASC']],
  });

  const pagosComplemento = items.map((item) => mapItemToPagoParcial(item));
  const pagosManual = invoice.pagos.filter((pago) => (pago.origen ?? 'MANUAL') === 'MANUAL');
  const pagos = mergePagos(pagosManual, pagosComplemento);

  invoice.pagos = pagos;
  await invoice.save();
};

export const applyPaymentsToExpense = async (
  expense: AccruedExpense,
  profileId: string
): Promise<void> => {
  const items = await PaymentComplementItem.findAll({
    where: {
      profile_id: profileId,
      factura_uuid: expense.uuid || '',
    },
    order: [['fecha_pago', 'ASC']],
  });

  const pagosComplemento = items.map((item) => mapItemToPagoParcial(item));
  const pagosManual = expense.pagos.filter((pago) => (pago.origen ?? 'MANUAL') === 'MANUAL');
  const pagos = mergePagos(pagosManual, pagosComplemento);

  expense.pagos = pagos;
  await expense.save();
};

/**
 * Verifica si ya existe un vínculo entre un perfil y un complemento con el UUID dado.
 */
export const isLinkedToProfile = async (
  complementUUID: string,
  profileId: string
): Promise<boolean> => {
  const complement = await PaymentComplement.findOne({
    where: { uuid: complementUUID },
  });
  if (!complement) return false;

  const link = await ProfilePaymentComplement.findOne({
    where: {
      profile_id: profileId,
      complement_id: complement.id,
    },
  });
  return !!link;
};

/**
 * Lista complementos de pago vinculados a los perfiles del usuario.
 * Filtro de período por fecha_pago de los ítems (alineado con métricas de flujo).
 */
export const listForUser = async (
  params: ListPaymentComplementsParams
): Promise<ListPaymentComplementsResult> => {
  const { userId, profileId, role, mes, año, page, limit } = params;

  const profileWhere: { user_id: string; id?: string } = { user_id: userId };
  if (profileId) {
    profileWhere.id = profileId;
  }

  const profiles = await Profile.findAll({
    where: profileWhere,
    attributes: ['id', 'nombre', 'rfc'],
  });

  if (profiles.length === 0) {
    if (profileId) {
      throw new AppError('Perfil no encontrado', 404);
    }
    return {
      data: [],
      pagination: { total: 0, page, limit, totalPages: 0 },
    };
  }

  const profileIds = profiles.map((p) => p.id);
  const profileById = new Map(profiles.map((p) => [p.id, p]));

  const linkWhere: {
    profile_id: { [Op.in]: string[] };
    role?: ComplementRole;
    complement_id?: { [Op.in]: string[] };
  } = {
    profile_id: { [Op.in]: profileIds },
  };

  if (role) {
    linkWhere.role = role;
  }

  const dateRange = getDateRangeFromMesAño(mes, año);
  if (dateRange) {
    const itemsInPeriod = await PaymentComplementItem.findAll({
      where: {
        profile_id: { [Op.in]: profileIds },
        fecha_pago: {
          [Op.gte]: dateRange.start,
          [Op.lt]: dateRange.end,
        },
      },
      attributes: ['complement_id'],
    });
    const complementIdsInPeriod = Array.from(
      new Set(itemsInPeriod.map((item) => item.complement_id))
    );
    if (complementIdsInPeriod.length === 0) {
      return {
        data: [],
        pagination: { total: 0, page, limit, totalPages: 0 },
      };
    }
    linkWhere.complement_id = { [Op.in]: complementIdsInPeriod };
  }

  const offset = (page - 1) * limit;

  const { count, rows: links } = await ProfilePaymentComplement.findAndCountAll({
    where: linkWhere,
    include: [
      {
        model: PaymentComplement,
        as: 'complement',
        required: true,
      },
    ],
    order: [[{ model: PaymentComplement, as: 'complement' }, 'fecha_emision', 'DESC']],
    limit,
    offset,
  });

  const data = await buildListItems(links, profileById, dateRange);

  return {
    data,
    pagination: {
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit),
    },
  };
};

/**
 * Detalle de un complemento por ID del documento (payment_complements.id).
 */
export const getByIdForUser = async (
  complementId: string,
  userId: string,
  profileId?: string
): Promise<PaymentComplementDetailResponse> => {
  const profiles = await Profile.findAll({
    where: profileId ? { user_id: userId, id: profileId } : { user_id: userId },
    attributes: ['id', 'nombre', 'rfc'],
  });

  if (profiles.length === 0) {
    throw new AppError(
      `${profileId ? 'Perfil no encontrado' : 'Complemento de pago no encontrado'}`,
      404
    );
  }

  const profileIds = profiles.map((p) => p.id);

  const links = await ProfilePaymentComplement.findAll({
    where: {
      complement_id: complementId,
      profile_id: { [Op.in]: profileIds },
    },
    include: [
      {
        model: PaymentComplement,
        as: 'complement',
        required: true,
      },
    ],
  });

  if (links.length === 0) {
    throw new AppError('Complemento de pago no encontrado', 404);
  }

  if (links.length > 1 && !profileId) {
    throw new AppError(
      'profile_id es requerido: el complemento está vinculado a más de un perfil',
      400
    );
  }

  const link = links[0];
  if (!link) {
    throw new AppError('Complemento de pago no encontrado', 404);
  }
  const complement = link.complement;
  if (!complement) {
    throw new AppError('Complemento de pago no encontrado', 404);
  }
  const profile = profiles.find((p) => p.id === link.profile_id);
  if (!profile) {
    throw new AppError('Complemento de pago no encontrado', 404);
  }

  const items = await PaymentComplementItem.findAll({
    where: {
      complement_id: complement.id,
      profile_id: link.profile_id,
    },
    order: [['fecha_pago', 'ASC']],
  });

  const conciliation = await resolveConciliation(link.profile_id, items);

  const listBase = mapLinkToListItem(link, complement, profile, items, conciliation, null);

  const itemResponses: PaymentComplementItemResponse[] = items.map((item) => {
    const match = conciliation.get(item.factura_uuid);
    return {
      id: item.id,
      factura_uuid: item.factura_uuid,
      fecha_pago: toIsoString(item.fecha_pago),
      forma_pago: item.forma_pago,
      moneda_pago: item.moneda_pago,
      tipo_cambio_pago: Number(item.tipo_cambio_pago),
      monto_pago: Number(item.monto_pago),
      num_operacion: item.num_operacion,
      num_parcialidad: item.num_parcialidad,
      imp_pagado: Number(item.imp_pagado),
      imp_saldo_ant: Number(item.imp_saldo_ant),
      imp_saldo_insoluto: Number(item.imp_saldo_insoluto),
      conciliado: match?.conciliado ?? false,
      documento_relacionado_tipo: match?.tipo ?? null,
      documento_relacionado_id: match?.documentoId ?? null,
    };
  });

  return {
    ...listBase,
    complemento_data: complement.complemento_data,
    items: itemResponses,
  };
};

const buildListItems = async (
  links: ProfilePaymentComplement[],
  profileById: Map<string, Profile>,
  dateRange: { start: Date; end: Date } | null
): Promise<PaymentComplementListItemResponse[]> => {
  if (links.length === 0) {
    return [];
  }

  const complementIds = links.map((l) => l.complement_id);
  const profileIdsOnPage = Array.from(new Set(links.map((l) => l.profile_id)));

  const allItems = await PaymentComplementItem.findAll({
    where: {
      complement_id: { [Op.in]: complementIds },
      profile_id: { [Op.in]: profileIdsOnPage },
    },
    order: [['fecha_pago', 'ASC']],
  });

  const itemsByKey = new Map<string, PaymentComplementItem[]>();
  for (const item of allItems) {
    const key = `${item.complement_id}|${item.profile_id}`;
    const bucket = itemsByKey.get(key) ?? [];
    bucket.push(item);
    itemsByKey.set(key, bucket);
  }

  const conciliationByProfile = new Map<string, Map<string, ConciliationMatch>>();

  for (const profileId of profileIdsOnPage) {
    const profileItems = allItems.filter((i) => i.profile_id === profileId);
    conciliationByProfile.set(profileId, await resolveConciliation(profileId, profileItems));
  }

  return links.map((link) => {
    const complement = link.complement;
    if (!complement) {
      throw new Error(`Complemento no cargado para link ${link.id}`);
    }
    const profile = profileById.get(link.profile_id);
    if (!profile) {
      throw new Error(`Perfil ${link.profile_id} no encontrado al armar listado`);
    }
    const key = `${link.complement_id}|${link.profile_id}`;
    const items = itemsByKey.get(key) ?? [];
    const conciliation = conciliationByProfile.get(link.profile_id) ?? new Map();
    return mapLinkToListItem(link, complement, profile, items, conciliation, dateRange);
  });
};

const mapLinkToListItem = (
  link: ProfilePaymentComplement,
  complement: PaymentComplement,
  profile: Profile,
  items: PaymentComplementItem[],
  conciliation: Map<string, ConciliationMatch>,
  dateRange: { start: Date; end: Date } | null
): PaymentComplementListItemResponse => {
  const filteredItems = dateRange
    ? items.filter((item) => {
        const fecha = item.fecha_pago instanceof Date ? item.fecha_pago : new Date(item.fecha_pago);
        return fecha >= dateRange.start && fecha < dateRange.end;
      })
    : items;

  const itemsForSummary = filteredItems.length > 0 ? filteredItems : items;

  let conciliados = 0;
  let sinConciliar = 0;
  const facturaUuids = new Set<string>();

  for (const item of itemsForSummary) {
    facturaUuids.add(item.factura_uuid);
    const match = conciliation.get(item.factura_uuid);
    if (match?.conciliado) {
      conciliados += 1;
    } else {
      sinConciliar += 1;
    }
  }

  const totalPagado = itemsForSummary.reduce((sum, item) => sum + Number(item.imp_pagado || 0), 0);

  const fechasPago = Array.from(
    new Set(itemsForSummary.map((item) => toIsoString(item.fecha_pago)))
  ).sort();

  return {
    link_id: link.id,
    profile_id: link.profile_id,
    profile: {
      id: profile.id,
      nombre: profile.nombre,
      rfc: profile.rfc,
    },
    role: link.role,
    id: complement.id,
    uuid: complement.uuid,
    fecha_emision: toIsoString(complement.fecha_emision),
    rfc_emisor: complement.rfc_emisor,
    rfc_receptor: complement.rfc_receptor,
    total_pagado: Math.round(totalPagado * 100) / 100,
    cantidad_facturas_relacionadas: facturaUuids.size,
    cantidad_items_conciliados: conciliados,
    cantidad_items_sin_conciliar: sinConciliar,
    fechas_pago: fechasPago,
  };
};

const resolveConciliation = async (
  profileId: string,
  items: PaymentComplementItem[]
): Promise<Map<string, ConciliationMatch>> => {
  const uuids = Array.from(new Set(items.map((i) => i.factura_uuid)));
  const result = new Map<string, ConciliationMatch>();

  if (uuids.length === 0) {
    return result;
  }

  const invoices = await Invoice.findAll({
    where: {
      profile_id: profileId,
      uuid: { [Op.in]: uuids },
      tipo: 'PPD',
    },
    attributes: ['id', 'uuid'],
  });

  const expenses = await AccruedExpense.findAll({
    where: {
      profile_id: profileId,
      uuid: { [Op.in]: uuids },
      tipo: 'PPD',
    },
    attributes: ['id', 'uuid'],
  });

  for (const inv of invoices) {
    result.set(inv.uuid, {
      conciliado: true,
      tipo: 'invoice',
      documentoId: inv.id,
    });
  }

  for (const exp of expenses) {
    const uuid = exp.uuid ?? '';
    if (uuid && !result.has(uuid)) {
      result.set(uuid, {
        conciliado: true,
        tipo: 'expense',
        documentoId: exp.id,
      });
    }
  }

  for (const uuid of uuids) {
    if (!result.has(uuid)) {
      result.set(uuid, {
        conciliado: false,
        tipo: null,
        documentoId: null,
      });
    }
  }

  return result;
};

const getDateRangeFromMesAño = (mes?: number, año?: number): { start: Date; end: Date } | null => {
  if (mes === undefined && año === undefined) {
    return null;
  }
  if (año === undefined) {
    return null;
  }
  if (mes === undefined) {
    return {
      start: new Date(año, 0, 1, 0, 0, 0),
      end: new Date(año + 1, 0, 1, 0, 0, 0),
    };
  }
  return {
    start: new Date(año, mes - 1, 1, 0, 0, 0),
    end: new Date(año, mes, 1, 0, 0, 0),
  };
};

const toIsoString = (value: Date | string): string => {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return new Date(value).toISOString();
};

const determineRole = (
  rfcEmisor: string,
  rfcReceptor: string,
  profileRFC: string
): ComplementRole => {
  if (compareRFCs(rfcEmisor, profileRFC)) return 'INGRESO';
  if (compareRFCs(rfcReceptor, profileRFC)) return 'EGRESO';
  return 'INGRESO';
};

const buildComplementItems = (
  pagos: ComplementoPagoItem[],
  profileId: string,
  complementId: string
): PaymentComplementItemCreationAttributes[] => {
  const items: PaymentComplementItemCreationAttributes[] = [];

  pagos.forEach((pago) => {
    pago.facturasRelacionadas.forEach((factura) => {
      items.push(mapPagoToItem(pago, factura, profileId, complementId));
    });
  });

  return items;
};

export const mapPagoToItem = (
  pago: ComplementoPagoItem,
  factura: FacturaRelacionada,
  profileId: string,
  complementId: string
): PaymentComplementItemCreationAttributes => {
  return {
    complement_id: complementId,
    profile_id: profileId,
    factura_uuid: factura.uuid,
    fecha_pago: pago.fechaPago,
    forma_pago: pago.formaPago,
    moneda_pago: pago.monedaPago,
    tipo_cambio_pago: pago.tipoCambio,
    // En pagos con múltiples DoctoRelacionado, el monto aplicable por factura es ImpPagado.
    monto_pago: factura.impPagado,
    num_operacion: pago.numOperacion ?? null,
    moneda_dr: factura.monedaDR,
    tipo_cambio_dr: factura.tipoCambioDR,
    metodo_pago_dr: factura.metodoPagoDR,
    num_parcialidad: factura.numParcialidad,
    imp_saldo_ant: factura.impSaldoAnt,
    imp_pagado: factura.impPagado,
    imp_saldo_insoluto: factura.impSaldoInsoluto,
  };
};

const mapItemToPagoParcial = (item: PaymentComplementItem): PagoParcial => {
  return {
    fechaPago: item.fecha_pago,
    formaPago: item.forma_pago,
    monedaPago: item.moneda_pago,
    monto: Number(item.monto_pago),
    numOperacion: item.num_operacion ?? undefined,
    numParcialidad: item.num_parcialidad,
    complementoUUID: item.complement_id,
    origen: 'COMPLEMENTO',
  };
};

const mergePagos = (pagosManual: PagoParcial[], pagosComplemento: PagoParcial[]): PagoParcial[] => {
  const existentes = new Set(
    pagosManual.filter((pago) => pago.complementoUUID).map((pago) => buildPagoKey(pago))
  );

  const complementosNuevos = pagosComplemento.filter((pago) => {
    const key = buildPagoKey(pago);
    return !existentes.has(key);
  });

  return [...pagosManual, ...complementosNuevos];
};

const buildPagoKey = (pago: PagoParcial): string => {
  const fecha = typeof pago.fechaPago === 'string' ? pago.fechaPago : pago.fechaPago.toISOString();
  return [pago.complementoUUID ?? 'manual', pago.numParcialidad ?? 0, pago.monto, fecha].join('|');
};

const applyComplementItemsToDocuments = async (
  profileId: string,
  items: PaymentComplementItemCreationAttributes[]
): Promise<void> => {
  const facturasUUIDs = Array.from(new Set(items.map((item) => item.factura_uuid)));
  if (facturasUUIDs.length === 0) {
    return;
  }

  const facturas = await Invoice.findAll({
    where: {
      profile_id: profileId,
      uuid: { [Op.in]: facturasUUIDs },
      tipo: 'PPD',
    },
  });

  for (const factura of facturas) {
    await applyPaymentsToInvoice(factura, profileId);
  }

  const gastos = await AccruedExpense.findAll({
    where: {
      profile_id: profileId,
      uuid: { [Op.in]: facturasUUIDs },
      tipo: 'PPD',
    },
  });

  for (const gasto of gastos) {
    await applyPaymentsToExpense(gasto, profileId);
  }
};

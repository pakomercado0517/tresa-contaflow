import {
  Invoice,
  AccruedExpense,
  Profile,
  PaymentComplement,
  PaymentComplementItem,
  Period,
  ManualIncome,
  Payroll,
} from '../database/models/index.js';
import { Op } from 'sequelize';
import type {
  PeriodMetricsResponse,
  NominaMetrics,
  PendientesImpuestosDesglose,
  MetricsByMonthItem,
  MetricsRangeResponse,
  PeriodMetrics,
  PaymentContext,
  MetricsFilters,
} from '../types/metrics.types.js';
import type { PagoParcial } from '../types/payment.types.js';
import { enumerateMonthYears, MAX_METRICS_RANGE_MONTHS } from '../lib/metrics-range.js';
import {
  getJson,
  setJsonForProfile,
  getMetricsTtlSeconds,
  metricsDateRangeKey,
  metricsMonthKey,
  metricsPeriodKey,
} from './cache.service.js';
import {
  calcularEstadoPagoGastos,
  type EstadoPagoDetalle,
} from './payment-status.service.js';
import { AppError } from '../utils/AppError.js';

/**
 * Métricas del período. Los importes (totalFacturado, totalPagado, totalCompras, etc.)
 * están en base subtotal sin IVA para poder mostrar impuestos trasladados y retenidos por separado.
 */

/**
 * Servicio para calcular métricas del dashboard
 */
/**
 * Calcula las métricas para un período específico.
 * @deprecated Usar getMetricsForMonthYear o getMetricsByDateRange del stack /api/metrics.
 */
export const calculatePeriodMetrics = async (filters: MetricsFilters): Promise<PeriodMetrics> => {
  const { profileId, mes, año, userId } = filters;

  // Construir filtros de fecha
  const dateFilter: { mes?: number; año?: number } = {};
  if (mes !== undefined) {
    dateFilter.mes = mes;
  }
  if (año !== undefined) {
    dateFilter.año = año;
  }

  // Construir filtros de perfil
  const profileWhereClause: { user_id: string; id?: string } = { user_id: userId };
  if (profileId) {
    profileWhereClause.id = profileId;
  }

  // Obtener facturas del período
  const facturas = await Invoice.findAll({
    where: dateFilter,
    include: [
      {
        model: Profile,
        as: 'profile',
        where: profileWhereClause,
        attributes: ['id'],
      },
    ],
  });

  // Obtener gastos del período
  const gastos = await AccruedExpense.findAll({
    where: dateFilter,
    include: [
      {
        model: Profile,
        as: 'profile',
        where: profileWhereClause,
        attributes: ['id'],
      },
    ],
  });

  const profileIds = await getProfileIds(profileId, userId);
  const dateRange = getDateRange(mes, año);

  // Separar complementos de invoices y expenses
  // Para Opción B: contar complementos por fecha_pago, no por fecha de factura
  // Esto permite que un complemento de diciembre aparezca en diciembre aunque la factura sea de enero
  const { totalInvoices, totalExpenses, totalInvoicesSinConciliar, totalExpensesSinConciliar } =
    await sumComplementosPeriodoSeparado(profileIds, dateRange);

  const invoicesForManualPagos =
    dateRange && !profileId
      ? await getInvoicesForManualPagos(profileWhereClause)
      : dateRange && profileId
      ? await getInvoicesForManualPagos(profileWhereClause)
      : facturas;

  const manualPagosPeriodo = sumManualPagos(invoicesForManualPagos, dateRange);
  const pagosComplementoPorFactura = await sumComplementosPorFactura(
    profileIds,
    facturas.map((factura) => factura.uuid)
  );
  const pagosComplementoPorGasto = await sumComplementosPorFactura(
    profileIds,
    gastos.map((gasto) => gasto.uuid || '').filter((uuid) => uuid !== '')
  );
  const pagosManualPorFactura = sumManualPagos(facturas, null).porFactura;

  const paymentContext: PaymentContext = {
    totalPagadoComplementosInvoicesPeriodo: totalInvoices,
    totalPagadoComplementosExpensesPeriodo: totalExpenses,
    totalPagadoComplementosInvoicesSinConciliarPeriodo: totalInvoicesSinConciliar,
    totalPagadoComplementosExpensesSinConciliarPeriodo: totalExpensesSinConciliar,
    totalPagadoManualPeriodo: manualPagosPeriodo.total,
    pagosComplementoPorFactura,
    pagosComplementoPorGasto,
    pagosManualPorFactura,
  };

  // Calcular métricas
  return await calculateMetricsFromData(facturas, gastos, paymentContext, profileIds, dateRange);
};

/**
 * Calcula métricas a partir de arrays de facturas y gastos
 */
const calculateMetricsFromData = async (
  facturas: Invoice[],
  gastos: AccruedExpense[],
  paymentContext: PaymentContext,
  profileIds: string[],
  dateRange: { start: Date; end: Date } | null
): Promise<PeriodMetrics> => {
  // Inicializar contadores
  let totalFacturado = 0;
  // Solo sumar complementos de invoices en totalPagado (ingresos)
  let totalPagado =
    paymentContext.totalPagadoComplementosInvoicesPeriodo +
    paymentContext.totalPagadoComplementosInvoicesSinConciliarPeriodo +
    paymentContext.totalPagadoManualPeriodo;
  let totalCompras = 0; // Total contable (completo)
  // Los complementos de expenses se suman en totalComprasPagadas (gastos pagados)
  let totalComprasPagadas =
    paymentContext.totalPagadoComplementosExpensesPeriodo +
    paymentContext.totalPagadoComplementosExpensesSinConciliarPeriodo;
  let facturasPUE = 0;
  let facturasPPD = 0;
  let facturasPagadasCompletamente = 0;
  let facturasParcialmentePagadas = 0;
  let facturasPendientesPago = 0;
  let gastosPUE = 0;
  let gastosPPD = 0;
  let gastosPagadosCompletamente = 0;
  let gastosParcialmentePagados = 0;

  // Procesar facturas (todo en subtotal sin IVA; impuestos se muestran aparte)
  facturas.forEach((factura) => {
    const subtotal = Number(factura.subtotal ?? factura.total);

    // Contar tipos
    if (factura.tipo === 'PUE') {
      facturasPUE++;
      totalFacturado += subtotal;
      totalPagado += subtotal; // PUE está pagado completamente
      facturasPagadasCompletamente++;
    } else if (factura.tipo === 'PPD') {
      facturasPPD++;
      totalFacturado += subtotal;

      // Calcular pagos parciales
      const totalPagosParciales =
        (paymentContext.pagosComplementoPorFactura[factura.uuid] || 0) +
        (paymentContext.pagosManualPorFactura[factura.uuid] || 0);

      // Determinar si está completamente pagada o parcialmente (comparar contra subtotal)
      if (totalPagosParciales >= subtotal) {
        facturasPagadasCompletamente++;
      } else if (totalPagosParciales > 0) {
        facturasParcialmentePagadas++;
      } else {
        // Sin pagos
        facturasPendientesPago++;
      }
    }
  });

  // Precalcular estados de pago de gastos PPD por perfil (batch, evita N+1)
  const estadosPagoGastos = new Map<string, EstadoPagoDetalle>();
  const gastosPPDPorPerfil = new Map<string, AccruedExpense[]>();
  for (const gasto of gastos) {
    if (gasto.tipo === 'PPD' && gasto.uuid) {
      const group = gastosPPDPorPerfil.get(gasto.profile_id) ?? [];
      group.push(gasto);
      gastosPPDPorPerfil.set(gasto.profile_id, group);
    }
  }
  for (const [pid, group] of gastosPPDPorPerfil) {
    const batch = await calcularEstadoPagoGastos(group, pid);
    for (const [id, estado] of batch) {
      estadosPagoGastos.set(id, estado);
    }
  }

  for (const gasto of gastos) {
    const subtotalGasto = Number(gasto.subtotal ?? gasto.total);
    totalCompras += subtotalGasto; // Suma completa (contable) en subtotal sin IVA

    // Calcular estado de pago si es gasto de XML (tiene tipo)
    if (gasto.tipo && gasto.uuid) {
      if (gasto.tipo === 'PUE') {
        gastosPUE++;
        totalComprasPagadas += subtotalGasto; // PUE está pagado completamente
        gastosPagadosCompletamente++;
      } else if (gasto.tipo === 'PPD') {
        gastosPPD++;
        const estadoPago = estadosPagoGastos.get(gasto.id);
        if (estadoPago?.completamentePagado) {
          gastosPagadosCompletamente++;
        } else if (estadoPago && estadoPago.totalPagado > 0) {
          gastosParcialmentePagados++;
        }
      }
    } else {
      // Gastos manuales (sin tipo) se consideran pagados completamente
      totalComprasPagadas += subtotalGasto;
      gastosPagadosCompletamente++;
    }
  }

  // Calcular pendientes basándose en saldo insoluto del último complemento
  // Los pendientes se muestran en el mes de timbrado de la PPD, no en el mes de pago
  // IMPORTANTE: Para gastos, necesitamos buscar gastos que tengan complementos en este período
  // pero los pendientes se calculan en el mes de timbrado del gasto
  const { pendientePagar, gastosPendientes } = await calcularPendientesPorSaldoInsoluto(
    facturas,
    gastos,
    paymentContext,
    profileIds,
    dateRange
  );

  // Calcular total pagado menos compras (flujo de efectivo neto)
  // Usa totalComprasPagadas en lugar de totalCompras para reflejar el flujo real
  const totalPagadoMenosCompras = totalPagado - totalComprasPagadas;

  return {
    totalFacturado: Math.round(totalFacturado * 100) / 100, // Redondear a 2 decimales
    totalPagado: Math.round(totalPagado * 100) / 100,
    totalCompras: Math.round(totalCompras * 100) / 100,
    totalComprasPagadas: Math.round(totalComprasPagadas * 100) / 100,
    totalPagadoMenosCompras: Math.round(totalPagadoMenosCompras * 100) / 100,
    pendientePagar: Math.round(pendientePagar * 100) / 100,
    gastosPendientes: Math.round(gastosPendientes * 100) / 100,
    pagosAnticipadosGastos: 0, // Ya no se calcula con el nuevo enfoque (pendientes por saldo insoluto)
    totalFacturas: facturas.length,
    totalGastos: gastos.length,
    facturasPUE,
    facturasPPD,
    facturasPagadasCompletamente,
    facturasParcialmentePagadas,
    facturasPendientesPago,
    gastosPUE,
    gastosPPD,
    gastosPagadosCompletamente,
    gastosParcialmentePagados,
  };
};

/**
 * Agrupa complementos por UUID y conserva el último (orden ASC por fecha/parcialidad).
 */
const buildUltimoComplementoPorUuid = (
  items: PaymentComplementItem[]
): Map<string, PaymentComplementItem> => {
  const map = new Map<string, PaymentComplementItem>();
  for (const item of items) {
    map.set(item.factura_uuid, item);
  }
  return map;
};

/**
 * Calcula pendientes basándose en el saldo insoluto del último complemento
 * Nuevo enfoque: Los pendientes se muestran en el mes de timbrado de la PPD
 *
 * Lógica:
 * - Si hay complemento de pago: usar el imp_saldo_insoluto del último complemento
 *   (el saldo insoluto ya refleja el estado real después de todos los pagos)
 * - Si NO hay complemento: usar el monto total del PPD
 * - Si saldo insoluto = 0: la factura está pagada completamente y NO aparece en pendientes
 *
 * IMPORTANTE: Los pendientes se calculan SOLO para facturas/gastos que están en el período consultado.
 * Si un gasto está en enero pero su complemento se pagó en diciembre, en diciembre NO debe aparecer
 * como pendiente (porque el gasto no está en diciembre).
 */
const calcularPendientesPorSaldoInsoluto = async (
  facturas: Invoice[],
  gastos: AccruedExpense[],
  paymentContext: PaymentContext,
  profileIds: string[],
  _dateRange: { start: Date; end: Date } | null
): Promise<{ pendientePagar: number; gastosPendientes: number }> => {
  let pendientePagar = 0;
  let gastosPendientes = 0;

  const facturasPPD = facturas.filter((f) => f.tipo === 'PPD');
  const gastosPPD = gastos.filter((g) => g.tipo === 'PPD' && g.uuid);

  const uuidsPendientes = [
    ...facturasPPD.map((f) => f.uuid),
    ...gastosPPD.map((g) => g.uuid as string),
  ];

  let ultimoComplementoPorUuid = new Map<string, PaymentComplementItem>();
  if (uuidsPendientes.length > 0 && profileIds.length > 0) {
    const complementosItems = await PaymentComplementItem.findAll({
      where: {
        profile_id: { [Op.in]: profileIds },
        factura_uuid: { [Op.in]: uuidsPendientes },
      },
      order: [
        ['fecha_pago', 'ASC'],
        ['num_parcialidad', 'ASC'],
      ],
    });
    ultimoComplementoPorUuid = buildUltimoComplementoPorUuid(complementosItems);
  }

  for (const factura of facturasPPD) {
    const ultimoComplemento = ultimoComplementoPorUuid.get(factura.uuid);

    if (ultimoComplemento) {
      const saldoInsoluto = Number(ultimoComplemento.imp_saldo_insoluto || 0);
      if (saldoInsoluto > 0.01) {
        pendientePagar += saldoInsoluto;
      }
    } else {
      const subtotalFactura = Number(factura.subtotal ?? factura.total);
      const totalPagosParciales =
        (paymentContext.pagosComplementoPorFactura[factura.uuid] || 0) +
        (paymentContext.pagosManualPorFactura[factura.uuid] || 0);
      const saldoPendiente = subtotalFactura - totalPagosParciales;
      if (saldoPendiente > 0.01) {
        pendientePagar += saldoPendiente;
      }
    }
  }

  for (const gasto of gastosPPD) {
    if (!gasto.uuid) continue;

    const ultimoComplemento = ultimoComplementoPorUuid.get(gasto.uuid);

    if (ultimoComplemento) {
      const saldoInsoluto = Number(ultimoComplemento.imp_saldo_insoluto || 0);
      if (saldoInsoluto > 0.01) {
        gastosPendientes += saldoInsoluto;
      }
    } else {
      const subtotalGasto = Number(gasto.subtotal ?? gasto.total);
      if (subtotalGasto > 0.01) {
        gastosPendientes += subtotalGasto;
      }
    }
  }

  return {
    pendientePagar: Math.round(pendientePagar * 100) / 100,
    gastosPendientes: Math.round(gastosPendientes * 100) / 100,
  };
};

const getProfileIds = async (profileId: string | undefined, userId: string): Promise<string[]> => {
  if (profileId) {
    return [profileId];
  }

  const profiles = await Profile.findAll({
    where: { user_id: userId },
    attributes: ['id'],
  });

  return profiles.map((profile) => profile.id);
};

const getDateRange = (mes?: number, año?: number): { start: Date; end: Date } | null => {
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

/**
 * Obtiene el rango de fechas de un período por ID (para uso con period_id).
 */
const getDateRangeFromPeriod = async (
  profileId: string,
  periodId: string
): Promise<{ start: Date; end: Date } | null> => {
  const period = await Period.findOne({
    where: { id: periodId, profile_id: profileId },
    attributes: ['start_date', 'end_date'],
  });
  if (!period) {
    return null;
  }
  const start = new Date(period.start_date);
  const end = new Date(period.end_date);
  end.setDate(end.getDate() + 1);
  return { start, end };
};

/**
 * Suma neto_pagado de payrolls del período (profile_id + period_id).
 */
export const calculateNominaPagada = async (
  profileId: string,
  periodId: string
): Promise<number> => {
  const payrolls = await Payroll.findAll({
    where: { profile_id: profileId, period_id: periodId },
    attributes: ['neto_pagado'],
  });
  const sum = payrolls.reduce((acc, p) => acc + Number(p.neto_pagado ?? 0), 0);
  return Math.round(sum * 100) / 100;
};

/**
 * Métricas de nómina del período: total_pagada, percepciones, deducciones, cantidad_empleados (distinct employee_rfc).
 */
const getNominaMetrics = async (profileId: string, periodId: string): Promise<NominaMetrics> => {
  const payrolls = await Payroll.findAll({
    where: { profile_id: profileId, period_id: periodId },
    attributes: ['neto_pagado', 'percepciones_total', 'deducciones_total', 'employee_rfc'],
  });
  const total_pagada = payrolls.reduce((acc, p) => acc + Number(p.neto_pagado ?? 0), 0);
  const percepciones = payrolls.reduce((acc, p) => acc + Number(p.percepciones_total ?? 0), 0);
  const deducciones = payrolls.reduce((acc, p) => acc + Number(p.deducciones_total ?? 0), 0);
  const employeeRfcs = new Set(payrolls.map((p) => p.employee_rfc).filter(Boolean));
  return {
    total_pagada: Math.round(total_pagada * 100) / 100,
    percepciones: Math.round(percepciones * 100) / 100,
    deducciones: Math.round(deducciones * 100) / 100,
    cantidad_empleados: employeeRfcs.size,
  };
};

/**
 * Métricas de nómina por rango de fechas (fecha_pago dentro del rango).
 */
const getNominaMetricsForRange = async (
  profileId: string,
  dateRange: { start: Date; end: Date }
): Promise<NominaMetrics> => {
  const payrolls = await Payroll.findAll({
    where: {
      profile_id: profileId,
      fecha_pago: { [Op.gte]: dateRange.start, [Op.lt]: dateRange.end },
    },
    attributes: ['neto_pagado', 'percepciones_total', 'deducciones_total', 'employee_rfc'],
  });
  const total_pagada = payrolls.reduce((acc, p) => acc + Number(p.neto_pagado ?? 0), 0);
  const percepciones = payrolls.reduce((acc, p) => acc + Number(p.percepciones_total ?? 0), 0);
  const deducciones = payrolls.reduce((acc, p) => acc + Number(p.deducciones_total ?? 0), 0);
  const employeeRfcs = new Set(payrolls.map((p) => p.employee_rfc).filter(Boolean));
  return {
    total_pagada: Math.round(total_pagada * 100) / 100,
    percepciones: Math.round(percepciones * 100) / 100,
    deducciones: Math.round(deducciones * 100) / 100,
    cantidad_empleados: employeeRfcs.size,
  };
};

/**
 * Rango de fechas para un mes/año (primer día del mes inclusive, primer día del siguiente exclusive).
 */
const getDateRangeFromMonthYear = (mes: number, año: number): { start: Date; end: Date } => {
  const start = new Date(año, mes - 1, 1, 0, 0, 0);
  const end = new Date(año, mes, 1, 0, 0, 0);
  return { start, end };
};

/**
 * Busca o crea un período para el perfil que cubra el mes/año indicado.
 * Retorna el Period para que el frontend tenga period_id y pueda habilitar "Agregar ingreso manual".
 */
export const findOrCreatePeriodForMonth = async (
  profileId: string,
  mes: number,
  año: number
): Promise<Period> => {
  const pad = (n: number) => String(n).padStart(2, '0');
  const lastDay = new Date(año, mes, 0).getDate();
  const startDate = new Date(año, mes - 1, 1, 0, 0, 0);
  const endDate = new Date(año, mes - 1, lastDay, 23, 59, 59);

  let period = await Period.findOne({
    where: {
      profile_id: profileId,
      start_date: startDate,
      end_date: endDate,
    },
  });

  if (!period) {
    period = await Period.create({
      profile_id: profileId,
      start_date: startDate,
      end_date: endDate,
    });
  }

  return period;
};

/**
 * Complementos de pago por factura (solo facturas PPD) con fecha_pago en el período.
 */
const getComplementosPorFacturaEnPeriodo = async (
  profileId: string,
  dateRange: { start: Date; end: Date }
): Promise<Record<string, number>> => {
  const items = await PaymentComplementItem.findAll({
    where: {
      profile_id: profileId,
      fecha_pago: { [Op.gte]: dateRange.start, [Op.lt]: dateRange.end },
    },
  });
  if (items.length === 0) return {};
  const uuids = [...new Set(items.map((i) => i.factura_uuid))];
  const invoicesPPD = await Invoice.findAll({
    where: { profile_id: profileId, uuid: { [Op.in]: uuids }, tipo: 'PPD' },
    attributes: ['uuid'],
  });
  const setPPD = new Set(invoicesPPD.map((i) => i.uuid));
  const porFactura: Record<string, number> = {};
  items.forEach((item) => {
    if (setPPD.has(item.factura_uuid)) {
      porFactura[item.factura_uuid] =
        (porFactura[item.factura_uuid] || 0) + Number(item.imp_pagado || 0);
    }
  });
  return porFactura;
};

const getComplementosPorGastoEnPeriodo = async (
  profileId: string,
  dateRange: { start: Date; end: Date }
): Promise<Record<string, number>> => {
  const items = await PaymentComplementItem.findAll({
    where: {
      profile_id: profileId,
      fecha_pago: { [Op.gte]: dateRange.start, [Op.lt]: dateRange.end },
    },
  });
  if (items.length === 0) return {};
  const uuids = [...new Set(items.map((i) => i.factura_uuid))];
  const expensesPPD = await AccruedExpense.findAll({
    where: { profile_id: profileId, uuid: { [Op.in]: uuids }, tipo: 'PPD' },
    attributes: ['uuid'],
  });
  const setPPD = new Set(expensesPPD.map((e) => e.uuid || '').filter((u) => u !== ''));
  const porGasto: Record<string, number> = {};
  items.forEach((item) => {
    if (setPPD.has(item.factura_uuid)) {
      porGasto[item.factura_uuid] =
        (porGasto[item.factura_uuid] || 0) + Number(item.imp_pagado || 0);
    }
  });
  return porGasto;
};

/**
 * Pagos manuales por factura con fecha de pago en el período.
 */
const getManualPagosPorFacturaEnPeriodo = async (
  profileId: string,
  dateRange: { start: Date; end: Date }
): Promise<Record<string, number>> => {
  const facturas = await Invoice.findAll({
    where: { profile_id: profileId },
    attributes: ['uuid', 'pagos'],
  });
  return sumManualPagos(facturas, dateRange).porFactura;
};

/**
 * Pagos manuales acumulados por UUID de CFDI/documento (misma regla para facturas y gastos XML).
 * Filas sin `uuid` no entran en `porFactura`.
 */
const sumManualPagosFromUuidDocuments = (
  documents: readonly { uuid: string | null; pagos: PagoParcial[] }[],
  dateRange: { start: Date; end: Date } | null
): { total: number; porFactura: Record<string, number> } => {
  const porFactura: Record<string, number> = {};
  let total = 0;

  documents.forEach((document) => {
    const uuid = document.uuid;
    const pagos = document.pagos.filter((pago) => (pago.origen ?? 'MANUAL') === 'MANUAL');
    const pagosFiltrados = dateRange
      ? pagos.filter((pago) => {
          const fecha =
            typeof pago.fechaPago === 'string' ? new Date(pago.fechaPago) : pago.fechaPago;
          return fecha >= dateRange.start && fecha < dateRange.end;
        })
      : pagos;

    const sumDoc = pagosFiltrados.reduce((sum, pago) => sum + Number(pago.monto || 0), 0);
    if (uuid !== null && uuid.trim() !== '') {
      porFactura[uuid] = (porFactura[uuid] || 0) + sumDoc;
    }
    total += sumDoc;
  });

  return { total, porFactura };
};

const sumManualPagos = (
  facturas: Invoice[],
  dateRange: { start: Date; end: Date } | null
): { total: number; porFactura: Record<string, number> } => {
  const documents = facturas.map((factura) => ({
    uuid: factura.uuid,
    pagos: factura.pagos,
  }));
  return sumManualPagosFromUuidDocuments(documents, dateRange);
};

const sumComplementosPeriodo = async (
  profileIds: string[],
  dateRange: { start: Date; end: Date } | null
): Promise<number> => {
  if (profileIds.length === 0) {
    return 0;
  }

  const whereClause: {
    profile_id: { [Op.in]: string[] };
    fecha_pago?: { [Op.gte]: Date; [Op.lt]: Date };
  } = {
    profile_id: {
      [Op.in]: profileIds,
    },
  };

  if (dateRange) {
    whereClause.fecha_pago = {
      [Op.gte]: dateRange.start,
      [Op.lt]: dateRange.end,
    };
  }

  const pagos = await PaymentComplementItem.findAll({
    where: whereClause,
  });

  return pagos.reduce((sum, item) => sum + Number(item.imp_pagado || 0), 0);
};

/**
 * Suma complementos de pago separando entre invoices y expenses
 * Opción B: Cuenta complementos por fecha_pago, independientemente de la fecha de la factura relacionada
 * Esto permite que un complemento de diciembre aparezca en diciembre aunque la factura sea de enero
 */
const sumComplementosPeriodoSeparado = async (
  profileIds: string[],
  dateRange: { start: Date; end: Date } | null
): Promise<{
  totalInvoices: number;
  totalExpenses: number;
  totalInvoicesSinConciliar: number;
  totalExpensesSinConciliar: number;
}> => {
  if (profileIds.length === 0) {
    return {
      totalInvoices: 0,
      totalExpenses: 0,
      totalInvoicesSinConciliar: 0,
      totalExpensesSinConciliar: 0,
    };
  }

  const whereClause: {
    profile_id: { [Op.in]: string[] };
    fecha_pago?: { [Op.gte]: Date; [Op.lt]: Date };
  } = {
    profile_id: {
      [Op.in]: profileIds,
    },
  };

  if (dateRange) {
    whereClause.fecha_pago = {
      [Op.gte]: dateRange.start,
      [Op.lt]: dateRange.end,
    };
  }

  const allPagos = await PaymentComplementItem.findAll({
    where: whereClause,
    include: [
      {
        model: PaymentComplement,
        as: 'complement',
        attributes: ['rfc_emisor', 'rfc_receptor'],
        required: false,
      },
    ],
  });

  if (allPagos.length === 0) {
    return {
      totalInvoices: 0,
      totalExpenses: 0,
      totalInvoicesSinConciliar: 0,
      totalExpensesSinConciliar: 0,
    };
  }

  // Obtener todos los UUIDs únicos de facturas relacionadas
  const facturasUUIDs = Array.from(new Set(allPagos.map((item) => item.factura_uuid)));

  // Buscar en invoices y expenses para determinar el tipo
  const invoices = await Invoice.findAll({
    where: {
      uuid: { [Op.in]: facturasUUIDs },
      profile_id: { [Op.in]: profileIds },
      tipo: 'PPD',
    },
    attributes: ['uuid'],
  });

  const expenses = await AccruedExpense.findAll({
    where: {
      uuid: { [Op.in]: facturasUUIDs },
      profile_id: { [Op.in]: profileIds },
      tipo: 'PPD',
    },
    attributes: ['uuid'],
  });

  // Crear sets para búsqueda rápida
  const invoiceUUIDsSet = new Set(invoices.map((inv) => inv.uuid));
  const expenseUUIDsSet = new Set(
    expenses.map((exp) => exp.uuid || '').filter((uuid) => uuid !== '')
  );
  const profiles = await Profile.findAll({
    where: {
      id: { [Op.in]: profileIds },
    },
    attributes: ['id', 'rfc'],
  });
  const profileRFCById = new Map<string, string>(
    profiles.map((profile) => [profile.id, profile.rfc])
  );

  let totalInvoices = 0;
  let totalExpenses = 0;
  let totalInvoicesSinConciliar = 0;
  let totalExpensesSinConciliar = 0;

  for (const item of allPagos) {
    const monto = Number(item.imp_pagado || 0);
    if (invoiceUUIDsSet.has(item.factura_uuid)) {
      totalInvoices += monto;
    } else if (expenseUUIDsSet.has(item.factura_uuid)) {
      totalExpenses += monto;
    } else {
      const classification = classifyUnmatchedComplementItem(item, profileRFCById);
      if (classification === 'INVOICE') {
        totalInvoicesSinConciliar += monto;
      } else if (classification === 'EXPENSE') {
        totalExpensesSinConciliar += monto;
      }
    }
  }

  return {
    totalInvoices,
    totalExpenses,
    totalInvoicesSinConciliar,
    totalExpensesSinConciliar,
  };
};

const classifyUnmatchedComplementItem = (
  item: PaymentComplementItem,
  profileRFCById: Map<string, string>
): 'INVOICE' | 'EXPENSE' | null => {
  const typedItem = item as PaymentComplementItem & { complement?: PaymentComplement };
  const complemento = typedItem.complement;
  if (!complemento) {
    return null;
  }

  const profileRFC = profileRFCById.get(item.profile_id);
  if (!profileRFC) {
    return null;
  }

  if (areRFCsEqual(complemento.rfc_receptor, profileRFC)) {
    return 'EXPENSE';
  }
  if (areRFCsEqual(complemento.rfc_emisor, profileRFC)) {
    return 'INVOICE';
  }
  return null;
};

const areRFCsEqual = (leftRFC: string, rightRFC: string): boolean => {
  return leftRFC.trim().toUpperCase() === rightRFC.trim().toUpperCase();
};

const getDocumentTotalBase = (document: {
  total?: number | null;
  subtotal?: number | null;
  iva_amount?: number | null;
}): number => {
  const total = Number(document.total ?? 0);
  if (total > 0) {
    return total;
  }

  const subtotal = Number(document.subtotal ?? 0);
  const iva = Number(document.iva_amount ?? 0);
  const subtotalMasIva = subtotal + iva;
  if (subtotalMasIva > 0) {
    return subtotalMasIva;
  }

  return subtotal;
};

/**
 * Base subtotal sin IVA para KPI de pendientes (por cobrar / por pagar), alineado con el resto de métricas de flujo.
 * Impuestos y retenciones se muestran por separado.
 */
const getDocumentSubtotalForPendientes = (document: { subtotal?: number | null }): number => {
  return Number(document.subtotal ?? 0);
};

const pendientesImpuestosCero: PendientesImpuestosDesglose = {
  iva: 0,
  retenciones_iva: 0,
  retenciones_isr: 0,
} as const;

const roundPendientesImpuestos = (d: PendientesImpuestosDesglose): PendientesImpuestosDesglose => {
  return {
    iva: Math.round(d.iva * 100) / 100,
    retenciones_iva: Math.round(d.retenciones_iva * 100) / 100,
    retenciones_isr: Math.round(d.retenciones_isr * 100) / 100,
  };
};

/** Subtotal pendiente por cobrar (PPD) más IVA/ret proporcionales a ese subtotal pendiente por factura. */
const aggregatePendientesPorCobrarConImpuestos = async (
  profileId: string,
  dateRange: { start: Date; end: Date },
  regimenFiscalEmisor?: string
): Promise<{
  por_cobrar: number;
  por_cobrar_impuestos: PendientesImpuestosDesglose;
}> => {
  const ppdWhere: Record<string, unknown> = {
    profile_id: profileId,
    tipo: 'PPD',
    fecha: { [Op.gte]: dateRange.start, [Op.lt]: dateRange.end },
  };
  if (regimenFiscalEmisor) {
    ppdWhere.regimen_fiscal_emisor = regimenFiscalEmisor;
  }

  const invoicesPPD = await Invoice.findAll({
    where: ppdWhere,
    attributes: [
      'uuid',
      'subtotal',
      'iva_amount',
      'total',
      'retencion_iva_amount',
      'retencion_isr_amount',
    ],
  });
  if (invoicesPPD.length === 0) {
    return { por_cobrar: 0, por_cobrar_impuestos: pendientesImpuestosCero };
  }

  const uuids = invoicesPPD.map((inv) => inv.uuid);
  const [complementosPorFactura, manualPorFactura] = await Promise.all([
    sumComplementosPorFactura([profileId], uuids),
    (async (): Promise<Record<string, number>> => {
      const facturas = await Invoice.findAll({
        where: { profile_id: profileId },
        attributes: ['uuid', 'pagos'],
      });
      return sumManualPagos(facturas, null).porFactura;
    })(),
  ]);

  let subtotalPend = 0;
  const impAgg: PendientesImpuestosDesglose = {
    iva: 0,
    retenciones_iva: 0,
    retenciones_isr: 0,
  };

  for (const inv of invoicesPPD) {
    const baseSubtotal = getDocumentSubtotalForPendientes(inv);
    if (baseSubtotal <= 0) continue;
    const cobrado = (complementosPorFactura[inv.uuid] || 0) + (manualPorFactura[inv.uuid] || 0);
    if (cobrado >= baseSubtotal) continue;
    const pendBase = baseSubtotal - cobrado;
    subtotalPend += pendBase;
    const ratio = pendBase / baseSubtotal;
    impAgg.iva += Number(inv.iva_amount ?? 0) * ratio;
    impAgg.retenciones_iva += Number(inv.retencion_iva_amount ?? 0) * ratio;
    impAgg.retenciones_isr += Number(inv.retencion_isr_amount ?? 0) * ratio;
  }

  return {
    por_cobrar: Math.round(subtotalPend * 100) / 100,
    por_cobrar_impuestos: roundPendientesImpuestos(impAgg),
  };
};

/**
 * Igual que `calculatePPDPorPagar` + desglose: PPD proporcional sobre subtotal; MANUAL pendiente cuenta IVA/rets íntegros.
 */
const aggregatePendientesPorPagarConImpuestos = async (
  profileId: string,
  dateRange: { start: Date; end: Date },
  regimenFiscalReceptor?: string
): Promise<{ por_pagar: number; por_pagar_impuestos: PendientesImpuestosDesglose }> => {
  const ppdWhere: Record<string, unknown> = {
    profile_id: profileId,
    tipo: 'PPD',
    fecha: { [Op.gte]: dateRange.start, [Op.lt]: dateRange.end },
  };
  if (regimenFiscalReceptor) {
    ppdWhere.regimen_fiscal_receptor = regimenFiscalReceptor;
  }

  const gastosPPD = await AccruedExpense.findAll({
    where: ppdWhere,
    attributes: [
      'uuid',
      'total',
      'subtotal',
      'iva_amount',
      'pagos',
      'retencion_iva_amount',
      'retencion_isr_amount',
    ],
  });

  const uuids = gastosPPD
    .map((gasto) => gasto.uuid)
    .filter((uuid): uuid is string => typeof uuid === 'string' && uuid.trim() !== '');

  let complementosPorUuid: Record<string, number> = {};
  let manualPorUuid: Record<string, number> = {};

  if (uuids.length > 0) {
    const [comps, manuals] = await Promise.all([
      sumComplementosPorFactura([profileId], uuids),
      (async (): Promise<Record<string, number>> => {
        const todos = await AccruedExpense.findAll({
          where: { profile_id: profileId },
          attributes: ['uuid', 'pagos'],
        });
        return sumManualPagosFromUuidDocuments(
          todos.map((row) => ({ uuid: row.uuid, pagos: row.pagos })),
          null
        ).porFactura;
      })(),
    ]);
    complementosPorUuid = comps;
    manualPorUuid = manuals;
  }

  let totalPpdSubtotal = 0;
  const ppdImp: PendientesImpuestosDesglose = {
    iva: 0,
    retenciones_iva: 0,
    retenciones_isr: 0,
  };

  for (const gasto of gastosPPD) {
    const uuid = gasto.uuid?.trim();
    if (!uuid) continue;
    const baseSubtotal = getDocumentSubtotalForPendientes(gasto);
    if (baseSubtotal <= 0) continue;
    const pagado = (complementosPorUuid[uuid] ?? 0) + (manualPorUuid[uuid] ?? 0);
    if (pagado >= baseSubtotal) continue;
    const pendBase = baseSubtotal - pagado;
    totalPpdSubtotal += pendBase;
    const ratio = pendBase / baseSubtotal;
    ppdImp.iva += Number(gasto.iva_amount ?? 0) * ratio;
    ppdImp.retenciones_iva += Number(gasto.retencion_iva_amount ?? 0) * ratio;
    ppdImp.retenciones_isr += Number(gasto.retencion_isr_amount ?? 0) * ratio;
  }

  const manualWhere: Record<string, unknown> = {
    profile_id: profileId,
    tipo_origen: 'MANUAL',
    is_paid: false,
    fecha: { [Op.gte]: dateRange.start, [Op.lt]: dateRange.end },
  };
  if (regimenFiscalReceptor) {
    manualWhere.regimen_fiscal_receptor = regimenFiscalReceptor;
  }

  const manualesPendientes = await AccruedExpense.findAll({
    where: manualWhere,
    attributes: ['subtotal', 'iva_amount', 'retencion_iva_amount', 'retencion_isr_amount'],
  });

  let totalManualMonto = 0;
  const manualImp: PendientesImpuestosDesglose = {
    iva: 0,
    retenciones_iva: 0,
    retenciones_isr: 0,
  };

  manualesPendientes.forEach((fila) => {
    totalManualMonto += Number(fila.subtotal ?? 0) + Number(fila.iva_amount ?? 0);
    manualImp.iva += Number(fila.iva_amount ?? 0);
    manualImp.retenciones_iva += Number(fila.retencion_iva_amount ?? 0);
    manualImp.retenciones_isr += Number(fila.retencion_isr_amount ?? 0);
  });

  const porPagarImp: PendientesImpuestosDesglose = roundPendientesImpuestos({
    iva: ppdImp.iva + manualImp.iva,
    retenciones_iva: ppdImp.retenciones_iva + manualImp.retenciones_iva,
    retenciones_isr: ppdImp.retenciones_isr + manualImp.retenciones_isr,
  });

  const por_pagar = Math.round((totalPpdSubtotal + totalManualMonto) * 100) / 100;

  return {
    por_pagar,
    por_pagar_impuestos: porPagarImp,
  };
};

const sumComplementosPorFactura = async (
  profileIds: string[],
  facturaUUIDs: string[]
): Promise<Record<string, number>> => {
  const porFactura: Record<string, number> = {};
  if (profileIds.length === 0 || facturaUUIDs.length === 0) {
    return porFactura;
  }

  const pagos = await PaymentComplementItem.findAll({
    where: {
      profile_id: {
        [Op.in]: profileIds,
      },
      factura_uuid: {
        [Op.in]: facturaUUIDs,
      },
    },
  });

  pagos.forEach((item) => {
    const current = porFactura[item.factura_uuid] || 0;
    porFactura[item.factura_uuid] = current + Number(item.imp_pagado || 0);
  });

  return porFactura;
};

const getInvoicesForManualPagos = async (profileWhereClause: {
  user_id: string;
  id?: string;
}): Promise<Invoice[]> => {
  return Invoice.findAll({
    include: [
      {
        model: Profile,
        as: 'profile',
        where: profileWhereClause,
        attributes: ['id'],
      },
    ],
  });
};

/**
 * Obtiene métricas por mes para un año específico
 * Útil para gráficos de tendencias
 */
export const getMonthlyMetrics = async (
  año: number,
  filters: { profileId?: string; userId: string }
): Promise<Record<number, PeriodMetrics>> => {
  const monthlyMetrics: Record<number, PeriodMetrics> = {};

  // Calcular métricas para cada mes (1-12)
  for (let mes = 1; mes <= 12; mes++) {
    const metrics = await calculatePeriodMetrics({
      ...filters,
      mes,
      año,
    });
    monthlyMetrics[mes] = metrics;
  }

  return monthlyMetrics;
};

/**
 * Obtiene resumen general (sin filtros de fecha)
 */
export const getGeneralMetrics = async (filters: {
  profileId?: string;
  userId: string;
}): Promise<PeriodMetrics> => {
  return calculatePeriodMetrics(filters);
};

/**
 * Métricas del período, opcionalmente filtradas por régimen fiscal.
 * Si regimenFiscal se indica, filtra facturas por regimen_fiscal_emisor y gastos por regimen_fiscal_receptor.
 * Retorna null si el período no existe o no pertenece al perfil.
 */
export const getMetricsForPeriod = async (
  profileId: string,
  periodId: string,
  regimenFiscal?: string
): Promise<PeriodMetricsResponse | null> => {
  if (!regimenFiscal) {
    return getMetrics(profileId, periodId);
  }

  const cacheKey = metricsPeriodKey(profileId, periodId, regimenFiscal);
  const cached = await getJson<PeriodMetricsResponse>(cacheKey, {
    profileId,
    domain: 'metrics',
  });
  if (cached) {
    return {
      ...cached,
      period: {
        ...cached.period,
        start: new Date(cached.period.start),
        end: new Date(cached.period.end),
      },
    };
  }

  const period = await Period.findOne({
    where: { id: periodId, profile_id: profileId },
    attributes: ['id', 'start_date', 'end_date'],
  });
  if (!period) return null;

  const dateRange = await getDateRangeFromPeriod(profileId, periodId);
  if (!dateRange) return null;
  const result = await getMetricsByDateRange(
    profileId,
    dateRange.start,
    dateRange.end,
    regimenFiscal
  );
  const response: PeriodMetricsResponse = {
    ...result,
    period: {
      id: period.id,
      start: period.start_date,
      end: period.end_date,
    },
  };

  await setJsonForProfile(cacheKey, response, profileId, getMetricsTtlSeconds(), 'metrics');
  return response;
};

/**
 * Métricas consolidadas del período para el endpoint: flujo, devengado, impuestos y pendientes.
 * Retorna null si el período no existe o no pertenece al perfil.
 */
export const getMetrics = async (
  profileId: string,
  periodId: string
): Promise<PeriodMetricsResponse | null> => {
  const cacheKey = metricsPeriodKey(profileId, periodId);
  const cached = await getJson<PeriodMetricsResponse>(cacheKey, {
    profileId,
    domain: 'metrics',
  });
  if (cached) {
    return {
      ...cached,
      period: {
        ...cached.period,
        start: new Date(cached.period.start),
        end: new Date(cached.period.end),
      },
    };
  }

  const period = await Period.findOne({
    where: { id: periodId, profile_id: profileId },
    attributes: ['id', 'start_date', 'end_date'],
  });
  if (!period) return null;

  const dateRange = await getDateRangeFromPeriod(profileId, periodId);
  if (!dateRange) {
    return null;
  }

  const [
    ingresosCobrados,
    egresosPagados,
    complementosSinConciliar,
    ingresosDevengados,
    egresosDevengados,
    ivaTrasladado,
    ivaAcreditable,
    retenciones,
    pendientesCobrarAgg,
    pendientesPagarAgg,
    nomina,
  ] = await Promise.all([
    calculateIngresosCobrados(profileId, periodId),
    calculateEgresosPagados(profileId, periodId),
    getUnmatchedComplementTotalsForPeriod(profileId, periodId),
    calculateIngresosDevengados(profileId, periodId),
    calculateEgresosDevengados(profileId, periodId),
    calculateIVATrasladado(profileId, periodId),
    calculateIVAAcreditable(profileId, periodId),
    calculateRetenciones(profileId, periodId),
    aggregatePendientesPorCobrarConImpuestos(profileId, dateRange),
    aggregatePendientesPorPagarConImpuestos(profileId, dateRange),
    getNominaMetrics(profileId, periodId),
  ]);

  const flujoNeto = ingresosCobrados - egresosPagados;
  const resultadoDevengado = ingresosDevengados - egresosDevengados;

  const response: PeriodMetricsResponse = {
    period: {
      id: period.id,
      start: period.start_date,
      end: period.end_date,
    },
    flujo: {
      ingresos_cobrados: ingresosCobrados,
      egresos_pagados: egresosPagados,
      flujo_neto: flujoNeto,
      ingresos_cobrados_sin_conciliar: complementosSinConciliar.ingresos,
      egresos_pagados_sin_conciliar: complementosSinConciliar.egresos,
    },
    devengado: {
      ingresos_devengados: ingresosDevengados,
      egresos_devengados: egresosDevengados,
      resultado_devengado: resultadoDevengado,
    },
    impuestos: {
      iva_trasladado: { cobrado: ivaTrasladado.cobrado, devengado: ivaTrasladado.devengado },
      iva_acreditable: { pagado: ivaAcreditable.pagado, devengado: ivaAcreditable.devengado },
      retenciones_iva: {
        cobrado: retenciones.iva_cobrado,
        devengado: retenciones.iva_devengado,
      },
      retenciones_isr: {
        cobrado: retenciones.isr_cobrado,
        devengado: retenciones.isr_devengado,
      },
    },
    pendientes: {
      por_cobrar: pendientesCobrarAgg.por_cobrar,
      por_pagar: pendientesPagarAgg.por_pagar,
      por_cobrar_impuestos: pendientesCobrarAgg.por_cobrar_impuestos,
      por_pagar_impuestos: pendientesPagarAgg.por_pagar_impuestos,
    },
    nomina,
  };

  await setJsonForProfile(cacheKey, response, profileId, getMetricsTtlSeconds(), 'metrics');
  return response;
};

/**
 * Métricas por rango de fechas (sin period_id). Para manual_incomes filtra por fecha en el rango.
 * Útil para mes/año cuando no hay período o se agregan varios perfiles.
 * regimenFiscal: si se indica, filtra facturas por regimen_fiscal_emisor y gastos por regimen_fiscal_receptor.
 */
export const getMetricsByDateRange = async (
  profileId: string,
  start: Date,
  end: Date,
  regimenFiscal?: string
): Promise<PeriodMetricsResponse> => {
  const startIso = start.toISOString();
  const endIso = end.toISOString();
  const cacheKey = metricsDateRangeKey(profileId, startIso, endIso, regimenFiscal);
  const cached = await getJson<PeriodMetricsResponse>(cacheKey, {
    profileId,
    domain: 'metrics',
  });
  if (cached) {
    return {
      ...cached,
      period: {
        ...cached.period,
        start: new Date(cached.period.start),
        end: new Date(cached.period.end),
      },
    };
  }

  const dateRange = { start, end };
  const regimenFilter = regimenFiscal ?? undefined;
  const [
    ingresosCobrados,
    egresosPagados,
    complementosSinConciliar,
    ingresosDevengados,
    egresosDevengados,
    ivaTrasladado,
    ivaAcreditable,
    retenciones,
    pendientesCobrarAgg,
    pendientesPagarAgg,
    nomina,
  ] = await Promise.all([
    calculateIngresosCobradosForRange(profileId, dateRange, regimenFilter),
    calculateEgresosPagadosForRange(profileId, dateRange, regimenFilter),
    getUnmatchedComplementTotalsForRange(profileId, dateRange, regimenFilter),
    calculateIngresosDevengadosForRange(profileId, dateRange, regimenFilter),
    calculateEgresosDevengadosForRange(profileId, dateRange, regimenFilter),
    calculateIVATrasladadoForRange(profileId, dateRange, regimenFilter),
    calculateIVAAcreditableForRange(profileId, dateRange, regimenFilter),
    calculateRetencionesForRange(profileId, dateRange, regimenFilter),
    aggregatePendientesPorCobrarConImpuestos(profileId, dateRange, regimenFilter),
    aggregatePendientesPorPagarConImpuestos(profileId, dateRange, regimenFilter),
    getNominaMetricsForRange(profileId, dateRange),
  ]);

  const flujoNeto = ingresosCobrados - egresosPagados;
  const resultadoDevengado = ingresosDevengados - egresosDevengados;

  const response: PeriodMetricsResponse = {
    period: { id: '', start, end },
    flujo: {
      ingresos_cobrados: ingresosCobrados,
      egresos_pagados: egresosPagados,
      flujo_neto: flujoNeto,
      ingresos_cobrados_sin_conciliar: complementosSinConciliar.ingresos,
      egresos_pagados_sin_conciliar: complementosSinConciliar.egresos,
    },
    devengado: {
      ingresos_devengados: ingresosDevengados,
      egresos_devengados: egresosDevengados,
      resultado_devengado: resultadoDevengado,
    },
    impuestos: {
      iva_trasladado: { cobrado: ivaTrasladado.cobrado, devengado: ivaTrasladado.devengado },
      iva_acreditable: { pagado: ivaAcreditable.pagado, devengado: ivaAcreditable.devengado },
      retenciones_iva: {
        cobrado: retenciones.iva_cobrado,
        devengado: retenciones.iva_devengado,
      },
      retenciones_isr: {
        cobrado: retenciones.isr_cobrado,
        devengado: retenciones.isr_devengado,
      },
    },
    pendientes: {
      por_cobrar: pendientesCobrarAgg.por_cobrar,
      por_pagar: pendientesPagarAgg.por_pagar,
      por_cobrar_impuestos: pendientesCobrarAgg.por_cobrar_impuestos,
      por_pagar_impuestos: pendientesPagarAgg.por_pagar_impuestos,
    },
    nomina,
  };

  await setJsonForProfile(cacheKey, response, profileId, getMetricsTtlSeconds(), 'metrics');
  return response;
};

/**
 * Métricas para mes/año: un perfil (profile_id) o todos (profileIds). Una sola petición.
 * regimenFiscal: si se indica, filtra por regimen_fiscal_emisor (facturas) y regimen_fiscal_receptor (gastos).
 * Sin profile_id y con regimenFiscal: solo incluye perfiles cuyo regimenes_fiscales contiene la clave.
 */
export const getMetricsForMonthYear = async (
  userId: string,
  mes: number,
  año: number,
  profileId?: string,
  regimenFiscal?: string
): Promise<PeriodMetricsResponse | null> => {
  if (profileId) {
    const cacheKey = metricsMonthKey(profileId, año, mes, regimenFiscal);
    const cached = await getJson<PeriodMetricsResponse>(cacheKey, {
      profileId,
      domain: 'metrics',
    });
    if (cached) {
      const period = await findOrCreatePeriodForMonth(profileId, mes, año);
      return {
        ...cached,
        period: {
          id: period.id,
          start: new Date(cached.period.start),
          end: new Date(cached.period.end),
        },
      };
    }
  }

  let profileIds: string[];
  if (profileId) {
    profileIds = [profileId];
  } else {
    const profiles = await Profile.findAll({
      where: { user_id: userId },
      attributes: ['id', 'regimenes_fiscales'],
    });
    profileIds = regimenFiscal
      ? profiles
          .filter((p) => (p.regimenes_fiscales ?? []).includes(regimenFiscal))
          .map((p) => p.id)
      : profiles.map((p) => p.id);
  }
  if (profileIds.length === 0) return null;

  const { start, end } = getDateRangeFromMonthYear(mes, año);

  const results = await Promise.all(
    profileIds.map((pid) => getMetricsByDateRange(pid, start, end, regimenFiscal))
  );

  if (results.length === 1) {
    const single = results[0];
    if (!single) return null;
    // Obtener period_id real para habilitar "Agregar ingreso manual" en el frontend
    const period = await findOrCreatePeriodForMonth(profileIds[0]!, mes, año);
    const response: PeriodMetricsResponse = {
      period: { id: period.id, start, end },
      flujo: single.flujo,
      devengado: single.devengado,
      impuestos: single.impuestos,
      pendientes: single.pendientes,
      nomina: single.nomina,
    };
    if (profileId) {
      await setJsonForProfile(
        metricsMonthKey(profileId, año, mes, regimenFiscal),
        response,
        profileId,
        getMetricsTtlSeconds(),
        'metrics'
      );
    }
    return response;
  }

  const aggregated: PeriodMetricsResponse = {
    period: { id: 'aggregated', start, end },
    flujo: {
      ingresos_cobrados: 0,
      egresos_pagados: 0,
      flujo_neto: 0,
      ingresos_cobrados_sin_conciliar: 0,
      egresos_pagados_sin_conciliar: 0,
    },
    devengado: {
      ingresos_devengados: 0,
      egresos_devengados: 0,
      resultado_devengado: 0,
    },
    impuestos: {
      iva_trasladado: { cobrado: 0, devengado: 0 },
      iva_acreditable: { pagado: 0, devengado: 0 },
      retenciones_iva: { cobrado: 0, devengado: 0 },
      retenciones_isr: { cobrado: 0, devengado: 0 },
    },
    pendientes: {
      por_cobrar: 0,
      por_pagar: 0,
      por_cobrar_impuestos: { ...pendientesImpuestosCero },
      por_pagar_impuestos: { ...pendientesImpuestosCero },
    },
    nomina: {
      total_pagada: 0,
      percepciones: 0,
      deducciones: 0,
      cantidad_empleados: 0,
    },
  };

  for (const r of results) {
    aggregated.flujo.ingresos_cobrados += r.flujo.ingresos_cobrados;
    aggregated.flujo.egresos_pagados += r.flujo.egresos_pagados;
    aggregated.flujo.flujo_neto += r.flujo.flujo_neto;
    aggregated.flujo.ingresos_cobrados_sin_conciliar += r.flujo.ingresos_cobrados_sin_conciliar;
    aggregated.flujo.egresos_pagados_sin_conciliar += r.flujo.egresos_pagados_sin_conciliar;
    aggregated.devengado.ingresos_devengados += r.devengado.ingresos_devengados;
    aggregated.devengado.egresos_devengados += r.devengado.egresos_devengados;
    aggregated.devengado.resultado_devengado += r.devengado.resultado_devengado;
    aggregated.impuestos.iva_trasladado.cobrado += r.impuestos.iva_trasladado.cobrado;
    aggregated.impuestos.iva_trasladado.devengado += r.impuestos.iva_trasladado.devengado;
    aggregated.impuestos.iva_acreditable.pagado += r.impuestos.iva_acreditable.pagado;
    aggregated.impuestos.iva_acreditable.devengado += r.impuestos.iva_acreditable.devengado;
    aggregated.impuestos.retenciones_iva.cobrado += r.impuestos.retenciones_iva.cobrado;
    aggregated.impuestos.retenciones_iva.devengado += r.impuestos.retenciones_iva.devengado;
    aggregated.impuestos.retenciones_isr.cobrado += r.impuestos.retenciones_isr.cobrado;
    aggregated.impuestos.retenciones_isr.devengado += r.impuestos.retenciones_isr.devengado;
    aggregated.pendientes.por_cobrar += r.pendientes.por_cobrar;
    aggregated.pendientes.por_pagar += r.pendientes.por_pagar;
    aggregated.pendientes.por_cobrar_impuestos.iva += r.pendientes.por_cobrar_impuestos.iva;
    aggregated.pendientes.por_cobrar_impuestos.retenciones_iva +=
      r.pendientes.por_cobrar_impuestos.retenciones_iva;
    aggregated.pendientes.por_cobrar_impuestos.retenciones_isr +=
      r.pendientes.por_cobrar_impuestos.retenciones_isr;
    aggregated.pendientes.por_pagar_impuestos.iva += r.pendientes.por_pagar_impuestos.iva;
    aggregated.pendientes.por_pagar_impuestos.retenciones_iva +=
      r.pendientes.por_pagar_impuestos.retenciones_iva;
    aggregated.pendientes.por_pagar_impuestos.retenciones_isr +=
      r.pendientes.por_pagar_impuestos.retenciones_isr;
    aggregated.nomina.total_pagada += r.nomina.total_pagada;
    aggregated.nomina.percepciones += r.nomina.percepciones;
    aggregated.nomina.deducciones += r.nomina.deducciones;
    aggregated.nomina.cantidad_empleados += r.nomina.cantidad_empleados;
  }

  aggregated.flujo.flujo_neto = Math.round(aggregated.flujo.flujo_neto * 100) / 100;
  aggregated.flujo.ingresos_cobrados_sin_conciliar =
    Math.round(aggregated.flujo.ingresos_cobrados_sin_conciliar * 100) / 100;
  aggregated.flujo.egresos_pagados_sin_conciliar =
    Math.round(aggregated.flujo.egresos_pagados_sin_conciliar * 100) / 100;
  aggregated.devengado.resultado_devengado =
    Math.round(aggregated.devengado.resultado_devengado * 100) / 100;
  aggregated.pendientes.por_cobrar = Math.round(aggregated.pendientes.por_cobrar * 100) / 100;
  aggregated.pendientes.por_pagar = Math.round(aggregated.pendientes.por_pagar * 100) / 100;
  aggregated.nomina.total_pagada = Math.round(aggregated.nomina.total_pagada * 100) / 100;
  aggregated.nomina.percepciones = Math.round(aggregated.nomina.percepciones * 100) / 100;
  aggregated.nomina.deducciones = Math.round(aggregated.nomina.deducciones * 100) / 100;
  aggregated.pendientes.por_cobrar_impuestos = roundPendientesImpuestos(
    aggregated.pendientes.por_cobrar_impuestos
  );
  aggregated.pendientes.por_pagar_impuestos = roundPendientesImpuestos(
    aggregated.pendientes.por_pagar_impuestos
  );

  return aggregated;
};

/**
 * Métricas para un rango de meses (inclusive). Una petición, un ítem por mes.
 * Reutiliza getMetricsForMonthYear por cada mes (agregación multi-perfil y régimen).
 */
export const getMetricsForMonthYearRange = async (
  userId: string,
  mesDesde: number,
  añoDesde: number,
  mesHasta: number,
  añoHasta: number,
  profileId?: string,
  regimenFiscal?: string
): Promise<MetricsRangeResponse | null> => {
  const months = enumerateMonthYears(mesDesde, añoDesde, mesHasta, añoHasta);
  if (months.length === 0) {
    return null;
  }
  if (months.length > MAX_METRICS_RANGE_MONTHS) {
    throw new AppError(`El rango no puede exceder ${MAX_METRICS_RANGE_MONTHS} meses`, 400);
  }

  const results = await Promise.all(
    months.map(({ mes, año }) => getMetricsForMonthYear(userId, mes, año, profileId, regimenFiscal))
  );

  const firstNullIndex = results.findIndex((r) => r === null);
  if (firstNullIndex !== -1) {
    const { mes, año } = months[firstNullIndex]!;
    throw new AppError(`No se pudieron calcular métricas para ${mes}/${año}`, 500);
  }

  const items: MetricsByMonthItem[] = months.map(({ mes, año }, index) => {
    const metrics = results[index] as PeriodMetricsResponse;
    return { ...metrics, mes, año };
  });

  return {
    range: {
      mes_desde: mesDesde,
      año_desde: añoDesde,
      mes_hasta: mesHasta,
      año_hasta: añoHasta,
    },
    items,
  };
};

const getUnmatchedComplementTotalsForPeriod = async (
  profileId: string,
  periodId: string
): Promise<{ ingresos: number; egresos: number }> => {
  const dateRange = await getDateRangeFromPeriod(profileId, periodId);
  if (!dateRange) {
    return { ingresos: 0, egresos: 0 };
  }
  return getUnmatchedComplementTotalsForRange(profileId, dateRange);
};

const getUnmatchedComplementTotalsForRange = async (
  profileId: string,
  dateRange: { start: Date; end: Date },
  regimenFiscal?: string
): Promise<{ ingresos: number; egresos: number }> => {
  if (regimenFiscal) {
    // Sin factura relacionada no podemos validar régimen fiscal de forma confiable.
    return { ingresos: 0, egresos: 0 };
  }

  const profile = await Profile.findByPk(profileId, { attributes: ['id', 'rfc'] });
  if (!profile) {
    return { ingresos: 0, egresos: 0 };
  }

  const allPagos = await PaymentComplementItem.findAll({
    where: {
      profile_id: profileId,
      fecha_pago: { [Op.gte]: dateRange.start, [Op.lt]: dateRange.end },
    },
    include: [
      {
        model: PaymentComplement,
        as: 'complement',
        attributes: ['rfc_emisor', 'rfc_receptor'],
        required: false,
      },
    ],
  });
  if (allPagos.length === 0) {
    return { ingresos: 0, egresos: 0 };
  }

  const facturaUUIDs = [...new Set(allPagos.map((item) => item.factura_uuid))];
  const [invoicesPPD, expensesPPD] = await Promise.all([
    Invoice.findAll({
      where: {
        profile_id: profileId,
        uuid: { [Op.in]: facturaUUIDs },
        tipo: 'PPD',
      },
      attributes: ['uuid'],
    }),
    AccruedExpense.findAll({
      where: {
        profile_id: profileId,
        uuid: { [Op.in]: facturaUUIDs },
        tipo: 'PPD',
      },
      attributes: ['uuid'],
    }),
  ]);

  const invoiceUUIDsSet = new Set(invoicesPPD.map((invoice) => invoice.uuid));
  const expenseUUIDsSet = new Set(
    expensesPPD.map((expense) => expense.uuid || '').filter((uuid) => uuid !== '')
  );
  const profileRFCById = new Map<string, string>([[profile.id, profile.rfc]]);

  let ingresos = 0;
  let egresos = 0;
  for (const item of allPagos) {
    if (invoiceUUIDsSet.has(item.factura_uuid) || expenseUUIDsSet.has(item.factura_uuid)) {
      continue;
    }

    const classification = classifyUnmatchedComplementItem(item, profileRFCById);
    const monto = Number(item.imp_pagado || 0);
    if (classification === 'INVOICE') {
      ingresos += monto;
    } else if (classification === 'EXPENSE') {
      egresos += monto;
    }
  }

  return {
    ingresos: Math.round(ingresos * 100) / 100,
    egresos: Math.round(egresos * 100) / 100,
  };
};

const calculateIngresosCobradosForRange = async (
  profileId: string,
  dateRange: { start: Date; end: Date },
  regimenFiscal?: string
): Promise<number> => {
  const invoiceWhere: Record<string, unknown> = {
    profile_id: profileId,
    tipo: 'PUE',
    fecha: { [Op.gte]: dateRange.start, [Op.lt]: dateRange.end },
  };
  if (regimenFiscal) invoiceWhere.regimen_fiscal_emisor = regimenFiscal;

  const invoicesPUE = await Invoice.findAll({
    where: invoiceWhere,
    attributes: ['subtotal'],
  });
  const sumPUE = invoicesPUE.reduce((acc, inv) => acc + Number(inv.subtotal || 0), 0);
  const complementosPPD = await PaymentComplementItem.findAll({
    where: {
      profile_id: profileId,
      fecha_pago: { [Op.gte]: dateRange.start, [Op.lt]: dateRange.end },
    },
  });
  const invoiceUUIDs = [...new Set(complementosPPD.map((c) => c.factura_uuid))];
  const ppdWhere: Record<string, unknown> = {
    profile_id: profileId,
    uuid: { [Op.in]: invoiceUUIDs },
    tipo: 'PPD',
  };
  if (regimenFiscal) ppdWhere.regimen_fiscal_emisor = regimenFiscal;
  const invoicesPPD = invoiceUUIDs.length
    ? await Invoice.findAll({
        where: ppdWhere,
        attributes: ['uuid'],
      })
    : [];
  const uuidPPDSet = new Set(invoicesPPD.map((i) => i.uuid));
  const sumComplementos = complementosPPD
    .filter((c) => uuidPPDSet.has(c.factura_uuid))
    .reduce((acc, c) => acc + Number(c.imp_pagado || 0), 0);

  const manualIncomesPaid = await ManualIncome.findAll({
    where: {
      profile_id: profileId,
      is_paid: true,
      fecha: { [Op.gte]: dateRange.start, [Op.lt]: dateRange.end },
    },
    attributes: ['subtotal'],
  });
  const sumManualPaid = manualIncomesPaid.reduce((acc, m) => acc + Number(m.subtotal || 0), 0);
  const complementosSinConciliar = await getUnmatchedComplementTotalsForRange(
    profileId,
    dateRange,
    regimenFiscal
  );

  return (
    Math.round(
      (sumPUE + sumComplementos + sumManualPaid + complementosSinConciliar.ingresos) * 100
    ) / 100
  );
};

const calculateEgresosPagadosForRange = async (
  profileId: string,
  dateRange: { start: Date; end: Date },
  regimenFiscal?: string
): Promise<number> => {
  const pueWhere: Record<string, unknown> = {
    profile_id: profileId,
    tipo: 'PUE',
    fecha: { [Op.gte]: dateRange.start, [Op.lt]: dateRange.end },
  };
  if (regimenFiscal) pueWhere.regimen_fiscal_receptor = regimenFiscal;

  const expensesPUE = await AccruedExpense.findAll({
    where: pueWhere,
    attributes: ['subtotal'],
  });
  const sumPUE = expensesPUE.reduce((acc, e) => acc + Number(e.subtotal || 0), 0);

  const complementosPPD = await PaymentComplementItem.findAll({
    where: {
      profile_id: profileId,
      fecha_pago: { [Op.gte]: dateRange.start, [Op.lt]: dateRange.end },
    },
  });
  const expenseUUIDs = [...new Set(complementosPPD.map((c) => c.factura_uuid))];
  const ppdWhere: Record<string, unknown> = {
    profile_id: profileId,
    uuid: { [Op.in]: expenseUUIDs },
    tipo: 'PPD',
  };
  if (regimenFiscal) ppdWhere.regimen_fiscal_receptor = regimenFiscal;
  const expensesPPD = expenseUUIDs.length
    ? await AccruedExpense.findAll({
        where: ppdWhere,
        attributes: ['uuid'],
      })
    : [];
  const uuidPPDSet = new Set(expensesPPD.map((e) => e.uuid || '').filter((u) => u !== ''));
  const sumComplementos = complementosPPD
    .filter((c) => uuidPPDSet.has(c.factura_uuid))
    .reduce((acc, c) => acc + Number(c.imp_pagado || 0), 0);

  const complementosSinConciliar = await getUnmatchedComplementTotalsForRange(
    profileId,
    dateRange,
    regimenFiscal
  );

  const manualPaidWhere: Record<string, unknown> = {
    profile_id: profileId,
    tipo_origen: 'MANUAL',
    is_paid: true,
    fecha: { [Op.gte]: dateRange.start, [Op.lt]: dateRange.end },
  };
  if (regimenFiscal) manualPaidWhere.regimen_fiscal_receptor = regimenFiscal;
  const manualPaidExpenses = await AccruedExpense.findAll({
    where: manualPaidWhere,
    attributes: ['subtotal'],
  });
  const sumManualPaid = manualPaidExpenses.reduce((acc, e) => acc + Number(e.subtotal || 0), 0);

  return (
    Math.round(
      (sumPUE + sumComplementos + complementosSinConciliar.egresos + sumManualPaid) * 100
    ) / 100
  );
};

const calculateIngresosDevengadosForRange = async (
  profileId: string,
  dateRange: { start: Date; end: Date },
  regimenFiscal?: string
): Promise<number> => {
  const invoiceWhere: Record<string, unknown> = {
    profile_id: profileId,
    tipo: { [Op.in]: ['PUE', 'PPD'] },
    fecha: { [Op.gte]: dateRange.start, [Op.lt]: dateRange.end },
  };
  if (regimenFiscal) invoiceWhere.regimen_fiscal_emisor = regimenFiscal;

  const invoices = await Invoice.findAll({
    where: invoiceWhere,
    attributes: ['subtotal'],
  });
  const manualIncomes = await ManualIncome.findAll({
    where: {
      profile_id: profileId,
      fecha: { [Op.gte]: dateRange.start, [Op.lt]: dateRange.end },
    },
    attributes: ['subtotal'],
  });
  const sumI = invoices.reduce((acc, inv) => acc + Number(inv.subtotal || 0), 0);
  const sumM = manualIncomes.reduce((acc, m) => acc + Number(m.subtotal || 0), 0);
  return Math.round((sumI + sumM) * 100) / 100;
};

const calculateEgresosDevengadosForRange = async (
  profileId: string,
  dateRange: { start: Date; end: Date },
  regimenFiscal?: string
): Promise<number> => {
  const expenseWhere: Record<string, unknown> = {
    profile_id: profileId,
    fecha: { [Op.gte]: dateRange.start, [Op.lt]: dateRange.end },
  };
  if (regimenFiscal) expenseWhere.regimen_fiscal_receptor = regimenFiscal;

  const expenses = await AccruedExpense.findAll({
    where: expenseWhere,
    attributes: ['subtotal'],
  });
  return Math.round(expenses.reduce((acc, e) => acc + Number(e.subtotal || 0), 0) * 100) / 100;
};

const calculateIVATrasladadoForRange = async (
  profileId: string,
  dateRange: { start: Date; end: Date },
  regimenFiscal?: string
): Promise<{ cobrado: number; devengado: number }> => {
  const baseInvoiceWhere = (tipo: string | string[]) => {
    const w: Record<string, unknown> = {
      profile_id: profileId,
      tipo: typeof tipo === 'string' ? tipo : { [Op.in]: tipo },
      fecha: { [Op.gte]: dateRange.start, [Op.lt]: dateRange.end },
    };
    if (regimenFiscal) w.regimen_fiscal_emisor = regimenFiscal;
    return w;
  };

  const [invoicesPUE, allInvoices, manualIncomes, complementosPorFactura, manualPorFactura] =
    await Promise.all([
      Invoice.findAll({
        where: baseInvoiceWhere('PUE'),
        attributes: ['iva_amount'],
      }),
      Invoice.findAll({
        where: baseInvoiceWhere(['PUE', 'PPD']),
        attributes: ['iva_amount'],
      }),
      ManualIncome.findAll({
        where: {
          profile_id: profileId,
          fecha: { [Op.gte]: dateRange.start, [Op.lt]: dateRange.end },
        },
        attributes: ['iva_amount'],
      }),
      getComplementosPorFacturaEnPeriodo(profileId, dateRange),
      getManualPagosPorFacturaEnPeriodo(profileId, dateRange),
    ]);

  const complementUUIDs = Object.keys(complementosPorFactura);
  const ppdWhere: Record<string, unknown> = {
    profile_id: profileId,
    uuid: { [Op.in]: complementUUIDs },
    tipo: 'PPD',
  };
  if (regimenFiscal) ppdWhere.regimen_fiscal_emisor = regimenFiscal;
  const invoicesPPD = complementUUIDs.length
    ? await Invoice.findAll({
        where: ppdWhere,
        attributes: ['uuid', 'total', 'subtotal', 'iva_amount'],
      })
    : [];

  let cobrado = invoicesPUE.reduce((acc, inv) => acc + Number(inv.iva_amount ?? 0), 0);
  for (const inv of invoicesPPD) {
    const totalDocumento = getDocumentTotalBase(inv);
    if (totalDocumento <= 0) continue;
    const pagadoEnPeriodo =
      (complementosPorFactura[inv.uuid] || 0) + (manualPorFactura[inv.uuid] || 0);
    const ratio = Math.min(1, pagadoEnPeriodo / totalDocumento);
    cobrado += Number(inv.iva_amount ?? 0) * ratio;
  }
  const devengado =
    allInvoices.reduce((acc, inv) => acc + Number(inv.iva_amount ?? 0), 0) +
    manualIncomes.reduce((acc, m) => acc + Number(m.iva_amount ?? 0), 0);
  return {
    cobrado: Math.round(cobrado * 100) / 100,
    devengado: Math.round(devengado * 100) / 100,
  };
};

const calculateIVAAcreditableForRange = async (
  profileId: string,
  dateRange: { start: Date; end: Date },
  regimenFiscal?: string
): Promise<{ pagado: number; devengado: number }> => {
  const baseExpenseWhere = (tipo?: string | string[]) => {
    const w: Record<string, unknown> = {
      profile_id: profileId,
      fecha: { [Op.gte]: dateRange.start, [Op.lt]: dateRange.end },
    };
    if (tipo !== undefined) w.tipo = typeof tipo === 'string' ? tipo : { [Op.in]: tipo };
    if (regimenFiscal) w.regimen_fiscal_receptor = regimenFiscal;
    return w;
  };

  const [expensesPUE, expensesTodos, complementosPorGasto] = await Promise.all([
    AccruedExpense.findAll({
      where: baseExpenseWhere('PUE'),
      attributes: ['iva_amount'],
    }),
    AccruedExpense.findAll({
      where: baseExpenseWhere(),
      attributes: ['iva_amount'],
    }),
    getComplementosPorGastoEnPeriodo(profileId, dateRange),
  ]);

  const complementUUIDs = Object.keys(complementosPorGasto);
  const ppdWhere: Record<string, unknown> = {
    profile_id: profileId,
    uuid: { [Op.in]: complementUUIDs },
    tipo: 'PPD',
  };
  if (regimenFiscal) ppdWhere.regimen_fiscal_receptor = regimenFiscal;
  const expensesPPD = complementUUIDs.length
    ? await AccruedExpense.findAll({
        where: ppdWhere,
        attributes: ['uuid', 'total', 'subtotal', 'iva_amount'],
      })
    : [];

  let pagado = expensesPUE.reduce((acc, e) => acc + Number(e.iva_amount ?? 0), 0);
  for (const expense of expensesPPD) {
    const totalDocumento = getDocumentTotalBase(expense);
    if (totalDocumento <= 0) continue;
    const pagadoEnPeriodo = complementosPorGasto[expense.uuid || ''] || 0;
    const ratio = Math.min(1, pagadoEnPeriodo / totalDocumento);
    pagado += Number(expense.iva_amount ?? 0) * ratio;
  }
  const devengado = expensesTodos.reduce((acc, e) => acc + Number(e.iva_amount ?? 0), 0);

  return {
    pagado: Math.round(pagado * 100) / 100,
    devengado: Math.round(devengado * 100) / 100,
  };
};

const calculateRetencionesForRange = async (
  profileId: string,
  dateRange: { start: Date; end: Date },
  regimenFiscal?: string
): Promise<{
  iva_cobrado: number;
  iva_devengado: number;
  isr_cobrado: number;
  isr_devengado: number;
}> => {
  const baseInvoiceWhere = (tipo: string | string[]) => {
    const w: Record<string, unknown> = {
      profile_id: profileId,
      tipo: typeof tipo === 'string' ? tipo : { [Op.in]: tipo },
      fecha: { [Op.gte]: dateRange.start, [Op.lt]: dateRange.end },
    };
    if (regimenFiscal) w.regimen_fiscal_emisor = regimenFiscal;
    return w;
  };

  const [invoicesPUE, allInvoices, complementosPorFactura, manualPorFactura] = await Promise.all([
    Invoice.findAll({
      where: baseInvoiceWhere('PUE'),
      attributes: ['retencion_iva_amount', 'retencion_isr_amount'],
    }),
    Invoice.findAll({
      where: baseInvoiceWhere(['PUE', 'PPD']),
      attributes: ['retencion_iva_amount', 'retencion_isr_amount'],
    }),
    getComplementosPorFacturaEnPeriodo(profileId, dateRange),
    getManualPagosPorFacturaEnPeriodo(profileId, dateRange),
  ]);

  const complementUUIDs = Object.keys(complementosPorFactura);
  const ppdWhere: Record<string, unknown> = {
    profile_id: profileId,
    uuid: { [Op.in]: complementUUIDs },
    tipo: 'PPD',
  };
  if (regimenFiscal) ppdWhere.regimen_fiscal_emisor = regimenFiscal;
  const invoicesPPD = complementUUIDs.length
    ? await Invoice.findAll({
        where: ppdWhere,
        attributes: ['uuid', 'total', 'subtotal', 'retencion_iva_amount', 'retencion_isr_amount'],
      })
    : [];

  let iva_cobrado = invoicesPUE.reduce(
    (acc, inv) => acc + Number(inv.retencion_iva_amount ?? 0),
    0
  );
  let isr_cobrado = invoicesPUE.reduce(
    (acc, inv) => acc + Number(inv.retencion_isr_amount ?? 0),
    0
  );
  for (const inv of invoicesPPD) {
    const totalDocumento = getDocumentTotalBase(inv);
    if (totalDocumento <= 0) continue;
    const pagadoEnPeriodo =
      (complementosPorFactura[inv.uuid] || 0) + (manualPorFactura[inv.uuid] || 0);
    const ratio = Math.min(1, pagadoEnPeriodo / totalDocumento);
    iva_cobrado += Number(inv.retencion_iva_amount ?? 0) * ratio;
    isr_cobrado += Number(inv.retencion_isr_amount ?? 0) * ratio;
  }
  const iva_devengado = allInvoices.reduce(
    (acc, inv) => acc + Number(inv.retencion_iva_amount ?? 0),
    0
  );
  const isr_devengado = allInvoices.reduce(
    (acc, inv) => acc + Number(inv.retencion_isr_amount ?? 0),
    0
  );
  return {
    iva_cobrado: Math.round(iva_cobrado * 100) / 100,
    iva_devengado: Math.round(iva_devengado * 100) / 100,
    isr_cobrado: Math.round(isr_cobrado * 100) / 100,
    isr_devengado: Math.round(isr_devengado * 100) / 100,
  };
};

/**
 * Ingresos cobrados (flujo de efectivo - ingresos): subtotal de facturas PUE del período
 * + montos cobrados por complementos de pago de facturas PPD (por fecha_pago en el período)
 * + subtotal de manual_incomes del período con is_paid = true.
 * Todo en subtotal sin IVA; para complementos se usa imp_pagado (base gravable, p.ej. BaseDR).
 */
export const calculateIngresosCobrados = async (
  profileId: string,
  periodId: string
): Promise<number> => {
  const dateRange = await getDateRangeFromPeriod(profileId, periodId);
  if (!dateRange) {
    return 0;
  }

  const invoicesPUE = await Invoice.findAll({
    where: {
      profile_id: profileId,
      tipo: 'PUE',
      fecha: {
        [Op.gte]: dateRange.start,
        [Op.lt]: dateRange.end,
      },
    },
    attributes: ['subtotal'],
  });
  const sumPUE = invoicesPUE.reduce((acc, inv) => acc + Number(inv.subtotal || 0), 0);

  const complementosPPD = await PaymentComplementItem.findAll({
    where: {
      profile_id: profileId,
      fecha_pago: {
        [Op.gte]: dateRange.start,
        [Op.lt]: dateRange.end,
      },
    },
  });
  const invoiceUUIDs = [...new Set(complementosPPD.map((c) => c.factura_uuid))];
  const invoicesPPD = await Invoice.findAll({
    where: {
      profile_id: profileId,
      uuid: { [Op.in]: invoiceUUIDs },
      tipo: 'PPD',
    },
    attributes: ['uuid'],
  });
  const uuidPPDSet = new Set(invoicesPPD.map((i) => i.uuid));
  const sumComplementos = complementosPPD
    .filter((c) => uuidPPDSet.has(c.factura_uuid))
    .reduce((acc, c) => acc + Number(c.imp_pagado || 0), 0);

  const manualIncomesPaid = await ManualIncome.findAll({
    where: {
      profile_id: profileId,
      period_id: periodId,
      is_paid: true,
    },
    attributes: ['subtotal'],
  });
  const sumManualPaid = manualIncomesPaid.reduce((acc, m) => acc + Number(m.subtotal || 0), 0);
  const complementosSinConciliar = await getUnmatchedComplementTotalsForPeriod(profileId, periodId);
  return (
    Math.round(
      (sumPUE + sumComplementos + sumManualPaid + complementosSinConciliar.ingresos) * 100
    ) / 100
  );
};

/**
 * Egresos pagados (flujo de efectivo - egresos): subtotal gastos PUE del período
 * + montos pagados por complementos de pago de gastos PPD (por fecha_pago en el período)
 * + complementos sin conciliar clasificados como egreso.
 */
export const calculateEgresosPagados = async (
  profileId: string,
  periodId: string
): Promise<number> => {
  const dateRange = await getDateRangeFromPeriod(profileId, periodId);
  if (!dateRange) {
    return 0;
  }

  const expensesPUE = await AccruedExpense.findAll({
    where: {
      profile_id: profileId,
      tipo: 'PUE',
      fecha: {
        [Op.gte]: dateRange.start,
        [Op.lt]: dateRange.end,
      },
    },
    attributes: ['subtotal'],
  });
  const sumPUE = expensesPUE.reduce((acc, e) => acc + Number(e.subtotal || 0), 0);

  const complementosPorGasto = await getComplementosPorGastoEnPeriodo(profileId, dateRange);
  const sumComplementos = Object.values(complementosPorGasto).reduce((acc, val) => acc + val, 0);

  const complementosSinConciliar = await getUnmatchedComplementTotalsForPeriod(profileId, periodId);
  const manualPaidExpenses = await AccruedExpense.findAll({
    where: {
      profile_id: profileId,
      tipo_origen: 'MANUAL',
      is_paid: true,
      fecha: { [Op.gte]: dateRange.start, [Op.lt]: dateRange.end },
    },
    attributes: ['subtotal'],
  });
  const sumManualPaid = manualPaidExpenses.reduce((acc, e) => acc + Number(e.subtotal || 0), 0);

  return (
    Math.round(
      (sumPUE + sumComplementos + complementosSinConciliar.egresos + sumManualPaid) * 100
    ) / 100
  );
};

/**
 * Ingresos devengados: subtotal de facturas del período + subtotal de manual_incomes del período.
 */
export const calculateIngresosDevengados = async (
  profileId: string,
  periodId: string
): Promise<number> => {
  const dateRange = await getDateRangeFromPeriod(profileId, periodId);
  if (!dateRange) {
    return 0;
  }

  const invoices = await Invoice.findAll({
    where: {
      profile_id: profileId,
      tipo: { [Op.in]: ['PUE', 'PPD'] },
      fecha: {
        [Op.gte]: dateRange.start,
        [Op.lt]: dateRange.end,
      },
    },
    attributes: ['subtotal'],
  });
  const sumInvoices = invoices.reduce((acc, inv) => acc + Number(inv.subtotal || 0), 0);

  const manualIncomes = await ManualIncome.findAll({
    where: {
      profile_id: profileId,
      period_id: periodId,
    },
    attributes: ['subtotal'],
  });
  const sumManual = manualIncomes.reduce((acc, m) => acc + Number(m.subtotal || 0), 0);

  return Math.round((sumInvoices + sumManual) * 100) / 100;
};

/**
 * Egresos devengados: suma de subtotal de todos los accrued_expenses del período.
 */
export const calculateEgresosDevengados = async (
  profileId: string,
  periodId: string
): Promise<number> => {
  const dateRange = await getDateRangeFromPeriod(profileId, periodId);
  if (!dateRange) {
    return 0;
  }

  const expenses = await AccruedExpense.findAll({
    where: {
      profile_id: profileId,
      fecha: {
        [Op.gte]: dateRange.start,
        [Op.lt]: dateRange.end,
      },
    },
    attributes: ['subtotal'],
  });
  const sum = expenses.reduce((acc, e) => acc + Number(e.subtotal || 0), 0);
  return Math.round(sum * 100) / 100;
};

/**
 * Flujo de efectivo neto (cobrado - pagado): ingresos cobrados menos egresos pagados.
 */
export const calculateFlujoCobradoPagado = async (
  profileId: string,
  periodId: string
): Promise<number> => {
  const [ingresos, egresos] = await Promise.all([
    calculateIngresosCobrados(profileId, periodId),
    calculateEgresosPagados(profileId, periodId),
  ]);
  return Math.round((ingresos - egresos) * 100) / 100;
};

/**
 * IVA trasladado (ingresos): cobrado = IVA de facturas PUE del período + IVA prorrateado
 * de facturas PPD por lo cobrado en el período (complementos + manual). Devengado = IVA de
 * todas las facturas del período + IVA de manual_incomes del período.
 */
export const calculateIVATrasladado = async (
  profileId: string,
  periodId: string
): Promise<{ cobrado: number; devengado: number }> => {
  const dateRange = await getDateRangeFromPeriod(profileId, periodId);
  if (!dateRange) {
    return { cobrado: 0, devengado: 0 };
  }

  const [invoicesPUE, allInvoices, manualIncomes, complementosPorFactura, manualPorFactura] =
    await Promise.all([
      Invoice.findAll({
        where: {
          profile_id: profileId,
          tipo: 'PUE',
          fecha: { [Op.gte]: dateRange.start, [Op.lt]: dateRange.end },
        },
        attributes: ['iva_amount'],
      }),
      Invoice.findAll({
        where: {
          profile_id: profileId,
          tipo: { [Op.in]: ['PUE', 'PPD'] },
          fecha: { [Op.gte]: dateRange.start, [Op.lt]: dateRange.end },
        },
        attributes: ['iva_amount'],
      }),
      ManualIncome.findAll({
        where: { profile_id: profileId, period_id: periodId },
        attributes: ['iva_amount'],
      }),
      getComplementosPorFacturaEnPeriodo(profileId, dateRange),
      getManualPagosPorFacturaEnPeriodo(profileId, dateRange),
    ]);

  const complementUUIDs = Object.keys(complementosPorFactura);
  const invoicesPPD = complementUUIDs.length
    ? await Invoice.findAll({
        where: {
          profile_id: profileId,
          uuid: { [Op.in]: complementUUIDs },
          tipo: 'PPD',
        },
        attributes: ['uuid', 'total', 'subtotal', 'iva_amount'],
      })
    : [];

  let cobrado = invoicesPUE.reduce((acc, inv) => acc + Number(inv.iva_amount ?? 0), 0);
  for (const inv of invoicesPPD) {
    const totalDocumento = getDocumentTotalBase(inv);
    if (totalDocumento <= 0) continue;
    const pagadoEnPeriodo =
      (complementosPorFactura[inv.uuid] || 0) + (manualPorFactura[inv.uuid] || 0);
    const ratio = Math.min(1, pagadoEnPeriodo / totalDocumento);
    cobrado += Number(inv.iva_amount ?? 0) * ratio;
  }

  const devengado =
    allInvoices.reduce((acc, inv) => acc + Number(inv.iva_amount ?? 0), 0) +
    manualIncomes.reduce((acc, m) => acc + Number(m.iva_amount ?? 0), 0);

  return {
    cobrado: Math.round(cobrado * 100) / 100,
    devengado: Math.round(devengado * 100) / 100,
  };
};

/**
 * IVA acreditable (gastos): pagado = IVA de gastos PUE + IVA prorrateado de gastos PPD
 * por lo pagado en el período (complementos). Devengado = IVA de todos los expenses del período.
 */
export const calculateIVAAcreditable = async (
  profileId: string,
  periodId: string
): Promise<{ pagado: number; devengado: number }> => {
  const dateRange = await getDateRangeFromPeriod(profileId, periodId);
  if (!dateRange) {
    return { pagado: 0, devengado: 0 };
  }

  const [expensesPUE, expensesTodos, complementosPorGasto] = await Promise.all([
    AccruedExpense.findAll({
      where: {
        profile_id: profileId,
        tipo: 'PUE',
        fecha: { [Op.gte]: dateRange.start, [Op.lt]: dateRange.end },
      },
      attributes: ['iva_amount'],
    }),
    AccruedExpense.findAll({
      where: {
        profile_id: profileId,
        fecha: { [Op.gte]: dateRange.start, [Op.lt]: dateRange.end },
      },
      attributes: ['iva_amount'],
    }),
    getComplementosPorGastoEnPeriodo(profileId, dateRange),
  ]);

  const complementUUIDs = Object.keys(complementosPorGasto);
  const expensesPPD = complementUUIDs.length
    ? await AccruedExpense.findAll({
        where: {
          profile_id: profileId,
          uuid: { [Op.in]: complementUUIDs },
          tipo: 'PPD',
        },
        attributes: ['uuid', 'total', 'subtotal', 'iva_amount'],
      })
    : [];

  let pagado = expensesPUE.reduce((acc, e) => acc + Number(e.iva_amount ?? 0), 0);
  for (const expense of expensesPPD) {
    const totalDocumento = getDocumentTotalBase(expense);
    if (totalDocumento <= 0) continue;
    const pagadoEnPeriodo = complementosPorGasto[expense.uuid || ''] || 0;
    const ratio = Math.min(1, pagadoEnPeriodo / totalDocumento);
    pagado += Number(expense.iva_amount ?? 0) * ratio;
  }
  const devengado = expensesTodos.reduce((acc, e) => acc + Number(e.iva_amount ?? 0), 0);

  return {
    pagado: Math.round(pagado * 100) / 100,
    devengado: Math.round(devengado * 100) / 100,
  };
};

/**
 * Retenciones (IVA e ISR): cobrado = retenciones de facturas PUE + prorrateado por lo cobrado
 * en PPD. Devengado = retenciones de todas las facturas. manual_incomes no tiene retenciones en el modelo.
 */
export const calculateRetenciones = async (
  profileId: string,
  periodId: string
): Promise<{
  iva_cobrado: number;
  iva_devengado: number;
  isr_cobrado: number;
  isr_devengado: number;
}> => {
  const dateRange = await getDateRangeFromPeriod(profileId, periodId);
  if (!dateRange) {
    return { iva_cobrado: 0, iva_devengado: 0, isr_cobrado: 0, isr_devengado: 0 };
  }

  const [invoicesPUE, allInvoices, complementosPorFactura, manualPorFactura] = await Promise.all([
    Invoice.findAll({
      where: {
        profile_id: profileId,
        tipo: 'PUE',
        fecha: { [Op.gte]: dateRange.start, [Op.lt]: dateRange.end },
      },
      attributes: ['retencion_iva_amount', 'retencion_isr_amount'],
    }),
    Invoice.findAll({
      where: {
        profile_id: profileId,
        tipo: { [Op.in]: ['PUE', 'PPD'] },
        fecha: { [Op.gte]: dateRange.start, [Op.lt]: dateRange.end },
      },
      attributes: ['retencion_iva_amount', 'retencion_isr_amount'],
    }),
    getComplementosPorFacturaEnPeriodo(profileId, dateRange),
    getManualPagosPorFacturaEnPeriodo(profileId, dateRange),
  ]);

  const complementUUIDs = Object.keys(complementosPorFactura);
  const invoicesPPD = complementUUIDs.length
    ? await Invoice.findAll({
        where: {
          profile_id: profileId,
          uuid: { [Op.in]: complementUUIDs },
          tipo: 'PPD',
        },
        attributes: ['uuid', 'total', 'subtotal', 'retencion_iva_amount', 'retencion_isr_amount'],
      })
    : [];

  let iva_cobrado = invoicesPUE.reduce(
    (acc, inv) => acc + Number(inv.retencion_iva_amount ?? 0),
    0
  );
  let isr_cobrado = invoicesPUE.reduce(
    (acc, inv) => acc + Number(inv.retencion_isr_amount ?? 0),
    0
  );
  for (const inv of invoicesPPD) {
    const totalDocumento = getDocumentTotalBase(inv);
    if (totalDocumento <= 0) continue;
    const pagadoEnPeriodo =
      (complementosPorFactura[inv.uuid] || 0) + (manualPorFactura[inv.uuid] || 0);
    const ratio = Math.min(1, pagadoEnPeriodo / totalDocumento);
    iva_cobrado += Number(inv.retencion_iva_amount ?? 0) * ratio;
    isr_cobrado += Number(inv.retencion_isr_amount ?? 0) * ratio;
  }

  const iva_devengado = allInvoices.reduce(
    (acc, inv) => acc + Number(inv.retencion_iva_amount ?? 0),
    0
  );
  const isr_devengado = allInvoices.reduce(
    (acc, inv) => acc + Number(inv.retencion_isr_amount ?? 0),
    0
  );

  return {
    iva_cobrado: Math.round(iva_cobrado * 100) / 100,
    iva_devengado: Math.round(iva_devengado * 100) / 100,
    isr_cobrado: Math.round(isr_cobrado * 100) / 100,
    isr_devengado: Math.round(isr_devengado * 100) / 100,
  };
};

/**
 * PPD por cobrar (solo subtotal pendiente). Ver `aggregatePendientesPorCobrarConImpuestos` para desglose de impuestos.
 */
export const calculatePPDPorCobrar = async (
  profileId: string,
  periodId: string
): Promise<number> => {
  const dateRange = await getDateRangeFromPeriod(profileId, periodId);
  if (!dateRange) {
    return 0;
  }
  const ag = await aggregatePendientesPorCobrarConImpuestos(profileId, dateRange);
  return ag.por_cobrar;
};

/**
 * Igual que métricas `pendientes.por_pagar` (numeric). Desglose en `aggregatePendientesPorPagarConImpuestos`.
 */
export const calculatePPDPorPagar = async (
  profileId: string,
  periodId: string
): Promise<number> => {
  const dateRange = await getDateRangeFromPeriod(profileId, periodId);
  if (!dateRange) {
    return 0;
  }
  const ag = await aggregatePendientesPorPagarConImpuestos(profileId, dateRange);
  return ag.por_pagar;
};

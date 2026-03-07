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
import { PaymentStatusService } from './payment-status.service.js';
import { Op } from 'sequelize';
import type { PeriodMetricsResponse, NominaMetrics } from '../types/metrics.types.js';

/**
 * Métricas del período. Los importes (totalFacturado, totalPagado, totalCompras, etc.)
 * están en base subtotal sin IVA para poder mostrar impuestos trasladados y retenidos por separado.
 */
export interface PeriodMetrics {
  totalFacturado: number; // Subtotal facturas (PUE + PPD) del período
  totalPagado: number; // Subtotal PUE + complementos/manual cobrados en el período
  totalCompras: number; // Subtotal gastos registrados (contable) - PUE + PPD
  totalComprasPagadas: number; // Subtotal de gastos pagados - PUE + PPD pagado
  totalPagadoMenosCompras: number; // Flujo de efectivo neto: totalPagado - totalComprasPagadas
  pendientePagar: number; // Subtotal pendiente de cobro (facturas PPD)
  gastosPendientes: number; // Subtotal gastos pendientes de pago
  pagosAnticipadosGastos: number; // Complementos pagados sin gastos correspondientes en el período
  totalFacturas: number;
  totalGastos: number;
  facturasPUE: number;
  facturasPPD: number;
  facturasPagadasCompletamente: number;
  facturasParcialmentePagadas: number;
  facturasPendientesPago: number; // PPD sin ningún pago
  gastosPUE: number;
  gastosPPD: number;
  gastosPagadosCompletamente: number;
  gastosParcialmentePagados: number;
}

interface PaymentContext {
  totalPagadoComplementosInvoicesPeriodo: number;
  totalPagadoComplementosExpensesPeriodo: number;
  totalPagadoComplementosInvoicesSinConciliarPeriodo: number;
  totalPagadoComplementosExpensesSinConciliarPeriodo: number;
  totalPagadoManualPeriodo: number;
  pagosComplementoPorFactura: Record<string, number>;
  pagosComplementoPorGasto: Record<string, number>;
  pagosManualPorFactura: Record<string, number>;
}

export interface MetricsFilters {
  profileId?: string;
  mes?: number;
  año?: number;
  userId: string; // Requerido para verificar ownership
}

/**
 * Servicio para calcular métricas del dashboard
 */
export class MetricsService {
  /**
   * Calcula las métricas para un período específico
   */
  async calculatePeriodMetrics(filters: MetricsFilters): Promise<PeriodMetrics> {
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

    const profileIds = await this.getProfileIds(profileId, userId);
    const dateRange = this.getDateRange(mes, año);

    // Separar complementos de invoices y expenses
    // Para Opción B: contar complementos por fecha_pago, no por fecha de factura
    // Esto permite que un complemento de diciembre aparezca en diciembre aunque la factura sea de enero
    const {
      totalInvoices,
      totalExpenses,
      totalInvoicesSinConciliar,
      totalExpensesSinConciliar,
    } = await this.sumComplementosPeriodoSeparado(
      profileIds,
      dateRange
    );

    const invoicesForManualPagos =
      dateRange && !profileId
        ? await this.getInvoicesForManualPagos(profileWhereClause)
        : dateRange && profileId
          ? await this.getInvoicesForManualPagos(profileWhereClause)
          : facturas;

    const manualPagosPeriodo = this.sumManualPagos(invoicesForManualPagos, dateRange);
    const pagosComplementoPorFactura = await this.sumComplementosPorFactura(
      profileIds,
      facturas.map((factura) => factura.uuid)
    );
    const pagosComplementoPorGasto = await this.sumComplementosPorFactura(
      profileIds,
      gastos.map((gasto) => gasto.uuid || '').filter((uuid) => uuid !== '')
    );
    const pagosManualPorFactura = this.sumManualPagos(facturas, null).porFactura;

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
    return await this.calculateMetricsFromData(
      facturas,
      gastos,
      paymentContext,
      profileIds,
      dateRange
    );
  }

  /**
   * Calcula métricas a partir de arrays de facturas y gastos
   */
  private async calculateMetricsFromData(
    facturas: Invoice[],
    gastos: AccruedExpense[],
    paymentContext: PaymentContext,
    profileIds: string[],
    dateRange: { start: Date; end: Date } | null
  ): Promise<PeriodMetrics> {
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

    // Procesar gastos
    const paymentStatusService = new PaymentStatusService();
    const profileIdParaGastos = gastos.length > 0 && gastos[0] ? gastos[0].profile_id : '';

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
          // Para gastos PPD, el complemento ya fue sumado en totalPagadoComplementosExpensesPeriodo
          // Solo necesitamos verificar el estado para contar gastos pagados/parciales
          const estadoPago = await paymentStatusService.calcularEstadoPagoGasto(
            gasto,
            gasto.profile_id
          );

          // El complemento ya fue sumado en totalComprasPagadas (línea 135),
          // solo verificar estado para contadores
          if (estadoPago.completamentePagado) {
            gastosPagadosCompletamente++;
          } else if (estadoPago.totalPagado > 0) {
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
    const { pendientePagar, gastosPendientes } = await this.calcularPendientesPorSaldoInsoluto(
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
  }

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
  private async calcularPendientesPorSaldoInsoluto(
    facturas: Invoice[],
    gastos: AccruedExpense[],
    paymentContext: PaymentContext,
    profileIds: string[],
    dateRange: { start: Date; end: Date } | null
  ): Promise<{ pendientePagar: number; gastosPendientes: number }> {
    let pendientePagar = 0;
    let gastosPendientes = 0;

    // Procesar facturas PPD del período
    const facturasPPD = facturas.filter((f) => f.tipo === 'PPD');
    for (const factura of facturasPPD) {
      // Obtener el último complemento de pago para esta factura
      const ultimoComplemento = await PaymentComplementItem.findOne({
        where: {
          profile_id: factura.profile_id,
          factura_uuid: factura.uuid,
        },
        order: [
          ['fecha_pago', 'DESC'],
          ['num_parcialidad', 'DESC'],
        ],
      });

      if (ultimoComplemento) {
        // Si hay complemento, usar el saldo insoluto del último complemento
        // El saldo insoluto ya refleja el estado después de todos los pagos (complementos y manuales)
        const saldoInsoluto = Number(ultimoComplemento.imp_saldo_insoluto || 0);
        // Solo agregar a pendientes si el saldo insoluto > 0 (tolerancia de 0.01)
        if (saldoInsoluto > 0.01) {
          pendientePagar += saldoInsoluto;
        }
      } else {
        // Si no hay complementos, restar pagos manuales y complementos ya aplicados (base subtotal)
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

    // Procesar gastos PPD del período
    // IMPORTANTE: Solo procesamos gastos que están en el período consultado
    // Si un gasto está en enero pero su complemento se pagó en diciembre,
    // en diciembre NO debe aparecer como pendiente (porque el gasto no está en diciembre)
    const gastosPPD = gastos.filter((g) => g.tipo === 'PPD' && g.uuid);
    for (const gasto of gastosPPD) {
      if (!gasto.uuid) continue;

      // Obtener el último complemento de pago para este gasto
      const ultimoComplemento = await PaymentComplementItem.findOne({
        where: {
          profile_id: gasto.profile_id,
          factura_uuid: gasto.uuid,
        },
        order: [
          ['fecha_pago', 'DESC'],
          ['num_parcialidad', 'DESC'],
        ],
      });

      if (ultimoComplemento) {
        // Si hay complemento, usar el saldo insoluto del último complemento
        const saldoInsoluto = Number(ultimoComplemento.imp_saldo_insoluto || 0);
        // Solo agregar a pendientes si el saldo insoluto > 0 (tolerancia de 0.01)
        if (saldoInsoluto > 0.01) {
          gastosPendientes += saldoInsoluto;
        }
      } else {
        // Si no hay complementos, usar el subtotal del PPD
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
  }

  private async getProfileIds(profileId: string | undefined, userId: string): Promise<string[]> {
    if (profileId) {
      return [profileId];
    }

    const profiles = await Profile.findAll({
      where: { user_id: userId },
      attributes: ['id'],
    });

    return profiles.map((profile) => profile.id);
  }

  private getDateRange(mes?: number, año?: number): { start: Date; end: Date } | null {
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
  }

  /**
   * Obtiene el rango de fechas de un período por ID (para uso con period_id).
   */
  private async getDateRangeFromPeriod(
    profileId: string,
    periodId: string
  ): Promise<{ start: Date; end: Date } | null> {
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
  }

  /**
   * Suma neto_pagado de payrolls del período (profile_id + period_id).
   */
  async calculateNominaPagada(profileId: string, periodId: string): Promise<number> {
    const payrolls = await Payroll.findAll({
      where: { profile_id: profileId, period_id: periodId },
      attributes: ['neto_pagado'],
    });
    const sum = payrolls.reduce((acc, p) => acc + Number(p.neto_pagado ?? 0), 0);
    return Math.round(sum * 100) / 100;
  }

  /**
   * Métricas de nómina del período: total_pagada, percepciones, deducciones, cantidad_empleados (distinct employee_rfc).
   */
  private async getNominaMetrics(profileId: string, periodId: string): Promise<NominaMetrics> {
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
  }

  /**
   * Métricas de nómina por rango de fechas (fecha_pago dentro del rango).
   */
  private async getNominaMetricsForRange(
    profileId: string,
    dateRange: { start: Date; end: Date }
  ): Promise<NominaMetrics> {
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
  }

  /**
   * Rango de fechas para un mes/año (primer día del mes inclusive, primer día del siguiente exclusive).
   */
  private static getDateRangeFromMonthYear(mes: number, año: number): { start: Date; end: Date } {
    const start = new Date(año, mes - 1, 1, 0, 0, 0);
    const end = new Date(año, mes, 1, 0, 0, 0);
    return { start, end };
  }

  /**
   * Busca o crea un período para el perfil que cubra el mes/año indicado.
   * Retorna el Period para que el frontend tenga period_id y pueda habilitar "Agregar ingreso manual".
   */
  async findOrCreatePeriodForMonth(
    profileId: string,
    mes: number,
    año: number
  ): Promise<Period> {
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
  }

  /**
   * Complementos de pago por factura (solo facturas PPD) con fecha_pago en el período.
   */
  private async getComplementosPorFacturaEnPeriodo(
    profileId: string,
    dateRange: { start: Date; end: Date }
  ): Promise<Record<string, number>> {
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
        porFactura[item.factura_uuid] = (porFactura[item.factura_uuid] || 0) + Number(item.imp_pagado || 0);
      }
    });
    return porFactura;
  }

  private async getComplementosPorGastoEnPeriodo(
    profileId: string,
    dateRange: { start: Date; end: Date }
  ): Promise<Record<string, number>> {
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
    const setPPD = new Set(
      expensesPPD.map((e) => e.uuid || '').filter((u) => u !== '')
    );
    const porGasto: Record<string, number> = {};
    items.forEach((item) => {
      if (setPPD.has(item.factura_uuid)) {
        porGasto[item.factura_uuid] = (porGasto[item.factura_uuid] || 0) + Number(item.imp_pagado || 0);
      }
    });
    return porGasto;
  }

  /**
   * Pagos manuales por factura con fecha de pago en el período.
   */
  private async getManualPagosPorFacturaEnPeriodo(
    profileId: string,
    dateRange: { start: Date; end: Date }
  ): Promise<Record<string, number>> {
    const facturas = await Invoice.findAll({
      where: { profile_id: profileId },
      attributes: ['uuid', 'pagos'],
    });
    return this.sumManualPagos(facturas, dateRange).porFactura;
  }

  private sumManualPagos(
    facturas: Invoice[],
    dateRange: { start: Date; end: Date } | null
  ): { total: number; porFactura: Record<string, number> } {
    const porFactura: Record<string, number> = {};
    let total = 0;

    facturas.forEach((factura) => {
      const pagos = factura.pagos.filter((pago) => (pago.origen ?? 'MANUAL') === 'MANUAL');
      const pagosFiltrados = dateRange
        ? pagos.filter((pago) => {
            const fecha =
              typeof pago.fechaPago === 'string' ? new Date(pago.fechaPago) : pago.fechaPago;
            return fecha >= dateRange.start && fecha < dateRange.end;
          })
        : pagos;

      const totalFactura = pagosFiltrados.reduce((sum, pago) => sum + Number(pago.monto || 0), 0);
      porFactura[factura.uuid] = (porFactura[factura.uuid] || 0) + totalFactura;
      total += totalFactura;
    });

    return { total, porFactura };
  }

  private async sumComplementosPeriodo(
    profileIds: string[],
    dateRange: { start: Date; end: Date } | null
  ): Promise<number> {
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
  }

  /**
   * Suma complementos de pago separando entre invoices y expenses
   * Opción B: Cuenta complementos por fecha_pago, independientemente de la fecha de la factura relacionada
   * Esto permite que un complemento de diciembre aparezca en diciembre aunque la factura sea de enero
   */
  private async sumComplementosPeriodoSeparado(
    profileIds: string[],
    dateRange: { start: Date; end: Date } | null
  ): Promise<{
    totalInvoices: number;
    totalExpenses: number;
    totalInvoicesSinConciliar: number;
    totalExpensesSinConciliar: number;
  }> {
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
        const classification = this.classifyUnmatchedComplementItem(item, profileRFCById);
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
  }

  private classifyUnmatchedComplementItem(
    item: PaymentComplementItem,
    profileRFCById: Map<string, string>
  ): 'INVOICE' | 'EXPENSE' | null {
    const typedItem = item as PaymentComplementItem & { complement?: PaymentComplement };
    const complemento = typedItem.complement;
    if (!complemento) {
      return null;
    }

    const profileRFC = profileRFCById.get(item.profile_id);
    if (!profileRFC) {
      return null;
    }

    if (this.areRFCsEqual(complemento.rfc_receptor, profileRFC)) {
      return 'EXPENSE';
    }
    if (this.areRFCsEqual(complemento.rfc_emisor, profileRFC)) {
      return 'INVOICE';
    }
    return null;
  }

  private areRFCsEqual(leftRFC: string, rightRFC: string): boolean {
    return leftRFC.trim().toUpperCase() === rightRFC.trim().toUpperCase();
  }

  private async sumComplementosPorFactura(
    profileIds: string[],
    facturaUUIDs: string[]
  ): Promise<Record<string, number>> {
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
  }

  private async getInvoicesForManualPagos(profileWhereClause: {
    user_id: string;
    id?: string;
  }): Promise<Invoice[]> {
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
  }

  /**
   * Obtiene métricas por mes para un año específico
   * Útil para gráficos de tendencias
   */
  async getMonthlyMetrics(
    año: number,
    filters: { profileId?: string; userId: string }
  ): Promise<Record<number, PeriodMetrics>> {
    const monthlyMetrics: Record<number, PeriodMetrics> = {};

    // Calcular métricas para cada mes (1-12)
    for (let mes = 1; mes <= 12; mes++) {
      const metrics = await this.calculatePeriodMetrics({
        ...filters,
        mes,
        año,
      });
      monthlyMetrics[mes] = metrics;
    }

    return monthlyMetrics;
  }

  /**
   * Obtiene resumen general (sin filtros de fecha)
   */
  async getGeneralMetrics(filters: { profileId?: string; userId: string }): Promise<PeriodMetrics> {
    return this.calculatePeriodMetrics(filters);
  }

  /**
   * Métricas del período, opcionalmente filtradas por régimen fiscal.
   * Si regimenFiscal se indica, filtra facturas por regimen_fiscal_emisor y gastos por regimen_fiscal_receptor.
   * Retorna null si el período no existe o no pertenece al perfil.
   */
  async getMetricsForPeriod(
    profileId: string,
    periodId: string,
    regimenFiscal?: string
  ): Promise<PeriodMetricsResponse | null> {
    const period = await Period.findOne({
      where: { id: periodId, profile_id: profileId },
      attributes: ['id', 'start_date', 'end_date'],
    });
    if (!period) return null;

    if (regimenFiscal) {
      const dateRange = await this.getDateRangeFromPeriod(profileId, periodId);
      if (!dateRange) return null;
      const result = await this.getMetricsByDateRange(
        profileId,
        dateRange.start,
        dateRange.end,
        regimenFiscal
      );
      return {
        ...result,
        period: {
          id: period.id,
          start: period.start_date,
          end: period.end_date,
        },
      };
    }

    return this.getMetrics(profileId, periodId);
  }

  /**
   * Métricas consolidadas del período para el endpoint: flujo, devengado, impuestos y pendientes.
   * Retorna null si el período no existe o no pertenece al perfil.
   */
  async getMetrics(profileId: string, periodId: string): Promise<PeriodMetricsResponse | null> {
    const period = await Period.findOne({
      where: { id: periodId, profile_id: profileId },
      attributes: ['id', 'start_date', 'end_date'],
    });
    if (!period) return null;

    const [
      ingresosCobrados,
      egresosPagados,
      complementosSinConciliar,
      ingresosDevengados,
      egresosDevengados,
      ivaTrasladado,
      ivaAcreditable,
      retenciones,
      porCobrar,
      porPagar,
      nomina,
    ] = await Promise.all([
      this.calculateIngresosCobrados(profileId, periodId),
      this.calculateEgresosPagados(profileId, periodId),
      this.getUnmatchedComplementTotalsForPeriod(profileId, periodId),
      this.calculateIngresosDevengados(profileId, periodId),
      this.calculateEgresosDevengados(profileId, periodId),
      this.calculateIVATrasladado(profileId, periodId),
      this.calculateIVAAcreditable(profileId, periodId),
      this.calculateRetenciones(profileId, periodId),
      this.calculatePPDPorCobrar(profileId, periodId),
      this.calculatePPDPorPagar(profileId, periodId),
      this.getNominaMetrics(profileId, periodId),
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
        por_cobrar: porCobrar,
        por_pagar: porPagar,
      },
      nomina,
    };

    return response;
  }

  /**
   * Métricas por rango de fechas (sin period_id). Para manual_incomes filtra por fecha en el rango.
   * Útil para mes/año cuando no hay período o se agregan varios perfiles.
   * regimenFiscal: si se indica, filtra facturas por regimen_fiscal_emisor y gastos por regimen_fiscal_receptor.
   */
  async getMetricsByDateRange(
    profileId: string,
    start: Date,
    end: Date,
    regimenFiscal?: string
  ): Promise<PeriodMetricsResponse> {
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
      porCobrar,
      porPagar,
      nomina,
    ] = await Promise.all([
      this.calculateIngresosCobradosForRange(profileId, dateRange, regimenFilter),
      this.calculateEgresosPagadosForRange(profileId, dateRange, regimenFilter),
      this.getUnmatchedComplementTotalsForRange(profileId, dateRange, regimenFilter),
      this.calculateIngresosDevengadosForRange(profileId, dateRange, regimenFilter),
      this.calculateEgresosDevengadosForRange(profileId, dateRange, regimenFilter),
      this.calculateIVATrasladadoForRange(profileId, dateRange, regimenFilter),
      this.calculateIVAAcreditableForRange(profileId, dateRange, regimenFilter),
      this.calculateRetencionesForRange(profileId, dateRange, regimenFilter),
      this.calculatePPDPorCobrarForRange(profileId, dateRange, regimenFilter),
      this.calculatePPDPorPagarForRange(profileId, dateRange, regimenFilter),
      this.getNominaMetricsForRange(profileId, dateRange),
    ]);

    const flujoNeto = ingresosCobrados - egresosPagados;
    const resultadoDevengado = ingresosDevengados - egresosDevengados;

    return {
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
      pendientes: { por_cobrar: porCobrar, por_pagar: porPagar },
      nomina,
    };
  }

  /**
   * Métricas para mes/año: un perfil (profile_id) o todos (profileIds). Una sola petición.
   * regimenFiscal: si se indica, filtra por regimen_fiscal_emisor (facturas) y regimen_fiscal_receptor (gastos).
   * Sin profile_id y con regimenFiscal: solo incluye perfiles cuyo regimenes_fiscales contiene la clave.
   */
  async getMetricsForMonthYear(
    userId: string,
    mes: number,
    año: number,
    profileId?: string,
    regimenFiscal?: string
  ): Promise<PeriodMetricsResponse | null> {
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

    const { start, end } = MetricsService.getDateRangeFromMonthYear(mes, año);

    const results = await Promise.all(
      profileIds.map((pid) => this.getMetricsByDateRange(pid, start, end, regimenFiscal))
    );

    if (results.length === 1) {
      const single = results[0];
      if (!single) return null;
      // Obtener period_id real para habilitar "Agregar ingreso manual" en el frontend
      const period = await this.findOrCreatePeriodForMonth(profileIds[0]!, mes, año);
      return {
        period: { id: period.id, start, end },
        flujo: single.flujo,
        devengado: single.devengado,
        impuestos: single.impuestos,
        pendientes: single.pendientes,
        nomina: single.nomina,
      };
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
      pendientes: { por_cobrar: 0, por_pagar: 0 },
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
    aggregated.nomina.total_pagada = Math.round(aggregated.nomina.total_pagada * 100) / 100;
    aggregated.nomina.percepciones = Math.round(aggregated.nomina.percepciones * 100) / 100;
    aggregated.nomina.deducciones = Math.round(aggregated.nomina.deducciones * 100) / 100;

    return aggregated;
  }

  private async getUnmatchedComplementTotalsForPeriod(
    profileId: string,
    periodId: string
  ): Promise<{ ingresos: number; egresos: number }> {
    const dateRange = await this.getDateRangeFromPeriod(profileId, periodId);
    if (!dateRange) {
      return { ingresos: 0, egresos: 0 };
    }
    return this.getUnmatchedComplementTotalsForRange(profileId, dateRange);
  }

  private async getUnmatchedComplementTotalsForRange(
    profileId: string,
    dateRange: { start: Date; end: Date },
    regimenFiscal?: string
  ): Promise<{ ingresos: number; egresos: number }> {
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

      const classification = this.classifyUnmatchedComplementItem(item, profileRFCById);
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
  }

  private async calculateIngresosCobradosForRange(
    profileId: string,
    dateRange: { start: Date; end: Date },
    regimenFiscal?: string
  ): Promise<number> {
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
    const sumManualPaid = manualIncomesPaid.reduce(
      (acc, m) => acc + Number(m.subtotal || 0),
      0
    );
    const complementosSinConciliar = await this.getUnmatchedComplementTotalsForRange(
      profileId,
      dateRange,
      regimenFiscal
    );

    return (
      Math.round(
        (sumPUE + sumComplementos + sumManualPaid + complementosSinConciliar.ingresos) * 100
      ) / 100
    );
  }

  private async calculateEgresosPagadosForRange(
    profileId: string,
    dateRange: { start: Date; end: Date },
    regimenFiscal?: string
  ): Promise<number> {
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
    const uuidPPDSet = new Set(
      expensesPPD.map((e) => e.uuid || '').filter((u) => u !== '')
    );
    const sumComplementos = complementosPPD
      .filter((c) => uuidPPDSet.has(c.factura_uuid))
      .reduce((acc, c) => acc + Number(c.imp_pagado || 0), 0);

    const complementosSinConciliar = await this.getUnmatchedComplementTotalsForRange(
      profileId,
      dateRange,
      regimenFiscal
    );
    return Math.round((sumPUE + sumComplementos + complementosSinConciliar.egresos) * 100) / 100;
  }

  private async calculateIngresosDevengadosForRange(
    profileId: string,
    dateRange: { start: Date; end: Date },
    regimenFiscal?: string
  ): Promise<number> {
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
  }

  private async calculateEgresosDevengadosForRange(
    profileId: string,
    dateRange: { start: Date; end: Date },
    regimenFiscal?: string
  ): Promise<number> {
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
  }

  private async calculateIVATrasladadoForRange(
    profileId: string,
    dateRange: { start: Date; end: Date },
    regimenFiscal?: string
  ): Promise<{ cobrado: number; devengado: number }> {
    const baseInvoiceWhere = (tipo: string | string[]) => {
      const w: Record<string, unknown> = {
        profile_id: profileId,
        tipo: typeof tipo === 'string' ? tipo : { [Op.in]: tipo },
        fecha: { [Op.gte]: dateRange.start, [Op.lt]: dateRange.end },
      };
      if (regimenFiscal) w.regimen_fiscal_emisor = regimenFiscal;
      return w;
    };

    const [invoicesPUE, invoicesPPD, allInvoices, manualIncomes, complementosPorFactura, manualPorFactura] =
      await Promise.all([
        Invoice.findAll({
          where: baseInvoiceWhere('PUE'),
          attributes: ['iva_amount'],
        }),
        Invoice.findAll({
          where: baseInvoiceWhere('PPD'),
          attributes: ['uuid', 'iva_amount', 'total'],
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
        this.getComplementosPorFacturaEnPeriodo(profileId, dateRange),
        this.getManualPagosPorFacturaEnPeriodo(profileId, dateRange),
      ]);

    let cobrado = invoicesPUE.reduce((acc, inv) => acc + Number(inv.iva_amount ?? 0), 0);
    for (const inv of invoicesPPD) {
      const total = Number(inv.total || 0);
      if (total <= 0) continue;
      const pagadoEnPeriodo =
        (complementosPorFactura[inv.uuid] || 0) + (manualPorFactura[inv.uuid] || 0);
      const ratio = Math.min(1, pagadoEnPeriodo / total);
      cobrado += Number(inv.iva_amount ?? 0) * ratio;
    }
    const devengado =
      allInvoices.reduce((acc, inv) => acc + Number(inv.iva_amount ?? 0), 0) +
      manualIncomes.reduce((acc, m) => acc + Number(m.iva_amount ?? 0), 0);
    return {
      cobrado: Math.round(cobrado * 100) / 100,
      devengado: Math.round(devengado * 100) / 100,
    };
  }

  private async calculateIVAAcreditableForRange(
    profileId: string,
    dateRange: { start: Date; end: Date },
    regimenFiscal?: string
  ): Promise<{ pagado: number; devengado: number }> {
    const baseExpenseWhere = (tipo?: string | string[]) => {
      const w: Record<string, unknown> = {
        profile_id: profileId,
        fecha: { [Op.gte]: dateRange.start, [Op.lt]: dateRange.end },
      };
      if (tipo !== undefined) w.tipo = typeof tipo === 'string' ? tipo : { [Op.in]: tipo };
      if (regimenFiscal) w.regimen_fiscal_receptor = regimenFiscal;
      return w;
    };

    const [expensesPUE, expensesPPD, expensesTodos, complementosPorGasto] = await Promise.all([
      AccruedExpense.findAll({
        where: baseExpenseWhere('PUE'),
        attributes: ['iva_amount'],
      }),
      AccruedExpense.findAll({
        where: baseExpenseWhere('PPD'),
        attributes: ['uuid', 'iva_amount', 'total'],
      }),
      AccruedExpense.findAll({
        where: baseExpenseWhere(),
        attributes: ['iva_amount'],
      }),
      this.getComplementosPorGastoEnPeriodo(profileId, dateRange),
    ]);

    let pagado = expensesPUE.reduce((acc, e) => acc + Number(e.iva_amount ?? 0), 0);
    for (const expense of expensesPPD) {
      const total = Number(expense.total || 0);
      if (total <= 0) continue;
      const pagadoEnPeriodo = complementosPorGasto[expense.uuid || ''] || 0;
      const ratio = Math.min(1, pagadoEnPeriodo / total);
      pagado += Number(expense.iva_amount ?? 0) * ratio;
    }
    const devengado = expensesTodos.reduce((acc, e) => acc + Number(e.iva_amount ?? 0), 0);

    return {
      pagado: Math.round(pagado * 100) / 100,
      devengado: Math.round(devengado * 100) / 100,
    };
  }

  private async calculateRetencionesForRange(
    profileId: string,
    dateRange: { start: Date; end: Date },
    regimenFiscal?: string
  ): Promise<{
    iva_cobrado: number;
    iva_devengado: number;
    isr_cobrado: number;
    isr_devengado: number;
  }> {
    const baseInvoiceWhere = (tipo: string | string[]) => {
      const w: Record<string, unknown> = {
        profile_id: profileId,
        tipo: typeof tipo === 'string' ? tipo : { [Op.in]: tipo },
        fecha: { [Op.gte]: dateRange.start, [Op.lt]: dateRange.end },
      };
      if (regimenFiscal) w.regimen_fiscal_emisor = regimenFiscal;
      return w;
    };

    const [invoicesPUE, invoicesPPD, allInvoices, complementosPorFactura, manualPorFactura] =
      await Promise.all([
        Invoice.findAll({
          where: baseInvoiceWhere('PUE'),
          attributes: ['retencion_iva_amount', 'retencion_isr_amount'],
        }),
        Invoice.findAll({
          where: baseInvoiceWhere('PPD'),
          attributes: ['uuid', 'total', 'retencion_iva_amount', 'retencion_isr_amount'],
        }),
        Invoice.findAll({
          where: baseInvoiceWhere(['PUE', 'PPD']),
          attributes: ['retencion_iva_amount', 'retencion_isr_amount'],
        }),
        this.getComplementosPorFacturaEnPeriodo(profileId, dateRange),
        this.getManualPagosPorFacturaEnPeriodo(profileId, dateRange),
      ]);

    let iva_cobrado = invoicesPUE.reduce((acc, inv) => acc + Number(inv.retencion_iva_amount ?? 0), 0);
    let isr_cobrado = invoicesPUE.reduce((acc, inv) => acc + Number(inv.retencion_isr_amount ?? 0), 0);
    for (const inv of invoicesPPD) {
      const total = Number(inv.total || 0);
      if (total <= 0) continue;
      const pagadoEnPeriodo =
        (complementosPorFactura[inv.uuid] || 0) + (manualPorFactura[inv.uuid] || 0);
      const ratio = Math.min(1, pagadoEnPeriodo / total);
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
  }

  private async calculatePPDPorCobrarForRange(
    profileId: string,
    dateRange: { start: Date; end: Date },
    regimenFiscal?: string
  ): Promise<number> {
    const ppdWhere: Record<string, unknown> = {
      profile_id: profileId,
      tipo: 'PPD',
      fecha: { [Op.gte]: dateRange.start, [Op.lt]: dateRange.end },
    };
    if (regimenFiscal) ppdWhere.regimen_fiscal_emisor = regimenFiscal;

    const invoicesPPD = await Invoice.findAll({
      where: ppdWhere,
      attributes: ['uuid', 'subtotal', 'iva_amount', 'total'],
    });
    if (invoicesPPD.length === 0) return 0;
    const uuids = invoicesPPD.map((inv) => inv.uuid);
    const [complementosPorFactura, manualPorFactura] = await Promise.all([
      this.sumComplementosPorFactura([profileId], uuids),
      (async () => {
        const facturas = await Invoice.findAll({
          where: { profile_id: profileId },
          attributes: ['uuid', 'pagos'],
        });
        return this.sumManualPagos(facturas, null).porFactura;
      })(),
    ]);
    let total = 0;
    for (const inv of invoicesPPD) {
      const totalFactura = Number(inv.total || 0);
      if (totalFactura <= 0) continue;
      const cobrado = (complementosPorFactura[inv.uuid] || 0) + (manualPorFactura[inv.uuid] || 0);
      if (cobrado >= totalFactura) continue;
      const subtotalIva = Number(inv.subtotal ?? 0) + Number(inv.iva_amount ?? 0);
      total += subtotalIva * (1 - cobrado / totalFactura);
    }
    return Math.round(total * 100) / 100;
  }

  private async calculatePPDPorPagarForRange(
    profileId: string,
    dateRange: { start: Date; end: Date },
    regimenFiscal?: string
  ): Promise<number> {
    const expenseWhere: Record<string, unknown> = {
      profile_id: profileId,
      is_paid: false,
      fecha: { [Op.gte]: dateRange.start, [Op.lt]: dateRange.end },
    };
    if (regimenFiscal) expenseWhere.regimen_fiscal_receptor = regimenFiscal;

    const expenses = await AccruedExpense.findAll({
      where: expenseWhere,
      attributes: ['subtotal', 'iva_amount'],
    });
    const sum = expenses.reduce(
      (acc, e) => acc + Number(e.subtotal ?? 0) + Number(e.iva_amount ?? 0),
      0
    );
    return Math.round(sum * 100) / 100;
  }

  /**
   * Ingresos cobrados (flujo de efectivo - ingresos): subtotal de facturas PUE del período
   * + montos cobrados por complementos de pago de facturas PPD (por fecha_pago en el período)
   * + subtotal de manual_incomes del período con is_paid = true.
   * Todo en subtotal sin IVA; para complementos se usa imp_pagado (base gravable, p.ej. BaseDR).
   */
  async calculateIngresosCobrados(profileId: string, periodId: string): Promise<number> {
    const dateRange = await this.getDateRangeFromPeriod(profileId, periodId);
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
    const sumManualPaid = manualIncomesPaid.reduce(
      (acc, m) => acc + Number(m.subtotal || 0),
      0
    );
    const complementosSinConciliar = await this.getUnmatchedComplementTotalsForPeriod(
      profileId,
      periodId
    );
    return (
      Math.round(
        (sumPUE + sumComplementos + sumManualPaid + complementosSinConciliar.ingresos) * 100
      ) / 100
    );
  }

  /**
   * Egresos pagados (flujo de efectivo - egresos): subtotal gastos PUE del período
   * + montos pagados por complementos de pago de gastos PPD (por fecha_pago en el período)
   * + complementos sin conciliar clasificados como egreso.
   */
  async calculateEgresosPagados(profileId: string, periodId: string): Promise<number> {
    const dateRange = await this.getDateRangeFromPeriod(profileId, periodId);
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

    const complementosPorGasto = await this.getComplementosPorGastoEnPeriodo(profileId, dateRange);
    const sumComplementos = Object.values(complementosPorGasto).reduce((acc, val) => acc + val, 0);

    const complementosSinConciliar = await this.getUnmatchedComplementTotalsForPeriod(
      profileId,
      periodId
    );
    return Math.round((sumPUE + sumComplementos + complementosSinConciliar.egresos) * 100) / 100;
  }

  /**
   * Ingresos devengados: subtotal de facturas del período + subtotal de manual_incomes del período.
   */
  async calculateIngresosDevengados(profileId: string, periodId: string): Promise<number> {
    const dateRange = await this.getDateRangeFromPeriod(profileId, periodId);
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
  }

  /**
   * Egresos devengados: suma de subtotal de todos los accrued_expenses del período.
   */
  async calculateEgresosDevengados(profileId: string, periodId: string): Promise<number> {
    const dateRange = await this.getDateRangeFromPeriod(profileId, periodId);
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
  }

  /**
   * Flujo de efectivo neto (cobrado - pagado): ingresos cobrados menos egresos pagados.
   */
  async calculateFlujoCobradoPagado(profileId: string, periodId: string): Promise<number> {
    const [ingresos, egresos] = await Promise.all([
      this.calculateIngresosCobrados(profileId, periodId),
      this.calculateEgresosPagados(profileId, periodId),
    ]);
    return Math.round((ingresos - egresos) * 100) / 100;
  }

  /**
   * IVA trasladado (ingresos): cobrado = IVA de facturas PUE del período + IVA prorrateado
   * de facturas PPD por lo cobrado en el período (complementos + manual). Devengado = IVA de
   * todas las facturas del período + IVA de manual_incomes del período.
   */
  async calculateIVATrasladado(
    profileId: string,
    periodId: string
  ): Promise<{ cobrado: number; devengado: number }> {
    const dateRange = await this.getDateRangeFromPeriod(profileId, periodId);
    if (!dateRange) {
      return { cobrado: 0, devengado: 0 };
    }

    const [invoicesPUE, invoicesPPD, allInvoices, manualIncomes, complementosPorFactura, manualPorFactura] =
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
            tipo: 'PPD',
            fecha: { [Op.gte]: dateRange.start, [Op.lt]: dateRange.end },
          },
          attributes: ['uuid', 'iva_amount', 'total'],
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
        this.getComplementosPorFacturaEnPeriodo(profileId, dateRange),
        this.getManualPagosPorFacturaEnPeriodo(profileId, dateRange),
      ]);

    let cobrado = invoicesPUE.reduce((acc, inv) => acc + Number(inv.iva_amount ?? 0), 0);
    for (const inv of invoicesPPD) {
      const total = Number(inv.total || 0);
      if (total <= 0) continue;
      const pagadoEnPeriodo =
        (complementosPorFactura[inv.uuid] || 0) + (manualPorFactura[inv.uuid] || 0);
      const ratio = Math.min(1, pagadoEnPeriodo / total);
      cobrado += Number(inv.iva_amount ?? 0) * ratio;
    }

    const devengado =
      allInvoices.reduce((acc, inv) => acc + Number(inv.iva_amount ?? 0), 0) +
      manualIncomes.reduce((acc, m) => acc + Number(m.iva_amount ?? 0), 0);

    return {
      cobrado: Math.round(cobrado * 100) / 100,
      devengado: Math.round(devengado * 100) / 100,
    };
  }

  /**
   * IVA acreditable (gastos): pagado = IVA de gastos PUE + IVA prorrateado de gastos PPD
   * por lo pagado en el período (complementos). Devengado = IVA de todos los expenses del período.
   */
  async calculateIVAAcreditable(
    profileId: string,
    periodId: string
  ): Promise<{ pagado: number; devengado: number }> {
    const dateRange = await this.getDateRangeFromPeriod(profileId, periodId);
    if (!dateRange) {
      return { pagado: 0, devengado: 0 };
    }

    const [expensesPUE, expensesPPD, expensesTodos, complementosPorGasto] = await Promise.all([
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
          tipo: 'PPD',
          fecha: { [Op.gte]: dateRange.start, [Op.lt]: dateRange.end },
        },
        attributes: ['uuid', 'iva_amount', 'total'],
      }),
      AccruedExpense.findAll({
        where: {
          profile_id: profileId,
          fecha: { [Op.gte]: dateRange.start, [Op.lt]: dateRange.end },
        },
        attributes: ['iva_amount'],
      }),
      this.getComplementosPorGastoEnPeriodo(profileId, dateRange),
    ]);

    let pagado = expensesPUE.reduce((acc, e) => acc + Number(e.iva_amount ?? 0), 0);
    for (const expense of expensesPPD) {
      const total = Number(expense.total || 0);
      if (total <= 0) continue;
      const pagadoEnPeriodo = complementosPorGasto[expense.uuid || ''] || 0;
      const ratio = Math.min(1, pagadoEnPeriodo / total);
      pagado += Number(expense.iva_amount ?? 0) * ratio;
    }
    const devengado = expensesTodos.reduce((acc, e) => acc + Number(e.iva_amount ?? 0), 0);

    return {
      pagado: Math.round(pagado * 100) / 100,
      devengado: Math.round(devengado * 100) / 100,
    };
  }

  /**
   * Retenciones (IVA e ISR): cobrado = retenciones de facturas PUE + prorrateado por lo cobrado
   * en PPD. Devengado = retenciones de todas las facturas. manual_incomes no tiene retenciones en el modelo.
   */
  async calculateRetenciones(
    profileId: string,
    periodId: string
  ): Promise<{
    iva_cobrado: number;
    iva_devengado: number;
    isr_cobrado: number;
    isr_devengado: number;
  }> {
    const dateRange = await this.getDateRangeFromPeriod(profileId, periodId);
    if (!dateRange) {
      return { iva_cobrado: 0, iva_devengado: 0, isr_cobrado: 0, isr_devengado: 0 };
    }

    const [invoicesPUE, invoicesPPD, allInvoices, complementosPorFactura, manualPorFactura] =
      await Promise.all([
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
            tipo: 'PPD',
            fecha: { [Op.gte]: dateRange.start, [Op.lt]: dateRange.end },
          },
          attributes: ['uuid', 'total', 'retencion_iva_amount', 'retencion_isr_amount'],
        }),
        Invoice.findAll({
          where: {
            profile_id: profileId,
            tipo: { [Op.in]: ['PUE', 'PPD'] },
            fecha: { [Op.gte]: dateRange.start, [Op.lt]: dateRange.end },
          },
          attributes: ['retencion_iva_amount', 'retencion_isr_amount'],
        }),
        this.getComplementosPorFacturaEnPeriodo(profileId, dateRange),
        this.getManualPagosPorFacturaEnPeriodo(profileId, dateRange),
      ]);

    let iva_cobrado = invoicesPUE.reduce((acc, inv) => acc + Number(inv.retencion_iva_amount ?? 0), 0);
    let isr_cobrado = invoicesPUE.reduce((acc, inv) => acc + Number(inv.retencion_isr_amount ?? 0), 0);
    for (const inv of invoicesPPD) {
      const total = Number(inv.total || 0);
      if (total <= 0) continue;
      const pagadoEnPeriodo =
        (complementosPorFactura[inv.uuid] || 0) + (manualPorFactura[inv.uuid] || 0);
      const ratio = Math.min(1, pagadoEnPeriodo / total);
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
  }

  /**
   * PPD por cobrar: facturas PPD del período que no tienen complemento completo (saldo pendiente).
   * Suma la parte pendiente en base (subtotal + iva_amount) prorrateada por lo que falta por cobrar.
   */
  async calculatePPDPorCobrar(profileId: string, periodId: string): Promise<number> {
    const dateRange = await this.getDateRangeFromPeriod(profileId, periodId);
    if (!dateRange) {
      return 0;
    }

    const invoicesPPD = await Invoice.findAll({
      where: {
        profile_id: profileId,
        tipo: 'PPD',
        fecha: { [Op.gte]: dateRange.start, [Op.lt]: dateRange.end },
      },
      attributes: ['uuid', 'subtotal', 'iva_amount', 'total'],
    });
    if (invoicesPPD.length === 0) return 0;

    const uuids = invoicesPPD.map((inv) => inv.uuid);
    const [complementosPorFactura, manualPorFactura] = await Promise.all([
      this.sumComplementosPorFactura([profileId], uuids),
      (async () => {
        const facturas = await Invoice.findAll({
          where: { profile_id: profileId },
          attributes: ['uuid', 'pagos'],
        });
        return this.sumManualPagos(facturas, null).porFactura;
      })(),
    ]);

    let total = 0;
    for (const inv of invoicesPPD) {
      const totalFactura = Number(inv.total || 0);
      if (totalFactura <= 0) continue;
      const cobrado = (complementosPorFactura[inv.uuid] || 0) + (manualPorFactura[inv.uuid] || 0);
      if (cobrado >= totalFactura) continue;
      const subtotalIva = Number(inv.subtotal ?? 0) + Number(inv.iva_amount ?? 0);
      const pendiente = subtotalIva * (1 - cobrado / totalFactura);
      total += pendiente;
    }
    return Math.round(total * 100) / 100;
  }

  /**
   * PPD por pagar: gastos del período con is_paid = false. Suma (subtotal + iva_amount).
   */
  async calculatePPDPorPagar(profileId: string, periodId: string): Promise<number> {
    const dateRange = await this.getDateRangeFromPeriod(profileId, periodId);
    if (!dateRange) {
      return 0;
    }

    const expenses = await AccruedExpense.findAll({
      where: {
        profile_id: profileId,
        is_paid: false,
        fecha: { [Op.gte]: dateRange.start, [Op.lt]: dateRange.end },
      },
      attributes: ['subtotal', 'iva_amount'],
    });
    const sum = expenses.reduce(
      (acc, e) => acc + Number(e.subtotal ?? 0) + Number(e.iva_amount ?? 0),
      0
    );
    return Math.round(sum * 100) / 100;
  }
}

import { Invoice, AccruedExpense, Profile, PaymentComplementItem } from '../database/models/index.js';
import { PaymentStatusService } from './payment-status.service.js';
import { Op } from 'sequelize';

export interface PeriodMetrics {
  totalFacturado: number;
  totalPagado: number;
  totalCompras: number; // Total de gastos registrados (contable) - suma completa de PUE + PPD
  totalComprasPagadas: number; // Solo lo pagado de gastos (efectivo) - PUE completo + PPD pagado
  totalPagadoMenosCompras: number; // Flujo de efectivo neto: totalPagado - totalComprasPagadas
  pendientePagar: number;
  gastosPendientes: number; // Gastos pendientes de pago (no puede ser negativo)
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
    const { totalInvoices, totalExpenses } = await this.sumComplementosPeriodoSeparado(
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
      paymentContext.totalPagadoManualPeriodo;
    let totalCompras = 0; // Total contable (completo)
    // Los complementos de expenses se suman en totalComprasPagadas (gastos pagados)
    let totalComprasPagadas = paymentContext.totalPagadoComplementosExpensesPeriodo;
    let facturasPUE = 0;
    let facturasPPD = 0;
    let facturasPagadasCompletamente = 0;
    let facturasParcialmentePagadas = 0;
    let facturasPendientesPago = 0;
    let gastosPUE = 0;
    let gastosPPD = 0;
    let gastosPagadosCompletamente = 0;
    let gastosParcialmentePagados = 0;

    // Procesar facturas
    facturas.forEach((factura) => {
      const total = Number(factura.total);

      // Contar tipos
      if (factura.tipo === 'PUE') {
        facturasPUE++;
        totalFacturado += total;
        totalPagado += total; // PUE está pagado completamente
        facturasPagadasCompletamente++;
      } else if (factura.tipo === 'PPD') {
        facturasPPD++;
        totalFacturado += total;

        // Calcular pagos parciales
        const totalPagosParciales =
          (paymentContext.pagosComplementoPorFactura[factura.uuid] || 0) +
          (paymentContext.pagosManualPorFactura[factura.uuid] || 0);

        // Determinar si está completamente pagada o parcialmente
        if (totalPagosParciales >= total) {
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
      const totalGasto = Number(gasto.total);
      totalCompras += totalGasto; // Suma completa (contable)

      // Calcular estado de pago si es gasto de XML (tiene tipo)
      if (gasto.tipo && gasto.uuid) {
        if (gasto.tipo === 'PUE') {
          gastosPUE++;
          totalComprasPagadas += totalGasto; // PUE está pagado completamente
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
        totalComprasPagadas += totalGasto;
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
        // Si no hay complementos, restar pagos manuales y complementos ya aplicados
        const totalFactura = Number(factura.total);
        const totalPagosParciales =
          (paymentContext.pagosComplementoPorFactura[factura.uuid] || 0) +
          (paymentContext.pagosManualPorFactura[factura.uuid] || 0);
        const saldoPendiente = totalFactura - totalPagosParciales;
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
        // Si no hay complementos, usar el monto total del PPD
        const totalGasto = Number(gasto.total);
        if (totalGasto > 0.01) {
          gastosPendientes += totalGasto;
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
  ): Promise<{ totalInvoices: number; totalExpenses: number }> {
    if (profileIds.length === 0) {
      return { totalInvoices: 0, totalExpenses: 0 };
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
    });

    if (allPagos.length === 0) {
      return { totalInvoices: 0, totalExpenses: 0 };
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

    let totalInvoices = 0;
    let totalExpenses = 0;

    for (const item of allPagos) {
      const monto = Number(item.imp_pagado || 0);
      if (invoiceUUIDsSet.has(item.factura_uuid)) {
        totalInvoices += monto;
      } else if (expenseUUIDsSet.has(item.factura_uuid)) {
        totalExpenses += monto;
      }
      // Si el UUID no está en ninguno de los dos sets, no lo contamos
      // (puede ser una factura eliminada o de otro perfil)
    }

    return { totalInvoices, totalExpenses };
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
}

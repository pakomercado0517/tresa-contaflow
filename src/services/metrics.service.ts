import { Invoice, Expense, Profile, PaymentComplementItem } from "../database/models/index.js";
import { Op } from "sequelize";

export interface PeriodMetrics {
  totalFacturado: number;
  totalPagado: number;
  totalCompras: number;
  totalPagadoMenosCompras: number;
  pendientePagar: number;
  totalFacturas: number;
  totalGastos: number;
  facturasPUE: number;
  facturasPPD: number;
  facturasPagadasCompletamente: number;
  facturasParcialmentePagadas: number;
}

interface PaymentContext {
  totalPagadoComplementosPeriodo: number;
  totalPagadoManualPeriodo: number;
  pagosComplementoPorFactura: Record<string, number>;
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
          as: "profile",
          where: profileWhereClause,
          attributes: ["id"],
        },
      ],
    });

    // Obtener gastos del período
    const gastos = await Expense.findAll({
      where: dateFilter,
      include: [
        {
          model: Profile,
          as: "profile",
          where: profileWhereClause,
          attributes: ["id"],
        },
      ],
    });

    const profileIds = await this.getProfileIds(profileId, userId);
    const dateRange = this.getDateRange(mes, año);

    const totalPagadoComplementosPeriodo = await this.sumComplementosPeriodo(
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
    const pagosManualPorFactura = this.sumManualPagos(facturas, null).porFactura;

    const paymentContext: PaymentContext = {
      totalPagadoComplementosPeriodo,
      totalPagadoManualPeriodo: manualPagosPeriodo.total,
      pagosComplementoPorFactura,
      pagosManualPorFactura,
    };

    // Calcular métricas
    return this.calculateMetricsFromData(facturas, gastos, paymentContext);
  }

  /**
   * Calcula métricas a partir de arrays de facturas y gastos
   */
  private calculateMetricsFromData(
    facturas: Invoice[],
    gastos: Expense[],
    paymentContext: PaymentContext
  ): PeriodMetrics {
    // Inicializar contadores
    let totalFacturado = 0;
    let totalPagado = paymentContext.totalPagadoComplementosPeriodo + paymentContext.totalPagadoManualPeriodo;
    let totalCompras = 0;
    let facturasPUE = 0;
    let facturasPPD = 0;
    let facturasPagadasCompletamente = 0;
    let facturasParcialmentePagadas = 0;

    // Procesar facturas
    facturas.forEach((factura) => {
      const total = Number(factura.total);

      // Contar tipos
      if (factura.tipo === "PUE") {
        facturasPUE++;
        totalFacturado += total;
        totalPagado += total; // PUE está pagado completamente
        facturasPagadasCompletamente++;
      } else if (factura.tipo === "PPD") {
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
        }
      }
    });

    // Procesar gastos
    gastos.forEach((gasto) => {
      totalCompras += Number(gasto.total);
    });

    // Calcular pendiente
    const pendientePagar = totalFacturado - totalPagado;

    // Calcular total pagado menos compras (flujo de efectivo neto)
    const totalPagadoMenosCompras = totalPagado - totalCompras;

    return {
      totalFacturado: Math.round(totalFacturado * 100) / 100, // Redondear a 2 decimales
      totalPagado: Math.round(totalPagado * 100) / 100,
      totalCompras: Math.round(totalCompras * 100) / 100,
      totalPagadoMenosCompras: Math.round(totalPagadoMenosCompras * 100) / 100,
      pendientePagar: Math.round(pendientePagar * 100) / 100,
      totalFacturas: facturas.length,
      totalGastos: gastos.length,
      facturasPUE,
      facturasPPD,
      facturasPagadasCompletamente,
      facturasParcialmentePagadas,
    };
  }

  private async getProfileIds(profileId: string | undefined, userId: string): Promise<string[]> {
    if (profileId) {
      return [profileId];
    }

    const profiles = await Profile.findAll({
      where: { user_id: userId },
      attributes: ["id"],
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
      const pagos = factura.pagos.filter((pago) => (pago.origen ?? "MANUAL") === "MANUAL");
      const pagosFiltrados = dateRange
        ? pagos.filter((pago) => {
            const fecha = typeof pago.fechaPago === "string" ? new Date(pago.fechaPago) : pago.fechaPago;
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

  private async getInvoicesForManualPagos(
    profileWhereClause: { user_id: string; id?: string }
  ): Promise<Invoice[]> {
    return Invoice.findAll({
      include: [
        {
          model: Profile,
          as: "profile",
          where: profileWhereClause,
          attributes: ["id"],
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


import { Invoice, Expense, Profile } from "../database/models/index.js";
import { Op } from "sequelize";

export interface PeriodMetrics {
  totalFacturado: number;
  totalPagado: number;
  totalCompras: number;
  pendientePagar: number;
  totalFacturas: number;
  totalGastos: number;
  facturasPUE: number;
  facturasPPD: number;
  facturasPagadasCompletamente: number;
  facturasParcialmentePagadas: number;
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
    const dateFilter: any = {};
    if (mes !== undefined) {
      dateFilter.mes = mes;
    }
    if (año !== undefined) {
      dateFilter.año = año;
    }

    // Construir filtros de perfil
    const profileWhereClause: any = { user_id: userId };
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

    // Calcular métricas
    return this.calculateMetricsFromData(facturas, gastos);
  }

  /**
   * Calcula métricas a partir de arrays de facturas y gastos
   */
  private calculateMetricsFromData(
    facturas: Invoice[],
    gastos: Expense[]
  ): PeriodMetrics {
    // Inicializar contadores
    let totalFacturado = 0;
    let totalPagado = 0;
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
        const pagos = (factura.pagos as unknown as Array<{ monto: number }>) || [];
        const totalPagosParciales = pagos.reduce(
          (sum, pago) => sum + Number(pago.monto || 0),
          0
        );

        totalPagado += totalPagosParciales;

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

    return {
      totalFacturado: Math.round(totalFacturado * 100) / 100, // Redondear a 2 decimales
      totalPagado: Math.round(totalPagado * 100) / 100,
      totalCompras: Math.round(totalCompras * 100) / 100,
      pendientePagar: Math.round(pendientePagar * 100) / 100,
      totalFacturas: facturas.length,
      totalGastos: gastos.length,
      facturasPUE,
      facturasPPD,
      facturasPagadasCompletamente,
      facturasParcialmentePagadas,
    };
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


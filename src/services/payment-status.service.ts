import { Op } from "sequelize";
import { Invoice, AccruedExpense, PaymentComplementItem } from "../database/models/index.js";
import type { PagoParcial } from "../types/payment.types.js";

export type EstadoPago = "PAGADO" | "PAGO_PARCIAL" | "NO_PAGADO";

export interface EstadoPagoDetalle {
  estado: EstadoPago;
  totalFactura: number;
  totalPagado: number;
  saldoPendiente: number;
  porcentajePagado: number;
  completamentePagado: boolean;
  ultimoSaldoInsoluto: number | null; // Del último complemento de pago
  tieneComplementos: boolean;
  tienePagosManuales: boolean;
  fechasComplementos?: Date[]; // Fechas de pago de los complementos (para anotaciones)
}

/**
 * Servicio para calcular el estado de pago de facturas y gastos
 * Usa el campo imp_saldo_insoluto del último complemento de pago como fuente de verdad
 */
export class PaymentStatusService {
  /**
   * Calcula el estado de pago de una factura
   */
  async calcularEstadoPagoFactura(
    factura: Invoice,
    profileId: string
  ): Promise<EstadoPagoDetalle> {
    const totalFactura = Number(factura.total);

    // Facturas PUE siempre están pagadas completamente
    if (factura.tipo === "PUE") {
      return {
        estado: "PAGADO",
        totalFactura,
        totalPagado: totalFactura,
        saldoPendiente: 0,
        porcentajePagado: 100,
        completamentePagado: true,
        ultimoSaldoInsoluto: null,
        tieneComplementos: false,
        tienePagosManuales: false,
      };
    }

    // Para facturas PPD, calcular basado en pagos y complementos
    if (factura.tipo === "PPD") {
      return await this.calcularEstadoPPD(factura.uuid, factura.pagos, totalFactura, profileId);
    }

    // COMPLEMENTO_PAGO no tiene estado de pago
    return {
      estado: "NO_PAGADO",
      totalFactura,
      totalPagado: 0,
      saldoPendiente: totalFactura,
      porcentajePagado: 0,
      completamentePagado: false,
      ultimoSaldoInsoluto: null,
      tieneComplementos: false,
      tienePagosManuales: false,
    };
  }

  /**
   * Calcula el estado de pago de un gasto
   */
  async calcularEstadoPagoGasto(
    gasto: AccruedExpense,
    profileId: string
  ): Promise<EstadoPagoDetalle> {
    const totalGasto = Number(gasto.total);

    // Gastos PUE siempre están pagados completamente
    if (gasto.tipo === "PUE") {
      return {
        estado: "PAGADO",
        totalFactura: totalGasto,
        totalPagado: totalGasto,
        saldoPendiente: 0,
        porcentajePagado: 100,
        completamentePagado: true,
        ultimoSaldoInsoluto: null,
        tieneComplementos: false,
        tienePagosManuales: false,
      };
    }

    // Para gastos PPD, calcular basado en pagos y complementos
    if (gasto.tipo === "PPD" && gasto.uuid) {
      return await this.calcularEstadoPPD(gasto.uuid, gasto.pagos, totalGasto, profileId);
    }

    // Si no tiene tipo o UUID, asumir no pagado
    return {
      estado: "NO_PAGADO",
      totalFactura: totalGasto,
      totalPagado: 0,
      saldoPendiente: totalGasto,
      porcentajePagado: 0,
      completamentePagado: false,
      ultimoSaldoInsoluto: null,
      tieneComplementos: false,
      tienePagosManuales: false,
    };
  }

  /**
   * Calcula el estado de pago para facturas/gastos PPD
   * Usa el último imp_saldo_insoluto como fuente de verdad
   */
  private async calcularEstadoPPD(
    uuid: string,
    pagosManuales: PagoParcial[],
    totalFactura: number,
    profileId: string
  ): Promise<EstadoPagoDetalle> {
    // Obtener todos los complementos de pago relacionados, ordenados por fecha
    const complementosItems = await PaymentComplementItem.findAll({
      where: {
        profile_id: profileId,
        factura_uuid: uuid,
      },
      order: [["fecha_pago", "ASC"], ["num_parcialidad", "ASC"]],
    });

    const tieneComplementos = complementosItems.length > 0;
    const tienePagosManuales = pagosManuales.length > 0;

    // Si no hay pagos ni complementos, está NO PAGADO
    if (!tieneComplementos && !tienePagosManuales) {
      return {
        estado: "NO_PAGADO",
        totalFactura,
        totalPagado: 0,
        saldoPendiente: totalFactura,
        porcentajePagado: 0,
        completamentePagado: false,
        ultimoSaldoInsoluto: null,
        tieneComplementos: false,
        tienePagosManuales: false,
        // No incluir fechasComplementos si no hay complementos
      };
    }

    // Calcular total pagado manual
    const totalPagadoManual = pagosManuales
      .filter((pago) => (pago.origen ?? "MANUAL") === "MANUAL")
      .reduce((sum, pago) => sum + Number(pago.monto || 0), 0);

    // Calcular total pagado por complementos
    const totalPagadoComplementos = complementosItems.reduce(
      (sum, item) => sum + Number(item.monto_pago || 0),
      0
    );

    const totalPagado = totalPagadoManual + totalPagadoComplementos;

    // Obtener el último saldo insoluto del último complemento (fuente de verdad)
    const ultimoItem = complementosItems[complementosItems.length - 1];
    const ultimoSaldoInsoluto = ultimoItem ? Number(ultimoItem.imp_saldo_insoluto) : null;

    // Si hay complementos, usar el último saldo insoluto como fuente de verdad
    // Si el saldo insoluto es 0, la factura está completamente pagada
    // Si el saldo insoluto > 0, hay un pago parcial
    let estado: EstadoPago;
    let completamentePagado: boolean;

    if (tieneComplementos && ultimoSaldoInsoluto !== null) {
      // Usar el saldo insoluto del último complemento como fuente de verdad
      // Tolerancia de 0.01 para errores de redondeo
      completamentePagado = ultimoSaldoInsoluto <= 0.01;
      estado = completamentePagado ? "PAGADO" : "PAGO_PARCIAL";
    } else {
      // Si no hay complementos, calcular basado en la suma de pagos manuales
      const saldoPendiente = totalFactura - totalPagado;
      completamentePagado = saldoPendiente <= 0.01;
      estado = completamentePagado ? "PAGADO" : "PAGO_PARCIAL";
    }

    const saldoPendiente = totalFactura - totalPagado;
    const porcentajePagado = totalFactura > 0 ? (totalPagado / totalFactura) * 100 : 0;

    // Obtener fechas de los complementos para anotaciones
    const fechasComplementos = complementosItems.map((item) => item.fecha_pago);

    return {
      estado,
      totalFactura,
      totalPagado: Math.round(totalPagado * 100) / 100,
      saldoPendiente: Math.round(saldoPendiente * 100) / 100,
      porcentajePagado: Math.round(porcentajePagado * 100) / 100,
      completamentePagado,
      ultimoSaldoInsoluto,
      tieneComplementos,
      tienePagosManuales,
      // Solo incluir fechasComplementos si hay complementos
      ...(fechasComplementos.length > 0 && { fechasComplementos }),
    };
  }

  /**
   * Calcula el estado de pago para múltiples facturas de forma eficiente
   * Nota: Asume que todas las facturas pertenecen al mismo profileId
   */
  async calcularEstadoPagoFacturas(
    facturas: Invoice[],
    profileId: string
  ): Promise<Map<string, EstadoPagoDetalle>> {
    const resultados = new Map<string, EstadoPagoDetalle>();

    if (facturas.length === 0 || !profileId) {
      return resultados;
    }

    // Separar facturas PUE (siempre pagadas) y PPD (necesitan cálculo)
    const facturasPPD = facturas.filter((f) => f.tipo === "PPD");
    const uuidsPPD = facturasPPD.map((f) => f.uuid);

    // Obtener todos los complementos de pago de una vez
    let todosComplementos: typeof PaymentComplementItem.prototype[] = [];
    if (uuidsPPD.length > 0) {
      todosComplementos = await PaymentComplementItem.findAll({
        where: {
          profile_id: profileId,
          factura_uuid: {
            [Op.in]: uuidsPPD,
          },
        },
        order: [["factura_uuid", "ASC"], ["fecha_pago", "ASC"], ["num_parcialidad", "ASC"]],
      });
    }

    // Agrupar complementos por UUID de factura
    const complementosPorFactura = new Map<string, typeof todosComplementos>();
    for (const item of todosComplementos) {
      const items = complementosPorFactura.get(item.factura_uuid) || [];
      items.push(item);
      complementosPorFactura.set(item.factura_uuid, items);
    }

    // Calcular estado para cada factura
    for (const factura of facturas) {
      if (factura.tipo === "PUE") {
        const totalFactura = Number(factura.total);
        resultados.set(factura.id, {
          estado: "PAGADO",
          totalFactura,
          totalPagado: totalFactura,
          saldoPendiente: 0,
          porcentajePagado: 100,
          completamentePagado: true,
          ultimoSaldoInsoluto: null,
          tieneComplementos: false,
          tienePagosManuales: false,
        });
      } else if (factura.tipo === "PPD") {
        const complementos = complementosPorFactura.get(factura.uuid) || [];
        const estado = await this.calcularEstadoPPDConComplementos(
          factura.uuid,
          factura.pagos,
          Number(factura.total),
          complementos
        );
        resultados.set(factura.id, estado);
      }
    }

    return resultados;
  }

  /**
   * Versión optimizada que recibe los complementos ya cargados
   */
  private async calcularEstadoPPDConComplementos(
    uuid: string,
    pagosManuales: PagoParcial[],
    totalFactura: number,
    complementosItems: typeof PaymentComplementItem.prototype[]
  ): Promise<EstadoPagoDetalle> {
    const tieneComplementos = complementosItems.length > 0;
    const tienePagosManuales = pagosManuales.length > 0;

    if (!tieneComplementos && !tienePagosManuales) {
      return {
        estado: "NO_PAGADO",
        totalFactura,
        totalPagado: 0,
        saldoPendiente: totalFactura,
        porcentajePagado: 0,
        completamentePagado: false,
        ultimoSaldoInsoluto: null,
        tieneComplementos: false,
        tienePagosManuales: false,
        // No incluir fechasComplementos si no hay complementos
      };
    }

    const totalPagadoManual = pagosManuales
      .filter((pago) => (pago.origen ?? "MANUAL") === "MANUAL")
      .reduce((sum, pago) => sum + Number(pago.monto || 0), 0);

    const totalPagadoComplementos = complementosItems.reduce(
      (sum, item) => sum + Number(item.monto_pago || 0),
      0
    );

    const totalPagado = totalPagadoManual + totalPagadoComplementos;
    const ultimoItem = complementosItems[complementosItems.length - 1];
    const ultimoSaldoInsoluto = ultimoItem ? Number(ultimoItem.imp_saldo_insoluto) : null;

    let estado: EstadoPago;
    let completamentePagado: boolean;

    if (tieneComplementos && ultimoSaldoInsoluto !== null) {
      completamentePagado = ultimoSaldoInsoluto <= 0.01;
      estado = completamentePagado ? "PAGADO" : "PAGO_PARCIAL";
    } else {
      const saldoPendiente = totalFactura - totalPagado;
      completamentePagado = saldoPendiente <= 0.01;
      estado = completamentePagado ? "PAGADO" : "PAGO_PARCIAL";
    }

    const saldoPendiente = totalFactura - totalPagado;
    const porcentajePagado = totalFactura > 0 ? (totalPagado / totalFactura) * 100 : 0;

    // Obtener fechas de los complementos para anotaciones
    const fechasComplementos = complementosItems.map((item) => item.fecha_pago);

    return {
      estado,
      totalFactura,
      totalPagado: Math.round(totalPagado * 100) / 100,
      saldoPendiente: Math.round(saldoPendiente * 100) / 100,
      porcentajePagado: Math.round(porcentajePagado * 100) / 100,
      completamentePagado,
      ultimoSaldoInsoluto,
      tieneComplementos,
      tienePagosManuales,
      // Solo incluir fechasComplementos si hay complementos
      ...(fechasComplementos.length > 0 && { fechasComplementos }),
    };
  }
}

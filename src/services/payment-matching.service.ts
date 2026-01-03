import type { CFDI, ComplementoPago, FacturaRelacionada } from "../types/cfdi.types.js";
import type { MatchResult, MatchingResult } from "../types/matching.types.js";
import { Invoice } from "../database/models/index.js";

/**
 * Servicio para matching de complementos de pago con facturas PPD
 */
export class PaymentMatchingService {
  /**
   * Busca matches entre un complemento de pago y facturas PPD existentes
   */
  async buscarMatchesComplemento(
    cfdi: CFDI,
    profileId: string
  ): Promise<MatchingResult> {
    if (!cfdi.complementoPago) {
      throw new Error("El CFDI no contiene un complemento de pago");
    }

    const complemento = cfdi.complementoPago;
    const matches: MatchResult[] = [];

    // Buscar matches para cada factura relacionada en el complemento
    for (const facturaRel of complemento.facturasRelacionadas) {
      const match = await this.buscarMatchFactura(facturaRel, profileId);
      matches.push(match);
    }

    const matchesValidos = matches.filter((m) => m.coincidencia && m.encontrada).length;
    const matchesInvalidos = matches.length - matchesValidos;

    return {
      complementoUUID: cfdi.uuid,
      matches,
      totalMatches: matches.length,
      matchesValidos,
      matchesInvalidos,
    };
  }

  /**
   * Busca y valida un match para una factura relacionada
   */
  private async buscarMatchFactura(
    facturaRel: FacturaRelacionada,
    profileId: string
  ): Promise<MatchResult> {
    const resultado: MatchResult = {
      uuid: facturaRel.uuid,
      encontrada: false,
      coincidencia: false,
      errores: [],
      advertencias: [],
    };

    try {
      // Buscar la factura PPD por UUID
      const factura = await Invoice.findOne({
        where: {
          uuid: facturaRel.uuid,
          profile_id: profileId,
          tipo: "PPD", // Solo facturas PPD pueden tener complementos de pago
        },
      });

      if (!factura) {
        resultado.errores?.push(
          `No se encontró factura PPD con UUID ${facturaRel.uuid}`
        );
        return resultado;
      }

      resultado.encontrada = true;
      resultado.factura = {
        id: factura.id,
        uuid: factura.uuid,
        total: Number(factura.total),
        tipo: factura.tipo,
        fecha: factura.fecha,
      };

      // Validar match
      const validacion = this.validarMatch(factura, facturaRel);
      resultado.coincidencia = validacion.esValido;
      resultado.errores = validacion.errores;
      resultado.advertencias = validacion.advertencias;

      return resultado;
    } catch (error) {
      console.error("Error al buscar match:", error);
      resultado.errores?.push("Error al buscar factura en la base de datos");
      return resultado;
    }
  }

  /**
   * Valida que el match sea correcto (montos, fechas, etc.)
   */
  private validarMatch(
    factura: any, // Invoice model
    facturaRel: FacturaRelacionada
  ): { esValido: boolean; errores: string[]; advertencias: string[] } {
    const errores: string[] = [];
    const advertencias: string[] = [];

    // Validar que la factura es PPD
    if (factura.tipo !== "PPD") {
      errores.push(
        `La factura ${factura.uuid} no es de tipo PPD, no puede recibir complementos de pago`
      );
      return { esValido: false, errores, advertencias };
    }

    // Validar UUID coincide
    if (factura.uuid !== facturaRel.uuid) {
      errores.push(`El UUID no coincide`);
      return { esValido: false, errores, advertencias };
    }

    // Validar montos (con tolerancia para errores de redondeo)
    const totalFactura = Number(factura.total);
    const saldoAnterior = facturaRel.impSaldoAnt;
    const pagado = facturaRel.impPagado;
    const saldoInsoluto = facturaRel.impSaldoInsoluto;

    // Verificar que saldo anterior - pagado = saldo insoluto (aproximadamente)
    // Fórmula: SaldoAnterior - Pagado = SaldoInsoluto
    const diferencia = Math.abs(saldoAnterior - pagado - saldoInsoluto);
    if (diferencia > 0.01) {
      advertencias.push(
        `Diferencia en cálculos de parcialidad: ${diferencia.toFixed(2)} (esperado: ${(saldoAnterior - pagado).toFixed(2)}, obtenido: ${saldoInsoluto.toFixed(2)})`
      );
    }

    // Validar que el monto pagado no exceda el total de la factura
    if (pagado > totalFactura) {
      errores.push(
        `El monto pagado (${pagado}) excede el total de la factura (${totalFactura})`
      );
      return { esValido: false, errores, advertencias };
    }

    // Validar que el saldo insoluto no sea negativo
    if (saldoInsoluto < 0) {
      errores.push(`El saldo insoluto no puede ser negativo`);
      return { esValido: false, errores, advertencias };
    }

    // Validar que el número de parcialidad sea positivo
    if (facturaRel.numParcialidad <= 0) {
      errores.push(`El número de parcialidad debe ser mayor a cero`);
      return { esValido: false, errores, advertencias };
    }

    return {
      esValido: errores.length === 0,
      errores,
      advertencias,
    };
  }

  /**
   * Calcula el estado de pago de una factura PPD después de aplicar complementos
   */
  async calcularEstadoPagoFactura(
    facturaId: string,
    profileId: string
  ): Promise<{
    totalFactura: number;
    totalPagado: number;
    saldoPendiente: number;
    porcentajePagado: number;
    completamentePagado: boolean;
  }> {
    const factura = await Invoice.findOne({
      where: { id: facturaId, profile_id: profileId },
    });

    if (!factura) {
      throw new Error("Factura no encontrada");
    }

    if (factura.tipo !== "PPD") {
      throw new Error("Solo las facturas PPD pueden tener estado de pago calculado");
    }

    // TODO: En el futuro, buscar todos los complementos de pago relacionados
    // y sumar los pagos parciales
    // Por ahora, retornamos valores básicos

    const totalFactura = Number(factura.total);
    const pagos = (factura.pagos as any[]) || [];
    const totalPagado = pagos.reduce((sum, pago) => sum + Number(pago.monto || 0), 0);
    const saldoPendiente = totalFactura - totalPagado;
    const porcentajePagado = totalFactura > 0 ? (totalPagado / totalFactura) * 100 : 0;
    const completamentePagado = saldoPendiente <= 0.01; // Tolerancia de 1 centavo

    return {
      totalFactura,
      totalPagado,
      saldoPendiente,
      porcentajePagado: Math.round(porcentajePagado * 100) / 100,
      completamentePagado,
    };
  }
}


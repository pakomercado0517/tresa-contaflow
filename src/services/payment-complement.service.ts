import { Op } from "sequelize";

import { Invoice, AccruedExpense, PaymentComplement, PaymentComplementItem } from "../database/models/index.js";

import type { CFDI, ComplementoPagoItem, FacturaRelacionada } from "../types/cfdi.types.js";
import type {
  PagoParcial,
  PaymentComplementItemCreationAttributes,
} from "../types/payment.types.js";

export class PaymentComplementService {
  async saveComplemento(cfdi: CFDI, profileId: string): Promise<PaymentComplement> {
    if (!cfdi.complementoPago) {
      throw new Error("El CFDI no contiene un complemento de pago");
    }

    // Usar findOrCreate para evitar race conditions y errores de constraint único
    // El constraint único es sobre uuid (global), no sobre (uuid, profile_id)
    // Si el complemento ya existe, lo retornamos sin error
    const [complemento, created] = await PaymentComplement.findOrCreate({
      where: {
        uuid: cfdi.uuid,
      },
      defaults: {
        profile_id: profileId,
        uuid: cfdi.uuid,
        fecha_emision: cfdi.fecha,
        rfc_emisor: cfdi.rfcEmisor,
        rfc_receptor: cfdi.rfcReceptor,
        complemento_data: cfdi.complementoPago,
      },
    });

    // Si el complemento ya existía, actualizar los datos por si acaso cambió algo
    // (aunque normalmente no debería cambiar)
    if (!created) {
      // Solo actualizar si los datos son diferentes para evitar updates innecesarios
      const fechaEmisionTime = complemento.fecha_emision instanceof Date 
        ? complemento.fecha_emision.getTime() 
        : new Date(complemento.fecha_emision).getTime();
      const cfdiFechaTime = cfdi.fecha instanceof Date 
        ? cfdi.fecha.getTime() 
        : new Date(cfdi.fecha).getTime();
      
      const needsUpdate = 
        complemento.profile_id !== profileId ||
        Math.abs(fechaEmisionTime - cfdiFechaTime) > 1000 || // Tolerancia de 1 segundo
        complemento.rfc_emisor !== cfdi.rfcEmisor ||
        complemento.rfc_receptor !== cfdi.rfcReceptor;

      if (needsUpdate) {
        complemento.profile_id = profileId;
        complemento.fecha_emision = cfdi.fecha;
        complemento.rfc_emisor = cfdi.rfcEmisor;
        complemento.rfc_receptor = cfdi.rfcReceptor;
        complemento.complemento_data = cfdi.complementoPago;
        await complemento.save();
      }
    }

    // Construir items del complemento
    const items = this.buildComplementItems(
      cfdi.complementoPago.pagos,
      profileId,
      complemento.id
    );

    // Solo crear items si el complemento fue recién creado
    // Si ya existía, los items ya deberían estar creados
    if (created && items.length > 0) {
      await PaymentComplementItem.bulkCreate(items);
      await this.applyComplementItemsToInvoices(profileId, items);
    } else if (!created && items.length > 0) {
      // Si el complemento ya existía, verificar si los items ya existen
      // y solo crear los que falten (por si acaso se agregaron nuevos pagos)
      const existingItems = await PaymentComplementItem.findAll({
        where: {
          complement_id: complemento.id,
          profile_id: profileId,
        },
      });

      // Crear un set de items existentes para comparar
      const existingItemsSet = new Set(
        existingItems.map((item) => {
          const fechaPago = item.fecha_pago instanceof Date 
            ? item.fecha_pago.toISOString() 
            : new Date(item.fecha_pago).toISOString();
          return `${item.factura_uuid}-${item.num_parcialidad}-${fechaPago}`;
        })
      );

      // Filtrar items nuevos que no existen
      const newItems = items.filter((item) => {
        const fechaPago = item.fecha_pago instanceof Date 
          ? item.fecha_pago.toISOString() 
          : new Date(item.fecha_pago).toISOString();
        const key = `${item.factura_uuid}-${item.num_parcialidad}-${fechaPago}`;
        return !existingItemsSet.has(key);
      });

      if (newItems.length > 0) {
        await PaymentComplementItem.bulkCreate(newItems);
        await this.applyComplementItemsToInvoices(profileId, newItems);
      }
    }

    return complemento;
  }

  async applyPaymentsToInvoice(invoice: Invoice, profileId: string): Promise<void> {
    const items = await PaymentComplementItem.findAll({
      where: {
        profile_id: profileId,
        factura_uuid: invoice.uuid,
      },
      order: [["fecha_pago", "ASC"]],
    });

    const pagosComplemento = items.map((item) => this.mapItemToPagoParcial(item));
    const pagosManual = invoice.pagos.filter((pago) => (pago.origen ?? "MANUAL") === "MANUAL");
    const pagos = this.mergePagos(pagosManual, pagosComplemento);

    invoice.pagos = pagos;
    await invoice.save();
  }

  async applyPaymentsToExpense(expense: AccruedExpense, profileId: string): Promise<void> {
    const items = await PaymentComplementItem.findAll({
      where: {
        profile_id: profileId,
        factura_uuid: expense.uuid || "",
      },
      order: [["fecha_pago", "ASC"]],
    });

    const pagosComplemento = items.map((item) => this.mapItemToPagoParcial(item));
    const pagosManual = expense.pagos.filter((pago) => (pago.origen ?? "MANUAL") === "MANUAL");
    const pagos = this.mergePagos(pagosManual, pagosComplemento);

    expense.pagos = pagos;
    await expense.save();
  }

  private buildComplementItems(
    pagos: ComplementoPagoItem[],
    profileId: string,
    complementId: string
  ): PaymentComplementItemCreationAttributes[] {
    const items: PaymentComplementItemCreationAttributes[] = [];

    pagos.forEach((pago) => {
      pago.facturasRelacionadas.forEach((factura) => {
        items.push(this.mapPagoToItem(pago, factura, profileId, complementId));
      });
    });

    return items;
  }

  private mapPagoToItem(
    pago: ComplementoPagoItem,
    factura: FacturaRelacionada,
    profileId: string,
    complementId: string
  ): PaymentComplementItemCreationAttributes {
    return {
      complement_id: complementId,
      profile_id: profileId,
      factura_uuid: factura.uuid,
      fecha_pago: pago.fechaPago,
      forma_pago: pago.formaPago,
      moneda_pago: pago.monedaPago,
      tipo_cambio_pago: pago.tipoCambio,
      monto_pago: pago.monto,
      num_operacion: pago.numOperacion ?? null,
      moneda_dr: factura.monedaDR,
      tipo_cambio_dr: factura.tipoCambioDR,
      metodo_pago_dr: factura.metodoPagoDR,
      num_parcialidad: factura.numParcialidad,
      imp_saldo_ant: factura.impSaldoAnt,
      imp_pagado: factura.impPagado,
      imp_saldo_insoluto: factura.impSaldoInsoluto,
    };
  }

  private mapItemToPagoParcial(item: PaymentComplementItem): PagoParcial {
    return {
      fechaPago: item.fecha_pago,
      formaPago: item.forma_pago,
      monedaPago: item.moneda_pago,
      monto: Number(item.imp_pagado),
      numOperacion: item.num_operacion ?? undefined,
      numParcialidad: item.num_parcialidad,
      complementoUUID: item.complement_id,
      origen: "COMPLEMENTO",
    };
  }

  private mergePagos(pagosManual: PagoParcial[], pagosComplemento: PagoParcial[]): PagoParcial[] {
    const existentes = new Set(
      pagosManual
        .filter((pago) => pago.complementoUUID)
        .map((pago) => this.buildPagoKey(pago))
    );

    const complementosNuevos = pagosComplemento.filter((pago) => {
      const key = this.buildPagoKey(pago);
      return !existentes.has(key);
    });

    return [...pagosManual, ...complementosNuevos];
  }

  private buildPagoKey(pago: PagoParcial): string {
    const fecha = typeof pago.fechaPago === "string" ? pago.fechaPago : pago.fechaPago.toISOString();
    return [
      pago.complementoUUID ?? "manual",
      pago.numParcialidad ?? 0,
      pago.monto,
      fecha,
    ].join("|");
  }

  private async applyComplementItemsToInvoices(
    profileId: string,
    items: PaymentComplementItemCreationAttributes[]
  ): Promise<void> {
    const facturasUUIDs = Array.from(new Set(items.map((item) => item.factura_uuid)));
    if (facturasUUIDs.length === 0) {
      return;
    }

    // Buscar facturas (invoices) PPD relacionadas
    const facturas = await Invoice.findAll({
      where: {
        profile_id: profileId,
        uuid: {
          [Op.in]: facturasUUIDs,
        },
        tipo: "PPD",
      },
    });

    for (const factura of facturas) {
      await this.applyPaymentsToInvoice(factura, profileId);
    }

    // Buscar gastos (expenses) PPD relacionados
    const gastos = await AccruedExpense.findAll({
      where: {
        profile_id: profileId,
        uuid: {
          [Op.in]: facturasUUIDs,
        },
        tipo: "PPD",
      },
    });

    for (const gasto of gastos) {
      await this.applyPaymentsToExpense(gasto, profileId);
    }
  }
}

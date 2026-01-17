import { Op } from "sequelize";

import { Invoice, PaymentComplement, PaymentComplementItem } from "../database/models/index.js";

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

    const complemento = await PaymentComplement.create({
      profile_id: profileId,
      uuid: cfdi.uuid,
      fecha_emision: cfdi.fecha,
      rfc_emisor: cfdi.rfcEmisor,
      rfc_receptor: cfdi.rfcReceptor,
      complemento_data: cfdi.complementoPago,
    });

    const items = this.buildComplementItems(
      cfdi.complementoPago.pagos,
      profileId,
      complemento.id
    );

    if (items.length > 0) {
      await PaymentComplementItem.bulkCreate(items);
      await this.applyComplementItemsToInvoices(profileId, items);
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
  }
}

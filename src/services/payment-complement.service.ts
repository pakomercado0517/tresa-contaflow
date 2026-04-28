import { Op } from "sequelize";

import {
  Invoice,
  AccruedExpense,
  PaymentComplement,
  ProfilePaymentComplement,
  PaymentComplementItem,
} from "../database/models/index.js";
import { compareRFCs } from "../utils/rfc.util.js";

import type { CFDI, ComplementoPagoItem, FacturaRelacionada } from "../types/cfdi.types.js";
import type {
  ComplementRole,
  PagoParcial,
  PaymentComplementItemCreationAttributes,
} from "../types/payment.types.js";

export class PaymentComplementService {
  async saveComplemento(
    cfdi: CFDI,
    profileId: string,
    profileRFC: string
  ): Promise<PaymentComplement> {
    if (!cfdi.complementoPago) {
      throw new Error("El CFDI no contiene un complemento de pago");
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
    const role = this.determineRole(cfdi.rfcEmisor, cfdi.rfcReceptor, profileRFC);

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
    const items = this.buildComplementItems(
      cfdi.complementoPago.pagos,
      profileId,
      complemento.id
    );

    if (items.length > 0) {
      const existingItems = await PaymentComplementItem.findAll({
        where: {
          complement_id: complemento.id,
          profile_id: profileId,
        },
      });

      if (existingItems.length === 0) {
        await PaymentComplementItem.bulkCreate(items);
        await this.applyComplementItemsToDocuments(profileId, items);
      } else {
        const existingItemsSet = new Set(
          existingItems.map((item) => {
            const fechaPago = item.fecha_pago instanceof Date
              ? item.fecha_pago.toISOString()
              : new Date(item.fecha_pago).toISOString();
            return `${item.factura_uuid}-${item.num_parcialidad}-${fechaPago}-${Number(item.imp_pagado)}-${item.num_operacion ?? ""}`;
          })
        );

        const newItems = items.filter((item) => {
          const fechaPago = item.fecha_pago instanceof Date
            ? item.fecha_pago.toISOString()
            : new Date(item.fecha_pago).toISOString();
          const key = `${item.factura_uuid}-${item.num_parcialidad}-${fechaPago}-${item.imp_pagado}-${item.num_operacion ?? ""}`;
          return !existingItemsSet.has(key);
        });

        if (newItems.length > 0) {
          await PaymentComplementItem.bulkCreate(newItems);
          await this.applyComplementItemsToDocuments(profileId, newItems);
        }
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

  /**
   * Verifica si ya existe un vínculo entre un perfil y un complemento con el UUID dado.
   */
  async isLinkedToProfile(complementUUID: string, profileId: string): Promise<boolean> {
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
  }

  private determineRole(
    rfcEmisor: string,
    rfcReceptor: string,
    profileRFC: string
  ): ComplementRole {
    if (compareRFCs(rfcEmisor, profileRFC)) return "INGRESO";
    if (compareRFCs(rfcReceptor, profileRFC)) return "EGRESO";
    return "INGRESO";
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
  }

  private mapItemToPagoParcial(item: PaymentComplementItem): PagoParcial {
    return {
      fechaPago: item.fecha_pago,
      formaPago: item.forma_pago,
      monedaPago: item.moneda_pago,
      monto: Number(item.monto_pago),
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

  private async applyComplementItemsToDocuments(
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
        uuid: { [Op.in]: facturasUUIDs },
        tipo: "PPD",
      },
    });

    for (const factura of facturas) {
      await this.applyPaymentsToInvoice(factura, profileId);
    }

    const gastos = await AccruedExpense.findAll({
      where: {
        profile_id: profileId,
        uuid: { [Op.in]: facturasUUIDs },
        tipo: "PPD",
      },
    });

    for (const gasto of gastos) {
      await this.applyPaymentsToExpense(gasto, profileId);
    }
  }
}

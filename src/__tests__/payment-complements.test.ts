import { describe, expect, it } from "vitest";

import { PaymentComplementService } from "../services/payment-complement.service";
import { PaymentStatusService } from "../services/payment-status.service";

import type { ComplementoPagoItem, FacturaRelacionada } from "../types/cfdi.types";
import type { PagoParcial } from "../types/payment.types";

describe("Payment complements multi-factura", () => {
  const paymentComplementService = new PaymentComplementService();
  const paymentStatusService = new PaymentStatusService();

  it("mapea monto_pago usando impPagado por factura en pagos con multiples doctos", () => {
    const pago: ComplementoPagoItem = {
      fechaPago: new Date("2025-12-30T17:00:45Z"),
      formaPago: "03",
      monedaPago: "MXN",
      tipoCambio: 1,
      monto: 1000,
      facturasRelacionadas: [],
    };
    const facturaRelacionada: FacturaRelacionada = {
      uuid: "AAAA1111-2222-3333-4444-555555555555",
      monedaDR: "MXN",
      tipoCambioDR: 1,
      metodoPagoDR: "PPD",
      numParcialidad: 1,
      impSaldoAnt: 600,
      impPagado: 600,
      impSaldoInsoluto: 0,
    };

    const item = (
      paymentComplementService as unknown as {
        mapPagoToItem: (
          pagoParam: ComplementoPagoItem,
          facturaParam: FacturaRelacionada,
          profileId: string,
          complementId: string
        ) => { monto_pago: number; imp_pagado: number };
      }
    ).mapPagoToItem(pago, facturaRelacionada, "profile-id", "complement-id");

    expect(item.monto_pago).toBe(600);
    expect(item.imp_pagado).toBe(600);
  });

  it("calcula totalPagado usando imp_pagado en estado PPD para evitar duplicacion", async () => {
    const pagosManuales: PagoParcial[] = [];
    const complementosItems = [
      {
        imp_pagado: 600,
        monto_pago: 1000,
        imp_saldo_insoluto: 0,
        fecha_pago: new Date("2025-12-30T17:00:45Z"),
      },
      {
        imp_pagado: 400,
        monto_pago: 1000,
        imp_saldo_insoluto: 0,
        fecha_pago: new Date("2025-12-30T17:00:45Z"),
      },
    ];

    const estado = await (
      paymentStatusService as unknown as {
        calcularEstadoPPDConComplementos: (
          uuid: string,
          pagosManual: PagoParcial[],
          totalFactura: number,
          items: Array<{
            imp_pagado: number;
            monto_pago: number;
            imp_saldo_insoluto: number;
            fecha_pago: Date;
          }>
        ) => Promise<{ totalPagado: number; saldoPendiente: number }>;
      }
    ).calcularEstadoPPDConComplementos("factura-uuid", pagosManuales, 1000, complementosItems);

    expect(estado.totalPagado).toBeCloseTo(1000, 2);
    expect(estado.saldoPendiente).toBeCloseTo(0, 2);
  });
});

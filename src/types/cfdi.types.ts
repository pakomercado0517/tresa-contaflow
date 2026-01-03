/**
 * Tipos e interfaces para el parser XML CFDI
 */

export type TipoCFDI = "PUE" | "PPD" | "COMPLEMENTO_PAGO";

export interface CFDI {
  uuid: string; // UUID del timbre fiscal
  fecha: Date; // Fecha de emisión
  tipo: TipoCFDI;
  total: number; // Total con IVA
  subtotal: number; // Subtotal sin IVA
  iva: number; // IVA calculado
  rfcEmisor: string; // RFC del emisor
  nombreEmisor: string; // Nombre/razón social emisor
  regimenFiscalEmisor: string; // Régimen fiscal del emisor (clave SAT)
  rfcReceptor: string; // RFC del receptor
  nombreReceptor: string; // Nombre/razón social receptor
  regimenFiscalReceptor: string; // Régimen fiscal del receptor (clave SAT)
  concepto: string; // Descripción/concepto principal
  mes: number; // Mes extraído (1-12)
  año: number; // Año extraído
  pagos?: Pago[]; // Pagos parciales (solo PPD)
  complementoPago?: ComplementoPago; // Datos de complemento (solo COMPLEMENTO_PAGO)
  version?: string; // Versión del CFDI (3.3 o 4.0)
}

export interface Pago {
  fechaPago: Date;
  formaPago: string;
  monedaPago: string;
  monto: number;
  numOperacion?: string;
}

export interface ComplementoPago {
  fechaPago: Date;
  formaPago: string;
  monedaPago: string;
  tipoCambio: number;
  monto: number;
  numOperacion?: string;
  facturasRelacionadas: FacturaRelacionada[];
}

export interface FacturaRelacionada {
  uuid: string; // UUID de la factura PPD relacionada
  monedaDR: string;
  tipoCambioDR: number;
  metodoPagoDR: string;
  numParcialidad: number;
  impSaldoAnt: number;
  impPagado: number;
  impSaldoInsoluto: number;
}


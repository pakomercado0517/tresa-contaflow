import type { ComplementoPago } from "./cfdi.types.js";

export type PagoOrigen = "COMPLEMENTO" | "MANUAL";

export interface PagoParcial {
  fechaPago: Date | string;
  formaPago: string;
  monedaPago: string;
  monto: number;
  numOperacion?: string | undefined;
  numParcialidad?: number;
  complementoUUID?: string;
  origen?: PagoOrigen;
}

export interface PaymentComplementAttributes {
  id: string;
  profile_id: string;
  uuid: string;
  fecha_emision: Date;
  rfc_emisor: string;
  rfc_receptor: string;
  complemento_data: ComplementoPago;
  created_at: Date;
  updated_at: Date;
}

export interface PaymentComplementCreationAttributes
  extends Omit<PaymentComplementAttributes, "id" | "created_at" | "updated_at"> {}

export interface PaymentComplementItemAttributes {
  id: string;
  complement_id: string;
  profile_id: string;
  factura_uuid: string;
  fecha_pago: Date;
  forma_pago: string;
  moneda_pago: string;
  tipo_cambio_pago: number;
  monto_pago: number;
  num_operacion: string | null;
  moneda_dr: string;
  tipo_cambio_dr: number;
  metodo_pago_dr: string;
  num_parcialidad: number;
  imp_saldo_ant: number;
  imp_pagado: number;
  imp_saldo_insoluto: number;
  created_at: Date;
  updated_at: Date;
}

export interface PaymentComplementItemCreationAttributes
  extends Omit<PaymentComplementItemAttributes, "id" | "created_at" | "updated_at"> {}

// Tipos para estado de pago
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
}

import type AccruedExpense from '../database/models/AccruedExpense.model.js';
import type Invoice from '../database/models/Invoice.model.js';
import type { CFDI } from './cfdi.types.js';
import type { MatchingResult } from './matching.types.js';
import type { EstadoPagoDetalle } from './payment.types.js';
import type { EstadoValidacionCFDI, EstadoValidacionGasto } from './validation.types.js';

interface UploadInvoiceBase {
  message: string;
  validacion: EstadoValidacionCFDI | EstadoValidacionGasto;
}

/** Complemento de pago procesado y persistido (HTTP 200). */
export interface UploadComplementResult extends UploadInvoiceBase {
  kind: 'complement';
  status: 200;
  data: CFDI;
  matching: MatchingResult | null;
  complementId: string;
}

/** Factura o gasto XML recién guardado (HTTP 201). */
export interface UploadCreatedResult extends UploadInvoiceBase {
  kind: 'created';
  status: 201;
  data: Invoice | AccruedExpense;
  estadoPago: EstadoPagoDetalle;
  tipo: 'factura' | 'gasto';
}

export type UploadInvoiceResult = UploadComplementResult | UploadCreatedResult;

/** Cuerpo JSON enviado al cliente (sin el código HTTP). */
export type UploadInvoiceResponseBody = Omit<UploadInvoiceResult, 'status'>;

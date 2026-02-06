/**
 * Tipos para los parsers de CFDI
 */

import type { CFDI } from "./cfdi.types.js";

/**
 * Resultado base del parser CFDI (compartido por invoice y expense)
 */
export type BaseParserResult = CFDI;

/**
 * Datos extraídos de un XML de factura de ingreso
 */
export type InvoiceData = CFDI;

/**
 * Datos extraídos de un XML de gasto con campos específicos de egreso
 */
export interface ExpenseData extends CFDI {
  /** Origen del gasto: 'cfdi' cuando se parsea desde XML */
  tipo_origen: "XML";
  /** Indica si el gasto ya fue pagado (PUE: true, PPD: false) */
  is_paid: boolean;
  /** Fecha de pago (PUE: fecha emisión, PPD: null hasta recibir complemento) */
  payment_date: Date | null;
}

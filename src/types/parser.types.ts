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

/**
 * Datos del empleado (receptor) en un CFDI de nómina
 */
export interface PayrollReceptorData {
  /** Nombre del empleado (cfdi:Receptor) */
  nombre: string;
  /** RFC del empleado (cfdi:Receptor) */
  rfc: string;
  /** CURP (complemento nomina12:Receptor), opcional */
  curp: string | null;
  /** Número de Seguridad Social (complemento nomina12:Receptor), opcional */
  nss: string | null;
}

/**
 * Datos extraídos de un XML de CFDI de nómina (complemento nomina12:Nomina)
 */
export interface PayrollData {
  /** UUID del timbre fiscal del comprobante */
  uuid: string;
  /** Fecha de pago (nomina12:Nomina.FechaPago) */
  fecha_pago: Date;
  /** Total de percepciones */
  percepciones_total: number;
  /** Total de deducciones */
  deducciones_total: number;
  /** Total de otros pagos (nomina12:Nomina.TotalOtrosPagos) */
  otros_pagos_total: number;
  /** Neto pagado: percepciones_total - deducciones_total + otros_pagos_total */
  neto_pagado: number;
  /** Datos del empleado (receptor) */
  receptor: PayrollReceptorData;
}

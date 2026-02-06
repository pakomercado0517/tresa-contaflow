import type { ExpenseData } from "../types/parser.types.js";
import {
  parseXML,
  validateCFDI,
  extractSubtotal,
  extractIVA,
  extractRetenciones,
  extractTotal,
  extractUUID,
  extractFecha,
  extractRfcEmisor,
  extractRfcReceptor,
  extractNombreEmisor,
  extractNombreReceptor,
  extractRegimenFiscalEmisor,
  extractRegimenFiscalReceptor,
  extractConceptos,
  calculateMesYAno,
  detectVersion,
  identifyType,
  extractComplementoPago,
} from "./base.parser.js";

/**
 * Determina is_paid y payment_date según el tipo de CFDI
 * PUE: pagado en el momento, payment_date = fecha emisión
 * PPD/COMPLEMENTO_PAGO: no pagado aún, payment_date = null
 */
function determinePaymentStatus(
  tipo: string,
  fecha: Date
): { is_paid: boolean; payment_date: Date | null } {
  if (tipo === "PUE") {
    return { is_paid: true, payment_date: fecha };
  }
  return { is_paid: false, payment_date: null };
}

/**
 * Parsea un buffer XML de gasto/egreso y retorna ExpenseData
 *
 * @param xmlBuffer - Buffer con el contenido XML del CFDI
 * @returns ExpenseData con tipo_origen 'XML', is_paid (PUE: true, PPD: false) y datos fiscales
 */
export function parseExpense(xmlBuffer: Buffer): ExpenseData {
  const xml = parseXML(xmlBuffer);

  if (!validateCFDI(xml)) {
    throw new Error("Estructura CFDI inválida: faltan Comprobante, Emisor o Receptor");
  }

  const uuid = extractUUID(xml);
  const fecha = extractFecha(xml);
  const total = extractTotal(xml);
  const subtotal = extractSubtotal(xml);
  const ivaAmount = extractIVA(xml);
  const { iva: retencionIva, isr: retencionIsr } = extractRetenciones(xml);
  const iva = ivaAmount > 0 ? ivaAmount : total - subtotal;

  const rfcEmisor = extractRfcEmisor(xml);
  const rfcReceptor = extractRfcReceptor(xml);
  const nombreEmisor = extractNombreEmisor(xml);
  const nombreReceptor = extractNombreReceptor(xml);
  const regimenFiscalEmisor = extractRegimenFiscalEmisor(xml);
  const regimenFiscalReceptor = extractRegimenFiscalReceptor(xml);

  const concepto = extractConceptos(xml);

  const { mes, año } = calculateMesYAno(fecha);

  const tipo = identifyType(xml);
  const version = detectVersion(xml);

  const { is_paid, payment_date } = determinePaymentStatus(tipo, fecha);

  const expenseData: ExpenseData = {
    uuid,
    fecha,
    tipo,
    total,
    subtotal,
    iva,
    iva_amount: ivaAmount,
    retencion_iva_amount: retencionIva,
    retencion_isr_amount: retencionIsr,
    rfcEmisor,
    nombreEmisor,
    regimenFiscalEmisor,
    rfcReceptor,
    nombreReceptor,
    regimenFiscalReceptor,
    concepto,
    mes,
    año,
    version,
    tipo_origen: "XML",
    is_paid,
    payment_date,
  };

  if (tipo === "COMPLEMENTO_PAGO") {
    expenseData.complementoPago = extractComplementoPago(xml);
  }

  return expenseData;
}

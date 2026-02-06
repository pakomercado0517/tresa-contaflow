import type { InvoiceData } from "../types/parser.types.js";
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
 * Parsea un buffer XML de factura de ingreso y retorna InvoiceData
 *
 * @param xmlBuffer - Buffer con el contenido XML del CFDI
 * @returns InvoiceData con RFC emisor, RFC receptor, UUID, fecha, conceptos y datos fiscales
 */
export function parseInvoice(xmlBuffer: Buffer): InvoiceData {
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

  const invoiceData: InvoiceData = {
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
  };

  if (tipo === "COMPLEMENTO_PAGO") {
    invoiceData.complementoPago = extractComplementoPago(xml);
  }

  return invoiceData;
}

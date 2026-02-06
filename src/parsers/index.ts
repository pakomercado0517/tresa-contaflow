/**
 * Parsers modulares para CFDI
 */

export {
  BaseCFDIParser,
  parseXML,
  extractSubtotal,
  extractIVA,
  extractRetenciones,
  validateCFDI,
  extractUUID,
  extractFecha,
  extractTotal,
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
export type { Document, ParsedXMLDocument } from "./base.parser.js";

export { parseInvoice } from "./invoice.parser.js";

export { parseExpense } from "./expense.parser.js";

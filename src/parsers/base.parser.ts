import { XMLParser } from "fast-xml-parser";
import type {
  CFDI,
  ComplementoPago,
  ComplementoPagoItem,
  FacturaRelacionada,
  TipoCFDI,
} from "../types/cfdi.types.js";

/**
 * Objeto parseado del XML (estructura de fast-xml-parser)
 */
export type Document = Record<string, unknown>;
export type ParsedXMLDocument = Document;

const defaultParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  parseAttributeValue: true,
  parseTagValue: true,
  trimValues: true,
});

function getComprobante(doc: Document): Record<string, unknown> | null {
  const comprobante = doc["cfdi:Comprobante"] ?? doc["Comprobante"];
  if (!comprobante || typeof comprobante !== "object") {
    return null;
  }
  return comprobante as Record<string, unknown>;
}

function getNumberAttr(obj: Record<string, unknown>, key: string, fallback: number): number {
  const value = obj[key];
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    return Number.isNaN(parsed) ? fallback : parsed;
  }
  return fallback;
}

function getStringAttr(obj: Record<string, unknown>, key: string): string {
  const value = obj[key];
  return typeof value === "string" ? value : "";
}

// ─── Funciones comunes exportadas ───────────────────────────────────────────

/**
 * Parsea un buffer XML a objeto Document
 */
export function parseXML(buffer: Buffer): Document {
  const xmlString = buffer.toString("utf-8");
  if (!xmlString || !xmlString.trim()) {
    throw new Error("El contenido XML no es válido");
  }
  return defaultParser.parse(xmlString) as Document;
}

/**
 * Extrae el subtotal del Comprobante
 */
export function extractSubtotal(xml: Document): number {
  const comprobante = getComprobante(xml);
  if (!comprobante) return 0;
  return getNumberAttr(comprobante, "@_SubTotal", 0);
}

/**
 * Extrae el IVA trasladado (TotalImpuestosTrasladados)
 */
export function extractIVA(xml: Document): number {
  const comprobante = getComprobante(xml);
  if (!comprobante) return 0;

  const impuestos = comprobante["cfdi:Impuestos"] ?? comprobante["Impuestos"];
  if (!impuestos || typeof impuestos !== "object") return 0;

  return getNumberAttr(
    impuestos as Record<string, unknown>,
    "@_TotalImpuestosTrasladados",
    0
  );
}

/**
 * Extrae retenciones por tipo. Códigos SAT: 001=ISR, 002=IVA
 */
export function extractRetenciones(xml: Document): { iva: number; isr: number } {
  const comprobante = getComprobante(xml);
  if (!comprobante) return { iva: 0, isr: 0 };

  const impuestos = comprobante["cfdi:Impuestos"] ?? comprobante["Impuestos"];
  if (!impuestos || typeof impuestos !== "object") return { iva: 0, isr: 0 };

  const impuestosObj = impuestos as Record<string, unknown>;
  const retenciones = impuestosObj["cfdi:Retenciones"] ?? impuestosObj["Retenciones"];
  if (!retenciones) return { iva: 0, isr: 0 };

  const retencionNode =
    (retenciones as Record<string, unknown>)["cfdi:Retencion"] ??
    (retenciones as Record<string, unknown>)["Retencion"];
  const retencionArray = Array.isArray(retencionNode)
    ? retencionNode
    : retencionNode
      ? [retencionNode]
      : [];

  let iva = 0;
  let isr = 0;
  for (const retencionItem of retencionArray) {
    const retencion = retencionItem as Record<string, unknown>;
    // parseAttributeValue:true convierte "001" en número 1 y "002" en número 2
    const impuestoRaw = retencion["@_Impuesto"];
    const impuesto = typeof impuestoRaw === "string" ? impuestoRaw : String(impuestoRaw ?? "");
    const importe = getNumberAttr(retencion, "@_Importe", 0);
    if (impuesto === "001" || impuesto === "1") isr += importe;
    else if (impuesto === "002" || impuesto === "2") iva += importe;
  }
  return { iva, isr };
}

/**
 * Valida la estructura mínima del CFDI (Comprobante, Emisor, Receptor)
 */
export function validateCFDI(xml: Document): boolean {
  const comprobante = getComprobante(xml);
  if (!comprobante) return false;

  const emisor = comprobante["cfdi:Emisor"] ?? comprobante["Emisor"];
  const receptor = comprobante["cfdi:Receptor"] ?? comprobante["Receptor"];
  return !!(emisor && receptor);
}

function getRegimenFiscal(emisorReceptor: Record<string, unknown>): string {
  const regimenFiscal =
    emisorReceptor["@_RegimenFiscal"] ??
    emisorReceptor["@_RegimenFiscalReceptor"] ??
    emisorReceptor["@_RegimenFiscalEmisor"];

  if (regimenFiscal) {
    if (Array.isArray(regimenFiscal)) return String(regimenFiscal[0] ?? "");
    return String(regimenFiscal);
  }
  const regimenFiscalNode = emisorReceptor["cfdi:RegimenFiscal"] ?? emisorReceptor["RegimenFiscal"];
  if (regimenFiscalNode && typeof regimenFiscalNode === "object") {
    const node = regimenFiscalNode as Record<string, unknown>;
    if (Array.isArray(node)) return String(node[0]?.["@_Regimen"] ?? "");
    return String(node["@_Regimen"] ?? "");
  }
  return "";
}

/**
 * Extrae el UUID del timbre fiscal
 */
export function extractUUID(xml: Document): string {
  const comprobante = getComprobante(xml);
  if (!comprobante) throw new Error("No se encontró Comprobante");

  const complementos = comprobante["cfdi:Complemento"] ?? comprobante["Complemento"];
  if (!complementos) throw new Error("No se encontró el complemento TimbreFiscalDigital");

  const complementosObj = complementos as Record<string, unknown>;
  let tfd = complementosObj["tfd:TimbreFiscalDigital"] ?? complementosObj["TimbreFiscalDigital"];

  if (tfd && typeof tfd === "object" && (tfd as Record<string, unknown>)["@_UUID"]) {
    return String((tfd as Record<string, unknown>)["@_UUID"]);
  }
  if (Array.isArray(complementos)) {
    for (const comp of complementos) {
      const compObj = comp as Record<string, unknown>;
      tfd = compObj["tfd:TimbreFiscalDigital"] ?? compObj["TimbreFiscalDigital"];
      if (tfd && typeof tfd === "object" && (tfd as Record<string, unknown>)["@_UUID"]) {
        return String((tfd as Record<string, unknown>)["@_UUID"]);
      }
    }
  }
  throw new Error("No se pudo extraer el UUID del timbre fiscal");
}

/**
 * Extrae la fecha del Comprobante
 */
export function extractFecha(xml: Document): Date {
  const comprobante = getComprobante(xml);
  if (!comprobante) throw new Error("No se encontró Comprobante");

  const fechaStr = getStringAttr(comprobante, "@_Fecha");
  if (!fechaStr) throw new Error("Fecha no encontrada en el CFDI");

  const fecha = new Date(fechaStr);
  if (Number.isNaN(fecha.getTime())) throw new Error(`Fecha inválida: ${fechaStr}`);
  return fecha;
}

/**
 * Extrae el total del Comprobante
 */
export function extractTotal(xml: Document): number {
  const comprobante = getComprobante(xml);
  if (!comprobante) return 0;
  return getNumberAttr(comprobante, "@_Total", 0);
}

/**
 * Extrae RFC del emisor
 */
export function extractRfcEmisor(xml: Document): string {
  const comprobante = getComprobante(xml);
  if (!comprobante) return "";
  const emisor = (comprobante["cfdi:Emisor"] ?? comprobante["Emisor"]) as Record<string, unknown> | undefined;
  if (!emisor) return "";
  return getStringAttr(emisor, "@_Rfc") || getStringAttr(emisor, "@_RFC");
}

/**
 * Extrae nombre/razón social del emisor
 */
export function extractNombreEmisor(xml: Document): string {
  const comprobante = getComprobante(xml);
  if (!comprobante) return "";
  const emisor = (comprobante["cfdi:Emisor"] ?? comprobante["Emisor"]) as Record<string, unknown> | undefined;
  if (!emisor) return "";
  return getStringAttr(emisor, "@_Nombre");
}

/**
 * Extrae régimen fiscal del emisor
 */
export function extractRegimenFiscalEmisor(xml: Document): string {
  const comprobante = getComprobante(xml);
  if (!comprobante) return "";
  const emisor = (comprobante["cfdi:Emisor"] ?? comprobante["Emisor"]) as Record<string, unknown> | undefined;
  if (!emisor) return "";
  return getRegimenFiscal(emisor);
}

/**
 * Extrae RFC del receptor
 */
export function extractRfcReceptor(xml: Document): string {
  const comprobante = getComprobante(xml);
  if (!comprobante) return "";
  const receptor = (comprobante["cfdi:Receptor"] ?? comprobante["Receptor"]) as Record<string, unknown> | undefined;
  if (!receptor) return "";
  return getStringAttr(receptor, "@_Rfc") || getStringAttr(receptor, "@_RFC");
}

/**
 * Extrae nombre/razón social del receptor
 */
export function extractNombreReceptor(xml: Document): string {
  const comprobante = getComprobante(xml);
  if (!comprobante) return "";
  const receptor = (comprobante["cfdi:Receptor"] ?? comprobante["Receptor"]) as Record<string, unknown> | undefined;
  if (!receptor) return "";
  return getStringAttr(receptor, "@_Nombre");
}

/**
 * Extrae régimen fiscal del receptor
 */
export function extractRegimenFiscalReceptor(xml: Document): string {
  const comprobante = getComprobante(xml);
  if (!comprobante) return "";
  const receptor = (comprobante["cfdi:Receptor"] ?? comprobante["Receptor"]) as Record<string, unknown> | undefined;
  if (!receptor) return "";
  return getRegimenFiscal(receptor);
}

/**
 * Extrae conceptos (productos/servicios) - descripción del concepto principal
 */
export function extractConceptos(xml: Document): string {
  const comprobante = getComprobante(xml);
  if (!comprobante) return "";

  const conceptosRaw = comprobante["cfdi:Conceptos"] ?? comprobante["Conceptos"];
  const conceptos = conceptosRaw as Record<string, unknown> | undefined;
  if (!conceptos) return "";

  const conceptosArray = conceptos["cfdi:Concepto"] ?? conceptos["Concepto"];
  if (!conceptosArray) return "";

  const concepto = Array.isArray(conceptosArray) ? conceptosArray[0] : conceptosArray;
  const conceptoObj = concepto as Record<string, unknown>;
  return getStringAttr(conceptoObj, "@_Descripcion") || getStringAttr(conceptoObj, "@_Concepto");
}

/**
 * Calcula mes y año desde una fecha (zona horaria México)
 */
export function calculateMesYAno(fecha: Date): { mes: number; año: number } {
  const fechaMexico = new Date(
    fecha.toLocaleString("en-US", { timeZone: "America/Mexico_City" })
  );
  return { mes: fechaMexico.getMonth() + 1, año: fechaMexico.getFullYear() };
}

/**
 * Detecta la versión del CFDI (3.3 o 4.0)
 */
export function detectVersion(xml: Document): string {
  if (xml["cfdi:Comprobante"]) return "4.0";
  const comprobante = getComprobante(xml);
  if (comprobante) {
    const version = comprobante["@_Version"] ?? comprobante["@_version"];
    if (version === "4.0") return "4.0";
    return "3.3";
  }
  throw new Error("No se pudo detectar la versión del CFDI");
}

/**
 * Identifica el tipo de CFDI (PUE, PPD, COMPLEMENTO_PAGO)
 */
export function identifyType(xml: Document): TipoCFDI {
  const comprobante = getComprobante(xml);
  if (!comprobante) return "PUE";

  const complementos = comprobante["cfdi:Complemento"] ?? comprobante["Complemento"];
  if (complementos && typeof complementos === "object") {
    const comp = complementos as Record<string, unknown>;
    if (comp["pago20:Pagos"] ?? comp["pago10:Pagos"]) return "COMPLEMENTO_PAGO";
  }

  const metodoPago = comprobante["@_MetodoPago"] ?? comprobante["@_MetodoDePago"];
  if (metodoPago === "PPD") return "PPD";

  return "PUE";
}

function parseFechaCfdi(fechaString: string | undefined): Date {
  if (!fechaString) throw new Error("Fecha no encontrada en el CFDI");
  const fecha = new Date(fechaString);
  if (Number.isNaN(fecha.getTime())) throw new Error(`Fecha inválida: ${fechaString}`);
  return fecha;
}

function getIntAttr(obj: Record<string, unknown>, key: string, fallback: number): number {
  const value = obj[key];
  if (typeof value === "number") return Math.trunc(value);
  if (typeof value === "string") {
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? fallback : parsed;
  }
  return fallback;
}

function ensureObject(value: unknown, contexto: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Estructura inválida para ${contexto}`);
  }
  return value as Record<string, unknown>;
}

function extractBaseDRFromDoctoRelacionado(docto: Record<string, unknown>): number | null {
  const impuestosDrNode = docto["pago20:ImpuestosDR"] ?? docto["pago10:ImpuestosDR"];
  if (!impuestosDrNode || typeof impuestosDrNode !== "object") {
    return null;
  }

  const impuestosDr = impuestosDrNode as Record<string, unknown>;
  const trasladosDrNode = impuestosDr["pago20:TrasladosDR"] ?? impuestosDr["pago10:TrasladosDR"];
  if (!trasladosDrNode || typeof trasladosDrNode !== "object") {
    return null;
  }

  const trasladosDr = trasladosDrNode as Record<string, unknown>;
  const trasladoDrNode = trasladosDr["pago20:TrasladoDR"] ?? trasladosDr["pago10:TrasladoDR"];
  const trasladoDrArray = Array.isArray(trasladoDrNode)
    ? trasladoDrNode
    : trasladoDrNode
      ? [trasladoDrNode]
      : [];

  if (trasladoDrArray.length === 0) {
    return null;
  }

  const baseDr = trasladoDrArray.reduce((acc, traslado) => {
    if (!traslado || typeof traslado !== "object") {
      return acc;
    }
    return acc + getNumberAttr(traslado as Record<string, unknown>, "@_BaseDR", 0);
  }, 0);

  return baseDr > 0 ? baseDr : null;
}

function extractBasePFromPago(pago: Record<string, unknown>): number | null {
  const impuestosPNode = pago["pago20:ImpuestosP"] ?? pago["pago10:ImpuestosP"];
  if (!impuestosPNode || typeof impuestosPNode !== "object") {
    return null;
  }

  const impuestosP = impuestosPNode as Record<string, unknown>;
  const trasladosPNode = impuestosP["pago20:TrasladosP"] ?? impuestosP["pago10:TrasladosP"];
  if (!trasladosPNode || typeof trasladosPNode !== "object") {
    return null;
  }

  const trasladosP = trasladosPNode as Record<string, unknown>;
  const trasladoPNode = trasladosP["pago20:TrasladoP"] ?? trasladosP["pago10:TrasladoP"];
  const trasladoPArray = Array.isArray(trasladoPNode)
    ? trasladoPNode
    : trasladoPNode
      ? [trasladoPNode]
      : [];

  if (trasladoPArray.length === 0) {
    return null;
  }

  const baseP = trasladoPArray.reduce((acc, traslado) => {
    if (!traslado || typeof traslado !== "object") {
      return acc;
    }
    return acc + getNumberAttr(traslado as Record<string, unknown>, "@_BaseP", 0);
  }, 0);

  return baseP > 0 ? baseP : null;
}

function resolveImpPagadoSubtotal(
  pago: Record<string, unknown>,
  docto: Record<string, unknown>,
  doctosCount: number
): number {
  const baseDr = extractBaseDRFromDoctoRelacionado(docto);
  if (baseDr !== null) {
    return baseDr;
  }

  // BaseP está a nivel Pago; solo es confiable como fallback cuando hay un único documento relacionado.
  if (doctosCount === 1) {
    const baseP = extractBasePFromPago(pago);
    if (baseP !== null) {
      return baseP;
    }
  }

  return getNumberAttr(docto, "@_ImpPagado", 0);
}

/**
 * Extrae datos del complemento de pago (solo para tipo COMPLEMENTO_PAGO)
 */
export function extractComplementoPago(xml: Document): ComplementoPago {
  const comprobante = getComprobante(xml);
  if (!comprobante) throw new Error("No se encontró Comprobante");

  const complementos = (comprobante["cfdi:Complemento"] ?? comprobante["Complemento"]) as Record<string, unknown>;
  if (!complementos) throw new Error("No se encontró complemento");

  const pagosNode = complementos["pago20:Pagos"] ?? complementos["pago10:Pagos"];
  if (!pagosNode) throw new Error("No se encontró el nodo de complemento de pago");

  const pagosRaw = (pagosNode as Record<string, unknown>)["pago20:Pago"] ?? (pagosNode as Record<string, unknown>)["pago10:Pago"];
  const pagosArray = Array.isArray(pagosRaw) ? pagosRaw : pagosRaw ? [pagosRaw] : [];
  if (pagosArray.length === 0) throw new Error("No se encontró el nodo Pago en el complemento");

  const pagos: ComplementoPagoItem[] = pagosArray.map((pagoNode: unknown) => {
    const pago = ensureObject(pagoNode, "Pago");
    const fechaPago = parseFechaCfdi(getStringAttr(pago, "@_FechaPago"));
    const formaPago = getStringAttr(pago, "@_FormaDePagoP") || getStringAttr(pago, "@_FormaPago");
    const monedaPago = getStringAttr(pago, "@_MonedaP") || getStringAttr(pago, "@_Moneda");
    const tipoCambio = getNumberAttr(pago, "@_TipoCambioP", getNumberAttr(pago, "@_TipoCambio", 1));
    const monto = getNumberAttr(pago, "@_Monto", 0);
    const numOperacion = getStringAttr(pago, "@_NumOperacion") || undefined;

    const doctosRelacionados = pago["pago20:DoctoRelacionado"] ?? pago["pago10:DoctoRelacionado"];
    const facturasRelacionadas: FacturaRelacionada[] = [];

    if (doctosRelacionados) {
      const doctosArray = Array.isArray(doctosRelacionados) ? doctosRelacionados : [doctosRelacionados];
      for (const doctoNode of doctosArray) {
        const docto = ensureObject(doctoNode, "DoctoRelacionado");
        const impPagadoSubtotal = resolveImpPagadoSubtotal(pago, docto, doctosArray.length);
        facturasRelacionadas.push({
          uuid: getStringAttr(docto, "@_IdDocumento") || getStringAttr(docto, "@_UUID"),
          monedaDR: getStringAttr(docto, "@_MonedaDR"),
          tipoCambioDR: getNumberAttr(docto, "@_TipoCambioDR", 1),
          metodoPagoDR: getStringAttr(docto, "@_MetodoDePagoDR"),
          numParcialidad: getIntAttr(docto, "@_NumParcialidad", 1),
          impSaldoAnt: getNumberAttr(docto, "@_ImpSaldoAnt", 0),
          impPagado: impPagadoSubtotal,
          impSaldoInsoluto: getNumberAttr(docto, "@_ImpSaldoInsoluto", 0),
        });
      }
    }

    return { fechaPago, formaPago, monedaPago, tipoCambio, monto, numOperacion, facturasRelacionadas };
  });

  return { pagos };
}

// ─── Clase BaseCFDIParser (usa funciones comunes) ───────────────────────────

/**
 * Parser base con lógica común para CFDI 3.3 y 4.0
 * Proporciona utilidades y extracción compartida entre invoice y expense parsers
 */
export class BaseCFDIParser {
  constructor() {
    // Usa parseXML y funciones comunes del módulo
  }

  /**
   * Parsea un string XML a objeto (usa parseXML con Buffer internamente)
   */
  parseXML(xmlString: string): ParsedXMLDocument {
    return parseXML(Buffer.from(xmlString, "utf-8"));
  }

  /**
   * Valida la estructura mínima del CFDI
   */
  validateCFDI(parsed: ParsedXMLDocument): boolean {
    return validateCFDI(parsed);
  }

  /**
   * Detecta la versión del CFDI (3.3 o 4.0)
   */
  detectVersion(parsed: ParsedXMLDocument): string {
    if (parsed["cfdi:Comprobante"]) {
      return "4.0";
    }
    const comprobante = parsed["Comprobante"] as Record<string, unknown> | undefined;
    if (comprobante) {
      const version = comprobante["@_Version"] ?? comprobante["@_version"];
      if (version === "4.0") {
        return "4.0";
      }
      return "3.3";
    }
    throw new Error("No se pudo detectar la versión del CFDI");
  }

  /**
   * Extrae el subtotal del Comprobante (desde documento completo)
   */
  extractSubtotalFromDoc(doc: ParsedXMLDocument): number {
    return extractSubtotal(doc);
  }

  /**
   * Extrae el subtotal desde un nodo Comprobante ya extraído
   */
  extractSubtotal(comprobante: Record<string, unknown>): number {
    return getNumberAttr(comprobante, "@_SubTotal", 0);
  }

  /**
   * Extrae impuestos (IVA trasladado y retenciones)
   * Códigos SAT: 001=ISR, 002=IVA
   */
  extractImpuestos(comprobante: Record<string, unknown>): {
    ivaAmount: number;
    retencionIva: number;
    retencionIsr: number;
  } {
    const impuestos = comprobante["cfdi:Impuestos"] ?? comprobante["Impuestos"];
    if (!impuestos || typeof impuestos !== "object") {
      return { ivaAmount: 0, retencionIva: 0, retencionIsr: 0 };
    }

    const impuestosObj = impuestos as Record<string, unknown>;
    const ivaAmount = this.getNumberAttr(
      impuestosObj,
      "@_TotalImpuestosTrasladados",
      0
    );

    const retenciones = impuestosObj["cfdi:Retenciones"] ?? impuestosObj["Retenciones"];
    let retencionIva = 0;
    let retencionIsr = 0;

    if (retenciones) {
      const retencionNode =
        (retenciones as Record<string, unknown>)["cfdi:Retencion"] ??
        (retenciones as Record<string, unknown>)["Retencion"];
      const retencionArray = Array.isArray(retencionNode)
        ? retencionNode
        : retencionNode
          ? [retencionNode]
          : [];

      for (const retencionItem of retencionArray) {
        const retencion = retencionItem as Record<string, unknown>;
        // parseAttributeValue:true convierte "001" en número 1 y "002" en número 2
        const impuestoRaw = retencion["@_Impuesto"];
        const impuesto = typeof impuestoRaw === "string" ? impuestoRaw : String(impuestoRaw ?? "");
        const importe = this.getNumberAttr(retencion, "@_Importe", 0);
        if (impuesto === "001" || impuesto === "1") {
          retencionIsr += importe;
        } else if (impuesto === "002" || impuesto === "2") {
          retencionIva += importe;
        }
      }
    }

    return { ivaAmount, retencionIva, retencionIsr };
  }

  /**
   * Extrae el UUID del timbre fiscal
   */
  extractUUID(comprobante: Record<string, unknown>): string {
    const complementos = comprobante["cfdi:Complemento"] ?? comprobante["Complemento"];
    if (!complementos) {
      throw new Error("No se encontró el complemento TimbreFiscalDigital");
    }

    const complementosObj = complementos as Record<string, unknown>;
    const tfd =
      complementosObj["tfd:TimbreFiscalDigital"] ??
      complementosObj["TimbreFiscalDigital"];

    if (tfd && typeof tfd === "object" && (tfd as Record<string, unknown>)["@_UUID"]) {
      return String((tfd as Record<string, unknown>)["@_UUID"]);
    }

    if (Array.isArray(complementos)) {
      for (const comp of complementos) {
        const compObj = comp as Record<string, unknown>;
        const tfdArray = compObj["tfd:TimbreFiscalDigital"] ?? compObj["TimbreFiscalDigital"];
        if (tfdArray && typeof tfdArray === "object" && (tfdArray as Record<string, unknown>)["@_UUID"]) {
          return String((tfdArray as Record<string, unknown>)["@_UUID"]);
        }
      }
    }

    throw new Error("No se pudo extraer el UUID del timbre fiscal");
  }

  /**
   * Extrae datos del Comprobante según versión (3.3 o 4.0)
   */
  extractCFDI(parsed: ParsedXMLDocument, version: string): CFDI {
    const comprobante = (parsed["cfdi:Comprobante"] ?? parsed["Comprobante"]) as Record<string, unknown> | undefined;
    if (!comprobante) {
      throw new Error(
        `Estructura de CFDI ${version} no válida: no se encontró Comprobante`
      );
    }

    const uuid = this.extractUUID(comprobante);
    const fecha = this.parseFecha(String(comprobante["@_Fecha"] ?? ""));
    const total = this.getNumberAttr(comprobante, "@_Total", 0);
    const subtotal = this.extractSubtotal(comprobante);
    const impuestos = this.extractImpuestos(comprobante);
    const iva =
      impuestos.ivaAmount > 0 ? impuestos.ivaAmount : total - subtotal;

    const emisor = (comprobante["cfdi:Emisor"] ?? comprobante["Emisor"]) as Record<string, unknown> | undefined;
    if (!emisor) {
      throw new Error(`Estructura de CFDI ${version} no válida: no se encontró Emisor`);
    }
    const rfcEmisor = this.getStringAttr(emisor, "@_Rfc") || this.getStringAttr(emisor, "@_RFC");
    const nombreEmisor = this.getStringAttr(emisor, "@_Nombre");
    const regimenFiscalEmisor = this.extractRegimenFiscal(emisor);

    const receptor = (comprobante["cfdi:Receptor"] ?? comprobante["Receptor"]) as Record<string, unknown> | undefined;
    if (!receptor) {
      throw new Error(`Estructura de CFDI ${version} no válida: no se encontró Receptor`);
    }
    const rfcReceptor = this.getStringAttr(receptor, "@_Rfc") || this.getStringAttr(receptor, "@_RFC");
    const nombreReceptor = this.getStringAttr(receptor, "@_Nombre");
    const regimenFiscalReceptor = this.extractRegimenFiscal(receptor);

    const conceptos = comprobante["cfdi:Conceptos"] ?? comprobante["Conceptos"];
    const concepto = this.extractConceptoPrincipal(conceptos as Record<string, unknown> | undefined);

    return {
      uuid,
      fecha,
      tipo: "PUE",
      total,
      subtotal,
      iva,
      iva_amount: impuestos.ivaAmount,
      retencion_iva_amount: impuestos.retencionIva,
      retencion_isr_amount: impuestos.retencionIsr,
      rfcEmisor,
      nombreEmisor,
      regimenFiscalEmisor,
      rfcReceptor,
      nombreReceptor,
      regimenFiscalReceptor,
      concepto,
      mes: 0,
      año: 0,
    };
  }

  /**
   * Identifica el tipo de CFDI (PUE, PPD, COMPLEMENTO_PAGO)
   */
  identifyType(parsed: ParsedXMLDocument, _version: string): TipoCFDI {
    const comprobante = (parsed["cfdi:Comprobante"] ?? parsed["Comprobante"]) as Record<string, unknown> | undefined;
    if (!comprobante) {
      return "PUE";
    }

    const complementos = comprobante["cfdi:Complemento"] ?? comprobante["Complemento"];
    if (complementos) {
      const complementosObj = complementos as Record<string, unknown>;
      if (complementosObj["pago20:Pagos"] ?? complementosObj["pago10:Pagos"]) {
        return "COMPLEMENTO_PAGO";
      }
    }

    const metodoPago = comprobante["@_MetodoPago"] ?? comprobante["@_MetodoDePago"];
    if (metodoPago === "PPD") {
      return "PPD";
    }

    return "PUE";
  }

  /**
   * Extrae datos del complemento de pago
   */
  extractComplementoPago(parsed: ParsedXMLDocument, _version: string): ComplementoPago {
    const comprobante = (parsed["cfdi:Comprobante"] ?? parsed["Comprobante"]) as Record<string, unknown>;
    const complementos = (comprobante["cfdi:Complemento"] ?? comprobante["Complemento"]) as Record<string, unknown>;

    const pagosNode = complementos["pago20:Pagos"] ?? complementos["pago10:Pagos"];
    if (!pagosNode) {
      throw new Error("No se encontró el nodo de complemento de pago");
    }

    const pagosRaw = (pagosNode as Record<string, unknown>)["pago20:Pago"] ?? (pagosNode as Record<string, unknown>)["pago10:Pago"];
    const pagosArray = Array.isArray(pagosRaw) ? pagosRaw : pagosRaw ? [pagosRaw] : [];
    if (pagosArray.length === 0) {
      throw new Error("No se encontró el nodo Pago en el complemento");
    }

    const pagos: ComplementoPagoItem[] = pagosArray.map((pagoNode: unknown) => {
      const pago = this.ensureObject(pagoNode, "Pago");
      const fechaPago = this.parseFecha(this.getStringAttr(pago, "@_FechaPago"));
      const formaPago =
        this.getStringAttr(pago, "@_FormaDePagoP") || this.getStringAttr(pago, "@_FormaPago");
      const monedaPago = this.getStringAttr(pago, "@_MonedaP") || this.getStringAttr(pago, "@_Moneda");
      const tipoCambio = this.getNumberAttr(pago, "@_TipoCambioP", this.getNumberAttr(pago, "@_TipoCambio", 1));
      const monto = this.getNumberAttr(pago, "@_Monto", 0);
      const numOperacion = this.getStringAttr(pago, "@_NumOperacion") || undefined;

      const doctosRelacionados =
        pago["pago20:DoctoRelacionado"] ?? pago["pago10:DoctoRelacionado"];
      const facturasRelacionadas: FacturaRelacionada[] = [];

      if (doctosRelacionados) {
        const doctosArray = Array.isArray(doctosRelacionados)
          ? doctosRelacionados
          : [doctosRelacionados];

        for (const doctoNode of doctosArray) {
          const docto = this.ensureObject(doctoNode, "DoctoRelacionado");
          const impPagadoSubtotal = resolveImpPagadoSubtotal(pago, docto, doctosArray.length);
          facturasRelacionadas.push({
            uuid: this.getStringAttr(docto, "@_IdDocumento") || this.getStringAttr(docto, "@_UUID"),
            monedaDR: this.getStringAttr(docto, "@_MonedaDR"),
            tipoCambioDR: this.getNumberAttr(docto, "@_TipoCambioDR", 1),
            metodoPagoDR: this.getStringAttr(docto, "@_MetodoDePagoDR"),
            numParcialidad: this.getIntAttr(docto, "@_NumParcialidad", 1),
            impSaldoAnt: this.getNumberAttr(docto, "@_ImpSaldoAnt", 0),
            impPagado: impPagadoSubtotal,
            impSaldoInsoluto: this.getNumberAttr(docto, "@_ImpSaldoInsoluto", 0),
          });
        }
      }

      return {
        fechaPago,
        formaPago,
        monedaPago,
        tipoCambio,
        monto,
        numOperacion,
        facturasRelacionadas,
      };
    });

    return { pagos };
  }

  /**
   * Calcula mes y año desde una fecha (zona horaria México)
   */
  calculateMesYAno(fecha: Date): { mes: number; año: number } {
    const fechaMexico = new Date(
      fecha.toLocaleString("en-US", { timeZone: "America/Mexico_City" })
    );
    return {
      mes: fechaMexico.getMonth() + 1,
      año: fechaMexico.getFullYear(),
    };
  }

  protected parseFecha(fechaString: string | undefined): Date {
    if (!fechaString) {
      throw new Error("Fecha no encontrada en el CFDI");
    }
    const fecha = new Date(fechaString);
    if (Number.isNaN(fecha.getTime())) {
      throw new Error(`Fecha inválida: ${fechaString}`);
    }
    return fecha;
  }

  protected extractRegimenFiscal(emisorReceptor: Record<string, unknown>): string {
    const regimenFiscal =
      emisorReceptor["@_RegimenFiscal"] ??
      emisorReceptor["@_RegimenFiscalReceptor"] ??
      emisorReceptor["@_RegimenFiscalEmisor"];

    if (regimenFiscal) {
      if (Array.isArray(regimenFiscal)) {
        return String(regimenFiscal[0] ?? "");
      }
      return String(regimenFiscal);
    }

    const regimenFiscalNode = emisorReceptor["cfdi:RegimenFiscal"] ?? emisorReceptor["RegimenFiscal"];
    if (regimenFiscalNode && typeof regimenFiscalNode === "object") {
      const node = regimenFiscalNode as Record<string, unknown>;
      if (Array.isArray(node)) {
        return String(node[0]?.["@_Regimen"] ?? "");
      }
      return String(node["@_Regimen"] ?? "");
    }

    return "";
  }

  protected extractConceptoPrincipal(conceptos: Record<string, unknown> | undefined): string {
    if (!conceptos) {
      return "";
    }
    const conceptosArray = conceptos["cfdi:Concepto"] ?? conceptos["Concepto"];
    if (!conceptosArray) {
      return "";
    }
    const concepto = Array.isArray(conceptosArray) ? conceptosArray[0] : conceptosArray;
    const conceptoObj = concepto as Record<string, unknown>;
    return this.getStringAttr(conceptoObj, "@_Descripcion") || this.getStringAttr(conceptoObj, "@_Concepto");
  }

  protected ensureObject(value: unknown, contexto: string): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`Estructura inválida para ${contexto}`);
    }
    return value as Record<string, unknown>;
  }

  protected getStringAttr(obj: Record<string, unknown>, key: string): string {
    const value = obj[key];
    return typeof value === "string" ? value : "";
  }

  protected getNumberAttr(obj: Record<string, unknown>, key: string, fallback: number): number {
    const value = obj[key];
    if (typeof value === "number") {
      return value;
    }
    if (typeof value === "string") {
      const parsed = parseFloat(value);
      return Number.isNaN(parsed) ? fallback : parsed;
    }
    return fallback;
  }

  protected getIntAttr(obj: Record<string, unknown>, key: string, fallback: number): number {
    const value = obj[key];
    if (typeof value === "number") {
      return Math.trunc(value);
    }
    if (typeof value === "string") {
      const parsed = parseInt(value, 10);
      return Number.isNaN(parsed) ? fallback : parsed;
    }
    return fallback;
  }
}

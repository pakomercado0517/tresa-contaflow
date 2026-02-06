import type { PayrollData, PayrollReceptorData } from "../types/parser.types.js";
import { parseXML, extractUUID } from "./base.parser.js";

type Document = Record<string, unknown>;

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
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}

/**
 * Obtiene el nodo nomina12:Nomina desde el Complemento del CFDI.
 * El complemento puede ser un objeto con varias claves o un array de nodos.
 */
function getComplementoNomina(xml: Document): Record<string, unknown> | null {
  const comprobante = getComprobante(xml);
  if (!comprobante) return null;

  const complementos = comprobante["cfdi:Complemento"] ?? comprobante["Complemento"];
  if (!complementos) return null;

  const complementosObj = complementos as Record<string, unknown>;
  const nomina = complementosObj["nomina12:Nomina"] ?? complementosObj["Nomina"];
  if (nomina && typeof nomina === "object" && !Array.isArray(nomina)) {
    return nomina as Record<string, unknown>;
  }

  if (Array.isArray(complementos)) {
    for (const comp of complementos) {
      const compObj = comp as Record<string, unknown>;
      const n = compObj["nomina12:Nomina"] ?? compObj["Nomina"];
      if (n && typeof n === "object" && !Array.isArray(n)) {
        return n as Record<string, unknown>;
      }
    }
  }
  return null;
}

/**
 * Extrae los datos del empleado (receptor): nombre y RFC del Comprobante,
 * CURP y NSS del complemento nomina12:Receptor si existen.
 */
function extractReceptorData(
  comprobante: Record<string, unknown>,
  nomina: Record<string, unknown> | null
): PayrollReceptorData {
  const receptorCfdi = (comprobante["cfdi:Receptor"] ?? comprobante["Receptor"]) as
    | Record<string, unknown>
    | undefined;
  const nombre = receptorCfdi
    ? getStringAttr(receptorCfdi, "@_Nombre") || getStringAttr(receptorCfdi, "@_nombre")
    : "";
  const rfc =
    receptorCfdi
      ? getStringAttr(receptorCfdi, "@_Rfc") ||
        getStringAttr(receptorCfdi, "@_RFC") ||
        getStringAttr(receptorCfdi, "@_rfc")
      : "";

  let curp: string | null = null;
  let nss: string | null = null;
  if (nomina) {
    const receptorNomina = (nomina["nomina12:Receptor"] ?? nomina["Receptor"]) as
      | Record<string, unknown>
      | undefined;
    if (receptorNomina) {
      const curpVal =
        getStringAttr(receptorNomina, "@_Curp") || getStringAttr(receptorNomina, "@_CURP");
      const nssVal =
        getStringAttr(receptorNomina, "@_NumSeguridadSocial") ||
        getStringAttr(receptorNomina, "@_NSS");
      curp = curpVal || null;
      nss = nssVal || null;
    }
  }

  return { nombre, rfc, curp, nss };
}

/**
 * Parsea un buffer XML de CFDI de nómina y retorna PayrollData.
 * Requiere que el comprobante tenga el complemento nomina12:Nomina.
 *
 * @param xmlBuffer - Buffer con el contenido XML del CFDI de nómina
 * @returns PayrollData con UUID, fecha de pago, totales y datos del empleado
 * @throws Error si el XML no es válido, no tiene Comprobante o carece del complemento de nómina
 */
export function parsePayroll(xmlBuffer: Buffer): PayrollData {
  const xml = parseXML(xmlBuffer);

  const comprobante = getComprobante(xml);
  if (!comprobante) {
    throw new Error("El XML no contiene un Comprobante CFDI válido");
  }

  const uuid = extractUUID(xml);

  const nomina = getComplementoNomina(xml);
  if (!nomina) {
    throw new Error("XML sin complemento de nómina: no se encontró nomina12:Nomina");
  }

  const percepciones_total = getNumberAttr(nomina, "@_TotalPercepciones", 0);
  const deducciones_total = getNumberAttr(nomina, "@_TotalDeducciones", 0);
  const otros_pagos_total = getNumberAttr(nomina, "@_TotalOtrosPagos", 0);
  const neto_pagado = percepciones_total - deducciones_total + otros_pagos_total;

  const fechaPagoStr =
    getStringAttr(nomina, "@_FechaPago") || getStringAttr(nomina, "@_fechaPago");
  if (!fechaPagoStr) {
    throw new Error("El complemento de nómina no contiene FechaPago");
  }
  const fecha_pago = new Date(fechaPagoStr);
  if (Number.isNaN(fecha_pago.getTime())) {
    throw new Error(`Fecha de pago inválida en el complemento de nómina: ${fechaPagoStr}`);
  }

  const receptor = extractReceptorData(comprobante, nomina);

  const payrollData: PayrollData = {
    uuid,
    fecha_pago,
    percepciones_total,
    deducciones_total,
    otros_pagos_total,
    neto_pagado,
    receptor,
  };

  return payrollData;
}

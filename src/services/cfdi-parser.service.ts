import { XMLParser } from "fast-xml-parser";
import type { CFDI, ComplementoPago, FacturaRelacionada, Pago, TipoCFDI } from "../types/cfdi.types.js";

/**
 * Servicio para parsear archivos XML CFDI (México)
 * Soporta versiones CFDI 3.3 y 4.0
 */
export class CFDIParserService {
  private parser: XMLParser;

  constructor() {
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      textNodeName: "#text",
      parseAttributeValue: true,
      parseTagValue: true,
      trimValues: true,
    });
  }

  /**
   * Parsea un archivo XML CFDI y retorna los datos estructurados
   */
  async parseXML(xmlString: string): Promise<CFDI> {
    try {
      // Validar que es XML válido
      if (!xmlString || typeof xmlString !== "string") {
        throw new Error("El contenido XML no es válido");
      }

      // Parsear XML
      const parsed = this.parser.parse(xmlString);

      // Detectar versión y estructura
      const version = this.detectVersion(parsed);
      
      // Extraer datos según la versión
      let cfdi: CFDI;
      if (version === "4.0") {
        cfdi = this.extractCFDI40(parsed);
      } else {
        cfdi = this.extractCFDI33(parsed);
      }

      // Identificar tipo (PUE, PPD, COMPLEMENTO_PAGO)
      cfdi.tipo = this.identifyType(parsed, version);
      cfdi.version = version;

      // Extraer complemento de pago si aplica
      if (cfdi.tipo === "COMPLEMENTO_PAGO") {
        cfdi.complementoPago = this.extractComplementoPago(parsed, version);
      }

      // Calcular mes y año
      const { mes, año } = this.calculateMesYAno(cfdi.fecha);
      cfdi.mes = mes;
      cfdi.año = año;

      return cfdi;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Error al parsear XML CFDI: ${error.message}`);
      }
      throw new Error("Error desconocido al parsear XML CFDI");
    }
  }

  /**
   * Detecta la versión del CFDI
   */
  private detectVersion(parsed: any): string {
    // CFDI 4.0 tiene namespace diferente
    if (parsed["cfdi:Comprobante"]) {
      return "4.0";
    }
    if (parsed["Comprobante"]) {
      // Puede ser 3.3 o 4.0, verificar atributo Version
      const comprobante = parsed["Comprobante"] || parsed["cfdi:Comprobante"];
      const version = comprobante["@_Version"] || comprobante["@_version"];
      if (version === "4.0") {
        return "4.0";
      }
      return "3.3";
    }
    throw new Error("No se pudo detectar la versión del CFDI");
  }

  /**
   * Extrae datos de CFDI 3.3
   */
  private extractCFDI33(parsed: any): CFDI {
    const comprobante = parsed["Comprobante"] || parsed["cfdi:Comprobante"];
    if (!comprobante) {
      throw new Error("Estructura de CFDI 3.3 no válida: no se encontró Comprobante");
    }

    // Extraer datos básicos
    const uuid = this.extractUUID(comprobante);
    const fecha = this.parseFecha(comprobante["@_Fecha"]);
    const total = parseFloat(comprobante["@_Total"] || "0");
    const subtotal = parseFloat(comprobante["@_SubTotal"] || "0");
    const iva = total - subtotal;

    // Extraer Emisor
    const emisor = comprobante["cfdi:Emisor"] || comprobante["Emisor"];
    if (!emisor) {
      throw new Error("Estructura de CFDI 3.3 no válida: no se encontró Emisor");
    }
    const rfcEmisor = emisor["@_Rfc"] || emisor["@_RFC"];
    const nombreEmisor = emisor["@_Nombre"] || "";
    const regimenFiscalEmisor = this.extractRegimenFiscal(emisor);

    // Extraer Receptor
    const receptor = comprobante["cfdi:Receptor"] || comprobante["Receptor"];
    if (!receptor) {
      throw new Error("Estructura de CFDI 3.3 no válida: no se encontró Receptor");
    }
    const rfcReceptor = receptor["@_Rfc"] || receptor["@_RFC"];
    const nombreReceptor = receptor["@_Nombre"] || "";
    const regimenFiscalReceptor = this.extractRegimenFiscal(receptor);

    // Extraer concepto principal
    const conceptos = comprobante["cfdi:Conceptos"] || comprobante["Conceptos"];
    const concepto = this.extractConceptoPrincipal(conceptos);

    return {
      uuid,
      fecha,
      tipo: "PUE", // Se actualizará después
      total,
      subtotal,
      iva,
      rfcEmisor,
      nombreEmisor,
      regimenFiscalEmisor,
      rfcReceptor,
      nombreReceptor,
      regimenFiscalReceptor,
      concepto,
      mes: 0, // Se calculará después
      año: 0, // Se calculará después
    };
  }

  /**
   * Extrae datos de CFDI 4.0
   */
  private extractCFDI40(parsed: any): CFDI {
    const comprobante = parsed["cfdi:Comprobante"] || parsed["Comprobante"];
    if (!comprobante) {
      throw new Error("Estructura de CFDI 4.0 no válida: no se encontró Comprobante");
    }

    // Extraer datos básicos
    const uuid = this.extractUUID(comprobante);
    const fecha = this.parseFecha(comprobante["@_Fecha"]);
    const total = parseFloat(comprobante["@_Total"] || "0");
    const subtotal = parseFloat(comprobante["@_SubTotal"] || "0");
    const iva = total - subtotal;

    // Extraer Emisor
    const emisor = comprobante["cfdi:Emisor"] || comprobante["Emisor"];
    if (!emisor) {
      throw new Error("Estructura de CFDI 4.0 no válida: no se encontró Emisor");
    }
    const rfcEmisor = emisor["@_Rfc"] || emisor["@_RFC"];
    const nombreEmisor = emisor["@_Nombre"] || "";
    const regimenFiscalEmisor = this.extractRegimenFiscal(emisor);

    // Extraer Receptor
    const receptor = comprobante["cfdi:Receptor"] || comprobante["Receptor"];
    if (!receptor) {
      throw new Error("Estructura de CFDI 4.0 no válida: no se encontró Receptor");
    }
    const rfcReceptor = receptor["@_Rfc"] || receptor["@_RFC"];
    const nombreReceptor = receptor["@_Nombre"] || "";
    const regimenFiscalReceptor = this.extractRegimenFiscal(receptor);

    // Extraer concepto principal
    const conceptos = comprobante["cfdi:Conceptos"] || comprobante["Conceptos"];
    const concepto = this.extractConceptoPrincipal(conceptos);

    return {
      uuid,
      fecha,
      tipo: "PUE", // Se actualizará después
      total,
      subtotal,
      iva,
      rfcEmisor,
      nombreEmisor,
      regimenFiscalEmisor,
      rfcReceptor,
      nombreReceptor,
      regimenFiscalReceptor,
      concepto,
      mes: 0, // Se calculará después
      año: 0, // Se calculará después
    };
  }

  /**
   * Extrae el UUID del timbre fiscal
   */
  private extractUUID(comprobante: any): string {
    // El UUID está en el complemento TimbreFiscalDigital
    const complementos = comprobante["cfdi:Complemento"] || comprobante["Complemento"];
    if (!complementos) {
      throw new Error("No se encontró el complemento TimbreFiscalDigital");
    }

    // Buscar en diferentes estructuras posibles
    const tfd = 
      complementos["tfd:TimbreFiscalDigital"] ||
      complementos["TimbreFiscalDigital"] ||
      complementos["tfd:TimbreFiscalDigital"];

    if (tfd && tfd["@_UUID"]) {
      return tfd["@_UUID"];
    }

    // Intentar buscar en array
    if (Array.isArray(complementos)) {
      for (const comp of complementos) {
        const tfdArray = comp["tfd:TimbreFiscalDigital"] || comp["TimbreFiscalDigital"];
        if (tfdArray && tfdArray["@_UUID"]) {
          return tfdArray["@_UUID"];
        }
      }
    }

    throw new Error("No se pudo extraer el UUID del timbre fiscal");
  }

  /**
   * Extrae el régimen fiscal del emisor o receptor
   */
  private extractRegimenFiscal(emisorReceptor: any): string {
    // Puede estar en @_RegimenFiscalReceptor/@_RegimenFiscal o en un array
    const regimenFiscal = 
      emisorReceptor["@_RegimenFiscal"] || 
      emisorReceptor["@_RegimenFiscalReceptor"] ||
      emisorReceptor["@_RegimenFiscalEmisor"];

    if (regimenFiscal) {
      // Si es un array, tomar el primero
      if (Array.isArray(regimenFiscal)) {
        return regimenFiscal[0];
      }
      return String(regimenFiscal);
    }

    // Buscar en estructura más compleja
    const regimenFiscalNode = emisorReceptor["cfdi:RegimenFiscal"] || emisorReceptor["RegimenFiscal"];
    if (regimenFiscalNode) {
      if (Array.isArray(regimenFiscalNode)) {
        return regimenFiscalNode[0]?.["@_Regimen"] || "";
      }
      return regimenFiscalNode["@_Regimen"] || "";
    }

    return "";
  }

  /**
   * Extrae el concepto principal
   */
  private extractConceptoPrincipal(conceptos: any): string {
    if (!conceptos) {
      return "";
    }

    const conceptosArray = conceptos["cfdi:Concepto"] || conceptos["Concepto"];
    if (!conceptosArray) {
      return "";
    }

    const concepto = Array.isArray(conceptosArray) ? conceptosArray[0] : conceptosArray;
    return concepto["@_Descripcion"] || concepto["@_Concepto"] || "";
  }

  /**
   * Identifica el tipo de CFDI (PUE, PPD, COMPLEMENTO_PAGO)
   */
  private identifyType(parsed: any, version: string): TipoCFDI {
    const comprobante = parsed["cfdi:Comprobante"] || parsed["Comprobante"];
    
    // Verificar si es complemento de pago
    const complementos = comprobante["cfdi:Complemento"] || comprobante["Complemento"];
    if (complementos) {
      const pago20 = complementos["pago20:Pagos"] || complementos["pago10:Pagos"];
      if (pago20) {
        return "COMPLEMENTO_PAGO";
      }
    }

    // Verificar método de pago
    const metodoPago = comprobante["@_MetodoPago"] || comprobante["@_MetodoDePago"];
    if (metodoPago === "PPD") {
      return "PPD";
    }

    return "PUE";
  }

  /**
   * Extrae datos del complemento de pago
   */
  private extractComplementoPago(parsed: any, version: string): ComplementoPago {
    const comprobante = parsed["cfdi:Comprobante"] || parsed["Comprobante"];
    const complementos = comprobante["cfdi:Complemento"] || comprobante["Complemento"];
    
    const pagosNode = complementos["pago20:Pagos"] || complementos["pago10:Pagos"];
    if (!pagosNode) {
      throw new Error("No se encontró el nodo de complemento de pago");
    }

    const pago = pagosNode["pago20:Pago"] || pagosNode["pago10:Pago"];
    if (!pago) {
      throw new Error("No se encontró el nodo Pago en el complemento");
    }

    const fechaPago = this.parseFecha(pago["@_FechaPago"]);
    const formaPago = pago["@_FormaDePagoP"] || pago["@_FormaPago"] || "";
    const monedaPago = pago["@_MonedaP"] || pago["@_Moneda"] || "";
    const tipoCambio = parseFloat(pago["@_TipoCambioP"] || pago["@_TipoCambio"] || "1");
    const monto = parseFloat(pago["@_Monto"] || "0");
    const numOperacion = pago["@_NumOperacion"] || undefined;

    // Extraer facturas relacionadas
    const doctosRelacionados = pago["pago20:DoctoRelacionado"] || pago["pago10:DoctoRelacionado"];
    const facturasRelacionadas: FacturaRelacionada[] = [];

    if (doctosRelacionados) {
      const doctosArray = Array.isArray(doctosRelacionados) ? doctosRelacionados : [doctosRelacionados];
      
      for (const docto of doctosArray) {
        facturasRelacionadas.push({
          uuid: docto["@_IdDocumento"] || docto["@_UUID"],
          monedaDR: docto["@_MonedaDR"] || "",
          tipoCambioDR: parseFloat(docto["@_TipoCambioDR"] || "1"),
          metodoPagoDR: docto["@_MetodoDePagoDR"] || "",
          numParcialidad: parseInt(docto["@_NumParcialidad"] || "1"),
          impSaldoAnt: parseFloat(docto["@_ImpSaldoAnt"] || "0"),
          impPagado: parseFloat(docto["@_ImpPagado"] || "0"),
          impSaldoInsoluto: parseFloat(docto["@_ImpSaldoInsoluto"] || "0"),
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
  }

  /**
   * Parsea una fecha del formato CFDI a Date
   */
  private parseFecha(fechaString: string | undefined): Date {
    if (!fechaString) {
      throw new Error("Fecha no encontrada en el CFDI");
    }

    // Formato CFDI: YYYY-MM-DDTHH:mm:ss o YYYY-MM-DDTHH:mm:ssZ
    const fecha = new Date(fechaString);
    if (isNaN(fecha.getTime())) {
      throw new Error(`Fecha inválida: ${fechaString}`);
    }

    return fecha;
  }

  /**
   * Calcula mes y año desde una fecha (zona horaria México)
   */
  private calculateMesYAno(fecha: Date): { mes: number; año: number } {
    // Convertir a zona horaria de México
    const fechaMexico = new Date(fecha.toLocaleString("en-US", { timeZone: "America/Mexico_City" }));
    
    return {
      mes: fechaMexico.getMonth() + 1, // getMonth() retorna 0-11
      año: fechaMexico.getFullYear(),
    };
  }
}


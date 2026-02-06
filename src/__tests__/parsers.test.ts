import { describe, it, expect } from "vitest";
import { parseInvoice, parseExpense, parseXML, validateCFDI, extractSubtotal, extractIVA, extractRetenciones } from "../parsers/index.js";

const MINIMAL_CFDI_PUE = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0" Serie="A" Folio="123" Fecha="2024-01-15T12:00:00" SubTotal="1000.00" Moneda="MXN" Total="1160.00" TipoDeComprobante="I" MetodoPago="PUE" LugarExpedicion="06100">
  <cfdi:Emisor Rfc="AAA010101AAA" Nombre="Emisor SA" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="BBB020202BBB" Nombre="Receptor SA" RegimenFiscal="601" UsoCFDI="G03"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="84111506" Cantidad="1" ClaveUnidad="E48" Descripcion="Servicio de pruebas" ValorUnitario="1000.00" Importe="1000.00"/>
  </cfdi:Conceptos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="1.1" UUID="AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE" FechaTimbrado="2024-01-15T12:05:00" RfcProvCertif="AAA010101AAA" SelloCFD="xxx" NoCertificadoSAT="12345678" SelloSAT="yyy"/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;

const MINIMAL_CFDI_PPD = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0" Serie="A" Folio="456" Fecha="2024-01-20T10:00:00" SubTotal="500.00" Moneda="MXN" Total="580.00" TipoDeComprobante="I" MetodoPago="PPD" LugarExpedicion="06100">
  <cfdi:Emisor Rfc="XXX030303XXX" Nombre="Proveedor SA" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="YYY040404YYY" Nombre="Cliente SA" RegimenFiscal="601" UsoCFDI="G03"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="84111506" Cantidad="1" ClaveUnidad="E48" Descripcion="Servicio PPD" ValorUnitario="500.00" Importe="500.00"/>
  </cfdi:Conceptos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="1.1" UUID="11111111-2222-3333-4444-555555555555" FechaTimbrado="2024-01-20T10:05:00" RfcProvCertif="AAA010101AAA" SelloCFD="xxx" NoCertificadoSAT="12345678" SelloSAT="yyy"/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;

describe("Parsers", () => {
  describe("parseXML", () => {
    it("debe parsear un buffer XML a Document", () => {
      const doc = parseXML(Buffer.from(MINIMAL_CFDI_PUE, "utf-8"));
      expect(doc).toBeDefined();
      expect(doc["cfdi:Comprobante"]).toBeDefined();
    });
  });

  describe("validateCFDI", () => {
    it("debe validar estructura CFDI correcta", () => {
      const doc = parseXML(Buffer.from(MINIMAL_CFDI_PUE, "utf-8"));
      expect(validateCFDI(doc)).toBe(true);
    });

    it("debe rechazar XML inválido", () => {
      const doc = parseXML(Buffer.from("<root><other/></root>", "utf-8"));
      expect(validateCFDI(doc)).toBe(false);
    });
  });

  describe("extractSubtotal", () => {
    it("debe extraer el subtotal del Comprobante", () => {
      const doc = parseXML(Buffer.from(MINIMAL_CFDI_PUE, "utf-8"));
      expect(extractSubtotal(doc)).toBe(1000);
    });
  });

  describe("extractIVA", () => {
    it("debe extraer IVA (0 cuando no hay Impuestos)", () => {
      const doc = parseXML(Buffer.from(MINIMAL_CFDI_PUE, "utf-8"));
      expect(extractIVA(doc)).toBe(0);
    });
  });

  describe("extractRetenciones", () => {
    it("debe extraer retenciones (0 cuando no hay)", () => {
      const doc = parseXML(Buffer.from(MINIMAL_CFDI_PUE, "utf-8"));
      const ret = extractRetenciones(doc);
      expect(ret).toEqual({ iva: 0, isr: 0 });
    });
  });

  describe("parseInvoice", () => {
    it("debe parsear XML de factura y retornar InvoiceData", () => {
      const result = parseInvoice(Buffer.from(MINIMAL_CFDI_PUE, "utf-8"));
      expect(result.uuid).toBe("AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE");
      expect(result.rfcEmisor).toBe("AAA010101AAA");
      expect(result.rfcReceptor).toBe("BBB020202BBB");
      expect(result.concepto).toBe("Servicio de pruebas");
      expect(result.tipo).toBe("PUE");
      expect(result.subtotal).toBe(1000);
      expect(result.total).toBe(1160);
      expect(result.mes).toBeGreaterThanOrEqual(1);
      expect(result.mes).toBeLessThanOrEqual(12);
      expect(result.año).toBe(2024);
    });

    it("debe lanzar error con XML inválido", () => {
      expect(() => parseInvoice(Buffer.from("<invalid/>", "utf-8"))).toThrow();
    });
  });

  describe("parseExpense", () => {
    it("debe parsear PUE con is_paid true y payment_date", () => {
      const result = parseExpense(Buffer.from(MINIMAL_CFDI_PUE, "utf-8"));
      expect(result.is_paid).toBe(true);
      expect(result.payment_date).toBeInstanceOf(Date);
      expect(result.tipo_origen).toBe("XML");
      expect(result.uuid).toBe("AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE");
    });

    it("debe parsear PPD con is_paid false y payment_date null", () => {
      const result = parseExpense(Buffer.from(MINIMAL_CFDI_PPD, "utf-8"));
      expect(result.is_paid).toBe(false);
      expect(result.payment_date).toBeNull();
      expect(result.tipo_origen).toBe("XML");
      expect(result.uuid).toBe("11111111-2222-3333-4444-555555555555");
    });
  });
});

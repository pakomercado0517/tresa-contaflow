import { describe, it, expect } from "vitest";
import {
  parseInvoice,
  parseExpense,
  parsePayroll,
  parseXML,
  validateCFDI,
  extractSubtotal,
  extractIVA,
  extractRetenciones,
  extractComplementoPago,
} from "../parsers/index.js";
import { readFileSync } from "fs";
import { join } from "path";

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

const COMPLEMENTO_PAGO_CON_BASEDR = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:pago20="http://www.sat.gob.mx/Pagos20" Version="4.0" TipoDeComprobante="P" SubTotal="0" Total="0" Moneda="XXX" Fecha="2025-12-30T17:02:11">
  <cfdi:Emisor Rfc="AAA010101AAA" Nombre="Emisor SA" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="BBB020202BBB" Nombre="Receptor SA" RegimenFiscalReceptor="601" UsoCFDI="CP01" DomicilioFiscalReceptor="06100"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="84111506" Cantidad="1" ClaveUnidad="ACT" Descripcion="Pago" ObjetoImp="01" ValorUnitario="0" Importe="0"/>
  </cfdi:Conceptos>
  <cfdi:Complemento>
    <pago20:Pagos Version="2.0">
      <pago20:Pago FechaPago="2025-12-30T17:00:45" FormaDePagoP="03" MonedaP="MXN" TipoCambioP="1" Monto="420000.01">
        <pago20:DoctoRelacionado IdDocumento="436FFCB4-5C45-44B1-B35D-6025F1BEF01A" MonedaDR="MXN" EquivalenciaDR="1" NumParcialidad="1" ImpSaldoAnt="420000.01" ImpPagado="420000.01" ImpSaldoInsoluto="0.00" ObjetoImpDR="02">
          <pago20:ImpuestosDR>
            <pago20:TrasladosDR>
              <pago20:TrasladoDR BaseDR="362068.974138" ImpuestoDR="002" TipoFactorDR="Tasa" TasaOCuotaDR="0.160000" ImporteDR="57931.035862"/>
            </pago20:TrasladosDR>
          </pago20:ImpuestosDR>
        </pago20:DoctoRelacionado>
      </pago20:Pago>
    </pago20:Pagos>
    <tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="1.1" UUID="176775A9-BD1E-43C0-B3DA-487631FB9DF5" FechaTimbrado="2025-12-30T17:02:12" RfcProvCertif="AAA010101AAA" SelloCFD="xxx" NoCertificadoSAT="12345678" SelloSAT="yyy"/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;

const COMPLEMENTO_PAGO_CON_BASEP = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:pago20="http://www.sat.gob.mx/Pagos20" Version="4.0" TipoDeComprobante="P" SubTotal="0" Total="0" Moneda="XXX" Fecha="2025-12-30T17:02:11">
  <cfdi:Emisor Rfc="AAA010101AAA" Nombre="Emisor SA" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="BBB020202BBB" Nombre="Receptor SA" RegimenFiscalReceptor="601" UsoCFDI="CP01" DomicilioFiscalReceptor="06100"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="84111506" Cantidad="1" ClaveUnidad="ACT" Descripcion="Pago" ObjetoImp="01" ValorUnitario="0" Importe="0"/>
  </cfdi:Conceptos>
  <cfdi:Complemento>
    <pago20:Pagos Version="2.0">
      <pago20:Pago FechaPago="2025-12-30T17:00:45" FormaDePagoP="03" MonedaP="MXN" TipoCambioP="1" Monto="580.00">
        <pago20:DoctoRelacionado IdDocumento="11111111-2222-3333-4444-555555555555" MonedaDR="MXN" EquivalenciaDR="1" NumParcialidad="1" ImpSaldoAnt="580.00" ImpPagado="580.00" ImpSaldoInsoluto="0.00" ObjetoImpDR="02"/>
        <pago20:ImpuestosP>
          <pago20:TrasladosP>
            <pago20:TrasladoP BaseP="500.00" ImpuestoP="002" TipoFactorP="Tasa" TasaOCuotaP="0.160000" ImporteP="80.00"/>
          </pago20:TrasladosP>
        </pago20:ImpuestosP>
      </pago20:Pago>
    </pago20:Pagos>
    <tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="1.1" UUID="276775A9-BD1E-43C0-B3DA-487631FB9DF5" FechaTimbrado="2025-12-30T17:02:12" RfcProvCertif="AAA010101AAA" SelloCFD="xxx" NoCertificadoSAT="12345678" SelloSAT="yyy"/>
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

    it("debe extraer retenciones ISR e IVA de factura real", () => {
      const fixturesDir = join(__dirname, "fixtures", "cfdi");
      const xml = readFileSync(join(fixturesDir, "factura-con-retenciones.xml"), "utf-8");
      const ret = extractRetenciones(parseXML(Buffer.from(xml, "utf-8")));
      // ISR: 2645.88, IVA: 2822.25
      expect(ret.isr).toBeCloseTo(2645.88, 2);
      expect(ret.iva).toBeCloseTo(2822.25, 2);
    });
  });

  describe("extractComplementoPago", () => {
    it("usa BaseDR como subtotal de impPagado cuando existe", () => {
      const doc = parseXML(Buffer.from(COMPLEMENTO_PAGO_CON_BASEDR, "utf-8"));
      const complemento = extractComplementoPago(doc);
      const facturaRelacionada = complemento.pagos[0]?.facturasRelacionadas[0];
      expect(facturaRelacionada).toBeDefined();
      expect(facturaRelacionada?.impPagado).toBeCloseTo(362068.974138, 6);
    });

    it("usa BaseP como fallback cuando no existe BaseDR y hay un solo DoctoRelacionado", () => {
      const doc = parseXML(Buffer.from(COMPLEMENTO_PAGO_CON_BASEP, "utf-8"));
      const complemento = extractComplementoPago(doc);
      const facturaRelacionada = complemento.pagos[0]?.facturasRelacionadas[0];
      expect(facturaRelacionada).toBeDefined();
      expect(facturaRelacionada?.impPagado).toBe(500);
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

  describe("parsePayroll", () => {
    it("debe parsear XML de nómina y retornar PayrollData", () => {
      const fixturesDir = join(__dirname, "fixtures", "nomina");
      const xml = readFileSync(join(fixturesDir, "nomina-minimal.xml"), "utf-8");
      const result = parsePayroll(Buffer.from(xml, "utf-8"));

      expect(result.uuid).toBe("a1b2c3d4-e5f6-7890-abcd-ef1234567890");
      expect(result.percepciones_total).toBe(10000);
      expect(result.deducciones_total).toBe(1500);
      expect(result.otros_pagos_total).toBe(0);
      expect(result.neto_pagado).toBe(8500);
      expect(result.fecha_pago).toBeInstanceOf(Date);
      expect(result.fecha_pago.getUTCFullYear()).toBe(2025);
      expect(result.fecha_pago.getUTCMonth()).toBe(0);
      expect(result.fecha_pago.getUTCDate()).toBe(15);
      expect(result.receptor.nombre).toBe("Hector Gonzalez Garcia");
      expect(result.receptor.rfc).toBe("HEGG800101ABC");
      expect(result.receptor.curp).toBe("HEGG800101HDFRRC01");
      expect(result.receptor.nss).toBe("12345678901");
    });

    it("debe calcular neto como percepciones - deducciones + otros_pagos", () => {
      const fixturesDir = join(__dirname, "fixtures", "nomina");
      const xml = readFileSync(join(fixturesDir, "nomina-otros-pagos.xml"), "utf-8");
      const result = parsePayroll(Buffer.from(xml, "utf-8"));

      expect(result.percepciones_total).toBe(9000);
      expect(result.deducciones_total).toBe(800);
      expect(result.otros_pagos_total).toBe(1000);
      expect(result.neto_pagado).toBe(9200);
    });

    it("debe lanzar error si el XML no tiene complemento de nómina", () => {
      expect(() => parsePayroll(Buffer.from(MINIMAL_CFDI_PUE, "utf-8"))).toThrow(
        "XML sin complemento de nómina"
      );
    });

    it("debe lanzar error si el XML no contiene Comprobante", () => {
      expect(() => parsePayroll(Buffer.from("<root><other/></root>", "utf-8"))).toThrow(
        "Comprobante CFDI válido"
      );
    });
  });
});

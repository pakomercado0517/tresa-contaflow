import request from "supertest";
import app from "../server";
import { cleanDatabase, closeDatabase } from "./helpers/test-db";
import { createTestUser, generateTestTokens, expectSuccess, expectError } from "./helpers/test-helpers";
import { Profile, Invoice, PaymentComplement, ProfilePaymentComplement, PaymentComplementItem } from "../database/models/index";
import { readFileSync } from "fs";
import { join } from "path";

describe("Invoices API", () => {
  let accessToken: string;
  let userId: string;
  let profileId: string;

  beforeAll(async () => {
    await cleanDatabase();
    const user = await createTestUser("invoices@example.com");
    userId = user.id;
    const tokens = generateTestTokens(userId, "invoices@example.com");
    accessToken = tokens.accessToken;

    // Crear perfil para las pruebas
    const profile = await Profile.create({
      user_id: userId,
      nombre: "Empresa de Prueba",
      rfc: "EPR123456ABC",
      tipo_persona: "MORAL",
      regimenes_fiscales: ["601"],
    });
    profileId = profile.id;
  });

  afterAll(async () => {
    await cleanDatabase();
    await closeDatabase();
  });

  describe("GET /api/invoices", () => {
    it("debe listar facturas del usuario", async () => {
      const response = await request(app)
        .get(`/api/invoices?profileId=${profileId}`)
        .set("Authorization", `Bearer ${accessToken}`);

      expectSuccess(response, 200);
      expect(response.body).toHaveProperty("data");
      expect(response.body).toHaveProperty("pagination");
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it("debe rechazar acceso sin token", async () => {
      const response = await request(app)
        .get(`/api/invoices?profileId=${profileId}`);

      expectError(response, 401);
    });
  });

  describe("GET /api/invoices/metrics", () => {
    let ppdInvoiceUuid: string;

    beforeEach(async () => {
      // Limpiar facturas previas
      await Invoice.destroy({ where: { profile_id: profileId } });
      await PaymentComplementItem.destroy({ where: { profile_id: profileId } });
      await ProfilePaymentComplement.destroy({ where: { profile_id: profileId } });
      await PaymentComplement.destroy({ where: {} });
      
      // Crear algunas facturas de prueba
      await Invoice.create({
        profile_id: profileId,
        uuid: `TEST-${Date.now()}-1`,
        fecha: new Date("2024-12-01"),
        mes: 12,
        año: 2024,
        total: 1000.0,
        subtotal: 862.07,
        iva: 137.93,
        tipo: "PUE",
        rfc_emisor: "EPR123456ABC",
        nombre_emisor: "Empresa de Prueba",
        rfc_receptor: "CLI123456XYZ",
        nombre_receptor: "Cliente",
        pagos: [],
        validacion: {},
      });

      await Invoice.create({
        profile_id: profileId,
        uuid: `TEST-${Date.now()}-2`,
        fecha: new Date("2024-12-15"),
        mes: 12,
        año: 2024,
        total: 2000.0,
        subtotal: 1724.14,
        iva: 275.86,
        tipo: "PPD",
        rfc_emisor: "EPR123456ABC",
        nombre_emisor: "Empresa de Prueba",
        rfc_receptor: "CLI123456XYZ",
        nombre_receptor: "Cliente",
        pagos: [{ monto: 1000.0, fechaPago: new Date("2024-12-15"), formaPago: "03" }],
        validacion: {},
      });

      const ppdInvoice = await Invoice.findOne({
        where: { profile_id: profileId, tipo: "PPD" },
      });
      ppdInvoiceUuid = ppdInvoice?.uuid ?? "";
    });

    it("debe obtener métricas del dashboard", async () => {
      const response = await request(app)
        .get(`/api/invoices/metrics?profileId=${profileId}&mes=12&año=2024`)
        .set("Authorization", `Bearer ${accessToken}`);

      expectSuccess(response, 200);
      expect(response.body).toHaveProperty("filters");
      expect(response.body).toHaveProperty("metrics");
      expect(response.body.metrics).toHaveProperty("totalFacturado");
      expect(response.body.metrics).toHaveProperty("totalPagado");
      expect(response.body.metrics).toHaveProperty("totalCompras");
      expect(response.body.metrics).toHaveProperty("pendientePagar");
      expect(response.body.metrics.totalFacturado).toBeGreaterThan(0);
    });

    it("debe calcular correctamente total facturado y pagado", async () => {
      const response = await request(app)
        .get(`/api/invoices/metrics?profileId=${profileId}&mes=12&año=2024`)
        .set("Authorization", `Bearer ${accessToken}`);

      expectSuccess(response, 200);
      const { metrics } = response.body;

      // Las métricas usan subtotal (sin IVA): PUE 862.07 + PPD 1724.14 = 2586.21
      expect(metrics.totalFacturado).toBeCloseTo(2586.21, 2);

      // Total pagado: PUE (862.07) + pagos manuales del período (1000 de la PPD)
      expect(metrics.totalPagado).toBeCloseTo(1862.07, 2);

      // Pendiente: PPD con 1000 pagado (manual) = subtotal 1724.14 - 1000 = 724.14
      expect(metrics.pendientePagar).toBeCloseTo(724.14, 2);
    });

    it("debe incluir pagos de complementos por fecha de pago", async () => {
      const complemento = await PaymentComplement.create({
        uuid: `COMP-${Date.now()}`,
        fecha_emision: new Date("2024-12-20"),
        rfc_emisor: "EPR123456ABC",
        rfc_receptor: "CLI123456XYZ",
        complemento_data: { pagos: [] },
      });
      await ProfilePaymentComplement.create({
        profile_id: profileId,
        complement_id: complemento.id,
        role: "INGRESO",
      });

      // Complemento con fecha_pago en diciembre: imp_pagado 500, saldo insoluto 500 (en subtotal)
      await PaymentComplementItem.create({
        complement_id: complemento.id,
        profile_id: profileId,
        factura_uuid: ppdInvoiceUuid,
        fecha_pago: new Date("2024-12-20"),
        forma_pago: "03",
        moneda_pago: "MXN",
        tipo_cambio_pago: 1,
        monto_pago: 500,
        num_operacion: null,
        moneda_dr: "MXN",
        tipo_cambio_dr: 1,
        metodo_pago_dr: "PPD",
        num_parcialidad: 1,
        imp_saldo_ant: 1000,
        imp_pagado: 500,
        imp_saldo_insoluto: 500,
      });

      const response = await request(app)
        .get(`/api/invoices/metrics?profileId=${profileId}&mes=12&año=2024`)
        .set("Authorization", `Bearer ${accessToken}`);

      expectSuccess(response, 200);
      const { metrics } = response.body;

      // totalPagado = PUE (862.07) + manual del PPD (1000) + complemento en período (500) = 2362.07
      expect(metrics.totalPagado).toBeCloseTo(2362.07, 2);
      // pendientePagar = saldo insoluto del último complemento = 500
      expect(metrics.pendientePagar).toBeCloseTo(500, 2);
    });
  });

  describe("GET /api/invoices/:id", () => {
    let invoiceId: string;

    beforeEach(async () => {
      const invoice = await Invoice.create({
        profile_id: profileId,
        uuid: `TEST-${Date.now()}`,
        fecha: new Date(),
        mes: 12,
        año: 2024,
        total: 500.0,
        subtotal: 431.03,
        iva: 68.97,
        tipo: "PUE",
        rfc_emisor: "EPR123456ABC",
        nombre_emisor: "Empresa de Prueba",
        rfc_receptor: "CLI123456XYZ",
        nombre_receptor: "Cliente",
        pagos: [],
        validacion: {},
      });
      invoiceId = invoice.id;
    });

    it("debe obtener una factura específica", async () => {
      const response = await request(app)
        .get(`/api/invoices/${invoiceId}`)
        .set("Authorization", `Bearer ${accessToken}`);

      expectSuccess(response, 200);
      expect(response.body).toHaveProperty("data");
      expect(response.body.data).toHaveProperty("id", invoiceId);
    });

    it("debe rechazar acceso a factura de otro usuario", async () => {
      const otherUser = await createTestUser("other@example.com");
      const otherProfile = await Profile.create({
        user_id: otherUser.id,
        nombre: "Otra Empresa",
        rfc: `OTHER${Date.now()}`,
        tipo_persona: "MORAL",
      });

      const otherInvoice = await Invoice.create({
        profile_id: otherProfile.id,
        uuid: `OTHER-${Date.now()}`,
        fecha: new Date(),
        mes: 12,
        año: 2024,
        total: 100.0,
        subtotal: 86.21,
        iva: 13.79,
        tipo: "PUE",
        rfc_emisor: "OTHER123456",
        nombre_emisor: "Otra Empresa",
        rfc_receptor: "CLI123456XYZ",
        nombre_receptor: "Cliente",
        pagos: [],
        validacion: {},
      });

      const response = await request(app)
        .get(`/api/invoices/${otherInvoice.id}`)
        .set("Authorization", `Bearer ${accessToken}`); // Token del primer usuario

      expectError(response, 404);
    });
  });

  describe("DELETE /api/invoices/:id", () => {
    let invoiceId: string;

    beforeEach(async () => {
      const invoice = await Invoice.create({
        profile_id: profileId,
        uuid: `DELETE-${Date.now()}`,
        fecha: new Date(),
        mes: 12,
        año: 2024,
        total: 300.0,
        subtotal: 258.62,
        iva: 41.38,
        tipo: "PUE",
        rfc_emisor: "EPR123456ABC",
        nombre_emisor: "Empresa de Prueba",
        rfc_receptor: "CLI123456XYZ",
        nombre_receptor: "Cliente",
        pagos: [],
        validacion: {},
      });
      invoiceId = invoice.id;
    });

    it("debe eliminar una factura exitosamente", async () => {
      const response = await request(app)
        .delete(`/api/invoices/${invoiceId}`)
        .set("Authorization", `Bearer ${accessToken}`);

      expectSuccess(response, 200);
      expect(response.body).toHaveProperty("message");

      // Verificar que la factura fue eliminada
      const deletedInvoice = await Invoice.findByPk(invoiceId);
      expect(deletedInvoice).toBeNull();
    });
  });
});


/**
 * Tests E2E de endpoints: manual_incomes, accrued_expenses, payrolls, métricas, ownership.
 */
import { describe, it, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import { readFileSync } from "fs";
import { join } from "path";
import app from "../server";
import { cleanDatabase, closeDatabase } from "./helpers/test-db";
import {
  createTestUser,
  generateTestTokens,
  expectSuccess,
} from "./helpers/test-helpers";
import {
  Profile,
  Period,
  ManualIncome,
  AccruedExpense,
  Payroll,
  Plugin,
  Subscription,
  SubscriptionPlugin,
} from "../database/models/index";

describe("E2E Endpoints", () => {
  let userAToken: string;
  let userAId: string;
  let userAProfileId: string;
  let userAPeriodId: string;

  let userBToken: string;
  let userBId: string;
  let userBProfileId: string;
  let userBPeriodId: string;

  beforeAll(async () => {
    await cleanDatabase();

    const userA = await createTestUser("usera-e2e@example.com");
    userAId = userA.id;
    const tokensA = generateTestTokens(userAId, "usera-e2e@example.com");
    userAToken = tokensA.accessToken;

    const profileA = await Profile.create({
      user_id: userAId,
      nombre: "Perfil A",
      rfc: "EPR123456ABC",
      tipo_persona: "MORAL",
      regimenes_fiscales: ["601"],
      validaciones_habilitadas: {},
    });
    userAProfileId = profileA.id;

    const [pluginPayroll] = await Plugin.findOrCreate({
      where: { name: "payroll" },
      defaults: {
        display_name: "Procesamiento de Nómina",
        description: null,
        is_available: true,
      },
    });
    const subA = await Subscription.create({
      user_id: userAId,
      plan: "BASIC",
      plan_price: 300,
      status: "ACTIVE",
      current_period_start: new Date(),
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      cancel_at_period_end: false,
    });
    await SubscriptionPlugin.create({
      subscription_id: subA.id,
      plugin_id: pluginPayroll.id,
      enabled: true,
    });

    const periodA = await Period.create({
      profile_id: userAProfileId,
      start_date: new Date("2025-01-01"),
      end_date: new Date("2025-01-31"),
      name: "Enero 2025",
    });
    userAPeriodId = periodA.id;

    const userB = await createTestUser("userb-e2e@example.com");
    userBId = userB.id;
    const tokensB = generateTestTokens(userBId, "userb-e2e@example.com");
    userBToken = tokensB.accessToken;

    const profileB = await Profile.create({
      user_id: userBId,
      nombre: "Perfil B",
      rfc: "EPR789012XYZ",
      tipo_persona: "MORAL",
      regimenes_fiscales: ["601"],
    });
    userBProfileId = profileB.id;

    const periodB = await Period.create({
      profile_id: userBProfileId,
      start_date: new Date("2025-01-01"),
      end_date: new Date("2025-01-31"),
      name: "Enero 2025",
    });
    userBPeriodId = periodB.id;
  });

  afterAll(async () => {
    await cleanDatabase();
    await closeDatabase();
  });

  describe("manual_income como pagado → aparece en ingresos cobrados", () => {
    it("al marcar manual_income como pagado, las métricas incluyen ese monto en ingresos cobrados", async () => {
      const createRes = await request(app)
        .post("/api/manual-incomes")
        .set("Authorization", `Bearer ${userAToken}`)
        .send({
          profile_id: userAProfileId,
          period_id: userAPeriodId,
          concept: "Ingreso manual E2E",
          subtotal: 5000,
          iva_amount: 800,
          fecha: "2025-01-15",
        });

      expectSuccess(createRes, 201);
      const incomeId = createRes.body.data.id as string;
      expect(createRes.body.data.is_paid).toBe(false);

      const metricsBefore = await request(app)
        .get(`/api/metrics?mes=1&año=2025&profile_id=${userAProfileId}`)
        .set("Authorization", `Bearer ${userAToken}`);
      expectSuccess(metricsBefore, 200);
      expect(metricsBefore.body.flujo.ingresos_cobrados).toBe(0);

      const updateRes = await request(app)
        .put(`/api/manual-incomes/${incomeId}`)
        .set("Authorization", `Bearer ${userAToken}`)
        .send({
          is_paid: true,
          payment_date: "2025-01-20",
        });
      expectSuccess(updateRes, 200);
      expect(updateRes.body.data.is_paid).toBe(true);

      const metricsAfter = await request(app)
        .get(`/api/metrics?mes=1&año=2025&profile_id=${userAProfileId}`)
        .set("Authorization", `Bearer ${userAToken}`);
      expectSuccess(metricsAfter, 200);
      expect(metricsAfter.body.flujo.ingresos_cobrados).toBe(5000);

      const metricsByPeriod = await request(app)
        .get(`/api/metrics/${userAPeriodId}`)
        .set("Authorization", `Bearer ${userAToken}`);
      expectSuccess(metricsByPeriod, 200);
      expect(metricsByPeriod.body.flujo.ingresos_cobrados).toBe(5000);
    });
  });

  describe("crear accrued_expense manual → aparece en egresos devengados", () => {
    it("al crear un gasto devengado manual, aparece en listado y en métricas de egresos devengados", async () => {
      const createRes = await request(app)
        .post("/api/accrued-expenses")
        .set("Authorization", `Bearer ${userAToken}`)
        .send({
          profile_id: userAProfileId,
          period_id: userAPeriodId,
          concept: "Gasto devengado E2E",
          subtotal: 3000,
          iva_amount: 480,
          fecha: "2025-01-10",
          type: "manual",
          categoria: "Servicios",
        });

      expectSuccess(createRes, 201);
      const expenseId = createRes.body.data.id as string;
      expect(createRes.body.data.tipo_origen).toBe("MANUAL");
      expect(Number(createRes.body.data.subtotal)).toBe(3000);

      const listRes = await request(app)
        .get(`/api/accrued-expenses?period_id=${userAPeriodId}&type=manual`)
        .set("Authorization", `Bearer ${userAToken}`);
      expectSuccess(listRes, 200);
      const found = listRes.body.data.find((e: { id: string }) => e.id === expenseId);
      expect(found).toBeDefined();
      expect(Number(found.subtotal)).toBe(3000);

      const metricsRes = await request(app)
        .get(`/api/metrics/${userAPeriodId}`)
        .set("Authorization", `Bearer ${userAToken}`);
      expectSuccess(metricsRes, 200);
      expect(metricsRes.body.devengado.egresos_devengados).toBeGreaterThanOrEqual(3000);
    });
  });

  describe("marcar expense como pagado → aparece en egresos pagados", () => {
    it("al marcar un gasto devengado como pagado, las métricas lo incluyen en egresos pagados", async () => {
      const createRes = await request(app)
        .post("/api/accrued-expenses")
        .set("Authorization", `Bearer ${userAToken}`)
        .send({
          profile_id: userAProfileId,
          period_id: userAPeriodId,
          concept: "Gasto para pagar E2E",
          subtotal: 1200,
          iva_amount: 192,
          fecha: "2025-01-12",
          type: "manual",
          categoria: "Materiales",
        });

      expectSuccess(createRes, 201);
      const expenseId = createRes.body.data.id as string;
      expect(createRes.body.data.is_paid).toBe(false);

      const metricsBefore = await request(app)
        .get(`/api/metrics?mes=1&año=2025&profile_id=${userAProfileId}`)
        .set("Authorization", `Bearer ${userAToken}`);
      expectSuccess(metricsBefore, 200);
      const egresosAntes = metricsBefore.body.flujo.egresos_pagados;

      const updateRes = await request(app)
        .put(`/api/accrued-expenses/${expenseId}`)
        .set("Authorization", `Bearer ${userAToken}`)
        .send({
          is_paid: true,
          payment_date: "2025-01-18",
        });
      expectSuccess(updateRes, 200);
      expect(updateRes.body.data.is_paid).toBe(true);

      const metricsAfter = await request(app)
        .get(`/api/metrics?mes=1&año=2025&profile_id=${userAProfileId}`)
        .set("Authorization", `Bearer ${userAToken}`);
      expectSuccess(metricsAfter, 200);
      expect(metricsAfter.body.flujo.egresos_pagados).toBe(egresosAntes + 1200);
    });
  });

  describe("validación de ownership (user A no puede editar devengado de user B)", () => {
    it("user B no puede editar un gasto devengado creado por user A", async () => {
      const expense = await AccruedExpense.create({
        profile_id: userAProfileId,
        tipo_origen: "MANUAL",
        fecha: new Date("2025-01-05"),
        mes: 1,
        año: 2025,
        total: 500,
        subtotal: 431.03,
        iva: 68.97,
        iva_amount: 68.97,
        concepto: "Gasto de User A",
        categoria: "Otros",
        uuid: null,
        tipo: null,
        rfc_emisor: null,
        nombre_emisor: null,
        regimen_fiscal_emisor: null,
        rfc_receptor: null,
        nombre_receptor: null,
        regimen_fiscal_receptor: null,
        pagos: [],
        complemento_pago: null,
        validacion: {},
      });
      const expenseId = expense.id;

      const updateAsB = await request(app)
        .put(`/api/accrued-expenses/${expenseId}`)
        .set("Authorization", `Bearer ${userBToken}`)
        .send({ concept: "Intentando editar", is_paid: true });

      expect(updateAsB.status).toBe(404);
      expect(updateAsB.body).toHaveProperty("error");
      expect(updateAsB.body.error).toMatch(/no encontrado|not found/i);

      const getAsB = await request(app)
        .get(`/api/accrued-expenses/${expenseId}`)
        .set("Authorization", `Bearer ${userBToken}`);
      expect(getAsB.status).toBe(404);
    });

    it("user B no puede editar un ingreso manual creado por user A", async () => {
      const income = await ManualIncome.create({
        profile_id: userAProfileId,
        period_id: userAPeriodId,
        concept: "Ingreso de User A",
        subtotal: 1000,
        iva_amount: 160,
        fecha: new Date("2025-01-10"),
      });
      const incomeId = income.id;

      const updateAsB = await request(app)
        .put(`/api/manual-incomes/${incomeId}`)
        .set("Authorization", `Bearer ${userBToken}`)
        .send({ concept: "Intentando editar", is_paid: true });

      expect(updateAsB.status).toBe(404);
      expect(updateAsB.body).toHaveProperty("error");
    });
  });

  describe("plugin nómina: usuario con plugin puede subir, usuario sin plugin → 403", () => {
    it("usuario sin plugin recibe 403 al intentar GET /api/payrolls", async () => {
      const res = await request(app)
        .get("/api/payrolls")
        .set("Authorization", `Bearer ${userBToken}`);
      expect(res.status).toBe(403);
      expect(res.body).toHaveProperty("error", "Plugin no disponible");
    });

    it("usuario sin plugin recibe 403 al intentar POST /api/payrolls/upload", async () => {
      const fixturesDir = join(__dirname, "fixtures", "nomina");
      const xmlContent = readFileSync(join(fixturesDir, "nomina-minimal.xml"), "utf-8");
      const res = await request(app)
        .post("/api/payrolls/upload")
        .set("Authorization", `Bearer ${userBToken}`)
        .field("profile_id", userBProfileId)
        .field("period_id", userBPeriodId)
        .attach("xml", Buffer.from(xmlContent), "nomina.xml");
      expect(res.status).toBe(403);
      expect(res.body).toHaveProperty("error", "Plugin no disponible");
    });

    it("usuario con plugin puede listar nóminas (GET /api/payrolls)", async () => {
      const res = await request(app)
        .get("/api/payrolls")
        .set("Authorization", `Bearer ${userAToken}`);
      expectSuccess(res, 200);
      expect(res.body).toHaveProperty("data");
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe("upload nómina → guardar en DB", () => {
    it("al subir XML de nómina válido, se guarda en payrolls y retorna 201", async () => {
      const fixturesDir = join(__dirname, "fixtures", "nomina");
      const xmlContent = readFileSync(join(fixturesDir, "nomina-minimal.xml"), "utf-8");

      const uploadRes = await request(app)
        .post("/api/payrolls/upload")
        .set("Authorization", `Bearer ${userAToken}`)
        .field("profile_id", userAProfileId)
        .field("period_id", userAPeriodId)
        .attach("xml", Buffer.from(xmlContent), "nomina.xml");

      expectSuccess(uploadRes, 201);
      expect(uploadRes.body).toHaveProperty("message", "Nómina registrada");
      expect(uploadRes.body.data).toHaveProperty("id");
      expect(uploadRes.body.data).toHaveProperty("uuid", "a1b2c3d4-e5f6-7890-abcd-ef1234567890");
      expect(uploadRes.body.data).toHaveProperty("employee_rfc", "HEGG800101ABC");
      expect(Number(uploadRes.body.data.neto_pagado)).toBe(8500);
      expect(uploadRes.body.data.profile_id).toBe(userAProfileId);
      expect(uploadRes.body.data.period_id).toBe(userAPeriodId);

      const inDb = await Payroll.findOne({
        where: { uuid: "a1b2c3d4-e5f6-7890-abcd-ef1234567890", profile_id: userAProfileId },
      });
      expect(inDb).not.toBeNull();
      expect(inDb!.employee_rfc).toBe("HEGG800101ABC");
      expect(Number(inDb!.neto_pagado)).toBe(8500);
    });
  });

  describe("cargar 3 nóminas → métricas correctas", () => {
    beforeEach(async () => {
      await Payroll.destroy({ where: { profile_id: userAProfileId } });
    });

    it("al subir 3 nóminas, las métricas incluyen total_pagada, percepciones, deducciones y cantidad_empleados correctos", async () => {
      const fixturesDir = join(__dirname, "fixtures", "nomina");
      const fixtures = [
        "nomina-minimal.xml",
        "nomina-percepciones-deducciones.xml",
        "nomina-horas-extra.xml",
      ];

      for (const filename of fixtures) {
        const xmlContent = readFileSync(join(fixturesDir, filename), "utf-8");
        const uploadRes = await request(app)
          .post("/api/payrolls/upload")
          .set("Authorization", `Bearer ${userAToken}`)
          .field("profile_id", userAProfileId)
          .field("period_id", userAPeriodId)
          .attach("xml", Buffer.from(xmlContent), filename);
        expectSuccess(uploadRes, 201);
      }

      const metricsRes = await request(app)
        .get(`/api/metrics/${userAPeriodId}`)
        .set("Authorization", `Bearer ${userAToken}`);
      expectSuccess(metricsRes, 200);

      expect(metricsRes.body).toHaveProperty("nomina");
      expect(metricsRes.body.nomina).toHaveProperty("total_pagada");
      expect(metricsRes.body.nomina).toHaveProperty("percepciones");
      expect(metricsRes.body.nomina).toHaveProperty("deducciones");
      expect(metricsRes.body.nomina).toHaveProperty("cantidad_empleados");

      expect(Number(metricsRes.body.nomina.total_pagada)).toBe(31200);
      expect(Number(metricsRes.body.nomina.percepciones)).toBe(37000);
      expect(Number(metricsRes.body.nomina.deducciones)).toBe(5800);
      expect(metricsRes.body.nomina.cantidad_empleados).toBe(3);
    });
  });

  describe("métricas con período vacío (retorna ceros)", () => {
    it("GET /api/metrics?mes=X&año=Y con período sin datos retorna estructura con ceros", async () => {
      const res = await request(app)
        .get("/api/metrics?mes=6&año=2030")
        .set("Authorization", `Bearer ${userAToken}`);

      expectSuccess(res, 200);
      expect(res.body).toHaveProperty("period");
      expect(res.body).toHaveProperty("flujo");
      expect(res.body).toHaveProperty("devengado");
      expect(res.body).toHaveProperty("impuestos");
      expect(res.body).toHaveProperty("pendientes");

      expect(res.body.flujo.ingresos_cobrados).toBe(0);
      expect(res.body.flujo.egresos_pagados).toBe(0);
      expect(res.body.flujo.flujo_neto).toBe(0);
      expect(res.body.devengado.ingresos_devengados).toBe(0);
      expect(res.body.devengado.egresos_devengados).toBe(0);
      expect(res.body.devengado.resultado_devengado).toBe(0);
      expect(res.body.pendientes.por_cobrar).toBe(0);
      expect(res.body.pendientes.por_pagar).toBe(0);
    });

    it("GET /api/metrics?mes=X&año=Y&profile_id= con perfil sin datos en ese mes retorna ceros", async () => {
      const res = await request(app)
        .get(`/api/metrics?mes=12&año=2028&profile_id=${userAProfileId}`)
        .set("Authorization", `Bearer ${userAToken}`);

      expectSuccess(res, 200);
      expect(res.body.flujo.ingresos_cobrados).toBe(0);
      expect(res.body.flujo.egresos_pagados).toBe(0);
      expect(res.body.devengado.ingresos_devengados).toBe(0);
      expect(res.body.devengado.egresos_devengados).toBe(0);
    });
  });

  describe("E2E: usuario upgrade → plugin se habilita → puede usar nómina", () => {
    it("al asignar suscripción con plugin payroll al usuario, puede subir nómina", async () => {
      const userC = await createTestUser("userc-upgrade@example.com");
      const tokenC = generateTestTokens(userC.id, "userc-upgrade@example.com").accessToken;
      const profileC = await Profile.create({
        user_id: userC.id,
        nombre: "Perfil C Upgrade",
        rfc: "PCU123456ABC",
        tipo_persona: "MORAL",
        regimenes_fiscales: ["601"],
        validaciones_habilitadas: {},
      });
      const periodC = await Period.create({
        profile_id: profileC.id,
        start_date: new Date("2025-01-01"),
        end_date: new Date("2025-01-31"),
        name: "Enero 2025",
      });

      const pluginPayroll = await Plugin.findOne({ where: { name: "payroll" } });
      expect(pluginPayroll).not.toBeNull();
      const subC = await Subscription.create({
        user_id: userC.id,
        plan: "PRO",
        plan_price: 800,
        status: "ACTIVE",
        current_period_start: new Date(),
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        cancel_at_period_end: false,
      });
      await SubscriptionPlugin.create({
        subscription_id: subC.id,
        plugin_id: pluginPayroll!.id,
        enabled: true,
      });

      const fixturesDir = join(__dirname, "fixtures", "nomina");
      const xmlContent = readFileSync(
        join(fixturesDir, "nomina-otros-pagos.xml"),
        "utf-8"
      );
      const uploadRes = await request(app)
        .post("/api/payrolls/upload")
        .set("Authorization", `Bearer ${tokenC}`)
        .field("profile_id", profileC.id)
        .field("period_id", periodC.id)
        .attach("xml", Buffer.from(xmlContent), "nomina.xml");

      expectSuccess(uploadRes, 201);
      expect(uploadRes.body).toHaveProperty("message", "Nómina registrada");
      expect(uploadRes.body.data).toHaveProperty(
        "uuid",
        "c3d4e5f6-a7b8-9012-cdef-123456789012"
      );
    });
  });
});

/**
 * Tests E2E de endpoints: manual_incomes, accrued_expenses, métricas, ownership.
 */
import { describe, it, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
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
      regimen_fiscal: "601",
    });
    userAProfileId = profileA.id;

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
      regimen_fiscal: "601",
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
});

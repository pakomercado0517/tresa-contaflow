import request from "supertest";
import app from "../server";
import { cleanDatabase, closeDatabase } from "./helpers/test-db";
import { createTestUser, generateTestTokens, expectSuccess, expectError } from "./helpers/test-helpers";
import { Profile, AccruedExpense } from "../database/models/index";
import type { AccruedExpenseAttributes } from "../database/models/AccruedExpense.model";

describe("Expenses API", () => {
  let accessToken: string;
  let userId: string;
  let profileId: string;

  beforeAll(async () => {
    await cleanDatabase();
    const user = await createTestUser("expenses@example.com");
    userId = user.id;
    const tokens = generateTestTokens(userId, "expenses@example.com");
    accessToken = tokens.accessToken;

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

  describe("POST /api/expenses", () => {
    it("debe crear un gasto manual exitosamente", async () => {
      const response = await request(app)
        .post("/api/expenses")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          profileId,
          fecha: "2024-12-15T00:00:00.000Z",
          subtotal: 431.03,
          iva: 16,
          concepto: "Gasto de prueba",
          categoria: "Servicios",
        });

      expectSuccess(response, 201);
      expect(response.body).toHaveProperty("data");
      expect(response.body.data).toHaveProperty("id");
      expect(response.body.data).toHaveProperty("tipo_origen", "MANUAL");
      expect(parseFloat(response.body.data.total)).toBe(499.99);
      expect(parseFloat(response.body.data.iva_amount)).toBe(68.96);
    });

    it("debe rechazar gasto sin profileId", async () => {
      const response = await request(app)
        .post("/api/expenses")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          fecha: "2024-12-15T00:00:00.000Z",
          subtotal: 431.03,
          iva: 16,
        });

      expectError(response, 400);
    });
  });

  describe("GET /api/expenses", () => {
    beforeEach(async () => {
      await AccruedExpense.create({
        profile_id: profileId,
        tipo_origen: "MANUAL",
        fecha: new Date("2024-12-01"),
        mes: 12,
        año: 2024,
        total: 116,
        subtotal: 100,
        iva: 16,
        iva_amount: 16,
        concepto: "Gasto 1",
        categoria: "Servicios",
      });

      await AccruedExpense.create({
        profile_id: profileId,
        tipo_origen: "MANUAL",
        fecha: new Date("2024-12-15"),
        mes: 12,
        año: 2024,
        total: 232,
        subtotal: 200,
        iva: 16,
        iva_amount: 32,
        concepto: "Gasto 2",
        categoria: "Materiales",
      });
    });

    it("debe listar gastos del usuario", async () => {
      const response = await request(app)
        .get(`/api/expenses?profileId=${profileId}`)
        .set("Authorization", `Bearer ${accessToken}`);

      expectSuccess(response, 200);
      expect(response.body).toHaveProperty("data");
      expect(response.body).toHaveProperty("pagination");
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.pagination.total).toBeGreaterThanOrEqual(2);
    });

    it("debe filtrar gastos por categoría", async () => {
      const response = await request(app)
        .get(`/api/expenses?profileId=${profileId}&categoria=Servicios`)
        .set("Authorization", `Bearer ${accessToken}`);

      expectSuccess(response, 200);
      expect(response.body.data.length).toBeGreaterThan(0);
      response.body.data.forEach((expense: AccruedExpenseAttributes) => {
        expect(expense.categoria).toContain("Servicios");
      });
    });
  });

  describe("GET /api/expenses/:id", () => {
    let expenseId: string;

    beforeEach(async () => {
      const expense = await AccruedExpense.create({
        profile_id: profileId,
        tipo_origen: "MANUAL",
        fecha: new Date(),
        mes: 12,
        año: 2024,
        total: 348,
        subtotal: 300,
        iva: 16,
        iva_amount: 48,
        concepto: "Gasto específico",
        categoria: "Servicios",
      });
      expenseId = expense.id;
    });

    it("debe obtener un gasto específico", async () => {
      const response = await request(app)
        .get(`/api/expenses/${expenseId}`)
        .set("Authorization", `Bearer ${accessToken}`);

      expectSuccess(response, 200);
      expect(response.body).toHaveProperty("data");
      expect(response.body.data).toHaveProperty("id", expenseId);
    });
  });

  describe("PUT /api/expenses/:id", () => {
    let expenseId: string;

    beforeEach(async () => {
      const expense = await AccruedExpense.create({
        profile_id: profileId,
        tipo_origen: "MANUAL",
        fecha: new Date(),
        mes: 12,
        año: 2024,
        total: 464,
        subtotal: 400,
        iva: 16,
        iva_amount: 64,
        concepto: "Gasto para actualizar",
        categoria: "Servicios",
      });
      expenseId = expense.id;
    });

    it("debe actualizar un gasto manual exitosamente", async () => {
      const response = await request(app)
        .put(`/api/expenses/${expenseId}`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          subtotal: 500,
          concepto: "Gasto actualizado",
        });

      expectSuccess(response, 200);
      expect(response.body).toHaveProperty("data");
      expect(parseFloat(response.body.data.total)).toBe(580);
      expect(response.body.data).toHaveProperty("concepto", "Gasto actualizado");
    });
  });

  describe("DELETE /api/expenses/:id", () => {
    let expenseId: string;

    beforeEach(async () => {
      const expense = await AccruedExpense.create({
        profile_id: profileId,
        tipo_origen: "MANUAL",
        fecha: new Date(),
        mes: 12,
        año: 2024,
        total: 290,
        subtotal: 250,
        iva: 16,
        iva_amount: 40,
        concepto: "Gasto para eliminar",
        categoria: "Servicios",
      });
      expenseId = expense.id;
    });

    it("debe eliminar un gasto exitosamente", async () => {
      const response = await request(app)
        .delete(`/api/expenses/${expenseId}`)
        .set("Authorization", `Bearer ${accessToken}`);

      expectSuccess(response, 200);
      expect(response.body).toHaveProperty("message");

      const deletedExpense = await AccruedExpense.findByPk(expenseId);
      expect(deletedExpense).toBeNull();
    });
  });
});

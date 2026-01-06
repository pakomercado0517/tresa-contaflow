import request from "supertest";
import app from "../server";
import { cleanDatabase, closeDatabase } from "./helpers/test-db";
import { createTestUser, generateTestTokens, expectSuccess, expectError } from "./helpers/test-helpers";
import { Profile, Expense } from "../database/models/index";

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

    // Crear perfil para las pruebas
    const profile = await Profile.create({
      user_id: userId,
      nombre: "Empresa de Prueba",
      rfc: "EPR123456ABC",
      tipo_persona: "MORAL",
      regimen_fiscal: "601",
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
          total: 500.0,
          subtotal: 431.03,
          iva: 68.97,
          concepto: "Gasto de prueba",
          categoria: "Servicios",
        });

      expectSuccess(response, 201);
      expect(response.body).toHaveProperty("data");
      expect(response.body.data).toHaveProperty("id");
      expect(response.body.data).toHaveProperty("tipo_origen", "MANUAL");
      expect(parseFloat(response.body.data.total)).toBe(500.0);
    });

    it("debe rechazar gasto sin profileId", async () => {
      const response = await request(app)
        .post("/api/expenses")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          fecha: "2024-12-15T00:00:00.000Z",
          total: 500.0,
          subtotal: 431.03,
          iva: 68.97,
        });

      expectError(response, 400);
    });
  });

  describe("GET /api/expenses", () => {
    beforeEach(async () => {
      // Crear algunos gastos de prueba
      await Expense.create({
        profile_id: profileId,
        tipo_origen: "MANUAL",
        fecha: new Date("2024-12-01"),
        mes: 12,
        año: 2024,
        total: 100.0,
        subtotal: 86.21,
        iva: 13.79,
        concepto: "Gasto 1",
        categoria: "Servicios",
      });

      await Expense.create({
        profile_id: profileId,
        tipo_origen: "MANUAL",
        fecha: new Date("2024-12-15"),
        mes: 12,
        año: 2024,
        total: 200.0,
        subtotal: 172.41,
        iva: 27.59,
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
      response.body.data.forEach((expense: Expense) => {
        expect(expense.categoria).toContain("Servicios");
      });
    });
  });

  describe("GET /api/expenses/:id", () => {
    let expenseId: string;

    beforeEach(async () => {
      const expense = await Expense.create({
        profile_id: profileId,
        tipo_origen: "MANUAL",
        fecha: new Date(),
        mes: 12,
        año: 2024,
        total: 300.0,
        subtotal: 258.62,
        iva: 41.38,
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
      const expense = await Expense.create({
        profile_id: profileId,
        tipo_origen: "MANUAL",
        fecha: new Date(),
        mes: 12,
        año: 2024,
        total: 400.0,
        subtotal: 344.83,
        iva: 55.17,
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
          total: 450.0,
          concepto: "Gasto actualizado",
        });

      expectSuccess(response, 200);
      expect(response.body).toHaveProperty("data");
      expect(response.body.data).toHaveProperty("total", 450.0);
      expect(response.body.data).toHaveProperty("concepto", "Gasto actualizado");
    });
  });

  describe("DELETE /api/expenses/:id", () => {
    let expenseId: string;

    beforeEach(async () => {
      const expense = await Expense.create({
        profile_id: profileId,
        tipo_origen: "MANUAL",
        fecha: new Date(),
        mes: 12,
        año: 2024,
        total: 250.0,
        subtotal: 215.52,
        iva: 34.48,
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

      // Verificar que el gasto fue eliminado
      const deletedExpense = await Expense.findByPk(expenseId);
      expect(deletedExpense).toBeNull();
    });
  });
});


import request from "supertest";
import app from "../server.js";
import { cleanDatabase, closeDatabase } from "./helpers/test-db.js";
import { createTestUser, generateTestTokens, expectSuccess, expectError } from "./helpers/test-helpers.js";
import { Subscription } from "../database/models/index.js";

describe("Subscription API", () => {
  let accessToken: string;
  let userId: string;

  beforeAll(async () => {
    await cleanDatabase();
    const user = await createTestUser("subscription@example.com");
    userId = user.id;
    const tokens = generateTestTokens(userId);
    accessToken = tokens.accessToken;
  });

  afterAll(async () => {
    await cleanDatabase();
    await closeDatabase();
  });

  describe("GET /api/subscription", () => {
    it("debe retornar plan FREE cuando no hay suscripción activa", async () => {
      const response = await request(app)
        .get("/api/subscription")
        .set("Authorization", `Bearer ${accessToken}`);

      expectSuccess(response, 200);
      expect(response.body).toHaveProperty("plan", "FREE");
      expect(response.body).toHaveProperty("status", "ACTIVE");
      expect(response.body).toHaveProperty("planPrice", 0);
    });

    it("debe retornar suscripción activa cuando existe", async () => {
      // Crear suscripción de prueba
      await Subscription.create({
        user_id: userId,
        plan: "BASIC",
        plan_price: 29.0,
        status: "ACTIVE",
        stripe_customer_id: "cus_test123",
        stripe_subscription_id: "sub_test123",
        current_period_start: new Date(),
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        cancel_at_period_end: false,
      });

      const response = await request(app)
        .get("/api/subscription")
        .set("Authorization", `Bearer ${accessToken}`);

      expectSuccess(response, 200);
      expect(response.body).toHaveProperty("plan", "BASIC");
      expect(response.body).toHaveProperty("status", "ACTIVE");
      expect(response.body).toHaveProperty("planPrice", 29.0);
      expect(response.body).toHaveProperty("stripeCustomerId", "cus_test123");
    });
  });

  describe("POST /api/subscription/create-checkout", () => {
    it("debe rechazar checkout sin plan", async () => {
      const response = await request(app)
        .post("/api/subscription/create-checkout")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({});

      expectError(response, 400);
    });

    it("debe rechazar checkout con plan inválido", async () => {
      const response = await request(app)
        .post("/api/subscription/create-checkout")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          plan: "INVALID",
        });

      expectError(response, 400);
    });

    it("debe rechazar checkout con plan FREE", async () => {
      const response = await request(app)
        .post("/api/subscription/create-checkout")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          plan: "FREE",
        });

      expectError(response, 400);
    });

    // Nota: Los tests de creación exitosa de checkout requieren configuración de Stripe
    // y variables de entorno, por lo que se omiten en tests básicos
  });

  describe("POST /api/subscription/create-portal-session", () => {
    it("debe rechazar portal sin suscripción activa", async () => {
      const response = await request(app)
        .post("/api/subscription/create-portal-session")
        .set("Authorization", `Bearer ${accessToken}`);

      expectError(response, 400);
      expect(response.body.message).toContain("suscripción activa");
    });

    it("debe rechazar portal sin stripe_customer_id", async () => {
      // Crear suscripción sin stripe_customer_id
      await Subscription.create({
        user_id: userId,
        plan: "BASIC",
        plan_price: 29.0,
        status: "ACTIVE",
        stripe_customer_id: null,
        stripe_subscription_id: null,
        current_period_start: new Date(),
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        cancel_at_period_end: false,
      });

      const response = await request(app)
        .post("/api/subscription/create-portal-session")
        .set("Authorization", `Bearer ${accessToken}`);

      expectError(response, 400);
    });

    // Nota: Los tests de creación exitosa de portal requieren configuración de Stripe
    // y variables de entorno, por lo que se omiten en tests básicos
  });
});


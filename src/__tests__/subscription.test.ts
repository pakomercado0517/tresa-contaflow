import request from "supertest";
import app from "../server";
import { cleanDatabase, closeDatabase } from "./helpers/test-db";
import { createTestUser, generateTestTokens, expectSuccess, expectError } from "./helpers/test-helpers";
import { Subscription } from "../database/models/index";

describe("Subscription API", () => {
  let accessToken: string;
  let userId: string;

  beforeAll(async () => {
    await cleanDatabase();
    const user = await createTestUser("subscription@example.com");
    userId = user.id;
    const tokens = generateTestTokens(userId, "subscription@example.com");
    accessToken = tokens.accessToken;
  });

  afterAll(async () => {
    await cleanDatabase();
    await closeDatabase();
  });

  beforeEach(async () => {
    if (!userId) {
      return;
    }
    await Subscription.destroy({ where: { user_id: userId } });
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

    it("debe rechazar checkout con código de descuento inválido", async () => {
      const response = await request(app)
        .post("/api/subscription/create-checkout")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          plan: "BASIC",
          promotionCode: "CODIGO_INEXISTENTE",
        });

      expectError(response, 400);
      expect(response.body).toHaveProperty(
        "message",
        "El código de descuento no es válido, ya expiró o no está activo"
      );
    });

    // Nota: Los tests de creación exitosa de checkout requieren configuración de Stripe
    // y variables de entorno, por lo que se omiten en tests básicos
  });

  describe("POST /api/subscription/create-portal-session", () => {
    it("debe rechazar portal sin suscripción activa", async () => {
      const response = await request(app)
        .post("/api/subscription/create-portal-session")
        .set("Authorization", `Bearer ${accessToken}`);

      // Puede retornar 400 o 500 dependiendo de la configuración de Stripe
      expect([400, 500]).toContain(response.status);
      expect(response.body).toHaveProperty("error");
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

